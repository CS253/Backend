const { resolveAuthenticatedUser } = require("../services/authService");

module.exports = async (req, res, next) => {
  try {
    const { user, firebaseUid } = await resolveAuthenticatedUser(req.headers.authorization);

    req.userId = user.id;
    req.firebaseUid = firebaseUid;
    req.authUser = user;

    next();
  } catch (error) {
    return res.status(401).json({
      error: error.message === "Access denied" ? "Access denied" : "Invalid token"
    });
  }
};
