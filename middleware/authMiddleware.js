const { resolveAuthenticatedUser } = require("../services/authService");

module.exports = async (req, res, next) => {
  // Prevent re-execution when multiple routers are mounted at the same path.
  // Express evaluates all routers at a mount point (e.g. /api), so this
  // guard ensures auth only runs once per request.
  if (req.userId) {
    return next();
  }

  try {
    const { user, firebaseUid } = await resolveAuthenticatedUser(req.headers.authorization);

    req.userId = user.id;
    req.firebaseUid = firebaseUid;
    req.authUser = user;

    next();
  } catch (error) {
    console.error("AuthMiddleware error:", error.message);
    return res.status(401).json({
      error: error.message === "Access denied" ? "Access denied" : "Invalid token"
    });
  }
};
