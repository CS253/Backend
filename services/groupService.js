const { PrismaClient } = require('@prisma/client');
const geoip = require('geoip-lite');

const prisma = new PrismaClient();

// Country to Currency mapping
const countryToCurrency = {
  IN: 'INR',
  US: 'USD',
  GB: 'GBP',
  EU: 'EUR',
  CA: 'CAD',
  AU: 'AUD',
  JP: 'JPY',
  CN: 'CNY',
  CH: 'CHF',
  SG: 'SGD',
  // Default for European countries to EUR
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PL: 'EUR',
  SE: 'EUR',
  NO: 'NOK',
  DK: 'DKK',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  GR: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  CY: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
};

const normalizeParticipantName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const normalizePreAddedParticipants = (participants = []) => {
  if (!Array.isArray(participants)) {
    return [];
  }

  return participants
    .map((participant, index) => {
      if (typeof participant === 'string') {
        const name = participant.trim();
        return name
          ? {
              id: `placeholder-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
              name,
              phone: null,
            }
          : null;
      }

      if (participant && typeof participant === 'object') {
        const name = typeof participant.name === 'string' ? participant.name.trim() : '';
        if (!name) return null;

        return {
          id:
            typeof participant.id === 'string' && participant.id.trim() !== ''
              ? participant.id.trim()
              : `placeholder-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
          name,
          phone:
            typeof participant.phone === 'string' && participant.phone.trim() !== ''
              ? participant.phone.trim()
              : null,
        };
      }

      return null;
    })
    .filter(Boolean);
};

/**
 * Get currency from IP address
 * @param {string} ip - Client IP address
 * @returns {string} Currency code or 'INR' as default
 */
const getCurrencyFromIP = (ip) => {
  try {
    // Remove IPv6 prefix if present
    const cleanIp = ip.replace(/::ffff:/, '');
    
    const geo = geoip.lookup(cleanIp);
    
    if (geo && geo.country) {
      return countryToCurrency[geo.country] || 'INR';
    }
  } catch (error) {
    console.error('Error looking up IP geolocation:', error.message);
  }
  
  // Default to INR if geolocation fails
  return 'INR';
};

/**
 * Create a new group with pre-added participants
 * FR-5 Implementation
 */
const createGroupWithParticipants = async (groupData, clientIp) => {
  const {
    title,
    createdBy,
    preAddedParticipants = [], // Array of participant names ["Alice", "Bob"]
    currency = null,
    destination = '',
    startDate = null,
    endDate = null,
    tripType = 'Other',
    coverImage = null,
  } = groupData;

  // Validate required fields
  if (!title || !createdBy) {
    throw new Error('Title and createdBy are required');
  }

  // Validate pre-added participants are unique
  const normalizedParticipants = normalizePreAddedParticipants(preAddedParticipants);

  if (normalizedParticipants.length > 0) {
    const uniqueNames = new Set(normalizedParticipants.map((participant) => participant.name.toLowerCase()));
    if (uniqueNames.size !== normalizedParticipants.length) {
      throw new Error('Duplicate names in pre-added participants. Each name must be unique.');
    }
  }

  const parsedStartDate = startDate ? new Date(startDate) : new Date();
  const parsedEndDate = endDate ? new Date(endDate) : parsedStartDate;

  if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
    throw new Error('Invalid trip dates provided');
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error('End date must be after or equal to start date');
  }

  // Auto-detect currency from IP if not provided
  let finalCurrency = currency;
  if (!finalCurrency) {
    finalCurrency = getCurrencyFromIP(clientIp);
  }

  // Generate unique invite link
  const inviteLink = 'invite-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

  try {
    // Create group
    const group = await prisma.group.create({
      data: {
        title,
        destination: destination || '',
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        tripType: tripType || 'Other',
        coverImage,
        currency: finalCurrency,
        createdBy,
        inviteLink,
        inviteLinkStatus: 'ACTIVE',
        preAddedParticipants: Array.isArray(preAddedParticipants) ? preAddedParticipants : [],
      },
    });

    // Add creator as group member
    await prisma.groupMember.create({
      data: {
        userId: createdBy,
        groupId: group.id,
      },
    });

    return {
      groupId: group.id,
      title: group.title,
      destination: group.destination,
      startDate: group.startDate,
      endDate: group.endDate,
      tripType: group.tripType,
      coverImage: group.coverImage,
      currency: group.currency,
      inviteLink: group.inviteLink,
      preAddedParticipants: group.preAddedParticipants,
      createdAt: group.createdAt,
    };
  } catch (error) {
    throw new Error(`Failed to create group: ${error.message}`);
  }
};

/**
 * Join an existing group via invite link
 * FR-6 Implementation
 */
const joinGroupByInviteLink = async (inviteLink, userId, participantName) => {
  // Validate inputs
  if (!inviteLink || !userId || !participantName) {
    throw new Error('Invite link, user ID, and participant name are required');
  }

  try {
    // Find group by invite link
    const group = await prisma.group.findUnique({
      where: { inviteLink },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Validate invite link exists and is active
    if (!group) {
      throw new Error('Invite link expired');
    }

    if (group.inviteLinkStatus !== 'ACTIVE') {
      throw new Error('Invite link expired');
    }

    // Check if user is already a member of this group
    const existingMember = group.members.find((m) => m.userId === userId);
    if (existingMember) {
      throw new Error('User is already a member of this group');
    }

    // Extract already joined members' names
    const alreadyJoinedNames = new Set();
    group.members.forEach((member) => {
      if (member.user.name) {
        alreadyJoinedNames.add(member.user.name);
      }
    });

    // Check if participant name is already taken by a joined member
    if (alreadyJoinedNames.has(participantName)) {
      throw new Error('This participant has already joined the group');
    }

    // Get pre-added participants list
    const preAddedParticipants = normalizePreAddedParticipants(group.preAddedParticipants || []);

    // Check if participant name is in pre-added list or is new
    const isPreAdded = preAddedParticipants.some(
      (participant) => normalizeParticipantName(participant.name) === normalizeParticipantName(participantName)
    );

    // Add user to group
    const newMember = await prisma.groupMember.create({
      data: {
        userId,
        groupId: group.id,
      },
    });

    if (isPreAdded) {
      const remainingParticipants = preAddedParticipants.filter(
        (participant) => normalizeParticipantName(participant.name) !== normalizeParticipantName(participantName)
      );

      await prisma.group.update({
        where: { id: group.id },
        data: {
          preAddedParticipants: remainingParticipants,
        },
      });
    }

    // Return group details with member list
    const updatedGroup = await prisma.group.findUnique({
      where: { id: group.id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        expenses: true,
      },
    });

    return {
      groupId: updatedGroup.id,
      title: updatedGroup.title,
      currency: updatedGroup.currency,
      members: updatedGroup.members,
      expenseCount: updatedGroup.expenses.length,
      joinedAsParticipant: participantName,
      joinedAt: newMember.joinedAt,
    };
  } catch (error) {
    throw new Error(error.message || `Failed to join group: ${error.message}`);
  }
};

/**
 * Delete a group (hard delete)
 * FR-7 Implementation
 */
const deleteGroup = async (groupId, confirmation) => {
  // Validate confirmation
  if (confirmation !== true) {
    throw new Error('Confirmation required to delete group');
  }

  try {
    // Check if group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new Error('Group not found');
    }

    // Hard delete: Prisma will cascade delete related records
    // GroupMember, Expense, ExpenseSplit, Settlement, Transaction will be deleted automatically
    await prisma.group.delete({
      where: { id: groupId },
    });

    return {
      groupId,
      title: group.title,
      message: 'Group deleted permanently',
    };
  } catch (error) {
    // Handle specific Prisma errors
    if (error.code === 'P2025') {
      throw new Error('Group not found');
    }
    throw new Error(`Failed to delete group: ${error.message}`);
  }
};

/**
 * Revoke invite link (optional - for future use)
 */
const revokeInviteLink = async (groupId) => {
  try {
    const group = await prisma.group.update({
      where: { id: groupId },
      data: { inviteLinkStatus: 'REVOKED' },
    });

    return {
      groupId: group.id,
      inviteLinkStatus: group.inviteLinkStatus,
      message: 'Invite link revoked',
    };
  } catch (error) {
    throw new Error(`Failed to revoke invite link: ${error.message}`);
  }
};

module.exports = {
  getCurrencyFromIP,
  normalizePreAddedParticipants,
  createGroupWithParticipants,
  joinGroupByInviteLink,
  deleteGroup,
  revokeInviteLink,
};
