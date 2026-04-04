const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');

const router = express.Router();

router.use(authMiddleware);

router.post('/notifications/register-token', async (req, res) => {
  try {
    const { token, device } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'FCM token is required' });
    }

    await notificationService.registerToken(req.userId, token, device || null);

    return res.json({ success: true, message: 'Device token registered' });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/notifications/unregister-token', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, error: 'FCM token is required' });
    }

    await notificationService.unregisterToken(req.userId, token);

    return res.json({ success: true, message: 'Device token removed' });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
