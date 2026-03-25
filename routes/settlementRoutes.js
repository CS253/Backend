const express = require('express');
const router = express.Router();
const settlementService = require('../services/settlementService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

console.log('✅ Settlement routes loaded at startup');

/**
 * GET /groups/:groupId/balances
 * Get settlements needed for a group (calculated on-demand)
 * Returns settlements grouped by currency with user details
 */
router.get('/groups/:groupId/balances', async (req, res) => {
  try {
    const { groupId } = req.params;
    const simplifyDebts = req.query.simplifyDebts;

    // If simplifyDebts parameter exists in query, return settlements
    if (req.query.hasOwnProperty('simplifyDebts')) {
      // Parse query parameter: 'true' string becomes boolean true
      const forceAlgorithm = simplifyDebts === 'true' ? true : simplifyDebts === 'false' ? false : null;
      const settlements = await settlementService.calculateSettlements(groupId, forceAlgorithm);
      return res.json({
        success: true,
        data: settlements,
        algorithm: forceAlgorithm === true ? 'GREEDY' : 'DINICS',
        message: 'Settlements calculated',
      });
    }

    // Otherwise return raw balances
    const balances = await settlementService.getGroupBalances(groupId);

    res.json({
      success: true,
      data: balances,
      message: 'Balances organized by currency. Positive balance = owed money, Negative = owes money',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /groups/:groupId/settlements
 * Alias for /balances endpoint (same functionality)
 */
router.get('/groups/:groupId/settlements', async (req, res) => {
  try {
    const { groupId } = req.params;
    const simplifyDebts = req.query.simplifyDebts;

    // If simplifyDebts parameter exists in query, return settlements
    if (req.query.hasOwnProperty('simplifyDebts')) {
      // Parse query parameter: 'true' string becomes boolean true
      const forceAlgorithm = simplifyDebts === 'true' ? true : simplifyDebts === 'false' ? false : null;
      const settlements = await settlementService.calculateSettlements(groupId, forceAlgorithm);
      return res.json({
        success: true,
        data: settlements,
        algorithm: forceAlgorithm === true ? 'GREEDY' : 'DINICS',
        message: 'Settlements calculated',
      });
    }

    // Otherwise return raw balances
    const balances = await settlementService.getGroupBalances(groupId);

    res.json({
      success: true,
      data: balances,
      message: 'Balances organized by currency. Positive balance = owed money, Negative = owes money',
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /groups/:groupId/settlements/mark-paid
 * Mark a settlement as paid and create reimbursement transaction
 */
router.post('/groups/:groupId/settlements/mark-paid', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromUserId, toUserId, amount, currency } = req.body;

    if (!fromUserId || !toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'fromUserId, toUserId, amount, and currency are required',
      });
    }

    // Verify group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    // Create reimbursement transaction
    const transaction = await settlementService.markSettlementAsPaid(
      groupId,
      fromUserId,
      toUserId,
      amount,
      currency
    );

    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Settlement marked as paid. Reimbursement transaction recorded.',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /groups/:groupId/settlements/request-payment
 * Send payment reminder (notification to debtor)
 */
router.post('/groups/:groupId/settlements/request-payment', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromUserId, toUserId, amount, currency } = req.body;

    if (!fromUserId || !toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'fromUserId, toUserId, amount, and currency are required',
      });
    }

    // In production, this would send a notification/email
    // For now, we just acknowledge the request
    res.json({
      success: true,
      data: {
        fromUserId,
        toUserId,
        amount,
        currency,
        requestedAt: new Date(),
      },
      message: 'Payment request sent to debtor (notification would be sent in production)',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /groups/:groupId/settlements/initiate-payment
 * Simulate UPI payment redirect
 */
router.post('/groups/:groupId/settlements/initiate-payment', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { toUserId, amount, currency } = req.body;

    if (!toUserId || !amount || !currency) {
      return res.status(400).json({
        success: false,
        error: 'toUserId, amount, and currency are required',
      });
    }

    // Get recipient's UPI ID
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

    // Simulate UPI payment redirect
    const paymentLink = `upi://pay?pa=${recipient.upiId}&pn=${recipient.name}&am=${amount}&tn=Travelly%20Reimbursement`;

    res.json({
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
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /groups/:groupId/payment-history
 * Get reimbursement transaction history
 */
router.get('/groups/:groupId/payment-history', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { fromDate, toDate, currency, userId } = req.query;

    const history = await settlementService.getPaymentHistory(groupId, {
      fromDate,
      toDate,
      currency,
      userId,
    });

    // Enrich with user details
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

    res.json({
      success: true,
      data: enrichedHistory,
      count: enrichedHistory.length,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /groups/:groupId/settings/simplify-debts
 * Update simplify debts toggle for the group
 */
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

    const updatedGroup = await settlementService.updateSimplifyDebtsSetting(
      groupId,
      simplifyDebts
    );

    res.json({
      success: true,
      data: {
        groupId: updatedGroup.id,
        simplifyDebts: updatedGroup.simplifyDebts,
      },
      message: `Settlement algorithm: ${simplifyDebts ? 'GREEDY (minimizes transactions)' : 'DINICS (preserves relationships)'}`,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
