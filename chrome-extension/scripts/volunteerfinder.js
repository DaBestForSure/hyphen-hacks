import { config } from './config.js';

/**
 * Checks if an organization has a location within 50 miles of a given address
 * @param {string} organizationName - Name of the organization (e.g., "Habitat for Humanity")
 * @param {string} address - Address to check distance from (city, full address, zip, etc.)
 * @returns {Promise<{hasLocation: boolean, distance?: number}>} 
 */
async function checkOrganizationLocation(organizationName, address) {
  const API_KEY = config.GOOGLE_PLACES_API_KEY;
  
  if (!API_KEY) {
    console.error('API key not found in config.js');
    return { hasLocation: false };
  }

  try {
    // Step 1: Geocode the input address
    const userCoords = await geocodeAddress(address, API_KEY);
    if (!userCoords) {
      console.error('Could not geocode address:', address);
      return { hasLocation: false };
    }

    // Step 2: Search for organization locations near the address
    const orgLocations = await searchOrganizationLocations(organizationName, address, API_KEY);
    if (!orgLocations || orgLocations.length === 0) {
      return { hasLocation: false };
    }

    // Step 3: Find closest location and calculate distance
    let closestDistance = Infinity;
    
    for (const location of orgLocations) {
      if (location.location) {
        const distance = calculateDistance(
          userCoords.lat, 
          userCoords.lng, 
          location.location.latitude, 
          location.location.longitude
        );
        
        if (distance < closestDistance) {
          closestDistance = distance;
        }
      }
    }

    // Step 4: Check if within 50 miles
    if (closestDistance <= 50) {
      return { 
        hasLocation: true, 
        distance: Math.round(closestDistance * 10) / 10 // Round to 1 decimal
      };
    } else {
      return { hasLocation: false };
    }

  } catch (error) {
    console.error('Error checking organization location:', error);
    return { hasLocation: false };
  }
}

/**
 * Geocode an address using Google Geocoding API
 */
async function geocodeAddress(address, apiKey) {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`
    );
    
    const data = await response.json();
    
    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Search for organization locations using Google Places API
 */
async function searchOrganizationLocations(organizationName, nearAddress, apiKey) {
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
      },
      body: JSON.stringify({
        textQuery: `${organizationName} near ${nearAddress}`,
        maxResultCount: 10
      })
    });

    const data = await response.json();
    
    if (data.places && data.places.length > 0) {
      return data.places;
    }
    
    return [];
  } catch (error) {
    console.error('Places API error:', error);
    return [];
  }
}

/**
 * Calculate straight-line distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point  
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in miles
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return distance;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Example usage:
// checkOrganizationLocation("Habitat for Humanity", "San Francisco, CA")
//   .then(result => console.log(result));
// Expected output: { hasLocation: true, distance: 15.3 } or { hasLocation: false }

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkOrganizationLocation };
}