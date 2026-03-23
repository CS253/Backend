const bcrypt = require("bcrypt");
const prisma = require("../utils/prismaClient");

function isValidUpiId(value) {
  if (!value) {
    return true;
  }

  return /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/i.test(String(value).trim());
}

function toProfileResponse(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email,
    phone: user.phone,
    address: user.address,
    image_url: user.imageUrl,
    upi_id: user.upiId || "",
    preferences: {
      notifications_enabled: user.notificationsEnabled,
    },
  };
}

function handleError(res, error) {
  const status = error.status || 500;
  return res.status(status).json({
    error: error.message || "Server error",
  });
}

exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    return res.json({
      data: toProfileResponse(user),
    });
  } catch (error) {
    console.error(error);
    return handleError(res, error);
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const email = req.body.email ? String(req.body.email).trim().toLowerCase() : undefined;
    const upiId =
      req.body.upi_id !== undefined ? String(req.body.upi_id).trim() || null : undefined;

    if (upiId !== undefined && !isValidUpiId(upiId)) {
      return res.status(400).json({
        error: "Enter a valid UPI ID (e.g. user@bank)",
      });
    }

    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: {
            id: req.userId,
          },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          error: "Email is already in use",
        });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        name: req.body.name !== undefined ? String(req.body.name).trim() : undefined,
        email,
        phone: req.body.phone !== undefined ? String(req.body.phone).trim() || null : undefined,
        address:
          req.body.address !== undefined ? String(req.body.address).trim() || null : undefined,
        imageUrl:
          req.body.image_url !== undefined
            ? String(req.body.image_url).trim() || null
            : undefined,
        upiId,
      },
    });

    return res.json({
      data: {
        success: true,
        profile: toProfileResponse(user),
      },
    });
  } catch (error) {
    console.error(error);
    return handleError(res, error);
  }
};

exports.updateNotificationPreferences = async (req, res) => {
  try {
    if (typeof req.body.notifications_enabled !== "boolean") {
      return res.status(400).json({
        error: "notifications_enabled must be a boolean",
      });
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        notificationsEnabled: req.body.notifications_enabled,
      },
    });

    return res.json({
      data: {
        notifications_enabled: user.notificationsEnabled,
      },
    });
  } catch (error) {
    console.error(error);
    return handleError(res, error);
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { current_password: currentPassword, new_password: newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "current_password and new_password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isMatch) {
      return res.status(400).json({
        error: "Incorrect current password",
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.userId },
      data: { passwordHash },
    });

    return res.json({
      data: {
        success: true,
      },
    });
  } catch (error) {
    console.error(error);
    return handleError(res, error);
  }
};
