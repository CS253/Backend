const express = require("express");
const prisma = require("../utils/prismaClient");
const groupService = require("../services/groupService");
const tripService = require("../services/tripService");
const authMiddleware = require("../middleware/authMiddleware");
const groupController = require("../controllers/groupController");
const upload = require("../utils/mediaUpload");

const router = express.Router();

const ensureGroupMembership = async (groupId, userId) => {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!group) {
    throw new Error("Group not found or access denied");
  }

  return group;
};

const ensureGroupCreator = async (groupId, userId) => {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
  });

  if (!group) {
    throw new Error("Group not found");
  }

  if (group.createdBy !== userId) {
    throw new Error("Only the group creator can perform this action");
  }

  return group;
};

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const { page, limit } = req.query;
    const groups = await tripService.getUserTrips(req.userId, { page, limit });

    res.json({
      success: true,
      data: groups.trips,
      meta: {
        total: groups.total,
        page: groups.page,
        limit: groups.limit,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const {
      title,
      name,
      preAddedParticipants,
      currency,
      destination,
      startDate,
      endDate,
      tripType,
      coverImage,
    } = req.body;

    const resolvedTitle = title || name;

    if (!resolvedTitle) {
      return res.status(400).json({
        success: false,
        error: "Title is required",
      });
    }

    const clientIp = req.ip || req.connection.remoteAddress || "";

    const group = await groupService.createGroupWithParticipants(
      {
        title: resolvedTitle,
        createdBy: req.userId,
        preAddedParticipants: preAddedParticipants || [],
        currency,
        destination,
        startDate,
        endDate,
        tripType,
        coverImage,
      },
      clientIp
    );

    res.status(201).json({
      success: true,
      data: group,
      message: "Group created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await ensureGroupMembership(groupId, req.userId);

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    res.status(error.message.includes("not found") ? 404 : 403).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/:groupId/members", async (req, res) => {
  try {
    const { groupId } = req.params;
    const members = await tripService.getTripMembers(groupId, req.userId);

    res.json({
      success: true,
      members,
    });
  } catch (error) {
    const status = error.message === "Trip not found" ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/:groupId/members", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId, members } = req.body;

    if (Array.isArray(members)) {
      const createdMembers = await tripService.addTripMembers(groupId, members, req.userId);

      return res.status(201).json({
        success: true,
        members: createdMembers,
        message: "Group members added successfully",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId is required",
      });
    }

    await ensureGroupCreator(groupId, req.userId);

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const existingMember = await prisma.groupMember.findFirst({
      where: {
        userId,
        groupId,
      },
    });

    if (existingMember) {
      return res.status(400).json({
        success: false,
        error: "User is already a member of this group",
      });
    }

    const member = await prisma.groupMember.create({
      data: {
        userId,
        groupId,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        memberId: member.id,
        userId: member.userId,
        groupId: member.groupId,
      },
      message: "User added to group successfully",
    });
  } catch (error) {
    const status = error.message === "Group not found"
      ? 404
      : error.message === "Only the group creator can perform this action"
        ? 403
        : 400;

    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete("/:groupId/members/:memberId", async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const removedMember = await tripService.removeTripMember(groupId, memberId, req.userId);

    res.json({
      success: true,
      member: removedMember,
      message: "Group member removed successfully",
    });
  } catch (error) {
    const status =
      error.message === "Trip not found" || error.message === "Member not found"
        ? 404
        : error.message === "Only the group creator can perform this action"
          ? 403
          : 400;

    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.put("/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      title,
      name,
      currency,
      destination,
      startDate,
      endDate,
      tripType,
      coverImage,
    } = req.body;

    const resolvedTitle = title ?? name;

    if (
      !resolvedTitle &&
      !currency &&
      destination === undefined &&
      startDate === undefined &&
      endDate === undefined &&
      tripType === undefined &&
      coverImage === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: "At least one updatable field is required",
      });
    }

    const group = await ensureGroupMembership(groupId, req.userId);

    const updateData = {};
    if (resolvedTitle) updateData.title = resolvedTitle;
    if (currency) updateData.currency = currency;
    if (destination !== undefined) updateData.destination = destination;
    if (tripType !== undefined) updateData.tripType = tripType;
    if (coverImage !== undefined) updateData.coverImage = coverImage;

    const nextStartDate = startDate ? new Date(startDate) : group.startDate;
    const nextEndDate = endDate ? new Date(endDate) : group.endDate;

    if (startDate !== undefined || endDate !== undefined) {
      if (Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid trip dates provided",
        });
      }

      if (nextEndDate < nextStartDate) {
        return res.status(400).json({
          success: false,
          error: "End date must be after or equal to start date",
        });
      }

      updateData.startDate = nextStartDate;
      updateData.endDate = nextEndDate;
    }

    const updatedGroup = await prisma.group.update({
      where: { id: groupId },
      data: updateData,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: updatedGroup,
      message: "Group updated successfully",
    });
  } catch (error) {
    const status = error.message === "Group not found"
      ? 404
      : error.message === "Only the group creator can perform this action"
        ? 403
        : 400;

    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/:groupId/leave", async (req, res) => {
  try {
    const { groupId } = req.params;
    const result = await tripService.leaveTrip(groupId, req.userId);

    res.json({
      success: true,
      data: result,
      message: "Leave trip action completed successfully",
    });
  } catch (error) {
    const status = error.message === "Trip not found" ? 404 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
    });
  }
});

router.post("/join", async (req, res) => {
  try {
    const { inviteLink, participantName } = req.body;

    if (!inviteLink || !participantName) {
      return res.status(400).json({
        success: false,
        error: "Invite link and participant name are required",
      });
    }

    const result = await groupService.joinGroupByInviteLink(
      inviteLink,
      req.userId,
      participantName
    );

    res.status(201).json({
      success: true,
      data: result,
      message: "Successfully joined group",
    });
  } catch (error) {
    if (error.message.includes("Invite link expired")) {
      return res.status(400).json({
        success: false,
        error: "Invite link expired",
      });
    }
    if (error.message.includes("already a member")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
    if (error.message.includes("already joined")) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.delete("/:groupId", async (req, res) => {
  try {
    const { groupId } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== true) {
      return res.status(400).json({
        success: false,
        error: "Confirmation required to delete group. Send confirmation: true",
      });
    }

    await ensureGroupCreator(groupId, req.userId);

    const result = await groupService.deleteGroup(groupId, confirmation);

    res.json({
      success: true,
      data: result,
      message: "Group deleted permanently",
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    if (error.message === "Only the group creator can perform this action") {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/:groupId/photo", groupController.getGroupPhoto);
router.put("/:groupId/photo", upload.single("photo"), groupController.upsertGroupPhoto);
router.delete("/:groupId/photo", groupController.deleteGroupPhoto);

module.exports = router;
