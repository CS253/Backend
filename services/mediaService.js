const path = require("path");
const prisma = require("../utils/prismaClient");
const mediaStorage = require("../utils/mediaStorage");
const notificationService = require("./notificationService");

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = {
  photo: new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "video/mp4",
    "video/quicktime",
    "video/webm"
  ]),
  document: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain"
  ])
};

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

function inferMediaType(file, requestedType) {
  const mimeType = resolveMimeType(file);

  if (requestedType === "document") {
    return "document";
  }

  if (requestedType === "photo") {
    return "photo";
  }

  if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
    return "photo";
  }

  return "document";
}

function resolveMimeType(file) {
  const rawMimeType = String(file.mimetype || "").trim().toLowerCase();

  if (rawMimeType && rawMimeType !== "application/octet-stream") {
    return rawMimeType;
  }

  const extension = path.extname(file.originalname || "").replace(".", "").toLowerCase();

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
    case "mp4":
      return "video/mp4";
    case "mov":
    case "qt":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "txt":
      return "text/plain";
    default:
      return rawMimeType || "application/octet-stream";
  }
}

function buildBaseMediaPayload(item) {
  return {
    id: item.id,
    title: item.title || item.fileName,
    fileName: item.fileName,
    fileUrl: item.fileUrl,
    mimeType: item.mimeType,
    mediaType: item.mediaType,
    sizeBytes: item.sizeBytes,
    groupId: item.groupId,
    createdAt: item.createdAt,
    authorName: item.uploader.name || "Unknown",
    uploadedBy: {
      id: item.uploader.id,
      name: item.uploader.name || "Unknown"
    }
  };
}

function buildPhotoPayload(item) {
  return {
    ...buildBaseMediaPayload(item),
    downloadUrl: item.fileUrl,
    imageUrl: item.fileUrl
  };
}

function buildDocumentPayload(item) {
  const extension = path.extname(item.fileName || "").replace(".", "").toLowerCase();

  return {
    ...buildBaseMediaPayload(item),
    documentUrl: item.fileUrl,
    downloadUrl: item.fileUrl,
    extension
  };
}

function serializeMedia(item, responseVariant) {
  if (responseVariant === "photo") {
    return buildPhotoPayload(item);
  }

  if (responseVariant === "document") {
    return buildDocumentPayload(item);
  }

  return {
    ...buildBaseMediaPayload(item),
    downloadUrl: item.fileUrl,
    imageUrl: item.mediaType === "photo" ? item.fileUrl : undefined,
    documentUrl: item.mediaType === "document" ? item.fileUrl : undefined
  };
}

async function ensureGroupMembership(userId, groupId) {
  if (!groupId) {
    throw new AppError(400, "groupId is required");
  }

  const membership = await prisma.groupMember.findFirst({
    where: {
      userId,
      groupId
    }
  });

  if (!membership) {
    throw new AppError(403, "You are not a member of this group");
  }

  return membership;
}

async function loadMediaForAccess(id, mediaType) {
  const media = await prisma.media.findUnique({
    where: { id },
    include: {
      uploader: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (!media) {
    throw new AppError(404, "Media not found");
  }

  if (mediaType && media.mediaType !== mediaType) {
    throw new AppError(404, "Media not found");
  }

  return media;
}

exports.listMedia = async ({ userId, groupId, mediaType, responseVariant, page, limit }) => {
  await ensureGroupMembership(userId, groupId);

  const where = {
    groupId
  };

  if (mediaType) {
    where.mediaType = mediaType;
  }

  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      include: {
        uploader: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      skip: (page - 1) * limit,
      take: limit
    }),
    prisma.media.count({ where })
  ]);

  return {
    data: items.map((item) => serializeMedia(item, responseVariant)),
    meta: {
      page,
      limit,
      total
    }
  };
};

exports.uploadMedia = async ({ userId, groupId, requestedType, responseVariant, files, titles, title }) => {
  await ensureGroupMembership(userId, groupId);

  if (!files || files.length === 0) {
    throw new AppError(400, "At least one file is required");
  }

  const normalizedTitles = normalizeListValue(titles);
  if (normalizedTitles.length === 0 && title) {
    normalizedTitles.push(title);
  }

  const createdMedia = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const mimeType = resolveMimeType(file);
      const mediaType = inferMediaType({ ...file, mimetype: mimeType }, requestedType);
      const allowedMimeTypes = ALLOWED_TYPES[mediaType];

      if (!allowedMimeTypes || !allowedMimeTypes.has(mimeType)) {
        throw new AppError(400, `Unsupported file format: ${mimeType}`);
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new AppError(400, `File exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`);
      }

      const extension = path.extname(file.originalname) || "";
      const safeName = sanitizeSegment(path.basename(file.originalname, extension), "media");
      const generatedName = `${Date.now()}-${index}-${safeName}${extension.toLowerCase()}`;
      const storedMedia = await mediaStorage.saveFile({
        groupId,
        mediaType,
        generatedName,
        buffer: file.buffer
      });

      const dbMedia = await prisma.media.create({
        data: {
          title: normalizedTitles[index] || safeName,
          fileName: file.originalname,
          fileUrl: storedMedia.fileUrl,
          filePath: storedMedia.filePath,
          mimeType,
          mediaType,
          sizeBytes: file.size,
          groupId,
          uploadedBy: userId
        },
        include: {
          uploader: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      createdMedia.push(dbMedia);
    }
  } catch (error) {
    await Promise.all(
      createdMedia.map((item) =>
        mediaStorage.deleteFile(item.filePath)
      )
    );

    if (createdMedia.length > 0) {
      await prisma.media.deleteMany({
        where: {
          id: {
            in: createdMedia.map((item) => item.id)
          }
        }
      });
    }

    throw error;
  }

  const result = {
    message: "Media uploaded successfully",
    data: createdMedia.map((item) => serializeMedia(item, responseVariant))
  };

  // Notify group members about the upload
  notificationService.sendToGroup(
    groupId,
    {
      title: 'New Upload',
      body: `New ${requestedType || 'media'} was uploaded`,
      data: { type: 'media_uploaded', groupId },
    },
    userId
  );

  return result;
};

exports.deleteSingleMedia = async ({ userId, id, mediaType }) => {
  const media = await loadMediaForAccess(id, mediaType);
  await ensureGroupMembership(userId, media.groupId);

  await prisma.media.delete({
    where: { id }
  });

  await mediaStorage.deleteFile(media.filePath);

  return {
    message: "Media deleted successfully"
  };
};

exports.deleteManyMedia = async ({ userId, ids, mediaType }) => {
  const normalizedIds = Array.isArray(ids) ? ids.filter(Boolean) : [];

  if (normalizedIds.length === 0) {
    throw new AppError(400, "ids must be a non-empty array");
  }

  const mediaItems = await prisma.media.findMany({
    where: {
      id: {
        in: normalizedIds
      }
    }
  });

  if (mediaItems.length !== normalizedIds.length) {
    throw new AppError(404, "One or more media items were not found");
  }

  for (const item of mediaItems) {
    if (mediaType && item.mediaType !== mediaType) {
      throw new AppError(404, "One or more media items were not found");
    }

    await ensureGroupMembership(userId, item.groupId);
  }

  await prisma.media.deleteMany({
    where: {
      id: {
        in: normalizedIds
      }
    }
  });

  await Promise.all(
    mediaItems.map((item) => mediaStorage.deleteFile(item.filePath))
  );

  return {
    message: "Media deleted successfully",
    deletedCount: mediaItems.length
  };
};

exports.getDownloadableMedia = async ({ userId, id, mediaType }) => {
  const media = await loadMediaForAccess(id, mediaType);
  await ensureGroupMembership(userId, media.groupId);

  try {
    return await mediaStorage.getDownloadTarget({
      filePath: media.filePath,
      fileUrl: media.fileUrl,
      fileName: media.fileName
    });
  } catch (_error) {
    throw new AppError(404, "Stored file not found");
  }
};

exports.handleControllerError = (res, error) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: error.message
    });
  }

  if (error && error.name === "MulterError") {
    return res.status(400).json({
      error: error.message
    });
  }

  if (error && error.name === "StorageConfigError") {
    return res.status(500).json({
      error: error.message
    });
  }

  console.error(error);

  return res.status(500).json({
    error: "Server error"
  });
};
