const express = require('express');
const prisma = require('../utils/prismaClient');
const authMiddleware = require('../middleware/authMiddleware');
const { syncFirebaseUser } = require('../services/authService');

const router = express.Router();

router.post('/users', async (req, res) => {
  try {
    const { idToken, name, phoneNumber } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token is required',
      });
    }

    const { user, created } = await syncFirebaseUser({
      idToken,
      name,
      phoneNumber,
    });

    return res.status(created ? 201 : 200).json({
      success: true,
      data: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
      },
      message: created ? 'User created successfully' : 'User synced successfully',
    });
  } catch (error) {
    return res.status(error.message.includes('token') ? 401 : 400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/users/sync', async (req, res) => {
  try {
    const { idToken, name: providedName, phoneNumber: providedPhone } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'ID token is required',
      });
    }

    const { user, inviteClaims } = await syncFirebaseUser({
      idToken,
      name: providedName,
      phoneNumber: providedPhone,
    });

    return res.json({
      success: true,
      data: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        name: user.name,
        phoneNumber: user.phoneNumber,
        claimedGroups: inviteClaims.claimedGroups,
        claimedParticipants: inviteClaims.claimedParticipants,
      },
      message: 'User synced successfully',
    });
  } catch (error) {
    return res.status(error.message.includes('token') ? 401 : 400).json({
      success: false,
      error: error.message || 'Invalid or expired token',
    });
  }
});

router.get('/users/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only access your own profile',
      });
    }

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

    return res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
