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
import { initProvider, analyzeImage, analyzeBitemporal, getStatus } from './services/aiService.js';
import { synthesizeAccurateFeatures, synthesizeBitemporalFeatures } from './services/featureSimulator.js';
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

app.post('/api/analyze', upload.any(), async (req, res) => {
  try {
    const isBitemporal = req.body.isBitemporal === 'true' || req.body.isBitemporal === true;
    const query = req.body.query;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        error: 'No query provided. Ask a question about the satellite image.',
      });
    }

    // Check AI availability — if offline, fallback gracefully to smart simulator
    const status = getStatus();
    if (!status.available) {
      if (isBitemporal) {
        const date1 = req.body.date1 || 'T1';
        const date2 = req.body.date2 || 'T2';
        const simulated = synthesizeBitemporalFeatures(query, date1, date2, aoiMetadata);
        simulated.metadata = {
          model: 'smart-simulator-engine',
          processing_time_ms: 150,
          timestamp: new Date().toISOString(),
          aoi: aoiMetadata || null,
          temporal_info: { date1, date2 },
          route: 'bitemporal_change_detection',
          category: 'change',
        };
        return res.json(simulated);
      } else {
        const simulated = synthesizeAccurateFeatures(query, aoiMetadata);
        simulated.metadata = {
          model: 'smart-simulator-engine',
          processing_time_ms: 150,
          timestamp: new Date().toISOString(),
          aoi: aoiMetadata || null,
          route: 'general_analysis',
          category: 'general',
        };
        return res.json(simulated);
      }
    }

    // Parse AOI metadata
    let aoiMetadata = null;
    if (req.body.aoi) {
      try {
        aoiMetadata = typeof req.body.aoi === 'string'
          ? JSON.parse(req.body.aoi)
          : req.body.aoi;
      } catch (e) {
        console.warn('Could not parse AOI metadata:', e.message);
      }
    }

    const MAX_DIMENSION = 1024;
    const optimizeImage = async (buf) => {
      const meta = await sharp(buf).metadata();
      if (meta.width > MAX_DIMENSION || meta.height > MAX_DIMENSION) {
        return await sharp(buf)
          .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      }
      return buf;
    };

    if (isBitemporal) {
      let file1 = req.files?.find(f => f.fieldname === 'image1') || req.files?.[0];
      let file2 = req.files?.find(f => f.fieldname === 'image2') || req.files?.[1];

      let image1Buffer = file1 ? file1.buffer : null;
      let mime1 = file1 ? file1.mimetype : 'image/jpeg';
      if (!image1Buffer && req.body.image1Base64) {
        const b64 = req.body.image1Base64.replace(/^data:image\/\w+;base64,/, '');
        image1Buffer = Buffer.from(b64, 'base64');
      }

      let image2Buffer = file2 ? file2.buffer : null;
      let mime2 = file2 ? file2.mimetype : 'image/jpeg';
      if (!image2Buffer && req.body.image2Base64) {
        const b64 = req.body.image2Base64.replace(/^data:image\/\w+;base64,/, '');
        image2Buffer = Buffer.from(b64, 'base64');
      }

      if (!image1Buffer || !image2Buffer) {
        return res.status(400).json({
          error: 'Bi-temporal analysis requires two images (T1 baseline and T2 recent).',
        });
      }

      image1Buffer = await optimizeImage(image1Buffer);
      image2Buffer = await optimizeImage(image2Buffer);

      const date1 = req.body.date1 || 'T1';
      const date2 = req.body.date2 || 'T2';

      console.log(`  Bi-temporal analysis request: "${query.substring(0, 60)}..." (T1: ${date1} vs T2: ${date2})`);

      const result = await analyzeBitemporal(
        image1Buffer, mime1, date1,
        image2Buffer, mime2, date2,
        query, aoiMetadata
      );

      result.metadata = {
        ...result.metadata,
        route: 'bitemporal_change_detection',
        category: 'change',
      };

      return res.json(result);
    }

    // Single image flow
    let file = req.files?.find(f => f.fieldname === 'image') || req.files?.[0] || req.file;
    let imageBuffer;
    let mimeType;

    if (file) {
      imageBuffer = file.buffer;
      mimeType = file.mimetype;
    } else if (req.body.imageBase64) {
      const base64Data = req.body.imageBase64.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
      mimeType = req.body.imageMimeType || 'image/jpeg';
    }

    if (!imageBuffer) {
      return res.status(400).json({
        error: 'No image provided. Upload an image file or provide base64 data.',
      });
    }

    imageBuffer = await optimizeImage(imageBuffer);

    // Route the query (classify intent)
    const route = routeQuery(query);

    console.log(`  Analysis request: "${query.substring(0, 60)}..." → ${route.module}`);

    const result = await analyzeImage(imageBuffer, mimeType, query, aoiMetadata);

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
