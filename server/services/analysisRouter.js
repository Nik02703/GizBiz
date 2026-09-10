/**
 * Analysis Router — Query intent classification and routing
 *
 * For the MVP, all queries route to the multimodal AI provider.
 * This architecture allows individual specialist models to replace
 * generic analysis modules later (SIH final round).
 *
 * Future routing targets:
 *   - Image VQA (Visual Question Answering)
 *   - Land Cover Classification
 *   - Object Detection (buildings, roads, vehicles)
 *   - Change Detection (temporal comparison)
 *   - SAR Analysis (Synthetic Aperture Radar)
 *   - Vegetation / NDVI Analysis
 *   - Water Body Detection
 */

const ANALYSIS_CATEGORIES = {
  land_cover: {
    keywords: ['land use', 'land cover', 'terrain', 'soil', 'landscape', 'classification'],
    module: 'land_cover_analysis',
  },
  urban: {
    keywords: ['urban', 'city', 'building', 'built-up', 'settlement', 'construction', 'infrastructure', 'road'],
    module: 'urban_analysis',
  },
  vegetation: {
    keywords: ['vegetation', 'forest', 'green', 'crop', 'agriculture', 'farm', 'tree', 'plant', 'ndvi'],
    module: 'vegetation_analysis',
  },
  water: {
    keywords: ['water', 'river', 'lake', 'ocean', 'flood', 'reservoir', 'wetland', 'coast'],
    module: 'water_body_detection',
  },
  change: {
    keywords: ['change', 'differ', 'before', 'after', 'temporal', 'expansion', 'growth', 'deforestation'],
    module: 'change_detection',
  },
  object: {
    keywords: ['identify', 'detect', 'count', 'find', 'locate', 'object', 'highlight', 'mark', 'outline', 'point out', 'delineate'],
    module: 'object_detection',
  },
  geographic_context: {
    keywords: ['osm', 'openstreetmap', 'mapped', 'geographic context', 'overpass', 'cadastral', 'footprint', 'cartographic', 'existing map', 'vector data'],
    module: 'osm_geographic_context',
  },
};

/**
 * Classify the intent of a natural-language query.
 *
 * @param {string} query - The user's question
 * @returns {{ category: string, module: string }}
 */
export function classifyQuery(query) {
  const lower = query.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const [category, config] of Object.entries(ANALYSIS_CATEGORIES)) {
    const score = config.keywords.reduce((acc, kw) => {
      return acc + (lower.includes(kw) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { category, module: config.module };
    }
  }

  if (!bestMatch || bestScore === 0) {
    return { category: 'general', module: 'general_analysis' };
  }

  return bestMatch;
}

/**
 * Route the query to the appropriate analysis module.
 *
 * For MVP: all routes lead to the multimodal AI provider.
 * In the future, each module key maps to a specialist model.
 *
 * @param {string} query
 * @returns {{ module: string, preprocessor: string | null }}
 */
export function routeQuery(query) {
  const { category, module } = classifyQuery(query);

  // MVP: all modules use the generic multimodal provider
  return {
    module,
    category,
    // Future: preprocessor could resize, apply band math, etc.
    preprocessor: null,
    // Future: postprocessor could add segmentation masks, bboxes, etc.
    postprocessor: null,
  };
}
