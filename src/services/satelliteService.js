/**
 * Satellite Service — Image acquisition abstraction
 *
 * Provides a clean interface for getting satellite imagery of an AOI.
 * For the MVP, supports:
 *   1. Map view capture (screenshot of Leaflet map with satellite tiles)
 *   2. File upload (user provides their own satellite image)
 *   3. Demo images (pre-loaded for demo mode)
 *
 * The architecture allows adding real satellite imagery APIs later
 * (e.g., Sentinel Hub, Google Earth Engine, Planet).
 */

import { captureMapView, resizeImage } from '../utils/imageUtils.js';
import { acquireSentinelImage } from './sentinelClient.js';

/**
 * Capture the satellite image of the selected Area of Interest.
 *
 * @param {HTMLElement} mapElement - The map container DOM element
 * @param {object | null} aoi - Selected Area of Interest
 * @param {object | null} mapInstance - Leaflet map instance
 * @returns {Promise<{ dataUrl: string, blob: Blob, source: string, isCropped: boolean }>}
 */
export async function captureFromMap(mapElement, aoi = null, mapInstance = null) {
  const result = await captureMapView(mapElement, aoi, mapInstance);
  const resized = await resizeImage(result.dataUrl, 1024, 0.9);

  return {
    dataUrl: resized.dataUrl,
    blob: resized.blob,
    source: 'map_capture',
    isCropped: result.isCropped,
  };
}

/**
 * Get a demo satellite image for a given location.
 *
 * @param {string} locationId - Demo location identifier
 * @returns {{ dataUrl: string | null, blob: Blob | null, source: string }}
 */
export function getDemoImage(locationId) {
  // Demo images are loaded in DemoSelector and stored here
  const image = demoImageStore[locationId];
  if (!image) {
    return { dataUrl: null, blob: null, source: 'demo' };
  }
  return { ...image, source: 'demo' };
}

// In-memory store for demo images loaded by DemoSelector
export const demoImageStore = {};

/**
 * Store a demo image.
 *
 * @param {string} locationId
 * @param {string} dataUrl
 * @param {Blob} blob
 */
export function storeDemoImage(locationId, dataUrl, blob) {
  demoImageStore[locationId] = { dataUrl, blob };
}

/**
 * Acquire real Sentinel-2 satellite imagery from Copernicus Data Space Ecosystem.
 *
 * @param {object} aoi - Selected Area of Interest
 * @param {object} [opts] - { preset, maxCloudCover, width, height }
 * @returns {Promise<{ dataUrl: string, source: string, metadata: object }>}
 */
export async function acquireFromSentinel(aoi, opts = {}) {
  const res = await acquireSentinelImage(aoi, opts);
  return {
    dataUrl: res.dataUrl,
    blob: null,
    source: 'sentinel_2',
    metadata: res.metadata,
  };
}

