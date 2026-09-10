/**
 * SatQuery AI — OSM API Client
 *
 * Communicates with backend /api/osm/query endpoint,
 * converts Leaflet AOI coordinates to standard GeoJSON Polygon format,
 * and handles error / timeout states.
 */

const API_BASE = '/api';

/**
 * Convert Leaflet LatLng coordinates array to GeoJSON Polygon geometry.
 * Standard GeoJSON format requires [longitude, latitude] coordinates and a closed ring.
 *
 * @param {Array<[number, number]>} leafletCoords - [[lat, lng], ...]
 * @returns {object} GeoJSON Polygon
 */
export function leafletCoordsToGeoJSONPolygon(leafletCoords) {
  if (!leafletCoords || !Array.isArray(leafletCoords) || leafletCoords.length < 3) {
    throw new Error('AOI must have at least 3 coordinate points.');
  }

  // Convert to [lng, lat] handling [lat, lng] array, LatLng object, or string numbers
  const ring = leafletCoords.map((coord) => {
    let lat, lng;
    if (Array.isArray(coord)) {
      lat = coord[0];
      lng = coord[1];
    } else if (coord && typeof coord === 'object') {
      lat = coord.lat;
      lng = coord.lng;
    }
    lat = parseFloat(lat);
    lng = parseFloat(lng);
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error(`Invalid coordinate point: ${JSON.stringify(coord)}`);
    }
    return [lng, lat];
  });

  // Ensure polygon is closed (first coord === last coord)
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-7 || Math.abs(first[1] - last[1]) > 1e-7) {
    ring.push([first[0], first[1]]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

/**
 * Query OpenStreetMap features within the selected Area of Interest.
 *
 * @param {object} params
 * @param {object} params.aoi - SatQuery AOI object containing coordinates
 * @param {string[]} [params.features] - Categories: 'buildings', 'roads', 'water', 'waterways', 'railways', 'pois'
 * @returns {Promise<object>} Structured OSM response with GeoJSON layers and execution trace
 */
export async function queryOSMData({ aoi, features }) {
  console.log('[osmClient] queryOSMData called with aoi:', aoi);
  console.log('[osmClient] aoi.coordinates:', aoi?.coordinates);
  console.log('[osmClient] aoi.areaKm2:', aoi?.areaKm2);

  if (!aoi || !aoi.coordinates || aoi.coordinates.length < 3) {
    throw new Error('Please select or draw an Area of Interest on the map first.');
  }

  // Large AOI check on client side as an immediate guard
  if (aoi.areaKm2 && aoi.areaKm2 > 25) {
    throw new Error(
      `Selected area is too large (${aoi.areaKm2} km²). Maximum allowed area for detailed OSM analysis is 25 km². Please select a smaller region.`
    );
  }

  const geometry = leafletCoordsToGeoJSONPolygon(aoi.coordinates);
  console.log('[osmClient] Converted GeoJSON geometry:', JSON.stringify(geometry));
  console.log('[osmClient] Sending features:', features);

  const requestBody = {
    geometry,
    features: features || ['buildings', 'roads', 'water', 'waterways', 'railways', 'pois'],
  };

  console.log('[osmClient] POST /api/osm/query body:', JSON.stringify(requestBody).substring(0, 500));

  const res = await fetch(`${API_BASE}/osm/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  console.log('[osmClient] Response status:', res.status, res.statusText);

  const data = await res.json();

  if (!res.ok) {
    console.error('[osmClient] Server error response:', data);
    throw new Error(data.error || `OpenStreetMap query failed (${res.status})`);
  }

  console.log('[osmClient] Success! Total features:', data?.metadata?.totalFeatures);
  return data;
}
