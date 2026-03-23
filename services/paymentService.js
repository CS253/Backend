const prisma = require("../utils/prismaClient");

const EPSILON = 0.01;
const CURRENCY_SYMBOL = "\u20B9";
const AVATAR_COLORS = [
  0xFF9FDFCA,
  0xFFFABD9E,
  0xFFCCB3E6,
  0xFF87D4F8,
  0xFFFFD6A5,
  0xFFBDE0FE,
];

function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function isEffectivelyZero(value) {
  return Math.abs(value) < EPSILON;
}

function normalizeAmount(value, fieldName = "amount") {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createHttpError(400, `${fieldName} must be a valid positive number`);
  }

  return roundCurrency(amount);
}

function getDisplayName(user) {
  if (!user) {
    return "Unknown";
  }

  if (user.name && user.name.trim()) {
    return user.name.trim();
  }

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "Unknown";
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "NA";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getAvatarColor(identifier) {
  const input = String(identifier || "");
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatAmount(amount) {
  const rounded = roundCurrency(amount);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

function buildUpiUrl({ payeeUpiId, payeeName, amount, note }) {
  const params = new URLSearchParams({
    pa: payeeUpiId,
    pn: payeeName,
    am: roundCurrency(amount).toFixed(2),
    cu: "INR",
  });

  if (note) {
    params.set("tn", note);
  }

  return `upi://pay?${params.toString()}`;
}

function normalizeSettlementMethod(value) {
  if (!value) {
    return "MANUAL";
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "UPI") {
    return "UPI";
  }

  if (normalized === "MANUAL") {
    return "MANUAL";
  }

  throw createHttpError(400, "payment_method must be either 'upi' or 'manual'");
}

function normalizeSettlementAction(action, status) {
  const normalizedAction = action ? String(action).trim().toLowerCase() : "";
  const normalizedStatus = status ? String(status).trim().toLowerCase() : "";

  if (normalizedAction === "confirm" || normalizedStatus === "completed") {
    return "confirm";
  }

  return "initiate";
}

function parsePaidAt(value) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }

  return parsed;
}

async function ensureGroupMembership(groupId, userId) {
  if (!groupId) {
    throw createHttpError(400, "group_id is required");
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      userId_groupId: {
        userId,
        groupId,
      },
    },
  });

  if (!membership) {
    throw createHttpError(403, "You are not a member of this group");
  }
}

async function getGroupFinanceSnapshot(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: true,
        },
      },
      expenses: {
        orderBy: { date: "desc" },
        include: {
          payer: true,
          splits: {
            include: {
              user: true,
            },
          },
        },
      },
      settlements: {
        orderBy: { initiatedAt: "desc" },
        include: {
          fromUser: true,
          toUser: true,
          confirmedByUser: true,
        },
      },
    },
  });

  if (!group) {
    throw createHttpError(404, "Group not found");
  }

  return group;
}

function computeSettlementPlan(group) {
  const membersById = new Map();
  const netBalances = new Map();

  for (const member of group.members) {
    membersById.set(member.userId, member.user);
    netBalances.set(member.userId, 0);
  }

  for (const expense of group.expenses) {
    netBalances.set(
      expense.paidBy,
      roundCurrency((netBalances.get(expense.paidBy) || 0) + expense.amount),
    );

    for (const split of expense.splits) {
      netBalances.set(
        split.userId,
        roundCurrency((netBalances.get(split.userId) || 0) - split.amount),
      );
    }
  }

  for (const settlement of group.settlements) {
    if (settlement.status !== "COMPLETED" && !settlement.isPaid) {
      continue;
    }

    netBalances.set(
      settlement.fromUserId,
      roundCurrency((netBalances.get(settlement.fromUserId) || 0) + settlement.amount),
    );
    netBalances.set(
      settlement.toUserId,
      roundCurrency((netBalances.get(settlement.toUserId) || 0) - settlement.amount),
    );
  }

  const creditors = [];
  const debtors = [];

  for (const [userId, balance] of netBalances.entries()) {
    if (balance > EPSILON) {
      creditors.push({ userId, amount: roundCurrency(balance) });
    } else if (balance < -EPSILON) {
      debtors.push({ userId, amount: roundCurrency(Math.abs(balance)) });
    }
  }

  creditors.sort((left, right) => right.amount - left.amount);
  debtors.sort((left, right) => right.amount - left.amount);

  const suggestions = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = roundCurrency(Math.min(creditor.amount, debtor.amount));

    if (!isEffectivelyZero(amount)) {
      suggestions.push({
        fromUserId: debtor.userId,
        toUserId: creditor.userId,
        amount,
      });
    }

    creditor.amount = roundCurrency(creditor.amount - amount);
    debtor.amount = roundCurrency(debtor.amount - amount);

    if (isEffectivelyZero(creditor.amount)) {
      creditorIndex += 1;
    }

    if (isEffectivelyZero(debtor.amount)) {
      debtorIndex += 1;
    }
  }

  return { membersById, netBalances, suggestions };
}

function serializeSettlement(settlement) {
  return {
    id: settlement.id,
    group_id: settlement.groupId,
    from_user_id: settlement.fromUserId,
    from_user_name: getDisplayName(settlement.fromUser),
    to_user_id: settlement.toUserId,
    to_user_name: getDisplayName(settlement.toUser),
    amount: roundCurrency(settlement.amount),
    payment_method: settlement.method.toLowerCase(),
    status: settlement.status.toLowerCase(),
    transaction_id: settlement.transactionId,
    notes: settlement.notes,
    upi_url: settlement.upiUrl,
    payee_upi_id: settlement.toUser?.upiId || null,
    initiated_at: settlement.initiatedAt,
    paid_at: settlement.paidAt,
    confirmed_at: settlement.confirmedAt,
    confirmed_by: settlement.confirmedBy,
  };
}

async function getExpensesForUser(groupId, userId) {
  await ensureGroupMembership(groupId, userId);
  const group = await getGroupFinanceSnapshot(groupId);

  return group.expenses.map((expense) => {
    const payerName = expense.paidBy === userId ? "You" : getDisplayName(expense.payer);
    const yourShare =
      expense.splits.find((split) => split.userId === userId)?.amount || 0;

    return {
      id: expense.id,
      group_id: expense.groupId,
      title: expense.title,
      amount: roundCurrency(expense.amount),
      payer_name: payerName,
      payer_initials: getInitials(getDisplayName(expense.payer)),
      payer_color: getAvatarColor(expense.paidBy),
      date: formatDate(expense.date),
      your_share: roundCurrency(yourShare),
      share_text_prefix: expense.paidBy === userId ? "You paid" : "Your share",
      status: expense.paidBy === userId || isEffectivelyZero(yourShare) ? "Settled" : "Pending",
      splits: expense.splits.map((split) => ({
        user_id: split.userId,
        name: getDisplayName(split.user),
        amount: roundCurrency(split.amount),
      })),
    };
  });
}

function splitAmountAcrossParticipants(totalAmount, participantIds) {
  const totalCents = Math.round(totalAmount * 100);
  const baseCents = Math.floor(totalCents / participantIds.length);
  const remainder = totalCents % participantIds.length;

  return participantIds.map((participantId, index) => ({
    userId: participantId,
    amount: (baseCents + (index < remainder ? 1 : 0)) / 100,
  }));
}

async function createExpense({
  groupId,
  title,
  amount,
  currentUserId,
  paidBy,
  participantUserIds,
  date,
}) {
  if (!title || !String(title).trim()) {
    throw createHttpError(400, "title is required");
  }

  await ensureGroupMembership(groupId, currentUserId);
  const group = await getGroupFinanceSnapshot(groupId);
  const memberIds = group.members.map((member) => member.userId);
  const payerId = paidBy || currentUserId;

  if (!memberIds.includes(payerId)) {
    throw createHttpError(400, "paid_by must belong to the group");
  }

  const rawParticipants = Array.isArray(participantUserIds) && participantUserIds.length
    ? [...new Set(participantUserIds)]
    : memberIds;

  if (!rawParticipants.length) {
    throw createHttpError(400, "At least one participant is required");
  }

  for (const participantId of rawParticipants) {
    if (!memberIds.includes(participantId)) {
      throw createHttpError(400, "All split participants must belong to the group");
    }
  }

  const normalizedAmount = normalizeAmount(amount);
  const splits = splitAmountAcrossParticipants(normalizedAmount, rawParticipants);
  const expenseDate = date ? new Date(date) : new Date();

  if (Number.isNaN(expenseDate.getTime())) {
    throw createHttpError(400, "date must be a valid ISO date string");
  }

  const expense = await prisma.expense.create({
    data: {
      title: String(title).trim(),
      amount: normalizedAmount,
      groupId,
      paidBy: payerId,
      date: expenseDate,
      splits: {
        create: splits,
      },
    },
    include: {
      payer: true,
      splits: {
        include: {
          user: true,
        },
      },
    },
  });

  return expense;
}

async function deleteExpense(expenseId, currentUserId) {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      group: true,
    },
  });

  if (!expense) {
    throw createHttpError(404, "Expense not found");
  }

  if (expense.paidBy !== currentUserId && expense.group.createdBy !== currentUserId) {
    throw createHttpError(403, "Only the payer or trip creator can delete this expense");
  }

  await prisma.expenseSplit.deleteMany({
    where: {
      expenseId,
    },
  });

  await prisma.expense.delete({
    where: {
      id: expenseId,
    },
  });
}

async function getBalancesForUser(groupId, userId) {
  await ensureGroupMembership(groupId, userId);
  const group = await getGroupFinanceSnapshot(groupId);
  const { suggestions } = computeSettlementPlan(group);

  const balances = group.members
    .filter((member) => member.userId !== userId)
    .map((member) => {
      const peer = member.user;
      const outgoing = suggestions.find(
        (suggestion) =>
          suggestion.fromUserId === userId && suggestion.toUserId === member.userId,
      );
      const incoming = suggestions.find(
        (suggestion) =>
          suggestion.fromUserId === member.userId && suggestion.toUserId === userId,
      );

      let direction = "settled";
      let amount = 0;
      let statusText = "Settled";
      let statusColor = 0xFFE0F5EE;
      let statusTextColor = 0xFF339977;

      if (outgoing) {
        direction = "owe";
        amount = outgoing.amount;
        statusText = `You owe ${CURRENCY_SYMBOL}${formatAmount(amount)}`;
        statusColor = 0xFFFBE9EC;
        statusTextColor = 0xFFD1475E;
      } else if (incoming) {
        direction = "collect";
        amount = incoming.amount;
        statusText = `Owes You ${CURRENCY_SYMBOL}${formatAmount(amount)}`;
      }

      const displayName = getDisplayName(peer);
      const upiUrl =
        direction === "owe" && peer.upiId
          ? buildUpiUrl({
              payeeUpiId: peer.upiId,
              payeeName: displayName,
              amount,
              note: `Travelly settlement for ${group.title}`,
            })
          : null;

      return {
        id: member.userId,
        user_id: member.userId,
        group_id: group.id,
        name: displayName,
        initials: getInitials(displayName),
        avatar_color: getAvatarColor(member.userId),
        amount: roundCurrency(amount),
        direction,
        status_text: statusText,
        status_color: statusColor,
        status_text_color: statusTextColor,
        payee_upi_id: direction === "owe" ? peer.upiId || null : null,
        upi_url: upiUrl,
      };
    })
    .sort((left, right) => {
      const leftSettled = left.direction === "settled" ? 1 : 0;
      const rightSettled = right.direction === "settled" ? 1 : 0;
      if (leftSettled !== rightSettled) {
        return leftSettled - rightSettled;
      }

      return left.name.localeCompare(right.name);
    });

  const totalYouOwe = roundCurrency(
    suggestions
      .filter((suggestion) => suggestion.fromUserId === userId)
      .reduce((sum, suggestion) => sum + suggestion.amount, 0),
  );

  const totalYouAreOwed = roundCurrency(
    suggestions
      .filter((suggestion) => suggestion.toUserId === userId)
      .reduce((sum, suggestion) => sum + suggestion.amount, 0),
  );

  return {
    group_id: group.id,
    group_title: group.title,
    balances,
    suggested_settlements: suggestions.map((suggestion) => ({
      from_user_id: suggestion.fromUserId,
      from_user_name: getDisplayName(
        group.members.find((member) => member.userId === suggestion.fromUserId)?.user,
      ),
      to_user_id: suggestion.toUserId,
      to_user_name: getDisplayName(
        group.members.find((member) => member.userId === suggestion.toUserId)?.user,
      ),
      amount: roundCurrency(suggestion.amount),
    })),
    summary: {
      total_you_owe: totalYouOwe,
      total_you_are_owed: totalYouAreOwed,
      net_balance: roundCurrency(totalYouAreOwed - totalYouOwe),
    },
  };
}

async function createSettlement({
  groupId,
  currentUserId,
  toUserId,
  amount,
  paymentMethod,
  action,
  status,
  transactionId,
  notes,
  paidAt,
}) {
  await ensureGroupMembership(groupId, currentUserId);
  const group = await getGroupFinanceSnapshot(groupId);

  if (!toUserId) {
    throw createHttpError(400, "to_user_id is required");
  }

  if (toUserId === currentUserId) {
    throw createHttpError(400, "You cannot settle with yourself");
  }

  const recipient = group.members.find((member) => member.userId === toUserId);
  if (!recipient) {
    throw createHttpError(400, "Recipient must belong to the same group");
  }

  const normalizedAmount = normalizeAmount(amount);
  const normalizedMethod = normalizeSettlementMethod(paymentMethod);
  const normalizedAction = normalizeSettlementAction(action, status);
  const { suggestions } = computeSettlementPlan(group);
  const outstanding = suggestions.find(
    (suggestion) =>
      suggestion.fromUserId === currentUserId && suggestion.toUserId === toUserId,
  );

  if (!outstanding) {
    throw createHttpError(400, "You do not currently owe this member any balance");
  }

  if (normalizedAmount - outstanding.amount > EPSILON) {
    throw createHttpError(
      400,
      `Amount exceeds outstanding balance. Maximum payable amount is ${formatAmount(outstanding.amount)}`,
    );
  }

  if (normalizedMethod === "UPI" && !recipient.user.upiId) {
    throw createHttpError(400, "This member has not saved a UPI ID yet");
  }

  const shouldComplete = normalizedAction === "confirm";
  const finalizedPaidAt = shouldComplete ? parsePaidAt(paidAt) : null;
  const upiUrl =
    normalizedMethod === "UPI"
      ? buildUpiUrl({
          payeeUpiId: recipient.user.upiId,
          payeeName: getDisplayName(recipient.user),
          amount: normalizedAmount,
          note: `Travelly settlement for ${group.title}`,
        })
      : null;

  const settlement = await prisma.settlement.create({
    data: {
      fromUserId: currentUserId,
      toUserId,
      groupId,
      amount: normalizedAmount,
      method: normalizedMethod,
      status: shouldComplete ? "COMPLETED" : "PENDING",
      transactionId: transactionId || null,
      notes: notes || null,
      upiUrl,
      paidAt: finalizedPaidAt,
      confirmedAt: shouldComplete ? new Date() : null,
      confirmedBy: shouldComplete ? currentUserId : null,
      isPaid: shouldComplete,
    },
    include: {
      fromUser: true,
      toUser: true,
      group: true,
    },
  });

  return {
    settlement: serializeSettlement(settlement),
    outstanding_before: roundCurrency(outstanding.amount),
    outstanding_after: roundCurrency(Math.max(0, outstanding.amount - normalizedAmount)),
  };
}

async function confirmSettlement({
  settlementId,
  currentUserId,
  transactionId,
  notes,
  paidAt,
}) {
  if (!settlementId) {
    throw createHttpError(400, "settlement_id is required");
  }

  const existingSettlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      fromUser: true,
      toUser: true,
    },
  });

  if (!existingSettlement) {
    throw createHttpError(404, "Settlement not found");
  }

  if (existingSettlement.fromUserId !== currentUserId) {
    throw createHttpError(403, "Only the payer can confirm this settlement");
  }

  if (existingSettlement.status === "COMPLETED" || existingSettlement.isPaid) {
    throw createHttpError(400, "Settlement has already been confirmed");
  }

  const settlement = await prisma.settlement.update({
    where: {
      id: settlementId,
    },
    data: {
      status: "COMPLETED",
      isPaid: true,
      transactionId: transactionId || existingSettlement.transactionId,
      notes: notes || existingSettlement.notes,
      paidAt: parsePaidAt(paidAt),
      confirmedAt: new Date(),
      confirmedBy: currentUserId,
    },
    include: {
      fromUser: true,
      toUser: true,
    },
  });

  return serializeSettlement(settlement);
}

async function getSettlementHistory(groupId, userId) {
  await ensureGroupMembership(groupId, userId);

  const settlements = await prisma.settlement.findMany({
    where: {
      groupId,
    },
    orderBy: {
      initiatedAt: "desc",
    },
    include: {
      fromUser: true,
      toUser: true,
    },
  });

  return settlements.map(serializeSettlement);
}

module.exports = {
  createExpense,
  createHttpError,
  deleteExpense,
  getBalancesForUser,
  getExpensesForUser,
  getSettlementHistory,
  createSettlement,
  confirmSettlement,
  getDisplayName,
  getInitials,
  getAvatarColor,
  roundCurrency,
};
