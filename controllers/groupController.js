const groupService = require("../services/groupService");

exports.getGroupPhoto = async (req, res) => {
  try {
    const result = await groupService.getGroupPhoto({
      userId: req.userId,
      groupId: req.params.groupId
    });

    res.json(result);
  } catch (error) {
    groupService.handleControllerError(res, error);
  }
};

exports.upsertGroupPhoto = async (req, res) => {
  try {
    const result = await groupService.upsertGroupPhoto({
      userId: req.userId,
      groupId: req.params.groupId,
      file: req.file
    });

    res.status(200).json(result);
  } catch (error) {
    groupService.handleControllerError(res, error);
  }
};

exports.deleteGroupPhoto = async (req, res) => {
  try {
    const result = await groupService.deleteGroupPhoto({
      userId: req.userId,
      groupId: req.params.groupId
    });

    res.json(result);
  } catch (error) {
    groupService.handleControllerError(res, error);
  }
};
