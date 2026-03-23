const fs = require("fs/promises");
const path = require("path");
const prisma = require("../utils/prismaClient");

const uploadsRoot = path.join(__dirname, "..", "uploads");
const MAX_GROUP_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_GROUP_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif"
]);

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

function getAppBaseUrl() {
  const baseUrl = process.env.APP_BASE_URL;

  if (!baseUrl) {
    throw new AppError(500, "APP_BASE_URL is not configured");
  }

  return baseUrl.replace(/\/+$/, "");
}

function buildPublicUrl(storedFilePath) {
  return `${getAppBaseUrl()}/${storedFilePath.replace(/^\/+/, "")}`;
}

async function ensureGroupMember(userId, groupId) {
  const [group, membership] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId }
    }),
    prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId
        }
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

async function removeStoredPhoto(photoPath) {
  if (!photoPath) {
    return;
  }

  try {
    await fs.unlink(path.join(__dirname, "..", photoPath));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function serializeGroupPhoto(group) {
  return {
    success: true,
    data: {
      groupId: group.id,
      photoUrl: group.photoUrl,
      hasPhoto: Boolean(group.photoUrl)
    }
  };
}

exports.getGroupPhoto = async ({ userId, groupId }) => {
  const group = await ensureGroupMember(userId, groupId);
  return serializeGroupPhoto(group);
};

exports.upsertGroupPhoto = async ({ userId, groupId, file }) => {
  const group = await ensureGroupMember(userId, groupId);

  if (!file) {
    throw new AppError(400, "photo file is required");
  }

  if (!ALLOWED_GROUP_PHOTO_TYPES.has(file.mimetype)) {
    throw new AppError(400, `Unsupported group photo format: ${file.mimetype}`);
  }

  if (file.size > MAX_GROUP_PHOTO_SIZE_BYTES) {
    throw new AppError(400, `Group photo exceeds ${MAX_GROUP_PHOTO_SIZE_BYTES / (1024 * 1024)} MB limit`);
  }

  const extension = path.extname(file.originalname) || "";
  const safeName = sanitizeSegment(path.basename(file.originalname, extension), "group-photo");
  const generatedName = `${Date.now()}-${safeName}${extension.toLowerCase()}`;
  const relativePath = path.join(
    "groups",
    sanitizeSegment(groupId, "group"),
    "profile",
    generatedName
  );
  const absolutePath = path.join(uploadsRoot, relativePath);
  const storedFilePath = path.join("uploads", relativePath).replace(/\\/g, "/");
  const publicUrl = buildPublicUrl(storedFilePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  try {
    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: {
        photoUrl: publicUrl,
        photoPath: storedFilePath
      }
    });

    await removeStoredPhoto(group.photoPath);

    return {
      success: true,
      data: {
        groupId: updatedGroup.id,
        photoUrl: updatedGroup.photoUrl,
        hasPhoto: true
      },
      message: group.photoUrl ? "Group photo updated successfully" : "Group photo added successfully"
    };
  } catch (error) {
    await removeStoredPhoto(storedFilePath);
    throw error;
  }
};

exports.deleteGroupPhoto = async ({ userId, groupId }) => {
  const group = await ensureGroupMember(userId, groupId);

  if (!group.photoUrl || !group.photoPath) {
    throw new AppError(404, "Group photo not found");
  }

  await prisma.group.update({
    where: { id: groupId },
    data: {
      photoUrl: null,
      photoPath: null
    }
  });

  await removeStoredPhoto(group.photoPath);

  return {
    success: true,
    data: {
      groupId,
      photoUrl: null,
      hasPhoto: false
    },
    message: "Group photo deleted successfully"
  };
};

exports.handleControllerError = (res, error) => {
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

  console.error(error);

  return res.status(500).json({
    success: false,
    error: "Server error"
  });
};
