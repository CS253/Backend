const prisma = require("../utils/prismaClient");
const { admin } = require("./firebaseAdmin");
const { claimPendingParticipantsForUser } = require("./memberInviteService");

const PHONE_NUMBER_IN_USE_ERROR = "An account already exists with this phone number";

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  return token || null;
}

// ── In-memory cache for verified Firebase tokens ──────────────────────
// Avoids re-verifying the same JWT on rapid parallel requests.
// TTL: 5 minutes. Max size: 200 entries.
const _tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const TOKEN_CACHE_MAX_SIZE = 200;

async function verifyIdTokenCached(idToken) {
  const cacheKey = idToken.slice(-16);
  const cached = _tokenCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL_MS) {
    return cached.decodedToken;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (_tokenCache.size >= TOKEN_CACHE_MAX_SIZE) {
      const firstKey = _tokenCache.keys().next().value;
      _tokenCache.delete(firstKey);
    }

    _tokenCache.set(cacheKey, { decodedToken, timestamp: Date.now() });
    return decodedToken;
  } catch (error) {
    console.error("Firebase verifyIdToken error:", error.message);
    throw error;
  }
}

// ── In-memory cache for user lookups by firebaseUid ───────────────────
// Avoids hitting DB for user.findUnique on every request.
// TTL: 30 seconds (short enough to pick up profile updates quickly).
const _userCache = new Map();
const USER_CACHE_TTL_MS = 30 * 1000;
const USER_CACHE_MAX_SIZE = 200;

function getCachedUser(firebaseUid) {
  const cached = _userCache.get(firebaseUid);
  if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL_MS) {
    return cached.user;
  }
  return null;
}

function setCachedUser(firebaseUid, user) {
  if (_userCache.size >= USER_CACHE_MAX_SIZE) {
    const firstKey = _userCache.keys().next().value;
    _userCache.delete(firstKey);
  }
  _userCache.set(firebaseUid, { user, timestamp: Date.now() });
}

/**
 * FAST PATH — used by authMiddleware on every request.
 * Only verifies the Firebase token and looks up the user by firebaseUid.
 * Does NOT sync/upsert user data or claim pending participants.
 */
async function resolveAuthenticatedUser(authorizationHeader) {
  const idToken = extractBearerToken(authorizationHeader);

  if (!idToken) {
    throw new Error("Access denied");
  }

  const decodedToken = await verifyIdTokenCached(idToken);
  const { uid } = decodedToken;

  // Try cache first
  const cachedUser = getCachedUser(uid);
  if (cachedUser) {
    return { user: cachedUser, firebaseUid: uid };
  }

  // Fast lookup using the unique indexed column
  const user = await prisma.user.findUnique({
    where: { firebaseUid: uid }
  });

  if (!user) {
    throw new Error("User not found. Please sync your account first.");
  }

  setCachedUser(uid, user);

  return {
    user,
    firebaseUid: uid
  };
}

/**
 * FULL SYNC — used only by /users and /users/sync routes.
 * Verifies token, upserts user data, and claims pending participants.
 */
async function syncFirebaseUser({
  idToken,
  name: providedName,
  phoneNumber: providedPhoneNumber
}) {
  if (!idToken) {
    throw new Error("ID token is required");
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error("Firebase sync syncFirebaseUser verifyIdToken error:", error.message);
    throw error;
  }
  const { uid, email, name: tokenName, phone_number: tokenPhoneNumber } = decodedToken;

  if (!email) {
    throw new Error("Authenticated Firebase user is missing an email");
  }

  const finalName =
    typeof providedName === "string" && providedName.trim() !== ""
      ? providedName.trim()
      : tokenName || email.split("@")[0];

  const finalPhoneNumber =
    typeof providedPhoneNumber === "string" && providedPhoneNumber.trim() !== ""
      ? providedPhoneNumber.trim()
      : tokenPhoneNumber || null;

  let user = await prisma.user.findFirst({
    where: {
      OR: [{ firebaseUid: uid }, { email }]
    }
  });

  if (finalPhoneNumber) {
    const normalizedRequestedPhone = finalPhoneNumber.replace(/\D/g, "");
    const requestedSuffix =
      normalizedRequestedPhone.length > 10
        ? normalizedRequestedPhone.slice(-10)
        : normalizedRequestedPhone;

    const conflictingUser = requestedSuffix
      ? await prisma.user.findFirst({
          where: {
            phoneNumber: {
              endsWith: requestedSuffix
            },
            ...(user?.id ? { NOT: { id: user.id } } : {})
          }
        })
      : null;

    if (conflictingUser) {
      throw new Error(PHONE_NUMBER_IN_USE_ERROR);
    }
  }

  let created = false;

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firebaseUid: uid,
        email,
        ...(finalName ? { name: finalName } : {}),
        ...(finalPhoneNumber ? { phoneNumber: finalPhoneNumber } : {}),
      }
    });
  } else {
    user = await prisma.user.create({
      data: {
        firebaseUid: uid,
        email,
        name: finalName,
        phoneNumber: finalPhoneNumber
      }
    });
    created = true;
  }

  const inviteClaims = await claimPendingParticipantsForUser(user);

  // Update user cache after sync
  setCachedUser(uid, user);

  return {
    user,
    created,
    inviteClaims,
    decodedToken
  };
}

module.exports = {
  extractBearerToken,
  resolveAuthenticatedUser,
  syncFirebaseUser,
  PHONE_NUMBER_IN_USE_ERROR
};
