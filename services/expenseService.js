const prisma = require('../utils/prismaClient');

/**
 * Create an expense with automatic split calculation
 * @param {Object} data - Expense data
 * @param {string} data.groupId - Group ID
 * @param {string} data.title - Expense title
 * @param {number} data.amount - Total expense amount
 * @param {string} data.paidBy - User ID of payer
 * @param {string} data.currency - Currency code (optional, defaults to group currency)
 * @param {Object} data.split - Split configuration
 * @param {string} data.split.type - Split type: 'EQUAL' or 'CUSTOM'
 * @param {string[]} data.split.participants - List of user IDs to split among (required for EQUAL, optional for CUSTOM)
 * @param {Object[]} data.split.splits - Array of {userId, amount} for CUSTOM splits
 * @param {string} data.notes - Optional notes
 * @param {Date} data.date - Expense date (optional, defaults to now)
 * @returns {Object} Created expense with splits
 */
async function createExpense(data) {
  const { groupId, title, amount, paidBy, currency, split, notes, date } = data;

  // Validate required fields
  if (!groupId || !title || !amount || !paidBy) {
    throw new Error('Missing required fields: groupId, title, amount, paidBy');
  }

  // Fetch group and get default currency if not specified
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  const expenseCurrency = currency || group.currency;

  // Validate split configuration
  if (!split || !split.type) {
    throw new Error('Split configuration required with type (EQUAL or CUSTOM)');
  }

  // Calculate splits based on type
  let participants = [];
  let splitAmounts = {}; // userId -> amount

  if (split.type === 'EQUAL') {
    // Equal split among specified participants or all group members
    if (split.participants && split.participants.length > 0) {
      participants = split.participants;
    } else {
      // Default to all group members if no participants specified
      participants = group.members.map((m) => m.userId);
      if (!participants.includes(paidBy)) {
        participants.push(paidBy);
      }
    }
    
    const perPersonAmount = amount / participants.length;
    participants.forEach((userId) => {
      splitAmounts[userId] = parseFloat(perPersonAmount.toFixed(2));
    });
  } else if (split.type === 'CUSTOM') {
    // Custom amounts per person
    if (!split.splits || split.splits.length === 0) {
      throw new Error('CUSTOM split requires splits array with {userId, amount} objects');
    }

    // Validate custom amounts sum to total
    const customSum = split.splits.reduce((sum, item) => sum + item.amount, 0);
    const difference = Math.abs(customSum - amount);

    if (difference > 0.01) {
      // Allow small floating point difference
      throw new Error(`Custom amounts sum (${customSum}) does not match total amount (${amount})`);
    }

    participants = split.splits.map((item) => item.userId);
    split.splits.forEach((item) => {
      splitAmounts[item.userId] = parseFloat(item.amount.toFixed(2));
    });
  } else {
    throw new Error(`Invalid split type: ${split.type}. Must be EQUAL or CUSTOM`);
  }

  // Validate all participants are group members
  const groupMemberIds = group.members.map((m) => m.userId);
  for (const participantId of participants) {
    if (!groupMemberIds.includes(participantId)) {
      throw new Error(`User ${participantId} is not a member of group ${groupId}`);
    }
  }

  // Create expense record
  const expense = await prisma.expense.create({
    data: {
      title,
      amount: parseFloat(amount.toFixed(2)),
      currency: expenseCurrency,
      groupId,
      paidBy,
      date: date ? new Date(date) : new Date(),
      notes,
      splitType: split.type,
    },
  });

  // Create split records
  const splits = [];
  for (const [userId, splitAmount] of Object.entries(splitAmounts)) {
    const splitRecord = await prisma.expenseSplit.create({
      data: {
        expenseId: expense.id,
        userId,
        amount: splitAmount,
      },
    });
    splits.push(splitRecord);
  }

  return {
    ...expense,
    splits,
  };
}

/**
 * Get all expenses for a group
 * @param {string} groupId - Group ID
 * @param {Object} filters - Optional filters
 * @param {Date} filters.fromDate - Start date
 * @param {Date} filters.toDate - End date
 * @param {string} filters.currency - Filter by currency
 * @param {string} filters.userId - Filter by payer user ID
 * @returns {Array} List of expenses with splits
 */
async function getGroupExpenses(groupId, filters = {}) {
  const { fromDate, toDate, currency, userId } = filters;

  const where = {
    groupId,
  };

  if (fromDate || toDate) {
    where.date = {};
    if (fromDate) where.date.gte = new Date(fromDate);
    if (toDate) where.date.lte = new Date(toDate);
  }

  if (currency) {
    where.currency = currency;
  }

  if (userId) {
    where.paidBy = userId;
  }

  const expenses = await prisma.expense.findMany({
    where,
    include: {
      splits: true,
      payer: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { date: 'desc' }, // Sort by transaction date descending (latest first)
  });

  return expenses;
}

/**
 * Get a specific expense with its splits
 * @param {string} expenseId - Expense ID
 * @returns {Object} Expense with splits and payer details
 */
async function getExpense(expenseId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      splits: {
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      payer: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!expense) {
    throw new Error(`Expense with ID ${expenseId} not found`);
  }

  return expense;
}

/**
 * Update an expense and its splits
 * @param {string} expenseId - Expense ID
 * @param {Object} data - Update data (same fields as createExpense)
 * @returns {Object} Updated expense with splits
 */
async function updateExpense(expenseId, data) {
  const { title, amount, paidBy, currency, split, notes, date, groupId } = data;

  // Get existing expense
  const existingExpense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: { splits: true },
  });

  if (!existingExpense) {
    throw new Error(`Expense with ID ${expenseId} not found`);
  }

  // Fetch group for validation
  const group = await prisma.group.findUnique({
    where: { id: existingExpense.groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${existingExpense.groupId} not found`);
  }

  // Use provided groupId or existing one
  const targetGroupId = groupId || existingExpense.groupId;

  // Use provided values or keep existing ones
  const updatedTitle = title !== undefined ? title : existingExpense.title;
  const updatedAmount = amount !== undefined ? amount : existingExpense.amount;
  const updatedPaidBy = paidBy !== undefined ? paidBy : existingExpense.paidBy;
  const updatedCurrency = currency !== undefined ? currency : existingExpense.currency;
  const updatedNotes = notes !== undefined ? notes : existingExpense.notes;
  const updatedDate = date !== undefined ? new Date(date) : existingExpense.date;
  const updatedSplit = split !== undefined ? split : { type: existingExpense.splitType, participants: existingExpense.splits.map(s => s.userId) };

  // Validate split configuration
  if (!updatedSplit || !updatedSplit.type) {
    throw new Error('Split configuration required with type (EQUAL or CUSTOM)');
  }

  // Calculate new splits based on type
  let participants = [];
  let splitAmounts = {};

  if (updatedSplit.type === 'EQUAL') {
    if (updatedSplit.participants && updatedSplit.participants.length > 0) {
      participants = updatedSplit.participants;
    } else {
      participants = group.members.map((m) => m.userId);
      if (!participants.includes(updatedPaidBy)) {
        participants.push(updatedPaidBy);
      }
    }
    
    const perPersonAmount = updatedAmount / participants.length;
    participants.forEach((userId) => {
      splitAmounts[userId] = parseFloat(perPersonAmount.toFixed(2));
    });
  } else if (updatedSplit.type === 'CUSTOM') {
    if (!updatedSplit.splits || updatedSplit.splits.length === 0) {
      throw new Error('CUSTOM split requires splits array with {userId, amount} objects');
    }

    const customSum = updatedSplit.splits.reduce((sum, item) => sum + item.amount, 0);
    const difference = Math.abs(customSum - updatedAmount);

    if (difference > 0.01) {
      throw new Error(`Custom amounts sum (${customSum}) does not match total amount (${updatedAmount})`);
    }

    participants = updatedSplit.splits.map((item) => item.userId);
    updatedSplit.splits.forEach((item) => {
      splitAmounts[item.userId] = parseFloat(item.amount.toFixed(2));
    });
  } else {
    throw new Error(`Invalid split type: ${updatedSplit.type}. Must be EQUAL or CUSTOM`);
  }

  // Validate all participants are group members
  const groupMemberIds = group.members.map((m) => m.userId);
  for (const participantId of participants) {
    if (!groupMemberIds.includes(participantId)) {
      throw new Error(`User ${participantId} is not a member of group ${existingExpense.groupId}`);
    }
  }

  // Update expense record
  const updatedExpense = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      title: updatedTitle,
      amount: parseFloat(updatedAmount.toFixed(2)),
      currency: updatedCurrency,
      paidBy: updatedPaidBy,
      date: updatedDate,
      notes: updatedNotes,
      splitType: updatedSplit.type,
    },
  });

  // Delete old splits
  await prisma.expenseSplit.deleteMany({
    where: { expenseId },
  });

  // Create new splits
  const splits = [];
  for (const [userId, splitAmount] of Object.entries(splitAmounts)) {
    const splitRecord = await prisma.expenseSplit.create({
      data: {
        expenseId: updatedExpense.id,
        userId,
        amount: splitAmount,
      },
    });
    splits.push(splitRecord);
  }

  return {
    ...updatedExpense,
    splits,
  };
}

/**
 * Delete an expense and its splits
 * @param {string} expenseId - Expense ID
 * @returns {Object} Deleted expense
 */
async function deleteExpense(expenseId) {
  // Delete associated splits first
  await prisma.expenseSplit.deleteMany({
    where: { expenseId },
  });

  // Delete the expense
  const expense = await prisma.expense.delete({
    where: { id: expenseId },
  });

  return expense;
}

module.exports = {
  createExpense,
  getGroupExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
};
