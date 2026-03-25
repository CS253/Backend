const prisma = require("../utils/prismaClient");
const { admin } = require("./firebaseAdmin");
const { claimPendingParticipantsForUser } = require("./memberInviteService");

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authorizationHeader.slice(7).trim();
  return token || null;
}

async function syncFirebaseUser({
  idToken,
  name: providedName,
  phoneNumber: providedPhoneNumber
}) {
  if (!idToken) {
    throw new Error("ID token is required");
  }

  const decodedToken = await admin.auth().verifyIdToken(idToken);
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

  let created = false;

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        firebaseUid: uid,
        email,
        name: finalName || user.name || undefined,
        phoneNumber: finalPhoneNumber || user.phoneNumber || undefined
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

  return {
    user,
    created,
    inviteClaims,
    decodedToken
  };
}

async function resolveAuthenticatedUser(authorizationHeader) {
  const idToken = extractBearerToken(authorizationHeader);

  if (!idToken) {
    throw new Error("Access denied");
  }

  const { user, decodedToken } = await syncFirebaseUser({ idToken });

  return {
    user,
    firebaseUid: decodedToken.uid
  };
}

module.exports = {
  extractBearerToken,
  resolveAuthenticatedUser,
  syncFirebaseUser
};
