const { admin } = require('./firebaseAdmin');
const prisma = require('../utils/prismaClient');

/**
 * Register an FCM device token for a user
 */
async function registerToken(userId, token, device = null) {
  if (!token) throw new Error('FCM token is required');

  return prisma.fcmToken.upsert({
    where: { token },
    update: { userId, device, updatedAt: new Date() },
    create: { token, userId, device },
  });
}

/**
 * Remove an FCM device token (e.g. on logout)
 */
async function unregisterToken(userId, token) {
  if (!token) throw new Error('FCM token is required');

  return prisma.fcmToken.deleteMany({
    where: { token, userId },
  });
}

/**
 * Send a push notification to a single user (respects notificationsEnabled)
 */
async function sendToUser(userId, { title, body, data = {} }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsEnabled: true, fcmTokens: true },
  });

  if (!user || !user.notificationsEnabled) return;

  const tokens = user.fcmTokens.map((t) => t.token);
  if (tokens.length === 0) return;

  await sendPush(tokens, { title, body, data });
}

/**
 * Send a push notification to all members of a group, excluding one user
 */
async function sendToGroup(groupId, { title, body, data = {} }, excludeUserId = null) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: {
        select: {
          id: true,
          notificationsEnabled: true,
          fcmTokens: true,
        },
      },
    },
  });

  const tokens = [];
  for (const member of members) {
    if (member.user.id === excludeUserId) continue;
    if (!member.user.notificationsEnabled) continue;
    for (const t of member.user.fcmTokens) {
      tokens.push(t.token);
    }
  }

  if (tokens.length === 0) return;

  await sendPush(tokens, { title, body, data });
}

/**
 * Internal: send FCM push and clean up stale tokens
 */
async function sendPush(tokens, { title, body, data }) {
  if (!tokens.length) return;

  try {
    const message = {
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const staleTokens = [];
      response.responses.forEach((resp, idx) => {
        if (
          resp.error &&
          (resp.error.code === 'messaging/registration-token-not-registered' ||
            resp.error.code === 'messaging/invalid-registration-token')
        ) {
          staleTokens.push(tokens[idx]);
        }
      });
      if (staleTokens.length > 0) {
        await prisma.fcmToken.deleteMany({
          where: { token: { in: staleTokens } },
        });
      }
    }
  } catch (error) {
    console.error('Push notification error:', error.message);
  }
}

module.exports = {
  registerToken,
  unregisterToken,
  sendToUser,
  sendToGroup,
};
