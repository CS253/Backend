const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Calculate balances for all members in a group (per currency)
 * Balances are grouped by currency since we don't do currency conversion
 * @param {string} groupId - Group ID
 * @returns {Object} Balances organized by currency and user
 * Example: {
 *   USD: {
 *     userId1: { paid: 100, owed: 50, balance: 50 },
 *     userId2: { paid: 20, owed: 40, balance: -20 }
 *   }
 * }
 */
async function getGroupBalances(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  const memberIds = group.members.map((m) => m.userId);

  // Fetch all expenses for this group (transfers are recorded as expenses with SELECTED_EQUAL split)
  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { splits: true },
  });

  // Initialize balances structure: { currency: { userId: { paid, owed, balance } } }
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
        balance: 0, // positive = they are owed money, negative = they owe money
      };
    });
  });

  // Process expenses (includes transfers recorded as SELECTED_EQUAL split expenses)
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
 * Get detailed history (expenses + reimbursements) for a group
 * Note: Reimbursements are created as expenses, so they appear in the expense ledger
 * @param {string} groupId - Group ID
 * @param {Object} filters - Optional filters
 * @param {Date} filters.fromDate - Start date
 * @param {Date} filters.toDate - End date
 * @param {string} filters.currency - Filter by currency
 * @param {string} filters.userId - Filter by user (payer)
 * @returns {Array} Combined sorted list of all expenses and reimbursements
 */
async function getGroupHistory(groupId, filters = {}) {
  const { fromDate, toDate, currency, userId } = filters;

  // Fetch all expenses (includes reimbursements since they're created as expenses)
  const expenseWhere = { groupId };
  if (fromDate || toDate) {
    expenseWhere.date = {};
    if (fromDate) expenseWhere.date.gte = new Date(fromDate);
    if (toDate) expenseWhere.date.lte = new Date(toDate);
  }
  if (currency) expenseWhere.currency = currency;
  if (userId) expenseWhere.paidBy = userId;

  const expenses = await prisma.expense.findMany({
    where: expenseWhere,
    include: {
      splits: {
        include: {
          user: { select: { id: true, name: true } },
        },
      },
      payer: { select: { id: true, name: true } },
    },
  });

  // Convert expenses to history format
  // Identify reimbursements by their notes or title
  const history = expenses.map((expense) => ({
    id: expense.id,
    type: expense.notes?.includes('Reimbursement') || expense.title?.includes('Reimbursement') ? 'REIMBURSEMENT' : 'EXPENSE',
    title: expense.title,
    amount: expense.amount,
    currency: expense.currency,
    date: expense.date,
    createdAt: expense.createdAt,
    payer: expense.payer,
    splits: expense.splits,
    notes: expense.notes,
  }));

  // Sort by createdAt descending (latest created first), then by type (expenses before reimbursements)
  history.sort((a, b) => {
    // Primary: Sort by createdAt descending (when it was added to system - latest first)
    const createdComparison = new Date(b.createdAt) - new Date(a.createdAt);
    if (createdComparison !== 0) return createdComparison;
    
    // Secondary: Within same createdAt time, show expenses before reimbursements
    if (a.type !== b.type) {
      return a.type === 'EXPENSE' ? -1 : 1; // EXPENSE comes first (-1), REIMBURSEMENT comes later (1)
    }
    
    return 0;
  });

  return history;
}

/**
 * Get summary statistics for a group
 * @param {string} groupId - Group ID
 * @param {string} userId - (Optional) User ID to include individual stats
 * @returns {Object} Summary including total spent, per-currency totals, member count, and optional individual stats
 */
async function getGroupSummary(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: { splits: true },
  });

  // Calculate totals by currency (transfers are recorded as expenses with SELECTED_EQUAL split)
  const totalByExpenseCurrency = {};

  expenses.forEach((expense) => {
    if (!totalByExpenseCurrency[expense.currency]) {
      totalByExpenseCurrency[expense.currency] = 0;
    }
    totalByExpenseCurrency[expense.currency] += expense.amount;
  });

  const summary = {
    groupId,
    groupTitle: group.title,
    currency: group.currency,
    memberCount: group.members.length,
    expenseCount: expenses.length,
    totalExpensesByPaymentCurrency: totalByExpenseCurrency,
  };

  // If userId provided, add individual user stats
  if (userId) {
    const individualStats = {
      userId,
      totalExpensesByPaymentCurrency: {}, // Total expenses user was involved in
      paid: {},
      owed: {},
      balance: {},
    };

    // Calculate individual paid and owed per currency
    const currencies = new Set();
    expenses.forEach((e) => currencies.add(e.currency));

    // Initialize per currency
    currencies.forEach((currency) => {
      individualStats.paid[currency] = 0;
      individualStats.owed[currency] = 0;
      individualStats.totalExpensesByPaymentCurrency[currency] = 0;
      individualStats.balance[currency] = 0;
    });

    // Calculate user's paid amounts
    expenses.forEach((expense) => {
      if (expense.paidBy === userId) {
        individualStats.paid[expense.currency] += expense.amount;
      }
    });

    // Calculate user's owed amounts (sum of their shares in all expenses)
    expenses.forEach((expense) => {
      expense.splits.forEach((split) => {
        if (split.userId === userId) {
          individualStats.owed[expense.currency] += split.amount;
          // Individual total expense = sum of their shares
          individualStats.totalExpensesByPaymentCurrency[expense.currency] += split.amount;
        }
      });
    });

    // Calculate balance per currency
    currencies.forEach((currency) => {
      individualStats.balance[currency] = individualStats.paid[currency] - individualStats.owed[currency];
    });

    summary.individual = individualStats;
  }

  return summary;
}

module.exports = {
  getGroupBalances,
  getGroupHistory,
  getGroupSummary,
};
