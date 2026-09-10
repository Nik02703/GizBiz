import OpenAI from 'openai';

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

export class OpenAIProvider {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  async analyze(imageBuffer, mimeType, query, aoiMetadata) {
    const aoiContext = aoiMetadata
      ? `\n\nArea of Interest Context (The image is cropped specifically to this selected area):\n- Center: ${aoiMetadata.center?.lat?.toFixed(4)}, ${aoiMetadata.center?.lng?.toFixed(4)}\n- Selected Area: ${aoiMetadata.area || 'unknown'}\n- Bounds: North ${aoiMetadata.bounds?.north?.toFixed(3)}°, South ${aoiMetadata.bounds?.south?.toFixed(3)}°, East ${aoiMetadata.bounds?.east?.toFixed(3)}°, West ${aoiMetadata.bounds?.west?.toFixed(3)}°\n\nPlease answer the user query focusing exclusively on the terrain, ground features, and objects visible in this specific selected area.`
      : '';

    const userPrompt = `${query}${aoiContext}`;
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimeType || 'image/jpeg'};base64,${base64Image}`;

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const text = response.choices[0]?.message?.content || '';
    return this.parseResponse(text);
  }

  parseResponse(text) {
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      return this.validateResponse(parsed);
    } catch (e) {
      console.error('OpenAI response parse error:', e.message);

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return this.validateResponse(parsed);
        } catch (e2) {
          // Fall through
        }
      }

      return {
        analysis_type: 'general_analysis',
        answer: cleaned || 'The AI model returned an unparseable response.',
        confidence: 0.3,
        evidence: ['Response could not be parsed into structured format'],
        observations: [],
        _raw: text,
        _parse_error: true,
      };
    }
  }

  validateResponse(data) {
    return {
      analysis_type: data.analysis_type || 'general_analysis',
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
