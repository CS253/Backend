const { PrismaClient } = require('@prisma/client');
const groupService = require('./groupService');
const { admin } = require('./firebaseAdmin');
const {
  attachInvitedMembersToTrip,
  claimPendingParticipantsForUser,
} = require('./memberInviteService');

const prisma = new PrismaClient();

const normalizeName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const formatPlaceholderId = (tripId, name, index = 0) =>
  `placeholder-${tripId}-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

const resolveUserId = async (userIdentifier, authorizationHeader = null) => {
  if (userIdentifier) {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ id: userIdentifier }, { firebaseUid: userIdentifier }],
      },
      select: {
        id: true,
        phoneNumber: true,
      },
    });

    if (existingUser) {
      await claimPendingParticipantsForUser(existingUser);
      return existingUser.id;
    }
  }

  const token = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice(7).trim()
    : null;

  if (!token) {
    throw new Error('User not found');
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    const { uid, email, name } = decodedToken;

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ firebaseUid: uid }, ...(email ? [{ email }] : [])],
      },
    });

    if (user) {
      if (user.firebaseUid !== uid) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            firebaseUid: uid,
            name: user.name || name || undefined,
            email: user.email || email || undefined,
          },
        });
      }

      await claimPendingParticipantsForUser(user);
      return user.id;
    }

    if (!email) {
      throw new Error('User not found');
    }

    user = await prisma.user.create({
      data: {
        firebaseUid: uid,
        email,
        name: name || email.split('@')[0],
      },
    });

    await claimPendingParticipantsForUser(user);
    return user.id;
  } catch (error) {
    throw new Error('User not found');
  }
};

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
    coverImage: group.coverImage || null,
    startDate: group.startDate.toISOString(),
    endDate: group.endDate.toISOString(),
    tripType: group.tripType || 'Other',
    membersCount: members.length + pendingParticipants.length,
    createdBy: group.createdBy,
    currency: group.currency,
    inviteLink: group.inviteLink,
  };
};

async function createTrip(data, clientIp, authorizationHeader = null) {
  const { name, destination, startDate, endDate, tripType, createdBy, coverImage } = data;

  if (!name || !destination || !startDate || !endDate || !createdBy) {
    throw new Error('name, destination, startDate, endDate, and createdBy are required');
  }

  const resolvedCreatedBy = await resolveUserId(createdBy, authorizationHeader);

  const createdGroup = await groupService.createGroupWithParticipants(
    {
      title: name,
      destination,
      startDate,
      endDate,
      tripType,
      createdBy: resolvedCreatedBy,
      coverImage,
    },
    clientIp
  );

  const trip = await prisma.group.findUnique({
    where: { id: createdGroup.groupId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
    },
  });

  return mapTrip(trip);
}

async function getUserTrips(userId, options = {}, authorizationHeader = null) {
  const resolvedUserId = await resolveUserId(userId, authorizationHeader);

  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.max(parseInt(options.limit, 10) || 10, 1);
  const skip = (page - 1) * limit;

  const where = {
    members: {
      some: {
        userId: resolvedUserId,
      },
    },
  };

  const [groups, total] = await prisma.$transaction([
    prisma.group.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
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

async function getTripById(tripId, userId = null, authorizationHeader = null) {
  if (!tripId) {
    throw new Error('tripId is required');
  }

  const resolvedUserId = userId
    ? await resolveUserId(userId, authorizationHeader)
    : null;

  const where = resolvedUserId
    ? {
        id: tripId,
        members: {
          some: {
            userId: resolvedUserId,
          },
        },
      }
    : { id: tripId };

  const trip = await prisma.group.findFirst({
    where,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
    },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  return mapTrip(trip);
}

async function getTripMembers(tripId) {
  const trip = await prisma.group.findUnique({
    where: { id: tripId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

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

async function addTripMembers(tripId, members = []) {
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error('members must be a non-empty array');
  }

  const trip = await prisma.group.findUnique({
    where: { id: tripId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  return attachInvitedMembersToTrip(trip, members);
}

async function updateTrip(tripId, data) {
  const trip = await prisma.group.findUnique({
    where: { id: tripId },
  });

  if (!trip) {
    throw new Error('Trip not found');
  }

  const nextStartDate = data.startDate ? new Date(data.startDate) : trip.startDate;
  const nextEndDate = data.endDate ? new Date(data.endDate) : trip.endDate;

  if (Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
    throw new Error('Invalid trip dates provided');
  }

  if (nextEndDate < nextStartDate) {
    throw new Error('End date must be after or equal to start date');
  }

  await prisma.group.update({
    where: { id: tripId },
    data: {
      title: data.name ?? trip.title,
      destination: data.destination ?? trip.destination,
      startDate: nextStartDate,
      endDate: nextEndDate,
      tripType: data.tripType ?? trip.tripType,
      coverImage: data.coverImage ?? trip.coverImage,
    },
  });

  return getTripById(tripId);
}

async function removeTripMember(tripId, memberId) {
  if (!tripId || !memberId) {
    throw new Error('tripId and memberId are required');
  }

  const trip = await prisma.group.findUnique({
    where: { id: tripId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
        },
      },
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

  return {
    id: membership.user.id,
    name: membership.user.name || membership.user.email || 'Traveller',
    pending: false,
  };
}

async function leaveTrip(tripId, userIdentifier, authorizationHeader = null) {
  if (!tripId) {
    throw new Error('tripId is required');
  }

  const resolvedUserId = await resolveUserId(userIdentifier, authorizationHeader);

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

  if (trip.createdBy === resolvedUserId) {
    const deleted = await groupService.deleteGroup(tripId, true);
    return {
      tripId,
      action: 'deleted',
      deletedTrip: true,
      title: deleted.title,
    };
  }

  const membership = trip.members.find((member) => member.userId === resolvedUserId);

  if (!membership) {
    throw new Error('You are not a member of this trip');
  }

  const hasExpenseHistory = trip.expenses.some(
    (expense) =>
      expense.paidBy === resolvedUserId ||
      expense.splits.some((split) => split.userId === resolvedUserId)
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
  createTrip,
  getTripById,
  getTripMembers,
  getUserTrips,
  leaveTrip,
  removeTripMember,
  updateTrip,
};
