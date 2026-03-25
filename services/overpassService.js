// services/overpassService.js

const axios = require("axios");
const { parseOpeningHoursBasic } = require("../utils/openingHoursParser");

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function getPlaceTimingInfo(place) {
  const { name, lat, lng } = place;

  if (!SERPAPI_KEY) {
    return fallback(name);
  }

  try {
    const response = await axios.get("https://serpapi.com/search", {
      params: {
        engine: "google_local",
        q: name,
        ll: lat != null && lng != null ? `@${lat},${lng},15z` : undefined,
        hl: "en",
        gl: "in",
        api_key: SERPAPI_KEY
      },
      timeout: 15000
    });

    const data = response.data || {};

    const candidates = [
      ...(Array.isArray(data.local_results) ? data.local_results : []),
      ...(Array.isArray(data.places_results) ? data.places_results : []),
      ...(Array.isArray(data.local_places_results) ? data.local_places_results : [])
    ];

    if (candidates.length === 0) {
      return fallback(name);
    }

    const bestMatch =
      candidates.find((item) => {
        const title = (item.title || item.name || "").toLowerCase();
        return (
          title.includes(name.toLowerCase()) ||
          name.toLowerCase().includes(title)
        );
      }) || candidates[0];

    const rawHours =
      bestMatch.hours ||
      bestMatch.opening_hours ||
      bestMatch.operating_hours ||
      bestMatch?.hours?.raw ||
      null;

    let openingHoursRaw = null;

    if (typeof rawHours === "string") {
      openingHoursRaw = rawHours;
    } else if (Array.isArray(rawHours)) {
      openingHoursRaw = rawHours.join("; ");
    } else if (rawHours && typeof rawHours === "object") {
      openingHoursRaw = JSON.stringify(rawHours);
    }

    if (!openingHoursRaw) {
      return fallback(name);
    }

    const parsed = parseOpeningHoursBasic(openingHoursRaw);

    return {
      placeName: name,
      openingHoursRaw,
      status: parsed.status,
      timingText: parsed.timingText,
      opensAt: parsed.opensAt,
      closesAt: parsed.closesAt,
      timingSource: "SerpApi"
    };
  } catch (error) {
    return fallback(name);
  }
}

function fallback(name) {
  return {
    placeName: name,
    openingHoursRaw: null,
    status: "Not available",
    timingText: "Not available",
    opensAt: "Not available",
    closesAt: "Not available",
    timingSource: "SerpApi"
  };
}

module.exports = {
  getPlaceTimingInfo
};