const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const mediaController = require("../controllers/mediaController");
const upload = require("../utils/mediaUpload");

const router = express.Router();

router.use(authMiddleware);
router.use((req, _res, next) => {
  req.mediaTypeFilter = "photo";
  next();
});

router.get("/", mediaController.listMedia);
router.post("/upload", upload.any(), mediaController.uploadMedia);
router.post("/delete", mediaController.deleteManyMedia);
router.get("/:id/download", mediaController.downloadMedia);
router.delete("/:id", mediaController.deleteMedia);

module.exports = router;
