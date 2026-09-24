/**
 * LocationSearch Component — Search bar overlaid on the map for geocoding locations.
 * Uses OpenStreetMap Nominatim API (free, no key required).
 */

let searchContainer = null;
let searchInput = null;
let resultsDropdown = null;
let clearBtn = null;
let debounceTimer = null;
let activeIndex = -1;
let currentResults = [];
let onLocationSelectedCb = null;

let onClearCb = null;

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

/**
 * Initialize the location search bar by attaching event listeners
 * to the existing HTML elements.
 *
 * @param {Function} onLocationSelected - Called with { lat, lng, name, fullName, bounds }
 * @param {Function} [onClear] - Called when search input is cleared
 */
export function initLocationSearch(onLocationSelected, onClear) {
  onLocationSelectedCb = onLocationSelected;
  onClearCb = onClear;

  // Cache DOM references (elements already exist in index.html)
  searchContainer = document.getElementById('location-search');
  searchInput = document.getElementById('location-search-input');
  resultsDropdown = document.getElementById('location-search-results');
  clearBtn = document.getElementById('location-search-clear');

  if (!searchContainer || !searchInput || !resultsDropdown || !clearBtn) {
    console.warn('[LocationSearch] Required DOM elements not found.');
    return;
  }

  // Prevent Leaflet map panning/zooming when interacting with search bar
  if (window.L && window.L.DomEvent) {
    window.L.DomEvent.disableClickPropagation(searchContainer);
    window.L.DomEvent.disableScrollPropagation(searchContainer);
  }
  ['mousedown', 'click', 'dblclick', 'wheel', 'touchstart', 'pointerdown'].forEach((evt) => {
    searchContainer.addEventListener(evt, (e) => e.stopPropagation());
  });

  // Event listeners
  searchInput.addEventListener('input', handleInput);
  searchInput.addEventListener('keydown', handleKeydown);
  searchInput.addEventListener('focus', handleFocus);
  clearBtn.addEventListener('click', handleClear);

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!searchContainer.contains(e.target)) {
      hideResults();
    }
  });
}

function handleInput() {
  const query = searchInput.value.trim();

  if (query.length > 0) {
    clearBtn.style.display = 'flex';
  } else {
    clearBtn.style.display = 'none';
  }

  if (query.length < MIN_QUERY_LENGTH) {
    hideResults();
    return;
  }

  // Debounce
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchLocations(query), DEBOUNCE_MS);
}

function handleKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (resultsDropdown.classList.contains('visible') && activeIndex >= 0 && activeIndex < currentResults.length) {
      selectResult(currentResults[activeIndex]);
    } else if (resultsDropdown.classList.contains('visible') && currentResults.length > 0) {
      selectResult(currentResults[0]);
    } else {
      const query = searchInput.value.trim();
      if (query.length >= MIN_QUERY_LENGTH) {
        clearTimeout(debounceTimer);
        searchLocations(query, true);
      }
    }
    return;
  }

  if (!resultsDropdown.classList.contains('visible')) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentResults.length - 1);
      updateActiveResult();
      break;
    case 'ArrowUp':
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActiveResult();
      break;
    case 'Escape':
      hideResults();
      searchInput.blur();
      break;
  }
}

function handleFocus() {
  if (currentResults.length > 0) {
    showResults();
  }
}

function handleClear() {
  searchInput.value = '';
  clearBtn.style.display = 'none';
  currentResults = [];
  activeIndex = -1;
  hideResults();
  searchInput.focus();

  if (onClearCb) {
    onClearCb();
  }
}

async function searchLocations(query, autoSelectFirst = false) {
  const spinner = document.getElementById('location-search-spinner');
  if (spinner) spinner.style.display = 'flex';

  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '6',
      addressdetails: '1',
      'accept-language': 'en',
    });

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: {
        'User-Agent': 'SatQueryAI/1.0',
      },
    });

    if (!response.ok) throw new Error('Search failed');

    const data = await response.json();
    currentResults = data.map(formatResult);
    activeIndex = -1;

    if (currentResults.length > 0) {
      if (autoSelectFirst) {
        selectResult(currentResults[0]);
      } else {
        renderResults();
        showResults();
      }
    } else {
      renderNoResults();
      showResults();
    }
  } catch (err) {
    console.warn('Location search error:', err);
    renderError();
    showResults();
  } finally {
    if (spinner) spinner.style.display = 'none';
  }
}

function formatResult(item) {
  const lat = parseFloat(item.lat);
  const lng = parseFloat(item.lon);

  // Build a readable name
  const name = item.display_name.split(',').slice(0, 2).join(',').trim();
  const fullName = item.display_name;

  // Parse type for icon
  const type = item.type || item.class || 'place';

  // Parse bounding box if available [south, north, west, east]
  let bounds = null;
  if (item.boundingbox) {
    const [south, north, west, east] = item.boundingbox.map(Number);
    bounds = [[south, west], [north, east]];
  }

  return { lat, lng, name, fullName, type, bounds };
}

function getTypeIcon(type) {
  const iconMap = {
    city: '🏙️',
    town: '🏘️',
    village: '🏡',
    hamlet: '🏠',
    suburb: '🏢',
    neighbourhood: '📍',
    county: '🗺️',
    state: '🗺️',
    country: '🌍',
    continent: '🌎',
    river: '🌊',
    lake: '💧',
    mountain: '⛰️',
    peak: '🏔️',
    island: '🏝️',
    airport: '✈️',
    railway: '🚂',
    road: '🛣️',
    building: '🏛️',
    university: '🎓',
    school: '🏫',
    hospital: '🏥',
    park: '🌳',
    forest: '🌲',
  };

  return iconMap[type] || '📍';
}

function renderResults() {
  resultsDropdown.innerHTML = currentResults
    .map(
      (r, i) => `
      <div class="location-result-item${i === activeIndex ? ' active' : ''}" data-index="${i}">
        <span class="location-result-icon">${getTypeIcon(r.type)}</span>
        <div class="location-result-text">
          <div class="location-result-name">${escapeHtml(r.name)}</div>
          <div class="location-result-detail">${escapeHtml(r.fullName)}</div>
        </div>
        <span class="location-result-coords">${r.lat.toFixed(2)}°, ${r.lng.toFixed(2)}°</span>
      </div>
    `
    )
    .join('');

  // Attach click handlers
  resultsDropdown.querySelectorAll('.location-result-item').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.index, 10);
      selectResult(currentResults[idx]);
    });
    el.addEventListener('mouseenter', () => {
      activeIndex = parseInt(el.dataset.index, 10);
      updateActiveResult();
    });
  });
}

function renderNoResults() {
  resultsDropdown.innerHTML = `
    <div class="location-result-empty">
      <span class="location-result-empty-icon">🔍</span>
      <span>No locations found. Try a different search term.</span>
    </div>
  `;
}

function renderError() {
  resultsDropdown.innerHTML = `
    <div class="location-result-empty location-result-error">
      <span class="location-result-empty-icon">⚠️</span>
      <span>Search unavailable. Check your connection.</span>
    </div>
  `;
}

function updateActiveResult() {
  resultsDropdown.querySelectorAll('.location-result-item').forEach((el, i) => {
    el.classList.toggle('active', i === activeIndex);
  });
}

function selectResult(result) {
  searchInput.value = result.name;
  clearBtn.style.display = 'flex';
  hideResults();

  if (onLocationSelectedCb) {
    onLocationSelectedCb(result);
  }
}

function showResults() {
  resultsDropdown.classList.add('visible');
}

function hideResults() {
  resultsDropdown.classList.remove('visible');
  activeIndex = -1;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
