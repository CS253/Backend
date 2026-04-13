const path = require("path");
const prisma = require("../utils/prismaClient");
const geoip = require("geoip-lite");
const mediaStorage = require("../utils/mediaStorage");
const { lastTenDigits } = require("../utils/phone");

const MAX_GROUP_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROUP_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);
const COVER_PHOTO_FOLDER = "cover photo";

const countryToCurrency = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  EU: "EUR",
  CA: "CAD",
  AU: "AUD",
  JP: "JPY",
  CN: "CNY",
  CH: "CHF",
  SG: "SGD",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  BE: "EUR",
  AT: "EUR",
  PL: "EUR",
  SE: "EUR",
  NO: "NOK",
  DK: "DKK",
  CZ: "CZK",
  HU: "HUF",
  RO: "RON",
  GR: "EUR",
  PT: "EUR",
  IE: "EUR",
  CY: "EUR",
  LU: "EUR",
  MT: "EUR"
};

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeParticipantName = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

function resolveGroupPhotoMimeType(file) {
  const rawMimeType = String(file?.mimetype || "").trim().toLowerCase();

  if (rawMimeType && rawMimeType !== "application/octet-stream") {
    return rawMimeType;
  }

  const extension = path.extname(file?.originalname || "").replace(".", "").toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return rawMimeType || "application/octet-stream";
  }
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

const normalizePreAddedParticipants = (participants = []) => {
  if (!Array.isArray(participants)) {
    return [];
  }

  return participants
    .map((participant, index) => {
      if (typeof participant === "string") {
        const name = participant.trim();
        return name
          ? {
              id: `placeholder-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
              name,
              phone: null
            }
          : null;
      }

      if (participant && typeof participant === "object") {
        const name = typeof participant.name === "string" ? participant.name.trim() : "";
        if (!name) return null;

        return {
          id:
            typeof participant.id === "string" && participant.id.trim() !== ""
              ? participant.id.trim()
              : `placeholder-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          name,
          phone:
            typeof participant.phone === "string" && participant.phone.trim() !== ""
              ? participant.phone.trim()
              : null
        };
      }

      return null;
    })
    .filter(Boolean);
};

const getPendingParticipantPhoneSuffixes = (participants = []) => {
  const suffixes = new Set();

  for (const participant of normalizePreAddedParticipants(participants)) {
    const suffix = lastTenDigits(participant.phone);
    if (suffix) {
      suffixes.add(suffix);
    }
  }

  return Array.from(suffixes);
};

const getCurrencyFromIP = (ip) => {
  try {
    const cleanIp = ip.replace(/::ffff:/, "");
    const geo = geoip.lookup(cleanIp);

    if (geo && geo.country) {
      return countryToCurrency[geo.country] || "INR";
    }
  } catch (error) {
    console.error("Error looking up IP geolocation:", error.message);
  }

  return "INR";
};

async function ensureGroupCreator(userId, groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    throw new AppError(404, "Group not found");
  }

  if (group.createdBy !== userId) {
    throw new AppError(403, "Only the group creator can perform this action");
  }

  return group;
}

async function ensureGroupMember(userId, groupId) {
  const [group, membership] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId }
    }),
    prisma.groupMember.findFirst({
      where: {
        userId,
        groupId
      }
    })
  ]);

  if (!group) {
    throw new AppError(404, "Group not found");
  }

  if (!membership) {
    throw new AppError(403, "You are not a member of this group");
  }

  return group;
}

function resolveGroupCoverImage(group) {
  return group.coverImage || group.photoUrl || null;
}

function serializeGroupPhoto(group) {
  const photoUrl = resolveGroupCoverImage(group);

  return {
    success: true,
    data: {
      groupId: group.id,
      photoUrl,
      coverImage: photoUrl,
      hasPhoto: Boolean(photoUrl)
    }
  };
}

const createGroupWithParticipants = async (groupData, clientIp) => {
  const {
    title,
    createdBy,
    preAddedParticipants = [],
    currency = null,
    destination = "",
    startDate = null,
    endDate = null,
    tripType = "Other",
    coverImage = null
  } = groupData;

  if (!title || !title.trim() || !createdBy) {
    throw new Error("Title (cannot be whitespace-only) and createdBy are required");
  }
  
  const trimmedTitle = title.trim();

  const normalizedParticipants = normalizePreAddedParticipants(preAddedParticipants);

  if (normalizedParticipants.length > 0) {
    const uniqueNames = new Set(normalizedParticipants.map((participant) => participant.name.toLowerCase()));
    if (uniqueNames.size !== normalizedParticipants.length) {
      throw new Error("Duplicate names in pre-added participants. Each name must be unique.");
    }
  }

  const parsedStartDate = startDate ? new Date(startDate) : new Date();
  const parsedEndDate = endDate ? new Date(endDate) : parsedStartDate;

  if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime())) {
    throw new Error("Invalid trip dates provided");
  }

  if (parsedEndDate < parsedStartDate) {
    throw new Error("End date must be after or equal to start date");
  }

  const finalCurrency = currency || getCurrencyFromIP(clientIp);
  const inviteLink = `invite-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const group = await prisma.group.create({
    data: {
      title: trimmedTitle,
      destination: destination || "",
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      tripType: tripType || "Other",
      coverImage,
      currency: finalCurrency,
      createdBy,
      inviteLink,
      inviteLinkStatus: "ACTIVE",
      preAddedParticipants: normalizedParticipants,
      pendingParticipantPhoneSuffixes: getPendingParticipantPhoneSuffixes(normalizedParticipants)
    }
  });

  await prisma.groupMember.create({
    data: {
      userId: createdBy,
      groupId: group.id
    }
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
    createdAt: group.createdAt
  };
};

const joinGroupByInviteLink = async (inviteLink, userId, participantName) => {
  if (!inviteLink || !userId || !participantName) {
    throw new Error("Invite link, user ID, and participant name are required");
  }

  const group = await prisma.group.findUnique({
    where: { inviteLink },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      }
    }
  });

  if (!group || group.inviteLinkStatus !== "ACTIVE") {
    throw new Error("Invite link expired");
  }

  const existingMember = group.members.find((member) => member.userId === userId);
  if (existingMember) {
    throw new Error("User is already a member of this group");
  }

  const alreadyJoinedNames = new Set();
  group.members.forEach((member) => {
    if (member.user.name) {
      alreadyJoinedNames.add(member.user.name);
    }
  });

  if (alreadyJoinedNames.has(participantName)) {
    throw new Error("This participant has already joined the group");
  }

  const preAddedParticipants = normalizePreAddedParticipants(group.preAddedParticipants || []);
  const isPreAdded = preAddedParticipants.some(
    (participant) => normalizeParticipantName(participant.name) === normalizeParticipantName(participantName)
  );

  const newMember = await prisma.groupMember.create({
    data: {
      userId,
      groupId: group.id
    }
  });

  if (isPreAdded) {
    const remainingParticipants = preAddedParticipants.filter(
      (participant) => normalizeParticipantName(participant.name) !== normalizeParticipantName(participantName)
    );

    await prisma.group.update({
      where: { id: group.id },
      data: {
        preAddedParticipants: remainingParticipants,
        pendingParticipantPhoneSuffixes: getPendingParticipantPhoneSuffixes(remainingParticipants)
      }
    });
  }

  const updatedGroup = await prisma.group.findUnique({
    where: { id: group.id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      },
      expenses: true
    }
  });

  return {
    groupId: updatedGroup.id,
    title: updatedGroup.title,
    currency: updatedGroup.currency,
    members: updatedGroup.members,
    expenseCount: updatedGroup.expenses.length,
    joinedAsParticipant: participantName,
    joinedAt: newMember.joinedAt
  };
};

const deleteGroup = async (groupId, confirmation) => {
  if (confirmation !== true) {
    throw new Error("Confirmation required to delete group");
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId }
  });

  if (!group) {
    throw new Error("Group not found");
  }

  await prisma.group.delete({
    where: { id: groupId }
  });

  return {
    groupId,
    title: group.title,
    message: "Group deleted permanently"
  };
};

const revokeInviteLink = async (groupId) => {
  const group = await prisma.group.update({
    where: { id: groupId },
    data: { inviteLinkStatus: "REVOKED" }
  });

  return {
    groupId: group.id,
    inviteLinkStatus: group.inviteLinkStatus,
    message: "Invite link revoked"
  };
};

const getGroupPhoto = async ({ userId, groupId }) => {
  const group = await ensureGroupMember(userId, groupId);
  return serializeGroupPhoto(group);
};

const upsertGroupPhoto = async ({ userId, groupId, file }) => {
  const group = await ensureGroupCreator(userId, groupId);
  const mimeType = resolveGroupPhotoMimeType(file);

  if (!file) {
    throw new AppError(400, "photo file is required");
  }

  if (!ALLOWED_GROUP_PHOTO_TYPES.has(mimeType)) {
    throw new AppError(400, `Unsupported group photo format: ${mimeType}`);
  }

  if (file.size > MAX_GROUP_PHOTO_SIZE_BYTES) {
    throw new AppError(400, `Group photo exceeds ${MAX_GROUP_PHOTO_SIZE_BYTES / (1024 * 1024)} MB limit`);
  }

  const extension = path.extname(file.originalname) || "";
  const safeName = sanitizeSegment(path.basename(file.originalname, extension), "group-photo");
  const generatedName = `${Date.now()}-${safeName}${extension.toLowerCase()}`;
  const storedPhoto = await mediaStorage.saveFile({
    groupId,
    mediaType: "coverPhoto",
    generatedName,
    buffer: file.buffer,
    folderName: COVER_PHOTO_FOLDER
  });

  try {
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        coverImage: storedPhoto.fileUrl,
        photoUrl: storedPhoto.fileUrl,
        photoPath: storedPhoto.filePath
      }
    });

    await mediaStorage.deleteFile(group.photoPath);
    const previousPhotoUrl = resolveGroupCoverImage(group);

    return {
      success: true,
      data: {
        groupId: updatedGroup.id,
        photoUrl: updatedGroup.coverImage,
        coverImage: updatedGroup.coverImage,
        hasPhoto: true
      },
      message: previousPhotoUrl ? "Group photo updated successfully" : "Group photo added successfully"
    };
  } catch (error) {
    await mediaStorage.deleteFile(storedPhoto.filePath);
    throw error;
  }
};

const deleteGroupPhoto = async ({ userId, groupId }) => {
  const group = await ensureGroupCreator(userId, groupId);
  const photoUrl = resolveGroupCoverImage(group);

  if (!photoUrl || !group.photoPath) {
    throw new AppError(404, "Group photo not found");
  }

  await prisma.group.update({
    where: { id: groupId },
    data: {
      coverImage: null,
      photoUrl: null,
      photoPath: null
    }
  });

  await mediaStorage.deleteFile(group.photoPath);

  return {
    success: true,
    data: {
      groupId,
      photoUrl: null,
      coverImage: null,
      hasPhoto: false
    },
    message: "Group photo deleted successfully"
  };
};

const handleControllerError = (res, error) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message
    });
  }

  if (error && error.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: error.message
    });
  }

  if (error && error.name === "StorageConfigError") {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }

  console.error(error);

  return res.status(500).json({
    success: false,
    error: "Server error"
  });
};

module.exports = {
  getCurrencyFromIP,
  normalizePreAddedParticipants,
  getPendingParticipantPhoneSuffixes,
  createGroupWithParticipants,
  joinGroupByInviteLink,
  deleteGroup,
  revokeInviteLink,
  getGroupPhoto,
  upsertGroupPhoto,
  deleteGroupPhoto,
  handleControllerError
};
