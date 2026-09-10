/**
 * Color and style resolution utilities for SatQuery AI highlights.
 */

export const NAMED_COLORS = {
  red: '#ef4444',
  crimson: '#dc2626',
  ruby: '#e11d48',
  scarlet: '#ff2400',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  gold: '#facc15',
  green: '#22c55e',
  emerald: '#10b981',
  lime: '#84cc16',
  cyan: '#06b6d4',
  teal: '#14b8a6',
  sky: '#0284c7',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  magenta: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
  white: '#ffffff',
};

export const CATEGORY_DEFAULTS = {
  water: '#06b6d4',
  water_body: '#06b6d4',
  vegetation: '#10b981',
  forest: '#10b981',
  agriculture: '#84cc16',
  urban: '#f59e0b',
  built_up: '#f59e0b',
  infrastructure: '#8b5cf6',
  hazard: '#ef4444',
  terrain: '#3b82f6',
  mountain: '#ef4444',
  peak: '#ef4444',
  snow: '#38bdf8',
  glacier: '#38bdf8',
  default: '#00f2fe',
};

/**
 * Resolve user-requested or AI-generated color to a valid hex string.
 *
 * @param {string} [colorNameOrHex] - Color string (e.g. 'red', '#ef4444', 'yellow color')
 * @param {string} [category] - Feature category fallback
 * @returns {string} Hex color string
 */
export function resolveHighlightColor(colorNameOrHex, category = 'default') {
  if (colorNameOrHex && typeof colorNameOrHex === 'string') {
    const raw = colorNameOrHex.trim().toLowerCase();

    // Direct hex or rgb format
    if (raw.startsWith('#') || raw.startsWith('rgb') || raw.startsWith('hsl')) {
      return colorNameOrHex.trim();
    }

    // Direct match
    if (NAMED_COLORS[raw]) {
      return NAMED_COLORS[raw];
    }

    // Keyword match within phrase (e.g. "bright red", "red color", "deep yellow")
    for (const [name, hex] of Object.entries(NAMED_COLORS)) {
      if (raw.includes(name)) {
        return hex;
      }
    }
  }

  // Category fallback
  const cat = (category || 'default').toLowerCase();
  return CATEGORY_DEFAULTS[cat] || CATEGORY_DEFAULTS.default;
}
