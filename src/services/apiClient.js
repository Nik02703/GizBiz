/**
 * API Client — Communicates with the backend /api endpoints.
 */

const API_BASE = '/api';

/**
 * Check backend health and AI provider status.
 * @returns {Promise<{ status: string, ai: { available: boolean, provider: string } }>}
 */
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      status: 'error',
      ai: { available: false, provider: 'none' },
      error: err.message,
    };
  }
}

/**
 * Send an image + query for AI analysis.
 *
 * @param {object} params
 * @param {Blob|File|null} params.imageFile - Image file (if uploading)
 * @param {string|null} params.imageBase64 - Base64 image data (if captured from map)
 * @param {string} params.query - Natural-language question
 * @param {object|null} params.aoi - Area of Interest metadata
 * @returns {Promise<import('../types/analysis.js').AnalysisResult>}
 */
export async function analyzeImage({ imageFile, imageBase64, query, aoi }) {
  const formData = new FormData();

  if (imageFile) {
    formData.append('image', imageFile);
  } else if (imageBase64) {
    formData.append('imageBase64', imageBase64);
    formData.append('imageMimeType', 'image/jpeg');
  }

  formData.append('query', query);

  if (aoi) {
    formData.append('aoi', JSON.stringify(aoi));
  }

  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `Analysis failed (${res.status})`);
  }

  return data;
}
