const prisma = require('../utils/prismaClient');
const groupService = require('./groupService');
const notificationService = require('./notificationService');
const {
  attachInvitedMembersToTrip,
} = require('./memberInviteService');

const memberUserSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
};

const memberWithUserInclude = {
  members: {
    include: {
      user: {
        select: memberUserSelect,
      },
    },
  },
};

const normalizeName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const formatPlaceholderId = (tripId, name, index = 0) =>
  `placeholder-${tripId}-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const getPendingParticipants = (rawParticipants, actualMembers, tripId) => {
  const normalizedParticipants = groupService.normalizePreAddedParticipants(rawParticipants);
  const actualNames = new Set(
    actualMembers
      .map((member) => member.user?.name)
      .filter(Boolean)
      .map((name) => normalizeName(name))
  );

  return normalizedParticipants
    .filter((participant) => !actualNames.has(normalizeName(participant.name)))
    .map((participant, index) => ({
      id: participant.id || formatPlaceholderId(tripId, participant.name, index),
      name: participant.name,
      phone: participant.phone || null,
      role: 'member',
      avatarUrl: null,
      pending: true,
    }));
};

const mapTrip = (group) => {
  const members = group.members || [];
  const pendingParticipants = getPendingParticipants(group.preAddedParticipants, members, group.id);

  return {
    id: group.id,
    name: group.title,
    destination: group.destination || '',
    coverImage: group.coverImage || group.photoUrl || null,
    startDate: group.startDate.toISOString(),
    endDate: group.endDate.toISOString(),
    tripType: group.tripType || 'Other',
    membersCount: members.length + pendingParticipants.length,
    createdBy: group.createdBy,
    currency: group.currency,
    inviteLink: group.inviteLink,
  };
};

async function getTripForMember(tripId, userId, include = {}) {
  const trip = await prisma.group.findFirst({
    where: {
      id: tripId,
      members: {
        some: {
          userId,
        },
      },
    },
    include,
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  return trip;
}

async function ensureTripCreator(tripId, userId) {
  const trip = await prisma.group.findUnique({
    where: { id: tripId },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.createdBy !== userId) {
    throw new Error('Only the trip creator can perform this action');
  }

  return trip;
}

async function getUserTrips(userId, options = {}) {
  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.max(parseInt(options.limit, 10) || 10, 1);
  const skip = (page - 1) * limit;

  const where = {
    members: {
      some: {
        userId,
      },
    },
  };

  const [groups, total] = await prisma.$transaction([
    prisma.group.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: memberWithUserInclude,
    }),
    prisma.group.count({ where }),
  ]);

  return {
    trips: groups.map(mapTrip),
    total,
    page,
    limit,
  };
}

/**
 * Lean summary fetch — shell fields only, no member join.
 * Used by the "My Trips" list for instant shell loading.
 */
async function getTripSummaries(userId) {
  const groups = await prisma.group.findMany({
    where: { members: { some: { userId } } },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      title: true,
      destination: true,
      startDate: true,
      endDate: true,
      tripType: true,
      coverImage: true,
      photoUrl: true,
      createdBy: true,
      currency: true,
      inviteLink: true,
      preAddedParticipants: true,
      updatedAt: true,
      _count: { select: { members: true } },
    },
  });

  return groups.map((g) => ({
    id: g.id,
    name: g.title,
    destination: g.destination || '',
    coverImage: g.coverImage || g.photoUrl || null,
    startDate: g.startDate.toISOString(),
    endDate: g.endDate.toISOString(),
    tripType: g.tripType || 'Other',
    membersCount:
      g._count.members +
      (Array.isArray(g.preAddedParticipants) ? g.preAddedParticipants.length : 0),
    createdBy: g.createdBy,
    currency: g.currency,
    inviteLink: g.inviteLink,
    updatedAt: g.updatedAt.toISOString(),
  }));
}

/**
 * Partial update — only updates fields that are explicitly provided.
 */
async function patchTrip(groupId, userId, fields) {
  await ensureTripCreator(groupId, userId);

  // ── Optimistic Locking ──────────────────────────────────────────────────────
  // If the client sends updatedAt, verify it matches the DB version.
  // If the DB record is newer, the client has stale data → return 409 Conflict.
  if (fields.updatedAt) {
    const current = await prisma.group.findUnique({
      where: { id: groupId },
      select: { updatedAt: true, id: true, title: true, destination: true, startDate: true, endDate: true, tripType: true, coverImage: true, photoUrl: true, currency: true, simplifyDebts: true },
    });
    if (!current) throw new Error('Group not found or access denied');

    const clientTs = new Date(fields.updatedAt).getTime();
    const dbTs = current.updatedAt.getTime();

    if (dbTs > clientTs) {
      // Conflict: DB has a newer version — return fresh data so client can update
      const err = new Error('CONFLICT');
      err.statusCode = 409;
      err.freshData = {
        id: current.id,
        name: current.title,
        destination: current.destination || '',
        coverImage: current.coverImage || current.photoUrl || null,
        startDate: current.startDate.toISOString(),
        endDate: current.endDate.toISOString(),
        tripType: current.tripType || 'Other',
        currency: current.currency,
        simplifyDebts: current.simplifyDebts,
        updatedAt: current.updatedAt.toISOString(),
      };
      throw err;
    }
  }

  const allowed = ['title', 'destination', 'startDate', 'endDate', 'tripType', 'coverImage', 'simplifyDebts'];
  const data = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== undefined) {
      if (key === 'startDate' || key === 'endDate') {
        const d = new Date(fields[key]);
        if (isNaN(d.getTime())) throw new Error(`Invalid date for ${key}`);
        data[key] = d;
      } else {
        data[key] = fields[key];
      }
    }
  }

  if (Object.keys(data).length === 0) throw new Error('No valid fields to update');

  if (data.startDate || data.endDate) {
    const curr = await prisma.group.findUnique({ where: { id: groupId }, select: { startDate: true, endDate: true } });
    const nextStart = data.startDate || curr.startDate;
    const nextEnd = data.endDate || curr.endDate;
    if (nextEnd < nextStart) throw new Error('End date must be after or equal to start date');
  }

  const updated = await prisma.group.update({
    where: { id: groupId },
    data,
    select: { id: true, title: true, destination: true, startDate: true, endDate: true, tripType: true, coverImage: true, photoUrl: true, currency: true, simplifyDebts: true, updatedAt: true },
  });

  return {
    id: updated.id,
    name: updated.title,
    destination: updated.destination || '',
    coverImage: updated.coverImage || updated.photoUrl || null,
    startDate: updated.startDate.toISOString(),
    endDate: updated.endDate.toISOString(),
    tripType: updated.tripType || 'Other',
    currency: updated.currency,
    simplifyDebts: updated.simplifyDebts,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

async function getTripMembers(tripId, userId) {
  const trip = await getTripForMember(tripId, userId, {
    ...memberWithUserInclude,
  });

  const actualMembers = trip.members.map((member) => ({
    id: member.user.id,
    name: member.user.name || member.user.email || 'Traveller',
    phone: member.user.phoneNumber || null,
    role: member.user.id === trip.createdBy ? 'admin' : 'member',
    avatarUrl: null,
    pending: false,
  }));

  const pendingParticipants = getPendingParticipants(trip.preAddedParticipants, trip.members, trip.id);

  return [...actualMembers, ...pendingParticipants];
}

async function addTripMembers(tripId, members = [], userId) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('members must be a non-empty array');
  }

  await ensureTripCreator(tripId, userId);

  const trip = await getTripForMember(tripId, userId, {
    ...memberWithUserInclude,
  });

  const result = await attachInvitedMembersToTrip(trip, members);

  // Notify the group about new members
  notificationService.sendToGroup(
    tripId,
    {
      title: 'Members Added',
      body: `New members were added to the group`,
      data: { type: 'members_added', groupId: tripId },
    },
    userId
  );

  return result;
}

async function removeTripMember(tripId, memberId, userId) {
  if (!tripId || !memberId) {
    throw new Error('tripId and memberId are required');
  }

  await ensureTripCreator(tripId, userId);

  const trip = await getTripForMember(tripId, userId, {
    ...memberWithUserInclude,
    expenses: {
      include: {
        splits: true,
      },
    },
  });

  const pendingParticipants = groupService.normalizePreAddedParticipants(trip.preAddedParticipants);
  const pendingParticipant = pendingParticipants.find((participant) => participant.id === memberId);

  if (pendingParticipant) {
    const remainingParticipants = pendingParticipants.filter((participant) => participant.id !== memberId);

    await prisma.group.update({
      where: { id: tripId },
      data: {
        preAddedParticipants: remainingParticipants,
      },
    });

    return {
      id: pendingParticipant.id,
      name: pendingParticipant.name,
      pending: true,
    };
  }

  const membership = trip.members.find((member) => member.userId === memberId);

  if (!membership) {
    throw new Error('Member not found');
  }

  if (membership.userId === trip.createdBy) {
    throw new Error('Trip creator cannot be removed');
  }

  const hasExpenseHistory = trip.expenses.some(
    (expense) =>
      expense.paidBy === membership.userId ||
      expense.splits.some((split) => split.userId === membership.userId)
  );

  if (hasExpenseHistory) {
    throw new Error('Member cannot be removed after being used in trip expenses');
  }

  await prisma.groupMember.delete({
    where: { id: membership.id },
  });

  // Notify the removed member
  notificationService.sendToUser(memberId, {
    title: 'Removed from Group',
    body: 'You were removed from a group',
    data: { type: 'removed_from_group', groupId: tripId },
  });

  return {
    id: membership.user.id,
    name: membership.user.name || membership.user.email || 'Traveller',
    pending: false,
  };
}

async function leaveTrip(tripId, userId) {
  if (!tripId) {
    throw new Error('tripId is required');
  }

  const trip = await prisma.group.findUnique({
    where: { id: tripId },
    include: {
      members: true,
      expenses: {
        include: {
          splits: true,
        },
      },
    },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.createdBy === userId) {
    const deleted = await groupService.deleteGroup(tripId, true);
    return {
      tripId,
      action: 'deleted',
      deletedTrip: true,
      title: deleted.title,
    };
  }

  const membership = trip.members.find((member) => member.userId === userId);

  if (!membership) {
    throw new Error('You are not a member of this trip');
  }

  const hasExpenseHistory = trip.expenses.some(
    (expense) =>
      expense.paidBy === userId ||
      expense.splits.some((split) => split.userId === userId)
  );

  if (hasExpenseHistory) {
    throw new Error('You cannot leave a trip after participating in expenses');
  }

  await prisma.groupMember.delete({
    where: { id: membership.id },
  });

  return {
    tripId,
    action: 'left',
    deletedTrip: false,
  };
}

module.exports = {
  addTripMembers,
  getTripMembers,
  getTripSummaries,
  getUserTrips,
  leaveTrip,
  patchTrip,
  removeTripMember,
};
