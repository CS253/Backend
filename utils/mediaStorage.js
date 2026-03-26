const fs = require("fs/promises");
const path = require("path");
const SftpClient = require("ssh2-sftp-client");

const localUploadsRoot = path.join(__dirname, "..", "uploads");
const storageFolders = {
  photo: "photos",
  document: "documents"
};

class StorageConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "StorageConfigError";
  }
}

function getStorageDriver() {
  return String(process.env.MEDIA_STORAGE_DRIVER || "local").trim().toLowerCase();
}

function sanitizeSegment(value, fallback) {
  const sanitized = String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || fallback;
}

function normalizeStorageKey(filePath) {
  const normalized = String(filePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (normalized.startsWith("uploads/")) {
    return normalized.slice("uploads/".length);
  }

  return normalized;
}

function buildStorageKey({ groupId, mediaType, generatedName }) {
  return path.posix.join(
    "groups",
    sanitizeSegment(groupId, "group"),
    storageFolders[mediaType] || sanitizeSegment(mediaType, "media"),
    generatedName
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new StorageConfigError(`${name} is not configured`);
  }
  return value;
}
// nothin
function getLocalPublicUrl(storageKey) {
  const appBaseUrl = requireEnv("APP_BASE_URL").replace(/\/+$/, "");
  return `${appBaseUrl}/uploads/${storageKey}`;
}

function getRemotePublicUrl(storageKey) {
  const publicBaseUrl = requireEnv("IITK_PUBLIC_BASE_URL").replace(/\/+$/, "");
  return `${publicBaseUrl}/${storageKey}`;
}

function getRemoteRoot() {
  return requireEnv("IITK_UPLOAD_ROOT").replace(/\/+$/, "");
}

function buildRemoteAbsolutePath(storageKey) {
  return path.posix.join(getRemoteRoot(), storageKey);
}

async function createSftpClient() {
  const client = new SftpClient();

  await client.connect({
    host: requireEnv("IITK_SFTP_HOST"),
    port: Number.parseInt(process.env.IITK_SFTP_PORT || "22", 10),
    username: requireEnv("IITK_SFTP_USER"),
    password: requireEnv("IITK_SFTP_PASSWORD")
  });

  return client;
}

async function closeSftpClient(client) {
  try {
    await client.end();
  } catch (_error) {
    // Ignore close errors from already-closed connections.
  }
}

function isMissingRemoteFileError(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return error?.code === 2 || error?.code === "ENOENT" || message.includes("no such file");
}

async function storeLocalFile(storageKey, buffer) {
  const absolutePath = path.join(localUploadsRoot, ...storageKey.split("/"));
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    filePath: storageKey,
    fileUrl: getLocalPublicUrl(storageKey)
  };
}

async function storeRemoteFile(storageKey, buffer) {
  const client = await createSftpClient();
  const remoteAbsolutePath = buildRemoteAbsolutePath(storageKey);

  try {
    await client.mkdir(path.posix.dirname(remoteAbsolutePath), true);
    await client.put(buffer, remoteAbsolutePath);

    return {
      filePath: storageKey,
      fileUrl: getRemotePublicUrl(storageKey)
    };
  } finally {
    await closeSftpClient(client);
  }
}

exports.saveFile = async ({ groupId, mediaType, generatedName, buffer }) => {
  const storageKey = buildStorageKey({ groupId, mediaType, generatedName });

  if (getStorageDriver() === "sftp") {
    return storeRemoteFile(storageKey, buffer);
  }

  return storeLocalFile(storageKey, buffer);
};

exports.deleteFile = async (filePath) => {
  const storageKey = normalizeStorageKey(filePath);

  if (!storageKey) {
    return;
  }

  if (getStorageDriver() === "sftp") {
    const client = await createSftpClient();

    try {
      await client.delete(buildRemoteAbsolutePath(storageKey));
    } catch (error) {
      if (!isMissingRemoteFileError(error)) {
        throw error;
      }
    } finally {
      await closeSftpClient(client);
    }

    return;
  }

  try {
    await fs.unlink(path.join(localUploadsRoot, ...storageKey.split("/")));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

exports.getDownloadTarget = async ({ filePath, fileUrl, fileName }) => {
  const storageKey = normalizeStorageKey(filePath);

  if (getStorageDriver() === "sftp" || /^https?:\/\//i.test(String(fileUrl || ""))) {
    return {
      type: "redirect",
      redirectUrl: fileUrl,
      fileName
    };
  }

  const absolutePath = path.join(localUploadsRoot, ...storageKey.split("/"));
  await fs.access(absolutePath);

  return {
    type: "local",
    absolutePath,
    fileName
  };
};
