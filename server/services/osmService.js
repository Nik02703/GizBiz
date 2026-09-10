/**
 * SatQuery AI — OpenStreetMap Overpass Service
 *
 * Retrieves geographic vector data from OpenStreetMap via Overpass API,
 * validates geometries, enforces AOI size bounds, caches queries in-memory,
 * and converts OSM JSON into standard WGS84 GeoJSON FeatureCollections.
 */

import crypto from 'crypto';

// Configurable Overpass API endpoints
const PRIMARY_OVERPASS_URL = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter';
const FALLBACK_OVERPASS_URLS = [
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Maximum AOI area in km² (default 25 km² to prevent public server overload)
const MAX_OSM_AOI_KM2 = parseFloat(process.env.MAX_OSM_AOI_KM2 || '25');

// In-memory cache for repeated queries (TTL: 30 minutes)
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const osmCache = new Map();

/**
 * Clean up expired cache entries.
 */
function pruneCache() {
  const now = Date.now();
  for (const [key, entry] of osmCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      osmCache.delete(key);
    }
  }
  if (osmCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = osmCache.keys().next().value;
    osmCache.delete(oldestKey);
  }
}

/**
 * Calculate spherical area of a polygon in km² using geodesic excess.
 * Coordinates are GeoJSON standard: [longitude, latitude].
 *
 * @param {Array<[number, number]>} coords - Polygon ring
 * @returns {number} Area in km²
 */
export function calculateGeoJSONPolygonAreaKm2(coords) {
  if (!coords || coords.length < 3) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in km

  let total = 0;
  const n = coords.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const lng1 = toRad(coords[i][0]);
    const lat1 = toRad(coords[i][1]);
    const lng2 = toRad(coords[j][0]);
    const lat2 = toRad(coords[j][1]);

    const dLng = lng2 - lng1;
    total += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  const area = Math.abs((total * R * R) / 2);
  return Math.round(area * 100) / 100;
}

/**
 * Extract bounding box from GeoJSON Polygon coordinates.
 * Returns { south, west, north, east } in degrees.
 *
 * @param {Array<[number, number]>} coords - [[lng, lat], ...]
 * @returns {{ south: number, west: number, north: number, east: number }}
 */
export function getBoundingBox(coords) {
  let south = 90, north = -90, west = 180, east = -180;

  for (const [lng, lat] of coords) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }

  return { south, west, north, east };
}

/**
 * Generate a cache key based on normalized bounding box and requested features.
 */
function generateCacheKey(bbox, features) {
  const normBbox = `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`;
  const sortedFeats = [...features].sort().join(',');
  return crypto.createHash('md5').update(`${normBbox}|${sortedFeats}`).digest('hex');
}

/**
 * Build Overpass QL query string based on bounding box and requested features.
 *
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {string[]} features
 * @returns {string} Overpass QL query
 */
export function buildOverpassQuery(bbox, features) {
  const { south, west, north, east } = bbox;
  const s = south.toFixed(6);
  const w = west.toFixed(6);
  const n = north.toFixed(6);
  const e = east.toFixed(6);
  const bboxStr = `${s},${w},${n},${e}`;

  const clauses = [];
  const featSet = new Set(features.map((f) => f.toLowerCase()));

  if (featSet.has('buildings')) {
    clauses.push(`way["building"](${bboxStr});`);
    clauses.push(`relation["building"](${bboxStr});`);
  }

  if (featSet.has('roads')) {
    clauses.push(`way["highway"](${bboxStr});`);
  }

  if (featSet.has('water')) {
    clauses.push(`way["natural"="water"](${bboxStr});`);
    clauses.push(`relation["natural"="water"](${bboxStr});`);
    clauses.push(`way["water"](${bboxStr});`);
    clauses.push(`relation["water"](${bboxStr});`);
    clauses.push(`way["landuse"="reservoir"](${bboxStr});`);
    clauses.push(`relation["landuse"="reservoir"](${bboxStr});`);
    clauses.push(`way["landuse"="basin"](${bboxStr});`);
  }

  if (featSet.has('waterways')) {
    clauses.push(`way["waterway"](${bboxStr});`);
    clauses.push(`relation["waterway"](${bboxStr});`);
  }

  if (featSet.has('railways')) {
    clauses.push(`way["railway"](${bboxStr});`);
  }

  if (featSet.has('pois')) {
    clauses.push(`node["amenity"](${bboxStr});`);
    clauses.push(`node["shop"](${bboxStr});`);
    clauses.push(`node["tourism"](${bboxStr});`);
    clauses.push(`node["historic"](${bboxStr});`);
    clauses.push(`node["leisure"](${bboxStr});`);
  }

  // If no specific features matched, query defaults (buildings, roads, water)
  if (clauses.length === 0) {
    clauses.push(`way["building"](${bboxStr});`);
    clauses.push(`way["highway"](${bboxStr});`);
    clauses.push(`way["natural"="water"](${bboxStr});`);
  }

  return `[out:json][timeout:15];
(
  ${clauses.join('\n  ')}
);
out geom qt;`;
}

/**
 * Execute Overpass query with fallback endpoints and timeout handling.
 *
 * @param {string} query
 * @returns {Promise<object>} Parsed Overpass JSON
 */
async function fetchOverpassData(query) {
  const endpoints = [PRIMARY_OVERPASS_URL, ...FALLBACK_OVERPASS_URLS.filter((u) => u !== PRIMARY_OVERPASS_URL)];

  let lastError = null;

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const params = new URLSearchParams();
      params.append('data', query);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'SatQuery-AI/1.0 (Satellite GIS Intelligence)',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        lastError = new Error('Overpass API rate limit reached (HTTP 429). Please wait a moment before querying again.');
        continue;
      }

      if (response.status === 504) {
        lastError = new Error('Overpass query timed out (HTTP 504). Try selecting a slightly smaller area.');
        continue;
      }

      if (!response.ok) {
        lastError = new Error(`Overpass server error (${response.status}) on ${url}`);
        continue;
      }

      const text = await response.text();

      // Check if response returned HTML error page (e.g., dispatcher busy)
      if (text.trim().startsWith('<') || text.includes('Dispatcher_Client::request_read_and_idx::timeout')) {
        lastError = new Error('Overpass server busy error. Attempting next mirror...');
        continue;
      }

      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        lastError = new Error(`Invalid JSON returned from Overpass: ${e.message}`);
        continue;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = new Error('Request to OpenStreetMap Overpass timed out after 25 seconds.');
      } else {
        lastError = err;
      }
    }
  }

  throw lastError || new Error('All OpenStreetMap Overpass endpoints failed. Please check network connectivity.');
}

/**
 * Assemble multiple line segments into closed rings for multipolygons.
 *
 * @param {Array<Array<[number, number]>>} segments
 * @returns {Array<Array<[number, number]>>} Assembled closed rings
 */
function assembleRings(segments) {
  const rings = [];
  const remaining = segments.map((seg) => [...seg]);

  while (remaining.length > 0) {
    let current = remaining.shift();
    if (!current || current.length === 0) continue;

    let isClosed = current.length >= 4 &&
      current[0][0] === current[current.length - 1][0] &&
      current[0][1] === current[current.length - 1][1];

    if (isClosed) {
      rings.push(current);
      continue;
    }

    let progress = true;
    while (progress && !isClosed) {
      progress = false;
      const endPoint = current[current.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const start = seg[0];
        const end = seg[seg.length - 1];

        // Match end to start
        if (Math.abs(endPoint[0] - start[0]) < 1e-7 && Math.abs(endPoint[1] - start[1]) < 1e-7) {
          current = current.concat(seg.slice(1));
          remaining.splice(i, 1);
          progress = true;
          break;
        }

        // Match end to end (reverse segment)
        if (Math.abs(endPoint[0] - end[0]) < 1e-7 && Math.abs(endPoint[1] - end[1]) < 1e-7) {
          current = current.concat(seg.slice(0, -1).reverse());
          remaining.splice(i, 1);
          progress = true;
          break;
        }
      }

      isClosed = current.length >= 4 &&
        current[0][0] === current[current.length - 1][0] &&
        current[0][1] === current[current.length - 1][1];
    }

    // Force closure if ends are close enough
    if (!isClosed && current.length >= 3) {
      current.push([current[0][0], current[0][1]]);
    }

    if (current.length >= 4) {
      rings.push(current);
    }
  }

  return rings;
}

/**
 * Determine the specific layer category for an OSM element.
 */
function classifyElement(tags) {
  if (!tags) return 'other';
  if (tags.building) return 'buildings';
  if (tags.highway) return 'roads';
  if (tags.waterway) return 'waterways';
  if (tags.natural === 'water' || tags.water || tags.landuse === 'reservoir' || tags.landuse === 'basin') {
    return 'water';
  }
  if (tags.railway) return 'railways';
  if (tags.amenity || tags.shop || tags.tourism || tags.historic || tags.leisure) {
    return 'pois';
  }
  return 'other';
}

/**
 * Extract clean, prioritized properties from OSM tags.
 */
function extractProperties(element, category) {
  const tags = element.tags || {};
  const props = {
    osm_id: `${element.type}/${element.id}`,
    osm_type: element.type,
    id: element.id,
    category,
    name: tags.name || tags['name:en'] || null,
  };

  switch (category) {
    case 'buildings':
      props.feature_type = tags.building !== 'yes' ? tags.building : 'building';
      props.levels = tags['building:levels'] ? parseInt(tags['building:levels'], 10) : null;
      props.height = tags.height || null;
      props.addr_street = tags['addr:street'] || null;
      props.addr_housenumber = tags['addr:housenumber'] || null;
      props.amenity = tags.amenity || null;
      props.shop = tags.shop || null;
      break;

    case 'roads':
      props.feature_type = tags.highway || 'road';
      props.highway = tags.highway;
      props.ref = tags.ref || null;
      props.lanes = tags.lanes ? parseInt(tags.lanes, 10) : null;
      props.maxspeed = tags.maxspeed || null;
      props.surface = tags.surface || null;
      props.oneway = tags.oneway === 'yes';
      props.bridge = tags.bridge === 'yes';
      props.tunnel = tags.tunnel === 'yes';
      break;

    case 'water':
      props.feature_type = tags.water || tags.natural || 'water body';
      props.natural = tags.natural || null;
      break;

    case 'waterways':
      props.feature_type = tags.waterway || 'waterway';
      props.waterway = tags.waterway;
      props.intermittent = tags.intermittent === 'yes';
      break;

    case 'railways':
      props.feature_type = tags.railway || 'railway';
      props.electrified = tags.electrified || null;
      props.gauge = tags.gauge || null;
      props.usage = tags.usage || null;
      break;

    case 'pois':
      props.feature_type = tags.amenity || tags.shop || tags.tourism || tags.historic || tags.leisure || 'poi';
      props.amenity = tags.amenity || null;
      props.shop = tags.shop || null;
      props.tourism = tags.tourism || null;
      props.opening_hours = tags.opening_hours || null;
      break;

    default:
      props.feature_type = 'feature';
  }

  // Attach full raw tags map for detailed inspection modal/popup
  props.all_tags = tags;

  return props;
}

/**
 * Convert Overpass JSON response into organized GeoJSON FeatureCollections by category.
 *
 * @param {object} overpassJson - Response from Overpass API
 * @returns {{ [category: string]: { type: 'FeatureCollection', features: Array } }}
 */
export function convertOverpassToGeoJSON(overpassJson) {
  const layers = {
    buildings: { type: 'FeatureCollection', features: [] },
    roads: { type: 'FeatureCollection', features: [] },
    water: { type: 'FeatureCollection', features: [] },
    waterways: { type: 'FeatureCollection', features: [] },
    railways: { type: 'FeatureCollection', features: [] },
    pois: { type: 'FeatureCollection', features: [] },
  };

  if (!overpassJson || !Array.isArray(overpassJson.elements)) {
    return layers;
  }

  for (const el of overpassJson.elements) {
    const category = classifyElement(el.tags);
    if (!layers[category]) continue;

    const props = extractProperties(el, category);

    // 1. OSM Node (Point)
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      const feature = {
        type: 'Feature',
        id: props.osm_id,
        geometry: {
          type: 'Point',
          coordinates: [el.lon, el.lat],
        },
        properties: props,
      };
      layers[category].features.push(feature);
      continue;
    }

    // 2. OSM Way (LineString or Polygon)
    if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const coords = el.geometry.map((pt) => [pt.lon, pt.lat]);

      const isClosed = coords.length >= 4 &&
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];

      const isArea = category === 'buildings' || category === 'water' ||
        (isClosed && !el.tags?.highway && !el.tags?.waterway && !el.tags?.railway);

      let geometry;
      if (isArea) {
        // Ensure closed ring
        const ring = [...coords];
        if (!isClosed) ring.push([ring[0][0], ring[0][1]]);
        geometry = {
          type: 'Polygon',
          coordinates: [ring],
        };
      } else {
        geometry = {
          type: 'LineString',
          coordinates: coords,
        };
      }

      const feature = {
        type: 'Feature',
        id: props.osm_id,
        geometry,
        properties: props,
      };

      layers[category].features.push(feature);
      continue;
    }

    // 3. OSM Relation (Multipolygon)
    if (el.type === 'relation' && Array.isArray(el.members)) {
      const outerSegments = [];
      const innerSegments = [];

      for (const m of el.members) {
        if (m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 2) {
          const segCoords = m.geometry.map((pt) => [pt.lon, pt.lat]);
          if (m.role === 'inner') {
            innerSegments.push(segCoords);
          } else {
            outerSegments.push(segCoords);
          }
        }
      }

      const outerRings = assembleRings(outerSegments);
      const innerRings = assembleRings(innerSegments);

      if (outerRings.length === 1) {
        const feature = {
          type: 'Feature',
          id: props.osm_id,
          geometry: {
            type: 'Polygon',
            coordinates: [outerRings[0], ...innerRings],
          },
          properties: props,
        };
        layers[category].features.push(feature);
      } else if (outerRings.length > 1) {
        // MultiPolygon representation
        const feature = {
          type: 'Feature',
          id: props.osm_id,
          geometry: {
            type: 'MultiPolygon',
            coordinates: outerRings.map((outerRing) => [outerRing]),
          },
          properties: props,
        };
        layers[category].features.push(feature);
      }
    }
  }

  return layers;
}

/**
 * Main handler to query OpenStreetMap for an AOI.
 *
 * @param {object} params
 * @param {object} params.geometry - GeoJSON Polygon
 * @param {string[]} [params.features] - Requested feature categories
 * @returns {Promise<object>} Structured response conforming to SatQuery standard
 */
export async function queryOSM({ geometry, features = ['buildings', 'roads', 'water', 'waterways', 'railways', 'pois'] }) {
  const startTime = Date.now();

  // Validate geometry
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates) || !geometry.coordinates[0]) {
    const error = new Error('Invalid AOI geometry. Must be a valid GeoJSON Polygon with coordinates.');
    error.statusCode = 400;
    throw error;
  }

  const ring = geometry.coordinates[0];
  if (ring.length < 3) {
    const error = new Error('Polygon must contain at least 3 coordinates.');
    error.statusCode = 400;
    throw error;
  }

  // Calculate area
  const areaKm2 = calculateGeoJSONPolygonAreaKm2(ring);

  // Large AOI Protection
  if (areaKm2 > MAX_OSM_AOI_KM2) {
    const error = new Error(
      `Selected area is too large (${areaKm2} km²). Maximum allowed area for detailed OSM analysis is ${MAX_OSM_AOI_KM2} km². Please select a smaller region.`
    );
    error.statusCode = 400;
    throw error;
  }

  const bbox = getBoundingBox(ring);
  const cacheKey = generateCacheKey(bbox, features);

  // Check cache
  const cached = osmCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return {
      ...cached.data,
      metadata: {
        ...cached.data.metadata,
        cached: true,
      },
      trace: {
        ...cached.data.trace,
        cached: true,
        durationMs: Date.now() - startTime,
      },
    };
  }

  // Build query
  const query = buildOverpassQuery(bbox, features);

  // Fetch from Overpass
  const overpassData = await fetchOverpassData(query);

  // Convert to GeoJSON layers
  const layers = convertOverpassToGeoJSON(overpassData);

  // Calculate counts
  const featureCount = {};
  let totalFeatures = 0;
  for (const [cat, fc] of Object.entries(layers)) {
    featureCount[cat] = fc.features.length;
    totalFeatures += fc.features.length;
  }

  const elapsed = Date.now() - startTime;

  const result = {
    success: true,
    source: 'OpenStreetMap',
    query: {
      features,
      boundingBox: bbox,
    },
    aoi: {
      type: 'Polygon',
      coordinates: geometry.coordinates,
      areaKm2,
    },
    layers,
    metadata: {
      featureCount,
      totalFeatures,
      cached: false,
      timestamp: new Date().toISOString(),
    },
    trace: {
      task: 'geographic_context',
      tool: 'Overpass API (Vector Features)',
      input: `AOI [${bbox.south.toFixed(3)}, ${bbox.west.toFixed(3)} to ${bbox.north.toFixed(3)}, ${bbox.east.toFixed(3)}] (${areaKm2} km²)`,
      requestedFeatures: features,
      status: 'completed',
      durationMs: elapsed,
      totalFeatures,
    },
  };

  // Cache response
  pruneCache();
  osmCache.set(cacheKey, { timestamp: Date.now(), data: result });

  return result;
}
