/**
 * SatQuery AI — Copernicus Sentinel-2 Client
 *
 * Frontend service to communicate with backend Sentinel-2 endpoints:
 * - Status check
 * - Catalog search (recent Sentinel-2 L2A passes over AOI)
 * - Multispectral raster acquisition (True Color RGB, False Color NIR, NDVI, SWIR)
 */

const API_BASE = '/api';

/**
 * Extract standard bounding box [minLng, minLat, maxLng, maxLat] from an AOI object.
 *
 * @param {object} aoi
 * @returns {[number, number, number, number]}
 */
export function aoiToBbox(aoi) {
  if (!aoi) {
    throw new Error('No Area of Interest specified.');
  }

  if (aoi.bounds) {
    const { west, south, east, north } = aoi.bounds;
    return [
      parseFloat(west.toFixed(6)),
      parseFloat(south.toFixed(6)),
      parseFloat(east.toFixed(6)),
      parseFloat(north.toFixed(6)),
    ];
  }

  if (Array.isArray(aoi.coordinates) && aoi.coordinates.length >= 2) {
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;

    for (const pt of aoi.coordinates) {
      const lat = Array.isArray(pt) ? pt[0] : pt.lat;
      const lng = Array.isArray(pt) ? pt[1] : pt.lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    return [
      parseFloat(minLng.toFixed(6)),
      parseFloat(minLat.toFixed(6)),
      parseFloat(maxLng.toFixed(6)),
      parseFloat(maxLat.toFixed(6)),
    ];
  }

  throw new Error('Unable to extract bounding box from AOI.');
}

/**
 * Check if the backend has Copernicus Sentinel-2 credentials configured and valid.
 * @returns {Promise<object>}
 */
export async function checkSentinelStatus() {
  try {
    const res = await fetch(`${API_BASE}/sentinel/status`);
    if (!res.ok) {
      return { available: false, error: `Status check returned ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Search Sentinel-2 L2A catalog for recent satellite passes over this AOI.
 *
 * @param {object} aoi
 * @param {object} [opts]
 * @param {number} [opts.maxCloudCover=40]
 * @param {number} [opts.limit=4]
 * @returns {Promise<Array<object>>}
 */
export async function fetchSentinelCatalog(aoi, opts = {}) {
  const bbox = aoiToBbox(aoi);

  const res = await fetch(`${API_BASE}/sentinel/catalog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bbox,
      maxCloudCover: opts.maxCloudCover ?? 40,
      limit: opts.limit ?? 4,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to search Sentinel-2 satellite catalog.');
  }

  return data.granules || [];
}

/**
 * Acquire real 10m Sentinel-2 multispectral imagery for the selected AOI.
 *
 * @param {object} aoi
 * @param {object} [opts]
 * @param {'true_color'|'false_color'|'ndvi'|'swir'} [opts.preset='true_color']
 * @param {number} [opts.maxCloudCover=40]
 * @param {number} [opts.width=768]
 * @param {number} [opts.height=768]
 * @returns {Promise<{ dataUrl: string, base64: string, metadata: object }>}
 */
export async function acquireSentinelImage(aoi, opts = {}) {
  const bbox = aoiToBbox(aoi);

  const res = await fetch(`${API_BASE}/sentinel/acquire`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bbox,
      preset: opts.preset || 'true_color',
      maxCloudCover: opts.maxCloudCover ?? 40,
      width: opts.width || 768,
      height: opts.height || 768,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to acquire Sentinel-2 satellite raster.');
  }

  return data;
}
