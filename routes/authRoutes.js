const express = require("express");

const router = express.Router();

const authController = require("../controllers/authController");

router.get("/demo", (req, res) => {
    res.json({
        message: "Auth routes working"
    });
});
router.get("/api/env", (req, res) => {
    res.json({
        port: process.env.PORT,
        jwtConfigured: process.env.JWT_SECRET ? true : false
    });
});

router.post("/register", authController.register);

router.post("/login", authController.login);

module.exports = router;