const { PrismaClient } = require('@prisma/client');
const { simplifyDebtsPreservingPairsDinic } = require('./debtSimplification');
const prisma = new PrismaClient();

/**
 * Calculate settlements for a group using the appropriate algorithm
 * @param {string} groupId - Group ID
 * @param {boolean} forceSimplifyDebts - Optional: override database setting (true=greedy, false=preserve-pairs-dinics)
 * @returns {Object} Settlements grouped by currency
 */
async function calculateSettlements(groupId, forceSimplifyDebts = null) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  // Get current balances
  const balances = await getGroupBalances(groupId);

  // Use query parameter if provided, otherwise use database setting
  const useSimplifyDebts = forceSimplifyDebts !== null ? forceSimplifyDebts : group.simplifyDebts;

  // Apply appropriate algorithm
  let settlements;
  if (useSimplifyDebts) {
    // Use greedy algorithm (minimizes transactions, ignores original relationships)
    settlements = greedyAlgorithm(balances);
  } else {
    // Use preserve-pairs Dinics algorithm (preserves debtor-creditor relationships)
    settlements = await preservePairsDinicsAlgorithm(groupId, balances);
  }

  // Group by currency
  const result = {};
  settlements.forEach((settlement) => {
    if (!result[settlement.currency]) {
      result[settlement.currency] = [];
    }
    result[settlement.currency].push(settlement);
  });

  return result;
}

/**
 * Get group balances for all users per currency
 * @param {string} groupId - Group ID
 * @returns {Object} Balances structure: {currency: {userId: {paid, owed, balance}}}
 */
async function getGroupBalances(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  // Get all expenses (including reimbursements which are now created as expenses)
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { splits: true },
  });

  const memberIds = group.members.map((m) => m.userId);
  const balances = {};

  // Get all unique currencies used in the group
  const currencies = new Set();
  expenses.forEach((e) => currencies.add(e.currency));

  // Initialize each currency with all members
  currencies.forEach((currency) => {
    balances[currency] = {};
    memberIds.forEach((userId) => {
      balances[currency][userId] = {
        paid: 0,
        owed: 0,
        balance: 0,
      };
    });
  });

  // Process expenses (includes reimbursements since they're now expenses)
  expenses.forEach((expense) => {
    const currency = expense.currency;

    // Add to payer's "paid" amount
    balances[currency][expense.paidBy].paid += expense.amount;

    // Add to each split participant's "owed" amount
    expense.splits.forEach((split) => {
      balances[currency][split.userId].owed += split.amount;
    });
  });

  // Calculate final balance for each user per currency
  Object.keys(balances).forEach((currency) => {
    Object.keys(balances[currency]).forEach((userId) => {
      balances[currency][userId].balance = balances[currency][userId].paid - balances[currency][userId].owed;
    });
  });

  return balances;
}

/**
 * Preserve-Pairs Dinics Algorithm - Non-intrusive debt simplification
 * 
 * Never creates new debtor-creditor pairs beyond what exists in original transactions.
 * Uses repeated max-flow compression on existing allowed directed pairs.
 * 
 * Algorithm:
 * 1. Extract all original debtor->creditor pairs from expenses
 * 2. Repeatedly find best pair to compress:
 *    - Build flow network EXCLUDING direct edge between pair
 *    - Run Dinic max flow between them through alternate paths
 *    - Apply flows, cancel reverses, prune zeros
 *    - Only commit if edge count strictly decreases
 * 3. Output final simplified transaction list
 * 
 * @param {string} groupId - Group ID
 * @param {Object} balances - Current balances {currency: {userId: {paid, owed, balance}}}
 * @returns {Array} Array of settlement transactions
 */
async function preservePairsDinicsAlgorithm(groupId, balances) {
  const settlements = [];

  // Fetch actual expenses to extract original debtor-creditor pairs
  // This now includes reimbursements (which are created as expenses)
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { splits: true },
  });

  // Process each currency separately
  Object.keys(balances).forEach((currency) => {
    const transactions = [];
    const allowedPairs = new Set();

    // Extract all debtor->creditor pairs from original expenses
    expenses.forEach((expense) => {
      if (expense.currency !== currency) return;

      const payer = expense.paidBy;
      expense.splits.forEach((split) => {
        if (split.userId !== payer) {
          // This person owes the payer
          const pairKey = `${split.userId}->${payer}`;
          allowedPairs.add(pairKey);
          transactions.push({
            from: split.userId,
            to: payer,
            amount: split.amount,
          });
        }
      });
    });

    if (transactions.length === 0) return;

    // Use the new preserve-pairs Dinics algorithm
    const simplified = simplifyDebtsPreservingPairsDinic(transactions, { allowedPairs });

    // Convert to settlement format
    simplified.forEach((tx) => {
      settlements.push({
        fromUserId: tx.from,
        toUserId: tx.to,
        amount: tx.amount,
        currency,
        isPaid: false,
      });
    });
  });

  return settlements;
}

/**
 * Greedy Algorithm - Minimizes total number of settlements (ignores original relationships)
 * Sorts creditors/debtors and matches highest with highest
 * @param {Object} balances - Current balances
 * @returns {Array} Array of settlement transactions
 */
function greedyAlgorithm(balances) {
  const settlements = [];

  // For each currency, calculate settlements
  Object.keys(balances).forEach((currency) => {
    const currencyBalances = balances[currency];

    // Create working copy of balances for this currency
    const workingBalances = {};
    Object.keys(currencyBalances).forEach((userId) => {
      workingBalances[userId] = currencyBalances[userId].balance;
    });

    // Keep matching until all balances are settled
    while (true) {
      // Find creditor with max amount and debtor with max amount
      let maxCreditorId = null;
      let maxCreditorAmount = 0;
      let maxDebtorId = null;
      let maxDebtorAmount = 0;

      Object.keys(workingBalances).forEach((userId) => {
        const balance = workingBalances[userId];
        if (balance > maxCreditorAmount) {
          maxCreditorAmount = balance;
          maxCreditorId = userId;
        }
        if (-balance > maxDebtorAmount) {
          maxDebtorAmount = -balance;
          maxDebtorId = userId;
        }
      });

      // If no more creditors or debtors, we're done
      if (maxCreditorAmount < 0.01 || maxDebtorAmount < 0.01) break;

      // Settle the transaction
      const settlementAmount = Math.min(maxCreditorAmount, maxDebtorAmount);

      settlements.push({
        fromUserId: maxDebtorId,
        toUserId: maxCreditorId,
        amount: parseFloat(settlementAmount.toFixed(2)),
        currency,
        isPaid: false,
      });

      // Update working balances
      workingBalances[maxCreditorId] -= settlementAmount;
      workingBalances[maxDebtorId] += settlementAmount;
    }
  });

  return settlements;
}

/**
 * Mark a settlement as paid by creating a reimbursement expense
 * This automatically updates settlements since they're calculated from the full expense ledger
 * @param {string} groupId - Group ID
 * @param {string} fromUserId - User paying (paidBy)
 * @param {string} toUserId - User receiving (in splits)
 * @param {number} amount - Amount paid
 * @param {string} currency - Currency code
 * @returns {Object} Created expense record (reimbursement)
 */
async function markSettlementAsPaid(groupId, fromUserId, toUserId, amount, currency) {
  // Create a reimbursement as an expense where:
  // - fromUserId is the payer (they're paying back)
  // - toUserId is in the split (they're the creditor receiving payment)
  // This cancels out the original obligation in the settlement algorithm
  
  const expenseService = require('./expenseService');
  
  const reimbursement = await expenseService.createExpense({
    groupId,
    title: `Reimbursement: Payment received`,
    amount,
    paidBy: fromUserId,
    currency,
    split: {
      type: 'EQUAL',
      participants: [toUserId], // Single participant = full amount
    },
    notes: 'Reimbursement for settlement',
    date: new Date(),
  });

  return reimbursement;
}

/**
 * Get payment history for a group (reimbursement expenses)
 * Since reimbursements are created as expenses, this returns expenses marked as reimbursements
 * @param {string} groupId - Group ID
 * @param {Object} filters - Optional filters
 * @returns {Array} List of reimbursement expenses
 */
async function getPaymentHistory(groupId, filters = {}) {
  const { fromDate, toDate, currency, userId } = filters;

  // Fetch all expenses for this group
  const where = { groupId };

  if (fromDate || toDate) {
    where.date = {};
    if (fromDate) where.date.gte = new Date(fromDate);
    if (toDate) where.date.lte = new Date(toDate);
  }

  if (currency) where.currency = currency;
  if (userId) where.paidBy = userId;

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      payer: { select: { id: true, name: true } },
      splits: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });

  // Filter to only reimbursements (identified by notes or title)
  const reimbursements = expenses.filter(
    exp => exp.notes?.includes('Reimbursement') || exp.title?.includes('Reimbursement')
  );

  // Format as transaction-like objects for API compatibility
  return reimbursements.map(exp => ({
    id: exp.id,
    type: 'REIMBURSEMENT',
    groupId: exp.groupId,
    fromUserId: exp.paidBy,
    toUserId: exp.splits[0]?.userId, // First split participant is the receiver
    amount: exp.amount,
    currency: exp.currency,
    date: exp.date,
    createdAt: exp.createdAt,
    title: exp.title,
    notes: exp.notes,
  }));
}

/**
 * Update group simplify debts setting
 * @param {string} groupId - Group ID
 * @param {boolean} simplifyDebts - New setting
 * @returns {Object} Updated group
 */
async function updateSimplifyDebtsSetting(groupId, simplifyDebts) {
  const group = await prisma.group.update({
    where: { id: groupId },
    data: { simplifyDebts },
  });

  return group;
}

module.exports = {
  calculateSettlements,
  getGroupBalances,
  markSettlementAsPaid,
  getPaymentHistory,
  updateSimplifyDebtsSetting,
};
