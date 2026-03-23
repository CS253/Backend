const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const groupController = require("../controllers/groupController");
const upload = require("../utils/mediaUpload");

const router = express.Router();

router.use(authMiddleware);

router.get("/:groupId/photo", groupController.getGroupPhoto);
router.put("/:groupId/photo", upload.single("photo"), groupController.upsertGroupPhoto);
router.delete("/:groupId/photo", groupController.deleteGroupPhoto);

module.exports = router;
