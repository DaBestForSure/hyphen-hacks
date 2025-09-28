import { config } from "./config.js";

/**
 * Check if an organization has a location within `radiusMiles` of `address`.
 * @param {string} organizationName
 * @param {string} address
 * @param {number} [radiusMiles=50]
 * @returns {Promise<{ hasLocation: boolean, distance?: number }>}
 */
export async function checkOrganizationLocation(organizationName, address, radiusMiles = 50) {
  const API_KEY = config.GOOGLE_PLACES_API_KEY;
  if (!API_KEY) {
    console.error("Missing GOOGLE_PLACES_API_KEY in config.js");
    return { hasLocation: false };
  }

  try {
    const user = await geocodeAddress(address, API_KEY);
    if (!user) return { hasLocation: false };

    const places = await searchOrganizationLocations(organizationName, address, API_KEY);
    if (!places.length) return { hasLocation: false };

    let closest = Infinity;
    for (const p of places) {
      const loc = p.location;
      if (!loc) continue;

      const d = haversineMiles(user.lat, user.lng, loc.latitude, loc.longitude);
      if (d < closest) closest = d;
    }

    if (!isFinite(closest)) return { hasLocation: false };
    if (closest <= radiusMiles) {
      return { hasLocation: true, distance: round1(closest) };
    }
    return { hasLocation: false };
  } catch (err) {
    console.error("checkOrganizationLocation error:", err);
    return { hasLocation: false };
  }
}

async function geocodeAddress(address, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Geocode HTTP error:", res.status, res.statusText);
      return null;
    }
    const data = await res.json();
    const hit = data?.results?.[0]?.geometry?.location;
    return data.status === "OK" && hit ? { lat: hit.lat, lng: hit.lng } : null;
  } catch (err) {
    console.error("Geocode fetch error:", err);
    return null;
  }
}

async function searchOrganizationLocations(organizationName, nearAddress, apiKey) {
  const url = "https://places.googleapis.com/v1/places:searchText";
  const body = {
    textQuery: `${organizationName} near ${nearAddress}`,
    maxResultCount: 10
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error("Places HTTP error:", res.status, res.statusText);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data?.places) ? data.places : [];
  } catch (err) {
    console.error("Places fetch error:", err);
    return [];
  }
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3959; // miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const toRad = (deg) => (deg * Math.PI) / 180;
const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;

// CommonJS compatibility
if (typeof module !== "undefined" && module.exports) {
  module.exports = { checkOrganizationLocation };
}
