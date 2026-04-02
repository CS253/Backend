const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  optimizeRouteController,
  manualRouteInfoController,
  planRouteController
} = require("../controllers/routePlannerController");

const router = express.Router();

router.use(authMiddleware);

router.post("/optimize", optimizeRouteController);
router.post("/manual-info", manualRouteInfoController);
router.post("/plan", planRouteController);

module.exports = router;
