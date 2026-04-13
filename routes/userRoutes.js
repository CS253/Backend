const express = require('express');
const prisma = require('../utils/prismaClient');
const authMiddleware = require('../middleware/authMiddleware');
const {
  syncFirebaseUser,
  PHONE_NUMBER_IN_USE_ERROR,
} = require('../services/authService');
const { admin } = require('../services/firebaseAdmin');


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
    const status = error.message.includes('token')
      ? 401
      : error.message === PHONE_NUMBER_IN_USE_ERROR
      ? 409
      : 400;

    return res.status(status).json({
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
    const status = error.message.includes('token')
      ? 401
      : error.message === PHONE_NUMBER_IN_USE_ERROR
      ? 409
      : 400;

    return res.status(status).json({
      success: false,
      error: error.message || 'Invalid or expired token',
    });
  }
});

router.get('/users/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        upiId: true,
        notificationsEnabled: true,
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

router.put('/users/me', authMiddleware, async (req, res) => {
  try {
    const { name, phoneNumber, upiId, notificationsEnabled } = req.body;

    const updateData = {};

    if (name !== undefined) {
      const trimmedName = typeof name === 'string' ? name.trim() : '';
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          error: 'Name is required',
        });
      }
      updateData.name = trimmedName;
    }

    if (phoneNumber !== undefined) {
      const trimmedPhone = typeof phoneNumber === 'string' ? phoneNumber.trim() : '';

      if (trimmedPhone) {
        const normalizedPhone = trimmedPhone.replace(/\D/g, '');
        const phoneSuffix =
          normalizedPhone.length > 10
            ? normalizedPhone.substring(normalizedPhone.length - 10)
            : normalizedPhone;

        const existingUser = phoneSuffix
          ? await prisma.user.findFirst({
              where: {
                phoneNumber: {
                  endsWith: phoneSuffix,
                },
                NOT: {
                  id: req.userId,
                },
              },
            })
          : null;

        if (existingUser) {
          return res.status(409).json({
            success: false,
            error: PHONE_NUMBER_IN_USE_ERROR,
          });
        }
      }

      updateData.phoneNumber = trimmedPhone || null;
    }

    if (upiId !== undefined) {
      const trimmedUpiId = typeof upiId === 'string' ? upiId.trim() : '';
      updateData.upiId = trimmedUpiId || null;
    }

    if (notificationsEnabled !== undefined) {
      updateData.notificationsEnabled = Boolean(notificationsEnabled);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one profile field is required',
      });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        upiId: true,
        notificationsEnabled: true,
        createdAt: true,
      },
    });

    // Sync name to Firebase if updated
    if (updateData.name && req.firebaseUid) {
      try {
        await admin.auth().updateUser(req.firebaseUid, {
          displayName: updateData.name,
        });
      } catch (fbError) {
        console.error('Error syncing name to Firebase:', fbError);
        // We don't fail the request if Firebase sync fails,
        // but it's good to log.
      }
    }

    return res.json({
      success: true,
      data: user,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
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
        phoneNumber: true,
        upiId: true,
        notificationsEnabled: true,
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
