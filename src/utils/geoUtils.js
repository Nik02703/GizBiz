/**
 * Geographic utility functions for AOI calculations.
 */

/**
 * Calculate approximate area of a polygon in square kilometers
 * using the Shoelace formula on projected coordinates.
 *
 * @param {L.LatLng[]} latlngs - Array of Leaflet LatLng points
 * @returns {number} Area in km²
 */
export function calculateAreaKm2(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;

  // Use the Haversine-based spherical excess for better accuracy
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  let total = 0;
  const n = latlngs.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;

    const lat1 = toRad(latlngs[i].lat);
    const lat2 = toRad(latlngs[j].lat);
    const dLng = toRad(latlngs[j].lng - latlngs[i].lng);

    total += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((total * R * R) / 2);
  return Math.round(area * 100) / 100;
}

/**
 * Format area with appropriate unit.
 * @param {number} areaKm2
 * @returns {string}
 */
export function formatArea(areaKm2) {
  if (areaKm2 < 0.01) {
    return `${Math.round(areaKm2 * 1e6)} m²`;
  }
  if (areaKm2 < 1) {
    return `${(areaKm2 * 1000).toFixed(1)} hectares`;
  }
  return `${areaKm2.toFixed(2)} km²`;
}

/**
 * Get center point of a set of coordinates.
 * @param {L.LatLng[]} latlngs
 * @returns {{ lat: number, lng: number }}
 */
export function getCenter(latlngs) {
  if (!latlngs || latlngs.length === 0) return { lat: 0, lng: 0 };

  const sum = latlngs.reduce(
    (acc, ll) => ({ lat: acc.lat + ll.lat, lng: acc.lng + ll.lng }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: sum.lat / latlngs.length,
    lng: sum.lng / latlngs.length,
  };
}

/**
 * Get bounding box from coordinates.
 * @param {L.LatLng[]} latlngs
 * @returns {{ north: number, south: number, east: number, west: number }}
 */
export function getBounds(latlngs) {
  if (!latlngs || latlngs.length === 0) {
    return { north: 0, south: 0, east: 0, west: 0 };
  }

  let north = -90, south = 90, east = -180, west = 180;

  for (const ll of latlngs) {
    if (ll.lat > north) north = ll.lat;
    if (ll.lat < south) south = ll.lat;
    if (ll.lng > east) east = ll.lng;
    if (ll.lng < west) west = ll.lng;
  }

  return { north, south, east, west };
}

/**
 * Format a coordinate for display.
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatCoord(value, decimals = 4) {
  return value.toFixed(decimals);
}

/**
 * Reverse geocode coordinates to a location name.
 * Uses Nominatim (free, no API key needed).
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string>}
 */
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
    const res = await fetch(url);
    if (!res.ok) return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    const data = await res.json();
    const addr = data.address || {};
    return addr.city || addr.town || addr.village || addr.county || addr.state || data.display_name?.split(',')[0] || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
  }
}
