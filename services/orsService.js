const axios = require("axios");

const ORS_API_KEY = process.env.ORS_API_KEY;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;

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

    for (let index = 0; index < remaining.length; index += 1) {
      const place = remaining[index];
      const distance = haversineDistance(
        currentPoint.lat,
        currentPoint.lng,
        place.lat,
        place.lng
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
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
