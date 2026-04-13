const express = require('express');
const settlementService = require('../services/settlementService');
const authMiddleware = require('../middleware/authMiddleware');
const prisma = require('../utils/prismaClient');
const notificationService = require('../services/notificationService');

const router = express.Router();

const ensureGroupMember = async (req, res, next) => {
  try {
    const membership = await prisma.groupMember.findFirst({
      where: {
        userId: req.userId,
        groupId: req.params.groupId,
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this group',
      });
    }

    return next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Server error',
    });
  }
};

router.use(authMiddleware);
router.use('/groups/:groupId', ensureGroupMember);

router.get('/groups/:groupId/balances', async (req, res) => {
  try {
    const { groupId } = req.params;
    const simplifyDebts = req.query.simplifyDebts;

    if (Object.prototype.hasOwnProperty.call(req.query, 'simplifyDebts')) {
      const forceAlgorithm =
        simplifyDebts === 'true' ? true : simplifyDebts === 'false' ? false : null;
      const settlements = await settlementService.calculateSettlements(groupId, forceAlgorithm);

      return res.json({
        success: true,
        data: settlements,
        algorithm: forceAlgorithm === true ? 'GREEDY' : 'DINICS',
        message: 'Settlements calculated',
      });
    }

    const balances = await settlementService.getGroupBalances(groupId);

    return res.json({
      success: true,
      data: balances,
      message: 'Balances organized by currency. Positive balance = owed money, Negative = owes money',
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/groups/:groupId/settlements', async (req, res) => {
  try {
    const { groupId } = req.params;
    const simplifyDebts = req.query.simplifyDebts;

    if (Object.prototype.hasOwnProperty.call(req.query, 'simplifyDebts')) {
      const forceAlgorithm =
        simplifyDebts === 'true' ? true : simplifyDebts === 'false' ? false : null;
      const settlements = await settlementService.calculateSettlements(groupId, forceAlgorithm);

      return res.json({
        success: true,
        data: settlements,
        algorithm: forceAlgorithm === true ? 'GREEDY' : 'DINICS',
        message: 'Settlements calculated',
      });
    }

    const balances = await settlementService.getGroupBalances(groupId);

    return res.json({
      success: true,
      data: balances,
      message: 'Balances organized by currency. Positive balance = owed money, Negative = owes money',
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/groups/:groupId/settlements/mark-paid', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { toUserId, amount, currency } = req.body;

    // vuln-11 fix: fromUserId MUST be the authenticated user — not taken from body
    const fromUserId = req.userId;

    if (!toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'toUserId, amount, and currency are required',
      });
    }

    // vuln-06 fix: prevent self-payment and negative amounts (double-spend guard)
    if (fromUserId === toUserId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot mark a payment to yourself',
      });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'amount must be a positive number',
      });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    const transaction = await settlementService.markSettlementAsPaid(
      groupId,
      fromUserId,
      toUserId,
      parsedAmount,
      currency
    );

    // Notify the creditor that payment was received
    notificationService.sendToUser(toUserId, {
      title: 'Payment Received',
      body: `You received ${currency} ${parsedAmount} for a settlement`,
      data: { type: 'settlement_paid', groupId, fromUserId, amount: String(parsedAmount) },
    });

    return res.status(201).json({
      success: true,
      data: transaction,
      message: 'Settlement marked as paid. Reimbursement transaction recorded.',
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/groups/:groupId/settlements/request-payment', async (req, res) => {
  try {
    const { fromUserId, toUserId, amount, currency } = req.body;

    if (!fromUserId || !toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'fromUserId, toUserId, amount, and currency are required',
      });
    }

    // Notify the debtor about the payment request
    notificationService.sendToUser(fromUserId, {
      title: 'Payment Requested',
      body: `You have a payment request of ${currency} ${amount}`,
      data: { type: 'payment_requested', groupId: req.params.groupId, toUserId, amount: String(amount) },
    });

    return res.json({
      success: true,
      data: {
        fromUserId,
        toUserId,
        amount,
        currency,
        requestedAt: new Date(),
      },
      message: 'Payment request sent to debtor',
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/groups/:groupId/settlements/initiate-payment', async (req, res) => {
  try {
    const { toUserId, amount, currency } = req.body;

    if (!toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'toUserId, amount, and currency are required',
      });
    }

    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { upiId: true, name: true },
    });

    if (!recipient || !recipient.upiId) {
      return res.status(400).json({
        success: false,
        error: 'Recipient does not have UPI ID saved',
      });
    }

    const { decrypt } = require('../utils/encryption');
    const decodedUpiId = decrypt(recipient.upiId);
    const encodedName = encodeURIComponent(recipient.name || "Unknown");
    const encodedNotes = encodeURIComponent("Travelly Reimbursement");
    const paymentLink = `upi://pay?pa=${decodedUpiId}&pn=${encodedName}&am=${amount}&tn=${encodedNotes}`;

    return res.json({
      success: true,
      data: {
        paymentLink,
        upiId: recipient.upiId,
        recipientName: recipient.name,
        amount,
        currency,
      },
      message: 'Payment link generated. Redirect to UPI app.',
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/groups/:groupId/payment-history', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromDate, toDate, currency, userId } = req.query;

    if (userId && userId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only request your own payment history filter',
      });
    }

    const history = await settlementService.getPaymentHistory(groupId, {
      fromDate,
      toDate,
      currency,
      userId,
    });

    const enrichedHistory = await Promise.all(
      history.map(async (transaction) => {
        const fromUser = await prisma.user.findUnique({
          where: { id: transaction.fromUserId },
          select: { id: true, name: true, email: true },
        });
        const toUser = await prisma.user.findUnique({
          where: { id: transaction.toUserId },
          select: { id: true, name: true, email: true },
        });

        return {
          ...transaction,
          fromUser,
          toUser,
        };
      })
    );

    return res.json({
      success: true,
      data: enrichedHistory,
      count: enrichedHistory.length,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/groups/:groupId/settings/simplify-debts', async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await settlementService.getSimplifyDebtsSetting(groupId);

    return res.json({
      success: true,
      data: {
        groupId: group.id,
        simplifyDebts: group.simplifyDebts,
      },
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.put('/groups/:groupId/settings/simplify-debts', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { simplifyDebts } = req.body;

    if (typeof simplifyDebts !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'simplifyDebts must be a boolean',
      });
    }

    // vuln-12 fix: only group creator can toggle this setting
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }
    if (group.createdBy !== req.userId) {
      return res.status(403).json({ success: false, error: 'Only the group creator can change this setting' });
    }

    const updatedGroup = await settlementService.updateSimplifyDebtsSetting(
      groupId,
      simplifyDebts
    );

    return res.json({
      success: true,
      data: {
        groupId: updatedGroup.id,
        simplifyDebts: updatedGroup.simplifyDebts,
      },
      message: `Settlement algorithm: ${simplifyDebts ? 'GREEDY (minimizes transactions)' : 'DINICS (preserves relationships)'}`,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
