const {
  optimizeRouteWithPlaceInfo,
  getManualRouteWithPlaceInfo
} = require('../services/planningService');

async function optimizeRouteController(req, res, next) {
  try {
    const { departureTime, start, destinations } = req.body;

    if (!departureTime || !start || !Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "departureTime, start, and destinations are required"
      });
    }

    if (typeof start.lat !== "number" || typeof start.lng !== "number") {
      return res.status(400).json({
        success: false,
        message: "start must contain numeric lat and lng"
      });
    }

    for (const destination of destinations) {
      if (
        !destination.name ||
        typeof destination.lat !== "number" ||
        typeof destination.lng !== "number"
      ) {
        return res.status(400).json({
          success: false,
          message: "Each destination must contain name, lat, and lng"
        });
      }
    }

    const result = await optimizeRouteWithPlaceInfo({
      departureTime,
      start,
      destinations
    });

    return res.status(200).json({
      success: true,
      mode: "distance-based-order",
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

async function manualRouteInfoController(req, res, next) {
  try {
    const { departureTime, destinations } = req.body;

    if (!departureTime || !Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "departureTime and destinations are required"
      });
    }

    for (const destination of destinations) {
      if (
        !destination.name ||
        typeof destination.lat !== "number" ||
        typeof destination.lng !== "number"
      ) {
        return res.status(400).json({
          success: false,
          message: "Each destination must contain name, lat, and lng"
        });
      }
    }

    const result = await getManualRouteWithPlaceInfo({
      departureTime,
      destinations
    });

    return res.status(200).json({
      success: true,
      mode: "manual-order",
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

async function planRouteController(req, res, next) {
  try {
    const { departureTime, optimized, start, destinations } = req.body;

    if (!departureTime || !Array.isArray(destinations) || destinations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "departureTime and destinations are required"
      });
    }

    for (const destination of destinations) {
      if (
        !destination.name ||
        typeof destination.lat !== "number" ||
        typeof destination.lng !== "number"
      ) {
        return res.status(400).json({
          success: false,
          message: "Each destination must contain name, lat, and lng"
        });
      }
    }

    if (optimized === true) {
      if (!start || typeof start.lat !== "number" || typeof start.lng !== "number") {
        return res.status(400).json({
          success: false,
          message: "start with numeric lat and lng is required when optimized is true"
        });
      }

      const result = await optimizeRouteWithPlaceInfo({
        departureTime,
        start,
        destinations
      });

      return res.status(200).json({
        success: true,
        mode: "distance-based-order",
        optimized: true,
        data: result
      });
    }

    const result = await getManualRouteWithPlaceInfo({
      departureTime,
      start,
      destinations
    });

    return res.status(200).json({
      success: true,
      mode: "manual-order",
      optimized: false,
      data: result
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  optimizeRouteController,
  manualRouteInfoController,
  planRouteController
};
