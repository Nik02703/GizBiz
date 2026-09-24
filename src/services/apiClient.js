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
export async function analyzeImage({
  imageFile,
  imageBase64,
  query,
  aoi,
  isBitemporal = false,
  image1File,
  image1Base64,
  date1,
  image2File,
  image2Base64,
  date2,
}) {
  const formData = new FormData();

  if (isBitemporal) {
    formData.append('isBitemporal', 'true');
    if (image1File) {
      formData.append('image1', image1File);
    } else if (image1Base64) {
      formData.append('image1Base64', image1Base64);
    }
    if (date1) formData.append('date1', date1);

    if (image2File) {
      formData.append('image2', image2File);
    } else if (image2Base64) {
      formData.append('image2Base64', image2Base64);
    }
    if (date2) formData.append('date2', date2);
  } else {
    if (imageFile) {
      formData.append('image', imageFile);
    } else if (imageBase64) {
      formData.append('imageBase64', imageBase64);
      formData.append('imageMimeType', 'image/jpeg');
    }
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
