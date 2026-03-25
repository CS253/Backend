// routes/routePlannerRoutes.js

const express = require("express");
const router = express.Router();

const {
  optimizeRouteController,
  manualRouteInfoController,
  planRouteController
} = require("../controllers/routePlannerController");

// Old routes kept for backward compatibility
router.post("/optimize", optimizeRouteController);
router.post("/manual-info", manualRouteInfoController);

// New unified route for frontend
router.post("/plan", planRouteController);

module.exports = router;