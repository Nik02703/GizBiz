/**
 * AI Service — Provider abstraction layer
 *
 * Routes analysis requests to the configured AI provider (Gemini or OpenAI).
 * Designed so that specialist remote-sensing models can replace the generic
 * multimodal LLM later without changing the interface.
 */

import { GeminiProvider } from './providers/geminiProvider.js';
import { OpenAIProvider } from './providers/openaiProvider.js';

let providerInstance = null;
let currentProviderName = null;

/**
 * Initialize the AI provider based on environment configuration.
 * Returns { ok, provider, error }.
 */
export function initProvider() {
  const providerName = process.env.AI_PROVIDER || 'gemini';

  if (providerName === 'gemini') {
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { ok: false, provider: null, error: 'GEMINI_API_KEY is not set in .env' };
    }
    apiKey = apiKey.trim().replace(/\.+$/, '');
    const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
    providerInstance = new GeminiProvider(apiKey, model);
    currentProviderName = model;
  } else if (providerName === 'openai') {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { ok: false, provider: null, error: 'OPENAI_API_KEY is not set in .env' };
    }
    providerInstance = new OpenAIProvider(apiKey);
    currentProviderName = 'gpt-4o';
  } else {
    return { ok: false, provider: null, error: `Unknown AI provider: ${providerName}` };
  }

  console.log(`  AI provider initialized: ${currentProviderName}`);
  return { ok: true, provider: providerInstance, error: null };
}

/**
 * Analyze a satellite image with a natural-language query.
 *
 * @param {Buffer} imageBuffer - The image data
 * @param {string} mimeType - MIME type of the image
 * @param {string} query - Natural-language question
 * @param {object} aoiMetadata - Area of Interest metadata
 * @returns {Promise<object>} Structured analysis result
 */
export async function analyzeImage(imageBuffer, mimeType, query, aoiMetadata) {
  if (!providerInstance) {
    throw new Error('AI provider not initialized. Check your .env configuration.');
  }

  const startTime = Date.now();

  const result = await providerInstance.analyze(imageBuffer, mimeType, query, aoiMetadata);

  const elapsed = Date.now() - startTime;

  return {
    ...result,
    metadata: {
      model: currentProviderName,
      processing_time_ms: elapsed,
      timestamp: new Date().toISOString(),
      aoi: aoiMetadata || null,
    },
  };
}

/**
 * Send two bi-temporal images + dates + query for AI change detection analysis.
 *
 * @param {Buffer} image1Buffer - T1 Image Buffer
 * @param {string} mime1 - MIME type of Image 1
 * @param {string} date1 - Capture date of Image 1
 * @param {Buffer} image2Buffer - T2 Image Buffer
 * @param {string} mime2 - MIME type of Image 2
 * @param {string} date2 - Capture date of Image 2
 * @param {string} query - Natural language query
 * @param {object} aoiMetadata - Area of Interest metadata
 * @returns {Promise<object>} Structured bi-temporal analysis result
 */
export async function analyzeBitemporal(image1Buffer, mime1, date1, image2Buffer, mime2, date2, query, aoiMetadata) {
  if (!providerInstance) {
    throw new Error('AI provider not initialized. Check your .env configuration.');
  }

  const startTime = Date.now();

  let result;
  if (typeof providerInstance.analyzeBitemporal === 'function') {
    result = await providerInstance.analyzeBitemporal(
      image1Buffer, mime1, date1,
      image2Buffer, mime2, date2,
      query, aoiMetadata
    );
  } else {
    result = await providerInstance.analyze(
      image2Buffer, mime2,
      `[Bi-temporal comparison between ${date1} and ${date2}]: ${query}`,
      aoiMetadata
    );
  }

  const elapsed = Date.now() - startTime;

  return {
    ...result,
    is_bitemporal: true,
    metadata: {
      model: currentProviderName,
      processing_time_ms: elapsed,
      timestamp: new Date().toISOString(),
      aoi: aoiMetadata || null,
      temporal_info: { date1, date2 },
    },
  };
}

/**
 * Check if the AI service is available.
 */
export function getStatus() {
  return {
    available: !!providerInstance,
    provider: currentProviderName || 'none',
  };
}
