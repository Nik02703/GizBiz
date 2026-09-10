/**
 * SatQuery AI — Express Backend Server
 *
 * Handles:
 * - POST /api/analyze — Accepts image + query, calls AI provider, returns structured result
 * - GET  /api/health  — Health check + AI provider status
 *
 * API keys are kept server-side and never exposed to the frontend.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err?.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection:', reason?.message || reason);
});
import { initProvider, analyzeImage, getStatus } from './services/aiService.js';
import { routeQuery } from './services/analysisRouter.js';
import { queryOSM } from './services/osmService.js';
import { getSentinelStatus, searchSentinelCatalog, acquireSentinelRaster } from './services/sentinelService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Multer config — memory storage, 10MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported image format: ${file.mimetype}`));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Initialize AI provider
const providerResult = initProvider();
if (!providerResult.ok) {
  console.warn(`\n  ⚠  AI provider not configured: ${providerResult.error}`);
  console.warn('  The app will run in demo-only mode.\n');
}

// ─── Health Check ────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  const status = getStatus();
  res.json({
    status: 'ok',
    ai: status,
    timestamp: new Date().toISOString(),
  });
});

// ─── OpenStreetMap Geographic Query Endpoint ─────────────────

app.post('/api/osm/query', async (req, res) => {
  try {
    const { geometry, features } = req.body;

    if (!geometry) {
      return res.status(400).json({
        success: false,
        error: 'No geometry provided. Please supply an Area of Interest polygon.',
      });
    }

    const result = await queryOSM({
      geometry,
      features: Array.isArray(features) && features.length > 0 ? features : undefined,
    });

    res.json(result);
  } catch (err) {
    console.error('[OSM Query Error]:', err.message);

    const status = err.statusCode || (err.message?.includes('rate limit') ? 429 : err.message?.includes('timed out') ? 504 : 500);

    res.status(status).json({
      success: false,
      error: err.message || 'OpenStreetMap data could not be retrieved right now. Please try again.',
      source: 'OpenStreetMap',
    });
  }
});

// ─── Copernicus Sentinel-2 Satellite Endpoints ───────────────

app.get('/api/sentinel/status', async (req, res) => {
  try {
    const status = await getSentinelStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ available: false, error: err.message });
  }
});

app.post('/api/sentinel/catalog', async (req, res) => {
  try {
    const { bbox, maxCloudCover, limit, fromDate, toDate } = req.body;
    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bounding box. Required format: [minLng, minLat, maxLng, maxLat].',
      });
    }

    const granules = await searchSentinelCatalog({ bbox, maxCloudCover, limit, fromDate, toDate });
    res.json({ success: true, granules });
  } catch (err) {
    console.error('[Sentinel Catalog Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sentinel/acquire', async (req, res) => {
  try {
    const { bbox, preset, width, height, maxCloudCover, fromDate, toDate } = req.body;
    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bounding box. Required format: [minLng, minLat, maxLng, maxLat].',
      });
    }

    const result = await acquireSentinelRaster({
      bbox,
      preset: preset || 'true_color',
      width: width || 768,
      height: height || 768,
      maxCloudCover: maxCloudCover !== undefined ? maxCloudCover : 40,
      fromDate,
      toDate,
    });

    res.json(result);
  } catch (err) {
    console.error('[Sentinel Acquire Error]:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Analyze Endpoint ────────────────────────────────────────

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    // Validate inputs
    if (!req.file && !req.body.imageBase64) {
      return res.status(400).json({
        error: 'No image provided. Upload an image file or provide base64 data.',
      });
    }

    const query = req.body.query;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'No query provided. Ask a question about the satellite image.',
      });
    }

    // Check AI availability
    const status = getStatus();
    if (!status.available) {
      return res.status(503).json({
        error: 'AI service is not configured. Add your API key to .env and restart the server.',
      });
    }

    // Get image buffer
    let imageBuffer;
    let mimeType;

    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype;
    } else if (req.body.imageBase64) {
      // Handle base64-encoded image from map capture
      const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      mimeType = req.body.imageMimeType || 'image/jpeg';
    }

    // Resize image to prevent sending unnecessarily large data to AI
    const MAX_DIMENSION = 1024;
    const metadata = await sharp(imageBuffer).metadata();

    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      imageBuffer = await sharp(imageBuffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      mimeType = 'image/jpeg';
    }

    // Parse AOI metadata
    let aoiMetadata = null;
    if (req.body.aoi) {
      try {
        aoiMetadata = typeof req.body.aoi === 'string'
          ? JSON.parse(req.body.aoi)
          : req.body.aoi;
      } catch (e) {
        // Non-critical — proceed without AOI
        console.warn('Could not parse AOI metadata:', e.message);
      }
    }

    // Route the query (classify intent)
    const route = routeQuery(query);

    console.log(`  Analysis request: "${query.substring(0, 60)}..." → ${route.module}`);

    // Run AI analysis
    const result = await analyzeImage(imageBuffer, mimeType, query, aoiMetadata);

    // Attach routing info
    result.metadata = {
      ...result.metadata,
      route: route.module,
      category: route.category,
    };

    res.json(result);
  } catch (err) {
    console.error('Analysis error:', err.message);

    // Handle known error conditions
    if (err.message?.includes('API key') || err.status === 401) {
      return res.status(401).json({ error: 'Invalid API key. Check your configuration.' });
    }

    if (err.status === 429 || /rate[-\s]?limit/i.test(err.message) || /quota/i.test(err.message)) {
      return res.status(429).json({ error: 'API rate limit or quota exceeded. Please try again in a moment.' });
    }

    if (err.message?.includes('Unsupported image')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
      error: `Analysis failed: ${err.message || 'Please try again or check server logs.'}`,
    });
  }
});

// ─── Serve Static Files (Production) ─────────────────────────

app.use(express.static(join(__dirname, '..', 'dist')));

// ─── Error Handler ───────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║  SatQuery AI — Backend Server        ║`);
  console.log(`  ╠══════════════════════════════════════╣`);
  console.log(`  ║  Port: ${PORT}                          ║`);
  console.log(`  ║  AI:   ${getStatus().provider.padEnd(26)}  ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
