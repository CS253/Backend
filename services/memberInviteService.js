const prisma = require('../utils/prismaClient');
const groupService = require('./groupService');

const normalizePhone = (phone) => {
  if (typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '');
};

const lastTenDigits = (phone) => {
  const digits = normalizePhone(phone);
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const phonesMatch = (invitePhone, userPhone) => {
  const inviteDigits = lastTenDigits(invitePhone);
  const userDigits = lastTenDigits(userPhone);

  if (!inviteDigits || !userDigits) {
    return false;
  }

  return inviteDigits === userDigits;
};

const findUserByPhone = async (phone) => {
  const suffix = lastTenDigits(phone);
  if (!suffix) return null;

  return prisma.user.findFirst({
    where: {
      phoneNumber: {
        endsWith: suffix,
      },
    },
  });
};

const createMembershipIfMissing = async (groupId, userId) => {
  const existing = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });

  if (existing) {
    return existing;
  }

  return prisma.groupMember.create({
    data: { groupId, userId },
  });
};

const claimPendingParticipantsForUser = async (user) => {
  if (!user?.id || !user?.phoneNumber) {
    return { claimedGroups: 0, claimedParticipants: 0 };
  }

  const groups = await prisma.group.findMany({
    include: {
      members: true,
    },
  });

  let claimedGroups = 0;
  let claimedParticipants = 0;

  for (const group of groups) {
    const participants = groupService.normalizePreAddedParticipants(group.preAddedParticipants);
    if (participants.length === 0) {
      continue;
    }

    const matchingParticipants = participants.filter((participant) =>
      phonesMatch(participant.phone, user.phoneNumber)
    );

    if (matchingParticipants.length === 0) {
      continue;
    }

    const isAlreadyMember = group.members.some((member) => member.userId === user.id);
    if (!isAlreadyMember) {
      await createMembershipIfMissing(group.id, user.id);
    }

    const remainingParticipants = participants.filter(
      (participant) => !phonesMatch(participant.phone, user.phoneNumber)
    );

    await prisma.group.update({
      where: { id: group.id },
      data: {
        preAddedParticipants: remainingParticipants,
      },
    });

    claimedGroups += 1;
    claimedParticipants += matchingParticipants.length;
  }

  return { claimedGroups, claimedParticipants };
};

const attachInvitedMembersToTrip = async (trip, members = []) => {
  const existingPending = groupService.normalizePreAddedParticipants(trip.preAddedParticipants);
  const existingMemberIds = new Set(trip.members.map((member) => member.userId));
  const existingPendingPhones = new Set(
    existingPending.map((participant) => lastTenDigits(participant.phone)).filter(Boolean)
  );
  const existingPendingNames = new Set(
    existingPending.map((participant) => participant.name.trim().toLowerCase())
  );

  const linkedMembers = [];
  const pendingParticipants = [];
  const seenPhonesInRequest = new Set();
  const seenNamesInRequest = new Set();

  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    const name = typeof member?.name === 'string' ? member.name.trim() : '';
    const phone = typeof member?.phone === 'string' ? member.phone.trim() : '';
    const phoneKey = lastTenDigits(phone);
    const nameKey = name.toLowerCase();

    if (phoneKey && seenPhonesInRequest.has(phoneKey)) {
      throw new Error(`Duplicate member phone numbers are not allowed: ${phone}`);
    }

    if (nameKey && seenNamesInRequest.has(nameKey)) {
      throw new Error(`Duplicate member names are not allowed: ${name}`);
    }

    if (nameKey) {
      seenNamesInRequest.add(nameKey);
    }
    if (phoneKey) {
      seenPhonesInRequest.add(phoneKey);
    }

    if (phoneKey && existingPendingPhones.has(phoneKey)) {
      throw new Error(`A pending invite already exists for phone ${phone}`);
    }

    if (existingPendingNames.has(nameKey)) {
      throw new Error(`Duplicate member names are not allowed: ${name}`);
    }

    const existingUser = phoneKey ? await findUserByPhone(phone) : null;

    if (existingUser) {
      if (existingMemberIds.has(existingUser.id)) {
        throw new Error(`${existingUser.name || existingUser.email || 'This user'} is already a member of the trip`);
      }

      await createMembershipIfMissing(trip.id, existingUser.id);
      existingMemberIds.add(existingUser.id);

      linkedMembers.push({
        id: existingUser.id,
        name: existingUser.name || existingUser.email || name,
        phone: existingUser.phoneNumber || phone || null,
        role: existingUser.id === trip.createdBy ? 'admin' : 'member',
        avatarUrl: null,
        pending: false,
      });

      continue;
    }

    if (!name) {
      if (phoneKey) {
        throw new Error('No registered user found with this phone number');
      }

      throw new Error(`Member name is required at index ${index}`);
    }

    pendingParticipants.push({
      id: `placeholder-${trip.id}-${existingPending.length + pendingParticipants.length}-${nameKey.replace(/[^a-z0-9]+/g, '-')}`,
      name,
      phone: phone || null,
    });
  }

  const updatedParticipants = [...existingPending, ...pendingParticipants];

  if (updatedParticipants.length !== existingPending.length) {
    await prisma.group.update({
      where: { id: trip.id },
      data: {
        preAddedParticipants: updatedParticipants,
      },
    });
  }

  return [
    ...linkedMembers,
    ...pendingParticipants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      phone: participant.phone,
      role: 'member',
      avatarUrl: null,
      pending: true,
    })),
  ];
};

module.exports = {
  attachInvitedMembersToTrip,
  claimPendingParticipantsForUser,
  findUserByPhone,
  lastTenDigits,
  normalizePhone,
  phonesMatch,
};
