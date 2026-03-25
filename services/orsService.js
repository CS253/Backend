// services/orsService.js

const axios = require("axios");

const ORS_API_KEY = process.env.ORS_API_KEY;

/**
 * ORS uses coordinates in [lng, lat] format.
 */

/**
 * Calculate straight-line distance between two points using Haversine formula.
 * This is used for local distance-based ordering without needing
 * the ORS optimization endpoint.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const R = 6371; // Earth radius in km

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Simple nearest-neighbor ordering:
 * start from the start point,
 * repeatedly visit the nearest unvisited destination.
 */
function optimizeRouteLocally(start, destinations) {
  const remaining = [...destinations];
  const orderedDestinations = [];

  let currentPoint = {
    lat: start.lat,
    lng: start.lng
  };

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const place = remaining[i];

      const distance = haversineDistance(
        currentPoint.lat,
        currentPoint.lng,
        place.lat,
        place.lng
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const nextStop = remaining.splice(nearestIndex, 1)[0];
    orderedDestinations.push(nextStop);

    currentPoint = {
      lat: nextStop.lat,
      lng: nextStop.lng
    };
  }

  return {
    orderedDestinations
  };
}

/**
 * Get actual road distance and duration for the final ordered route.
 */
async function getRouteSummary(coordinates) {
  if (!ORS_API_KEY) {
    throw new Error("ORS_API_KEY is missing in .env");
  }

  const response = await axios.post(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    { coordinates },
    {
      headers: {
        Authorization: ORS_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  const route = response.data?.routes?.[0];

  if (!route) {
    throw new Error("No route found from OpenRouteService");
  }

  return {
    distanceMeters: route.summary.distance,
    durationSeconds: route.summary.duration
  };
}

module.exports = {
  optimizeRouteLocally,
  getRouteSummary
};