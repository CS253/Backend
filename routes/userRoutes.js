const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const groupService = require('../services/groupService');
const { admin } = require('../services/firebaseAdmin');

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
 * POST /users/sync
 * Sync Firebase user with Neon DB
 */
router.post('/users/sync', async (req, res) => {
  console.log('DEBUG: Received sync request');
  try {
    const { idToken } = req.body;

    if (!idToken) {
      console.log('DEBUG: ID token is missing');
      return res.status(400).json({
        success: false,
        error: 'ID token is required',
      });
    }

    // Verify Firebase token
    console.log('DEBUG: Verifying Firebase token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;
    console.log(`DEBUG: Token verified for UID: ${uid}, Email: ${email}`);

    // Upsert user in Neon DB
    console.log('DEBUG: Upserting user in database...');
    const user = await prisma.user.upsert({
      where: { firebaseUid: uid },
      update: {
        email: email || undefined,
        name: name || undefined,
      },
      create: {
        firebaseUid: uid,
        email: email,
        name: name || null,
      },
    });
    console.log('DEBUG: User upserted successfully:', user.id);

    res.json({
      success: true,
      data: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
      },
      message: 'User synced successfully',
    });
  } catch (error) {
    console.error('DEBUG: Sync Error:', error.message);
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid or expired token',
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
 * Create a new group with optional pre-added participants
 * FR-5: Auto-detect currency from IP, allow pre-added participants
 */
router.post('/groups', async (req, res) => {
  try {
    const { title, createdBy, preAddedParticipants, currency } = req.body;

    if (!title || !createdBy) {
      return res.status(400).json({
        success: false,
        error: 'Title and createdBy are required',
      });
    }

    // Get client IP for currency auto-detection
    const clientIp = req.ip || req.connection.remoteAddress || '';

    // Create group using groupService
    const group = await groupService.createGroupWithParticipants(
      {
        title,
        createdBy,
        preAddedParticipants: preAddedParticipants || [],
        currency,
      },
      clientIp
    );

    res.status(201).json({
      success: true,
      data: group,
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

/**
 * PUT /groups/:groupId
 * Update group details (title, currency)
 */
router.put('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { title, currency } = req.body;

    // At least one field must be provided
    if (!title && !currency) {
      return res.status(400).json({
        success: false,
        error: 'At least one of title or currency is required',
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

    // Prepare update data
    const updateData = {};
    if (title) updateData.title = title;
    if (currency) updateData.currency = currency;

    // Update group
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: updateData,
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

    res.json({
      success: true,
      data: updatedGroup,
      message: 'Group updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /groups/join
 * Join an existing group using invite link
 * FR-6: Allow users to join groups via invite link and select/claim a participant name
 */
router.post('/groups/join', async (req, res) => {
  try {
    const { inviteLink, participantName, userId } = req.body;

    if (!inviteLink || !participantName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Invite link, participant name, and user ID are required',
      });
    }

    // Join group using groupService
    const result = await groupService.joinGroupByInviteLink(
      inviteLink,
      userId,
      participantName
    );

    res.status(201).json({
      success: true,
      data: result,
      message: 'Successfully joined group',
    });
  } catch (error) {
    // Return appropriate status codes based on error message
    if (error.message.includes('Invite link expired')) {
      return res.status(400).json({
        success: false,
        error: 'Invite link expired',
      });
    }
    if (error.message.includes('already a member')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes('already joined')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * DELETE /groups/:groupId
 * Delete a group permanently (hard delete)
 * FR-7: Require confirmation before deleting group and revoke invite link
 */
router.delete('/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== true) {
      return res.status(400).json({
        success: false,
        error: 'Confirmation required to delete group. Send confirmation: true',
      });
    }

    // Delete group using groupService (hard delete with cascade)
    const result = await groupService.deleteGroup(groupId, confirmation);

    res.json({
      success: true,
      data: result,
      message: 'Group deleted permanently',
    });
  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Group not found',
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
