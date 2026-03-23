const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Create a direct monetary transfer between group members
 * @param {Object} data - Transfer data
 * @param {string} data.groupId - Group ID
 * @param {string} data.title - Transfer title (e.g., "Payment")
 * @param {number} data.amount - Transfer amount
 * @param {string} data.senderId - Sender user ID
 * @param {string} data.receiverId - Receiver user ID
 * @param {string} data.currency - Currency code (optional, defaults to group currency)
 * @param {Date} data.date - Transfer date (optional, defaults to now)
 * @returns {Object} Created transfer record
 */
async function createTransfer(data) {
  const { groupId, title, amount, senderId, receiverId, currency, date } = data;

  // Validate required fields
  if (!groupId || !title || !amount || !senderId || !receiverId) {
    throw new Error('Missing required fields: groupId, title, amount, senderId, receiverId');
  }

  // Validate sender and receiver are different
  if (senderId === receiverId) {
    throw new Error('Sender and receiver cannot be the same person');
  }

  // Fetch group and validate members
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: true },
  });

  if (!group) {
    throw new Error(`Group with ID ${groupId} not found`);
  }

  const groupMemberIds = group.members.map((m) => m.userId);

  if (!groupMemberIds.includes(senderId)) {
    throw new Error(`Sender ${senderId} is not a member of group ${groupId}`);
  }

  if (!groupMemberIds.includes(receiverId)) {
    throw new Error(`Receiver ${receiverId} is not a member of group ${groupId}`);
  }

  // Validate amount
  if (amount <= 0) {
    throw new Error('Transfer amount must be greater than 0');
  }

  const transferCurrency = currency || group.currency;

  // Create transfer record
  const transfer = await prisma.transfer.create({
    data: {
      title,
      amount: parseFloat(amount.toFixed(2)),
      currency: transferCurrency,
      groupId,
      senderId,
      receiverId,
      date: date ? new Date(date) : new Date(),
    },
  });

  return transfer;
}

/**
 * Get all transfers for a group
 * @param {string} groupId - Group ID
 * @param {Object} filters - Optional filters
 * @param {Date} filters.fromDate - Start date
 * @param {Date} filters.toDate - End date
 * @param {string} filters.currency - Filter by currency
 * @param {string} filters.userId - Filter by sender or receiver
 * @returns {Array} List of transfers
 */
async function getGroupTransfers(groupId, filters = {}) {
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
    where.OR = [
      { senderId: userId },
      { receiverId: userId },
    ];
  }

  const transfers = await prisma.transfer.findMany({
    where,
    include: {
      sender: {
        select: { id: true, name: true, email: true },
      },
      receiver: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { date: 'desc' },
  });

  return transfers;
}

/**
 * Get a specific transfer
 * @param {string} transferId - Transfer ID
 * @returns {Object} Transfer record with sender/receiver details
 */
async function getTransfer(transferId) {
  const transfer = await prisma.transfer.findUnique({
    where: { id: transferId },
    include: {
      sender: {
        select: { id: true, name: true, email: true },
      },
      receiver: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  if (!transfer) {
    throw new Error(`Transfer with ID ${transferId} not found`);
  }

  return transfer;
}

/**
 * Delete a transfer
 * @param {string} transferId - Transfer ID
 * @returns {Object} Deleted transfer
 */
async function deleteTransfer(transferId) {
  const transfer = await prisma.transfer.delete({
    where: { id: transferId },
  });

  return transfer;
}

module.exports = {
  createTransfer,
  getGroupTransfers,
  getTransfer,
  deleteTransfer,
};
