const mediaService = require("../services/mediaService");

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

exports.listMedia = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(parsePositiveInt(req.query.limit, 20), 100);

    const result = await mediaService.listMedia({
      userId: req.userId,
      groupId: req.query.groupId,
      mediaType: req.mediaTypeFilter || req.query.type || req.query.mediaType,
      responseVariant: req.mediaTypeFilter || "media",
      page,
      limit
    });

    res.json(result);
  } catch (error) {
    mediaService.handleControllerError(res, error);
  }
};

exports.uploadMedia = async (req, res) => {
  try {
    const result = await mediaService.uploadMedia({
      userId: req.userId,
      groupId: req.body.groupId,
      requestedType: req.mediaTypeFilter || req.body.type || req.body.mediaType,
      responseVariant: req.mediaTypeFilter || "media",
      files: req.files || [],
      titles: req.body.titles,
      title: req.body.title
    });

    res.status(201).json(result);
  } catch (error) {
    mediaService.handleControllerError(res, error);
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    const result = await mediaService.deleteSingleMedia({
      userId: req.userId,
      id: req.params.id,
      mediaType: req.mediaTypeFilter
    });

    res.json(result);
  } catch (error) {
    mediaService.handleControllerError(res, error);
  }
};

exports.deleteManyMedia = async (req, res) => {
  try {
    const result = await mediaService.deleteManyMedia({
      userId: req.userId,
      ids: req.body.ids,
      mediaType: req.mediaTypeFilter
    });

    res.json(result);
  } catch (error) {
    mediaService.handleControllerError(res, error);
  }
};

exports.downloadMedia = async (req, res) => {
  try {
    const file = await mediaService.getDownloadableMedia({
      userId: req.userId,
      id: req.params.id,
      mediaType: req.mediaTypeFilter
    });

    if (file.type === "redirect") {
      return res.redirect(file.redirectUrl);
    }

    const fs = require('fs/promises');
    const { decryptBuffer } = require('../utils/encryption');
    
    const buffer = await fs.readFile(file.absolutePath);
    let finalBuffer = buffer;
    try {
      finalBuffer = decryptBuffer(buffer);
    } catch (decryptErr) {
      console.warn(`Decryption failed for ${file.absolutePath}, serving raw buffer.`);
    }
    
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    const ext = file.fileName.split('.').pop().toLowerCase();
    const mimeTypes = {
      'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
      'gif': 'image/gif', 'pdf': 'application/pdf', 'webp': 'image/webp'
    };
    if (mimeTypes[ext]) res.setHeader('Content-Type', mimeTypes[ext]);
    
    return res.send(finalBuffer);
  } catch (error) {
    mediaService.handleControllerError(res, error);
  }
};
