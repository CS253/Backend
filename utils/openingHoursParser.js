// utils/openingHoursParser.js

function normalizeAmPmTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") {
    return "Not available";
  }

  const trimmed = timeStr.trim();

  // Matches:
  // 10 am
  // 10:30 am
  // 11 pm
  // 11:15 pm
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)(.*)$/i);

  if (!match) {
    return trimmed;
  }

  const hour = match[1];
  const minute = match[2] || "00";
  const meridiem = match[3].toUpperCase();
  const extra = (match[4] || "").trim();

  return extra
    ? `${hour}:${minute} ${meridiem} ${extra}`
    : `${hour}:${minute} ${meridiem}`;
}

function parseOpeningHoursBasic(openingHoursRaw) {
  if (!openingHoursRaw || typeof openingHoursRaw !== "string") {
    return {
      status: "Not available",
      timingText: "Not available",
      opensAt: "Not available",
      closesAt: "Not available"
    };
  }

  const trimmed = openingHoursRaw.trim();

  // Example: Open · Closes 10 pm
  const openClosesMatch = trimmed.match(/^Open\s*[·\-]?\s*Closes\s+(.+)$/i);
  if (openClosesMatch) {
    return {
      status: "Open",
      timingText: trimmed,
      opensAt: "Not available",
      closesAt: normalizeAmPmTime(openClosesMatch[1])
    };
  }

  // Example: Closed · Opens 10 am Sun
  const closedOpensMatch = trimmed.match(/^Closed\s*[·\-]?\s*Opens\s+(.+)$/i);
  if (closedOpensMatch) {
    return {
      status: "Closed",
      timingText: trimmed,
      opensAt: normalizeAmPmTime(closedOpensMatch[1]),
      closesAt: "Not available"
    };
  }

  // Example: Opens 10 am
  const opensMatch = trimmed.match(/^Opens\s+(.+)$/i);
  if (opensMatch) {
    return {
      status: "Not available",
      timingText: trimmed,
      opensAt: normalizeAmPmTime(opensMatch[1]),
      closesAt: "Not available"
    };
  }

  // Example: Closes 11 pm
  const closesMatch = trimmed.match(/^Closes\s+(.+)$/i);
  if (closesMatch) {
    return {
      status: "Not available",
      timingText: trimmed,
      opensAt: "Not available",
      closesAt: normalizeAmPmTime(closesMatch[1])
    };
  }

  // Example: 10:00-22:00
  const timeOnlyMatch = trimmed.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (timeOnlyMatch) {
    return {
      status: "Not available",
      timingText: trimmed,
      opensAt: timeOnlyMatch[1],
      closesAt: timeOnlyMatch[2]
    };
  }

  // Example: 24/7
  if (trimmed.includes("24/7")) {
    return {
      status: "Open",
      timingText: "Open 24/7",
      opensAt: "00:00",
      closesAt: "24:00"
    };
  }

  return {
    status: "Not available",
    timingText: trimmed,
    opensAt: "Not available",
    closesAt: "Not available"
  };
}

module.exports = {
  parseOpeningHoursBasic
};