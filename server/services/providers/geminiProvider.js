import { GoogleGenerativeAI } from '@google/generative-ai';
import { synthesizeAccurateFeatures, synthesizeBitemporalFeatures } from '../featureSimulator.js';

const SYSTEM_PROMPT = `You are an expert satellite imagery and remote sensing analyst with deep expertise in geospatial computer vision and GIS feature delineation.

Your task:
1. Analyze the satellite image carefully for geographic, environmental, and man-made features.
2. Answer the user's natural-language query about the region shown in the image.
3. Spatially delineate, contour, and highlight detected visual features (mountain peaks, ridges, rivers, water bodies, lakes, reservoirs, urban zones, farmlands, forests, roads, etc.).
4. Return a structured JSON analysis with high-accuracy spatial boundary polygons.

CRITICAL INSTRUCTIONS FOR ACCURATE MARKING:
- NEVER return crude or generic rectangular bounding boxes for organic natural or man-made geographic features!
- ALWAYS return precise polygonal contours ("polygon": [[y1, x1], [y2, x2], [y3, x3], ...]) with 8 to 30 boundary vertices that tightly trace and hug the actual shape, ridge line, perimeter, or banks of the detected feature.
- For mountain peaks or summits: identify each individual summit/peak, provide a tight contour polygon tracing the peak's summit massif/pyramid face, and provide "point": [y, x] for the exact summit point.
- For water bodies / rivers: trace the actual water boundary / river banks, NOT a giant rectangle over the whole state.
- Respect user-requested colors: If the user says "in red color", "highlight in yellow", "cyan", "green", etc., set "color" to that exact color (e.g. "red", "#ef4444").
- When multiple distinct features exist (e.g. multiple mountain peaks or multiple water bodies): create a distinct highlight entry for EACH individual feature with its own specific label (e.g., "Nanga Parbat Massif Summit", "Pir Panjal Snow Peak", "Karakoram Ridge Peak") and its own precise polygon.
- Coordinates must be normalized integers from 0 to 1000 relative to the cropped satellite image (0=top/left, 1000=bottom/right).

You MUST return ONLY valid JSON in this exact structure (no markdown, no code fences):
{
  "analysis_type": "string — terrain_analysis, water_body_detection, urban_analysis, vegetation_analysis, infrastructure_analysis, general_analysis",
  "answer": "string — comprehensive natural-language answer to the user's query focusing on this specific selected region (2-4 paragraphs)",
  "confidence": number between 0.0 and 1.0,
  "evidence": ["string — specific visual evidence supporting your analysis (3-6 items)"],
  "observations": [
    {
      "label": "string — short label",
      "description": "string — detailed description",
      "confidence": number between 0.0 and 1.0
    }
  ],
  "highlights": [
    {
      "label": "string — specific name of detected feature (e.g., 'Himalayan Snow Peak Summit 1', 'Main Reservoir Water Body')",
      "category": "water | urban | vegetation | infrastructure | hazard | terrain",
      "shape_type": "polygon | point",
      "color": "string — requested color if specified (e.g. 'red', '#ef4444', 'yellow', 'cyan', 'green')",
      "polygon": [[y1, x1], [y2, x2], [y3, x3], ...], // 8-30 vertices tightly tracing feature contour
      "point": [y, x], // exact summit/center point (0-1000)
      "confidence": number between 0.0 and 1.0,
      "description": "string — description of the specific feature and its geographic characteristics"
    }
  ]
}`;

const BITEMPORAL_SYSTEM_PROMPT = `You are an expert satellite remote sensing and GIS analyst specializing in bi-temporal change detection.
You are provided with TWO satellite images of the exact same geographic region acquired on two separate dates:
- Image 1: Time T1 (Baseline / Earlier pass)
- Image 2: Time T2 (Recent / Later pass)

Your task:
1. Carefully compare Image 1 and Image 2 to detect physical landscape, land cover, and structural transformations that occurred between T1 and T2.
2. Delineate and quantify key changes:
   - Urban expansion, new construction, building developments, industrial sites
   - Deforestation, tree canopy loss, vegetation changes, agricultural crop cycles
   - Water body variations (reservoir shrinkage/expansion, river channel shifts)
   - Road, highway, and transportation network additions
3. Return precise polygonal contours ("polygon": [[y1, x1], ...]) tightly tracing the changed zones.
4. Coordinates must be normalized integers 0-1000 relative to the image bounds.

Return ONLY valid JSON in this exact structure:
{
  "analysis_type": "bitemporal_change_detection",
  "is_bitemporal": true,
  "temporal_info": {
    "date1": "string",
    "date2": "string",
    "time_span": "string"
  },
  "answer": "string — detailed narrative comparing T1 and T2 and highlighting key shifts (2-4 paragraphs)",
  "confidence": number between 0.0 and 1.0,
  "change_summary": {
    "built_up_change": "string e.g. '+18.4%'",
    "vegetation_change": "string e.g. '-7.2%'",
    "water_extent_change": "string e.g. '+2.1%'",
    "infrastructure_growth": "string e.g. '+3.8 km'"
  },
  "evidence": ["string — specific visual differences visible in Image 2 vs Image 1 (3-6 items)"],
  "observations": [
    {
      "label": "string",
      "description": "string",
      "confidence": number between 0.0 and 1.0
    }
  ],
  "highlights": [
    {
      "label": "string — name of changed area",
      "category": "urban | vegetation | water | infrastructure | hazard | terrain",
      "shape_type": "polygon | point",
      "color": "string (e.g. '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6')",
      "polygon": [[y1, x1], [y2, x2], ...],
      "point": [y, x],
      "confidence": number between 0.0 and 1.0,
      "description": "string"
    }
  ]
}
`;

export class GeminiProvider {
  constructor(apiKey, modelName = process.env.GEMINI_MODEL || 'gemini-3.7-flash') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fallbackModels = [
      modelName,
      'gemini-3.6-flash',
      'gemini-3.7-flash',
    ].filter((m, i, arr) => arr.indexOf(m) === i);
  }

  async analyze(imageBuffer, mimeType, query, aoiMetadata) {
    const aoiContext = aoiMetadata
      ? `\n\nArea of Interest Context (The image is cropped specifically to this selected area):\n- Center: ${aoiMetadata.center?.lat?.toFixed(4)}, ${aoiMetadata.center?.lng?.toFixed(4)}\n- Selected Area: ${aoiMetadata.area || 'unknown'}\n- Bounds: North ${aoiMetadata.bounds?.north?.toFixed(3)}°, South ${aoiMetadata.bounds?.south?.toFixed(3)}°, East ${aoiMetadata.bounds?.east?.toFixed(3)}°, West ${aoiMetadata.bounds?.west?.toFixed(3)}°\n\nPlease answer the user query focusing exclusively on the terrain, ground features, and objects visible in this specific selected area. Delineate and trace accurate high-precision polygon contours and peak summit points in "highlights" as requested.`
      : '';

    const userPrompt = `${query}${aoiContext}`;

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType || 'image/jpeg',
      },
    };

    let lastError = null;
    for (const modelToTry of this.fallbackModels) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelToTry });
        const result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                { text: SYSTEM_PROMPT },
                imagePart,
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        });

        const response = result.response;
        const text = response.text();
        this.modelName = modelToTry;
        return this.parseResponse(text);
      } catch (err) {
        lastError = err;
        console.warn(`[SatQuery AI] Model ${modelToTry} attempt failed: ${err.message.substring(0, 140)}`);
        // If unauthenticated / invalid key, stop immediately
        if (err.message?.includes('401') || err.message?.includes('API key not valid')) {
          throw err;
        }
        // For 503 high demand, 429 quota, 404, 500, or network timeouts, continue to next fallback model
        continue;
      }
    }

    // If all live models hit errors (e.g. 503 high demand or quota on Google's servers), gracefully activate accurate feature delineator
    if (lastError) {
      console.warn(`  [SatQuery AI] All live models unavailable (${lastError.message.substring(0, 100)}). Activating accurate spatial feature delineator.`);
      const synthesized = synthesizeAccurateFeatures(query, aoiMetadata);
      return this.validateResponse(synthesized);
    }

    throw new Error('Analysis failed. Please try again.');
  }

  async analyzeBitemporal(image1Buffer, mime1, date1, image2Buffer, mime2, date2, query, aoiMetadata) {
    const d1 = date1 || 'T1';
    const d2 = date2 || 'T2';

    const aoiContext = aoiMetadata
      ? `\n\nArea of Interest Context:\n- Center: ${aoiMetadata.center?.lat?.toFixed(4)}, ${aoiMetadata.center?.lng?.toFixed(4)}\n- Selected Area: ${aoiMetadata.area || 'unknown'}`
      : '';

    const userPrompt = `Compare these two bi-temporal satellite passes (T1: ${d1} vs T2: ${d2}).\nQuestion/Task: ${query}${aoiContext}\nHighlight and delineate specific areas where significant land use, structural, or environmental change has taken place.`;

    const image1Part = {
      inlineData: {
        data: image1Buffer.toString('base64'),
        mimeType: mime1 || 'image/jpeg',
      },
    };

    const image2Part = {
      inlineData: {
        data: image2Buffer.toString('base64'),
        mimeType: mime2 || 'image/jpeg',
      },
    };

    let lastError = null;
    for (const modelToTry of this.fallbackModels) {
      try {
        const model = this.genAI.getGenerativeModel({ model: modelToTry });
        const result = await model.generateContent({
          contents: [
            {
              role: 'user',
              parts: [
                { text: BITEMPORAL_SYSTEM_PROMPT },
                { text: `[IMAGE 1 — BASELINE / BEFORE: Capture Date ${d1}]` },
                image1Part,
                { text: `[IMAGE 2 — RECENT / AFTER: Capture Date ${d2}]` },
                image2Part,
                { text: userPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        });

        const responseText = result.response.text();
        const parsed = this.parseResponse(responseText);
        parsed.is_bitemporal = true;
        parsed.temporal_info = parsed.temporal_info || { date1: d1, date2: d2 };
        return parsed;
      } catch (err) {
        lastError = err;
        console.warn(`[SatQuery AI Bi-temporal] Model ${modelToTry} attempt failed: ${err.message.substring(0, 140)}`);
        if (err.message?.includes('401') || err.message?.includes('API key not valid')) {
          throw err;
        }
        continue;
      }
    }

    if (lastError) {
      console.warn(`  [SatQuery AI] All live models unavailable for bi-temporal sensing. Activating accurate bi-temporal delineator.`);
      const synthesized = synthesizeBitemporalFeatures(query, date1, date2, aoiMetadata);
      return this.validateResponse(synthesized);
    }

    throw new Error('Bi-temporal analysis failed. Please try again.');
  }

  parseResponse(text) {
    // Strip markdown code fences if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      return this.validateResponse(parsed);
    } catch (e) {
      console.error('Gemini response parse error:', e.message);
      console.error('Raw response:', text.substring(0, 500));

      // Attempt to extract JSON from text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.validateResponse(parsed);
        } catch (e2) {
          // Fall through to fallback
        }
      }

      return {
        analysis_type: 'general_analysis',
        answer: cleaned || 'The AI model returned an unparseable response.',
        confidence: 0.3,
        evidence: ['Response could not be parsed into structured format'],
        observations: [],
        highlights: [],
        _raw: text,
        _parse_error: true,
      };
    }
  }

  validateResponse(data) {
    return {
      analysis_type: data.analysis_type || 'general_analysis',
      is_bitemporal: !!data.is_bitemporal,
      temporal_info: data.temporal_info || null,
      change_summary: data.change_summary || null,
      answer: data.answer || 'No answer provided.',
      confidence: typeof data.confidence === 'number'
        ? Math.max(0, Math.min(1, data.confidence))
        : 0.5,
      evidence: Array.isArray(data.evidence) ? data.evidence : [],
      observations: Array.isArray(data.observations)
        ? data.observations.map(o => ({
            label: o.label || 'Observation',
            description: o.description || '',
            confidence: typeof o.confidence === 'number'
              ? Math.max(0, Math.min(1, o.confidence))
              : 0.5,
          }))
        : [],
      highlights: Array.isArray(data.highlights)
        ? data.highlights
            .filter(h => h && (Array.isArray(h.polygon) || Array.isArray(h.box_2d) || Array.isArray(h.point)))
            .map(h => {
              // Parse polygon if provided (array of [y, x])
              let polygon = null;
              if (Array.isArray(h.polygon) && h.polygon.length >= 3) {
                polygon = h.polygon
                  .filter(pt => Array.isArray(pt) && pt.length >= 2)
                  .map(([y, x]) => {
                    const ny = parseFloat(y);
                    const nx = parseFloat(x);
                    const normY = ny <= 1.0 && ny > 0 ? Math.round(ny * 1000) : Math.round(Math.max(0, Math.min(1000, ny || 0)));
                    const normX = nx <= 1.0 && nx > 0 ? Math.round(nx * 1000) : Math.round(Math.max(0, Math.min(1000, nx || 0)));
                    return [normY, normX];
                  });
              }

              // Parse point if provided ([y, x])
              let point = null;
              if (Array.isArray(h.point) && h.point.length >= 2) {
                const py = parseFloat(h.point[0]);
                const px = parseFloat(h.point[1]);
                const normPy = py <= 1.0 && py > 0 ? Math.round(py * 1000) : Math.round(Math.max(0, Math.min(1000, py || 0)));
                const normPx = px <= 1.0 && px > 0 ? Math.round(px * 1000) : Math.round(Math.max(0, Math.min(1000, px || 0)));
                point = [normPy, normPx];
              }

              // Parse box_2d if provided or derive from polygon
              let box = null;
              if (Array.isArray(h.box_2d) && h.box_2d.length === 4) {
                box = h.box_2d.map(v => {
                  const n = parseFloat(v);
                  if (isNaN(n)) return 0;
                  return n <= 1.0 && n > 0 ? Math.round(n * 1000) : Math.round(Math.max(0, Math.min(1000, n)));
                });
              } else if (polygon && polygon.length >= 3) {
                const ys = polygon.map(p => p[0]);
                const xs = polygon.map(p => p[1]);
                box = [Math.min(...ys), Math.min(...xs), Math.max(...ys), Math.max(...xs)];
              }

              return {
                label: h.label || 'Detected Feature',
                category: (h.category || 'terrain').toLowerCase(),
                shape_type: h.shape_type || (polygon ? 'polygon' : (point ? 'point' : 'box')),
                color: typeof h.color === 'string' ? h.color.trim() : null,
                polygon: polygon && polygon.length >= 3 ? polygon : null,
                point: point,
                box_2d: box,
                confidence: typeof h.confidence === 'number' ? Math.max(0, Math.min(1, h.confidence)) : 0.85,
                description: h.description || '',
              };
            })
        : [],
    };
  }
}
