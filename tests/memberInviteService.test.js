jest.mock('../utils/prismaClient', () => ({
  user: {
    findFirst: jest.fn(),
  },
  group: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  groupMember: {
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require('../utils/prismaClient');
const { claimPendingParticipantsForUser } = require('../services/memberInviteService');

describe('memberInviteService.claimPendingParticipantsForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.group.update.mockImplementation((args) => ({ kind: 'group.update', args }));
    prisma.groupMember.createMany.mockImplementation((args) => ({ kind: 'groupMember.createMany', args }));
    prisma.$transaction.mockResolvedValue([]);
  });

  test('queries only groups indexed by the user phone suffix and updates matching groups in bulk', async () => {
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'group-1',
        preAddedParticipants: [
          { id: 'p1', name: 'Alex', phone: '+91 98765 43210' },
          { id: 'p2', name: 'Sam', phone: '1111111111' },
        ],
        members: [],
      },
    ]);

    const result = await claimPendingParticipantsForUser({
      id: 'user-1',
      phoneNumber: '9876543210',
    });

    expect(prisma.group.findMany).toHaveBeenCalledWith({
      where: {
        pendingParticipantPhoneSuffixes: {
          has: '9876543210',
        },
      },
      include: {
        members: {
          where: {
            userId: 'user-1',
          },
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });

    expect(prisma.groupMember.createMany).toHaveBeenCalledWith({
      data: [
        {
          groupId: 'group-1',
          userId: 'user-1',
        },
      ],
      skipDuplicates: true,
    });

    expect(prisma.group.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        preAddedParticipants: [{ id: 'p2', name: 'Sam', phone: '1111111111' }],
        pendingParticipantPhoneSuffixes: ['1111111111'],
      },
    });

    expect(result).toEqual({
      claimedGroups: 1,
      claimedParticipants: 1,
    });
  });

  test('returns early when the user phone does not contain a searchable suffix', async () => {
    const result = await claimPendingParticipantsForUser({
      id: 'user-1',
      phoneNumber: '()',
    });

    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toEqual({
      claimedGroups: 0,
      claimedParticipants: 0,
    });
  });
});
