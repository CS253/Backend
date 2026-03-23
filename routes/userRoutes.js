const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ===== USER ROUTES =====

/**
 * POST /users
 * Create a new user
 */
router.post('/users', async (req, res) => {
  try {
    const { email, name, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      message: 'User created successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /users/:userId
 * Get user details
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        upiId: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// ===== GROUP ROUTES =====

/**
 * POST /groups
 * Create a new group
 */
router.post('/groups', async (req, res) => {
  try {
    const { title, currency, createdBy } = req.body;

    if (!title || !currency || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Title, currency, and createdBy are required',
      });
    }

    // Generate unique invite link
    const inviteLink = 'invite-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Create group
    const group = await prisma.group.create({
      data: {
        title,
        currency,
        createdBy,
        inviteLink,
      },
    });

    // Add creator to group
    await prisma.groupMember.create({
      data: {
        userId: createdBy,
        groupId: group.id,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        groupId: group.id,
        title: group.title,
        currency: group.currency,
        inviteLink: group.inviteLink,
      },
      message: 'Group created successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /groups/:groupId
 * Get group details
 */
router.get('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
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

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /groups/:groupId/members
 * Add a user to a group
 */
router.post('/groups/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    // Check if group exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Check if user already in group
    const existingMember = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId,
      },
    });

    if (existingMember) {
      return res.status(400).json({
        success: false,
        error: 'User is already a member of this group',
      });
    }

    // Add user to group
    const member = await prisma.groupMember.create({
      data: {
        userId,
        groupId,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        memberId: member.id,
        userId: member.userId,
        groupId: member.groupId,
      },
      message: 'User added to group successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
