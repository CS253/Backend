// services/planningService.js

const { optimizeRouteLocally, getRouteSummary } = require("./orsService");
const { getPlaceTimingInfo } = require("./overpassService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichDestinationsWithTiming(destinations) {
  const enrichedStops = [];

  for (const place of destinations) {
    const timingInfo = await getPlaceTimingInfo(place);

    enrichedStops.push({
      ...place,
      placeStatus: timingInfo.status,
      timingText: timingInfo.timingText,
      opensAt: timingInfo.opensAt,
      closesAt: timingInfo.closesAt,
      openingHoursRaw: timingInfo.openingHoursRaw,
      timingSource: timingInfo.timingSource
    });

    await sleep(1200);
  }

  return enrichedStops;
}

async function optimizeRouteWithPlaceInfo({ departureTime, start, destinations }) {
  const optimizedResult = optimizeRouteLocally(start, destinations);

  const enrichedStops = await enrichDestinationsWithTiming(
    optimizedResult.orderedDestinations
  );

  const coordinates = [
    [start.lng, start.lat],
    ...enrichedStops.map((stop) => [stop.lng, stop.lat])
  ];

  const summary = await getRouteSummary(coordinates);

  return {
    departureTime,
    start,
    stops: enrichedStops,
    totalDistanceKm: (summary.distanceMeters / 1000).toFixed(2),
    totalDurationMinutes: (summary.durationSeconds / 60).toFixed(2)
  };
}

async function getManualRouteWithPlaceInfo({ departureTime, destinations }) {
  const enrichedStops = await enrichDestinationsWithTiming(destinations);

  return {
    departureTime,
    stops: enrichedStops
  };
}

module.exports = {
  optimizeRouteWithPlaceInfo,
  getManualRouteWithPlaceInfo
};