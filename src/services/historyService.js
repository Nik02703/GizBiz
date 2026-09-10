/**
 * History Service — localStorage-based analysis history manager.
 */

const STORAGE_KEY = 'satquery_history';
const MAX_ENTRIES = 50;

/**
 * Get all history entries, newest first.
 * @returns {import('../types/analysis.js').HistoryEntry[]}
 */
export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Save a new analysis to history.
 *
 * @param {object} params
 * @param {string} params.query
 * @param {string} params.location
 * @param {object} params.result - Analysis result
 * @param {string|null} params.imageThumbnail - Base64 thumbnail
 * @param {object|null} params.aoi
 * @returns {string} The generated entry ID
 */
export function saveToHistory({ query, location, result, imageThumbnail, aoi }) {
  const history = getHistory();

  const entry = {
    id: generateId(),
    query,
    location: location || 'Unknown location',
    timestamp: new Date().toISOString(),
    result,
    imageThumbnail: imageThumbnail || null,
    aoi: aoi || null,
  };

  history.unshift(entry);

  // Trim to max entries
  if (history.length > MAX_ENTRIES) {
    history.length = MAX_ENTRIES;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    // localStorage might be full — remove oldest entries and retry
    console.warn('localStorage full, trimming history');
    history.length = Math.floor(MAX_ENTRIES / 2);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Give up gracefully
    }
  }

  return entry.id;
}

/**
 * Get a specific history entry by ID.
 * @param {string} id
 * @returns {import('../types/analysis.js').HistoryEntry | null}
 */
export function getHistoryEntry(id) {
  const history = getHistory();
  return history.find((e) => e.id === id) || null;
}

/**
 * Delete a history entry.
 * @param {string} id
 */
export function deleteHistoryEntry(id) {
  const history = getHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

/**
 * Clear all history.
 */
export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}
