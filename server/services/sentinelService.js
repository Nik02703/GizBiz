/**
 * SatQuery AI — Copernicus Sentinel-2 L2A Satellite Service
 *
 * Integrates directly with the European Space Agency (ESA) Copernicus Data Space
 * Ecosystem (CDSE) Sentinel Hub APIs to acquire real 10-meter multispectral
 * satellite imagery for any selected Area of Interest (AOI).
 *
 * Supported Capabilities:
 * - OAuth2 Client Credentials authentication with token caching
 * - Sentinel-2 L2A Catalog search (sensing dates, cloud cover %)
 * - Multispectral Process API raster rendering:
 *     1. True Color (B04, B03, B02 RGB)
 *     2. False Color NIR (B08, B04, B03 Vegetation & Agriculture)
 *     3. NDVI (Normalized Difference Vegetation Index)
 *     4. SWIR (B12, B8A, B04 Urban, Moisture & Geology)
 */

const CDSE_AUTH_URL = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const CDSE_PROCESS_URL = 'https://sh.dataspace.copernicus.eu/api/v1/process';
const CDSE_CATALOG_URL = 'https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search';

// In-memory token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Check if Copernicus / Sentinel Hub credentials are present in the environment.
 * @returns {boolean}
 */
export function isSentinelConfigured() {
  const id = process.env.COPERNICUS_CLIENT_ID;
  const secret = process.env.COPERNICUS_CLIENT_SECRET;
  return Boolean(id && secret && id.trim().length > 0 && secret.trim().length > 0);
}

/**
 * Get a valid OAuth2 Bearer token for Copernicus Data Space Ecosystem.
 * Automatically refreshes before expiration.
 *
 * @returns {Promise<string>}
 */
export async function getSentinelToken() {
  const clientId = process.env.COPERNICUS_CLIENT_ID;
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Copernicus Sentinel Hub credentials missing. Please set COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET in .env.');
  }

  const now = Date.now();
  // Return cached token if valid with 2-minute safety buffer
  if (cachedToken && tokenExpiresAt > now + 120_000) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId.trim(),
    client_secret: clientSecret.trim(),
  });

  const res = await fetch(CDSE_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Copernicus OAuth failed (${res.status}): ${errData.error_description || errData.error || res.statusText}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 1800) * 1000;
  return cachedToken;
}

/**
 * Get service status and credential validation.
 */
export async function getSentinelStatus() {
  const configured = isSentinelConfigured();
  if (!configured) {
    return {
      available: false,
      provider: 'Copernicus Sentinel-2 L2A',
      error: 'Credentials not configured in .env',
    };
  }

  try {
    const token = await getSentinelToken();
    return {
      available: true,
      provider: 'Copernicus Sentinel-2 L2A',
      clientId: process.env.COPERNICUS_CLIENT_ID?.slice(0, 8) + '...',
      authenticated: Boolean(token),
      presets: ['true_color', 'false_color', 'ndvi', 'swir'],
    };
  } catch (err) {
    return {
      available: false,
      provider: 'Copernicus Sentinel-2 L2A',
      error: err.message,
    };
  }
}

/**
 * Evalscripts for Sentinel-2 multispectral band calculations.
 */
const EVALSCRIPTS = {
  true_color: `//VERSION=3
function setup() {
  return {
    input: ["B04", "B03", "B02"],
    output: { bands: 3 }
  };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02];
}
`,

  false_color: `//VERSION=3
function setup() {
  return {
    input: ["B08", "B04", "B03"],
    output: { bands: 3 }
  };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B08, 2.5 * sample.B04, 2.5 * sample.B03];
}
`,

  ndvi: `//VERSION=3
function setup() {
  return {
    input: ["B08", "B04"],
    output: { bands: 3 }
  };
}
function evaluatePixel(sample) {
  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 0.0001);
  if (ndvi < -0.1) return [0.05, 0.2, 0.6];   // Water body (Deep Blue)
  if (ndvi < 0.05) return [0.75, 0.75, 0.75]; // Built-up / Bare soil (Gray)
  if (ndvi < 0.2)  return [0.85, 0.7, 0.35];  // Sparse shrub / Sand (Tan)
  if (ndvi < 0.45) return [0.85, 0.85, 0.2];  // Grassland / Moderate (Yellow-Green)
  if (ndvi < 0.65) return [0.3, 0.75, 0.2];   // Forest / Agriculture (Light Green)
  return [0.0, 0.48, 0.0];                    // Dense canopy / Peak vegetation (Dark Green)
}
`,

  swir: `//VERSION=3
function setup() {
  return {
    input: ["B12", "B8A", "B04"],
    output: { bands: 3 }
  };
}
function evaluatePixel(sample) {
  return [2.5 * sample.B12, 2.5 * sample.B8A, 2.5 * sample.B04];
}
`,
};

/**
 * Search the Sentinel-2 L2A satellite catalog for recent passes over an AOI.
 *
 * @param {object} params
 * @param {[number, number, number, number]} params.bbox - [minLng, minLat, maxLng, maxLat]
 * @param {number} [params.maxCloudCover=40]
 * @param {number} [params.limit=5]
 * @param {string} [params.fromDate]
 * @param {string} [params.toDate]
 * @returns {Promise<Array<object>>}
 */
export async function searchSentinelCatalog({
  bbox,
  maxCloudCover = 40,
  limit = 5,
  fromDate = null,
  toDate = null,
}) {
  const token = await getSentinelToken();

  const to = toDate || new Date().toISOString();
  const from = fromDate || new Date(Date.now() - 180 * 86400 * 1000).toISOString(); // Past 6 months

  const payload = {
    bbox,
    datetime: `${from}/${to}`,
    collections: ['sentinel-2-l2a'],
    limit: Math.min(limit, 10),
  };

  const res = await fetch(CDSE_CATALOG_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Catalog query failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const features = data.features || [];

  return features.map((f) => {
    const p = f.properties || {};
    return {
      id: f.id,
      sensingDate: p.datetime,
      platform: p.platform || 'Sentinel-2',
      cloudCover: typeof p['eo:cloud_cover'] === 'number' ? Math.round(p['eo:cloud_cover'] * 10) / 10 : null,
      constellation: p.constellation || 'sentinel-2',
    };
  });
}

/**
 * Acquire a real-time Sentinel-2 multispectral raster from Copernicus Process API.
 *
 * @param {object} params
 * @param {[number, number, number, number]} params.bbox - [minLng, minLat, maxLng, maxLat]
 * @param {'true_color'|'false_color'|'ndvi'|'swir'} [params.preset='true_color']
 * @param {number} [params.width=768]
 * @param {number} [params.height=768]
 * @param {number} [params.maxCloudCover=35]
 * @param {string} [params.fromDate]
 * @param {string} [params.toDate]
 * @returns {Promise<{ dataUrl: string, base64: string, mimeType: string, metadata: object }>}
 */
export async function acquireSentinelRaster({
  bbox,
  preset = 'true_color',
  width = 768,
  height = 768,
  maxCloudCover = 35,
  fromDate = null,
  toDate = null,
}) {
  const token = await getSentinelToken();

  const evalscript = EVALSCRIPTS[preset] || EVALSCRIPTS.true_color;

  const to = toDate || new Date().toISOString();
  const from = fromDate || new Date(Date.now() - 180 * 86400 * 1000).toISOString();

  const payload = {
    input: {
      bounds: {
        bbox,
        properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
      },
      data: [{
        type: 'sentinel-2-l2a',
        dataFilter: {
          timeRange: { from, to },
          maxCloudCoverage: maxCloudCover,
        },
      }],
    },
    output: {
      width: Math.min(Math.max(width, 256), 1024),
      height: Math.min(Math.max(height, 256), 1024),
      responses: [{ identifier: 'default', format: { type: 'image/png' } }],
    },
    evalscript,
  };

  const startTime = Date.now();
  const res = await fetch(CDSE_PROCESS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'image/png',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Sentinel-2 raster acquisition failed (${res.status}): ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  return {
    success: true,
    dataUrl,
    base64,
    mimeType: 'image/png',
    sizeBytes: buffer.length,
    durationMs: Date.now() - startTime,
    metadata: {
      satellite: 'Sentinel-2 (Copernicus / ESA)',
      resolution: '10m / pixel',
      preset,
      bbox,
      width,
      height,
      timestamp: new Date().toISOString(),
    },
  };
}
