const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", userController.getProfile);
router.patch("/profile", userController.updateProfile);
router.patch("/profile/preferences", userController.updateNotificationPreferences);
router.post("/change-password", userController.changePassword);

module.exports = router;
