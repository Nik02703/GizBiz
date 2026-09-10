/**
 * AOI Panel — Displays Area of Interest information.
 */

import { formatCoord } from '../utils/geoUtils.js';

/**
 * Render the AOI panel showing selected area details.
 *
 * @param {HTMLElement} container
 * @param {import('../types/analysis.js').AOI | null} aoi
 * @param {Function} onClear
 * @param {Function} [onZoomToAOI]
 */
export function renderAOIPanel(container, aoi, onClear, onZoomToAOI, opts = {}) {
  const {
    osmState = null,
    onFetchOSM = null,
    onToggleLayer = null,
    onClearOSM = null,
    onStartDrawRect = null,
    onStartDrawPoly = null,
  } = opts || {};

  if (!aoi) {
    container.innerHTML = `
      <div class="panel-section cloud-panel-section">
        <div class="panel-header">
          <span class="panel-title">Area of Interest</span>
          <button class="sunny-pill-tag clickable-pill" id="btn-pill-draw-rect" title="Click to draw Area of Interest">
            Select AOI
          </button>
        </div>
        <div class="aoi-empty aoi-empty-sunny">
          <div class="empty-mountain-sun-wrap">
            <svg class="empty-mountain-sun-svg" width="120" height="74" viewBox="0 0 160 90">
              <defs>
                <radialGradient id="emptySunGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#fffbeb"/>
                  <stop offset="60%" stop-color="#fde047"/>
                  <stop offset="100%" stop-color="#f59e0b"/>
                </radialGradient>
              </defs>
              <!-- Sun peaking behind mountain -->
              <circle cx="82" cy="36" r="22" fill="url(#emptySunGlow)"/>
              <!-- Mountains -->
              <polygon points="10,90 60,38 110,90" fill="#93c5fd" opacity="0.8"/>
              <polygon points="50,90 105,26 160,90" fill="#60a5fa"/>
              <polygon points="105,26 94,44 105,40 116,44" fill="#ffffff"/>
              <!-- Foreground cloud -->
              <path d="M42,86 C35,86 28,80 28,73 C28,66 33,61 40,60 C42,50 51,44 61,44 C72,44 80,51 82,60 C88,61 93,66 93,73 C93,80 88,86 81,86 Z" fill="#ffffff"/>
            </svg>
          </div>
          <div class="aoi-empty-text">
            <strong>Select a Region</strong><br/>
            Click a button below or use map tools to draw an Area of Interest
          </div>
          <div class="aoi-empty-draw-actions">
            <button class="btn-empty-draw btn-sunny-primary" id="btn-empty-draw-rect" title="Draw Rectangle Area">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
              </svg>
              Draw Rectangle
            </button>
            <button class="btn-empty-draw btn-sunny-outline" id="btn-empty-draw-poly" title="Draw Polygon Area">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2 L22 8.5 L18 21 L6 21 L2 8.5 Z"/>
              </svg>
              Draw Polygon
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-pill-draw-rect')?.addEventListener('click', () => {
      if (onStartDrawRect) onStartDrawRect();
    });
    document.getElementById('btn-empty-draw-rect')?.addEventListener('click', () => {
      if (onStartDrawRect) onStartDrawRect();
    });
    document.getElementById('btn-empty-draw-poly')?.addEventListener('click', () => {
      if (onStartDrawPoly) onStartDrawPoly();
    });
    return;
  }


  container.innerHTML = `
    <div class="panel-section cloud-panel-section animate-in">
      <div class="panel-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="panel-title">Area of Interest</span>
          <span class="sunny-badge">${aoi.type === 'rectangle' ? 'RECTANGLE' : 'POLYGON'}</span>
        </div>
        <span class="cloud-indicator">☁️ Cloud Mode</span>
      </div>

      <!-- Cloud-shaped coordinate and metric cards -->
      <div class="aoi-info aoi-cloud-grid">
        <div class="aoi-stat cloud-box">
          <div class="cloud-puff-tl"></div>
          <div class="cloud-puff-tr"></div>
          <div class="cloud-box-inner">
            <div class="aoi-stat-label">
              <span class="cloud-mini-icon">☁️</span>
              Latitude
            </div>
            <div class="aoi-stat-value">${formatCoord(aoi.center.lat)}</div>
          </div>
        </div>

        <div class="aoi-stat cloud-box">
          <div class="cloud-puff-tl"></div>
          <div class="cloud-puff-tr"></div>
          <div class="cloud-box-inner">
            <div class="aoi-stat-label">
              <span class="cloud-mini-icon">☁️</span>
              Longitude
            </div>
            <div class="aoi-stat-value">${formatCoord(aoi.center.lng)}</div>
          </div>
        </div>

        <div class="aoi-stat cloud-box">
          <div class="cloud-puff-tl"></div>
          <div class="cloud-puff-tr"></div>
          <div class="cloud-box-inner">
            <div class="aoi-stat-label">
              <span class="cloud-mini-icon">🌱</span>
              Area
            </div>
            <div class="aoi-stat-value">${aoi.area}</div>
          </div>
        </div>

        <div class="aoi-stat cloud-box">
          <div class="cloud-puff-tl"></div>
          <div class="cloud-puff-tr"></div>
          <div class="cloud-box-inner">
            <div class="aoi-stat-label">
              <span class="cloud-mini-icon">📍</span>
              Vertices
            </div>
            <div class="aoi-stat-value">${aoi.coordinates.length}</div>
          </div>
        </div>

        <div class="aoi-stat cloud-box full-width">
          <div class="cloud-puff-tl"></div>
          <div class="cloud-puff-tr"></div>
          <div class="cloud-box-inner">
            <div class="aoi-stat-label">
              <span class="cloud-mini-icon">🧭</span>
              Bounding Box
            </div>
            <div class="aoi-stat-value bounds-value">
              <span class="bound-tag">N ${formatCoord(aoi.bounds.north, 3)}°</span>
              <span class="bound-tag">S ${formatCoord(aoi.bounds.south, 3)}°</span>
              <span class="bound-tag">E ${formatCoord(aoi.bounds.east, 3)}°</span>
              <span class="bound-tag">W ${formatCoord(aoi.bounds.west, 3)}°</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Sunny Yellow Action Buttons -->
      <div class="aoi-actions">
        <button class="btn-zoom-aoi btn-sunny" id="btn-zoom-aoi-panel" title="Zoom to fit Area of Interest">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Zoom to AOI
        </button>
        <button class="btn-clear btn-sunny-outline" id="btn-clear-aoi-panel">Clear AOI</button>
      </div>

      <!-- Geographic Vector Context Section -->
      <div class="osm-section" id="osm-section">
        <div class="panel-header osm-panel-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="panel-title">Geographic Context</span>
            <span class="sunny-badge">VECTOR</span>
          </div>
          <span class="cloud-indicator">☁️ Vector Layers</span>
        </div>

        <div class="osm-section-desc">
          Retrieve mapped ground-truth vector features inside this AOI to compare with satellite imagery.
        </div>

        <!-- Feature categories checklist -->
        <div class="osm-feature-selector" id="osm-feature-selector">
          <label class="osm-chip ${osmState?.selectedFeatures?.has('buildings') !== false ? 'selected' : ''}" data-feature="buildings" title="Toggle Buildings layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('buildings') !== false ? 'checked' : ''} value="buildings" />
            <span class="osm-chip-icon">🏢</span> Buildings
          </label>
          <label class="osm-chip ${osmState?.selectedFeatures?.has('roads') !== false ? 'selected' : ''}" data-feature="roads" title="Toggle Roads layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('roads') !== false ? 'checked' : ''} value="roads" />
            <span class="osm-chip-icon">🛣️</span> Roads
          </label>
          <label class="osm-chip ${osmState?.selectedFeatures?.has('water') !== false ? 'selected' : ''}" data-feature="water" title="Toggle Water layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('water') !== false ? 'checked' : ''} value="water" />
            <span class="osm-chip-icon">🌊</span> Water
          </label>
          <label class="osm-chip ${osmState?.selectedFeatures?.has('waterways') !== false ? 'selected' : ''}" data-feature="waterways" title="Toggle Waterways layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('waterways') !== false ? 'checked' : ''} value="waterways" />
            <span class="osm-chip-icon">💧</span> Waterways
          </label>
          <label class="osm-chip ${osmState?.selectedFeatures?.has('railways') !== false ? 'selected' : ''}" data-feature="railways" title="Toggle Railways layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('railways') !== false ? 'checked' : ''} value="railways" />
            <span class="osm-chip-icon">🚆</span> Railways
          </label>
          <label class="osm-chip ${osmState?.selectedFeatures?.has('pois') !== false ? 'selected' : ''}" data-feature="pois" title="Toggle POIs layer query">
            <input type="checkbox" ${osmState?.selectedFeatures?.has('pois') !== false ? 'checked' : ''} value="pois" />
            <span class="osm-chip-icon">📍</span> POIs
          </label>
        </div>

        ${osmState?.error ? `
          <div class="osm-error-banner animate-in">
            <span class="osm-error-icon">⚠️</span>
            <span class="osm-error-text">${escapeHtml(osmState.error)}</span>
          </div>
        ` : ''}

        <!-- Fetch Vector Context action button -->
        <button class="btn-fetch-osm btn-sunny ${osmState?.isLoading ? 'loading' : ''}" id="btn-fetch-osm" ${osmState?.isLoading ? 'disabled' : ''}>
          ${osmState?.isLoading ? `
            <span class="osm-spinner"></span>
            <span>Querying Vector Data...</span>
          ` : `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
              <line x1="8" y1="2" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="22"/>
            </svg>
            <span>Fetch Geographic Context</span>
          `}
        </button>

        <!-- Display loaded vector layers and toggles if available -->
        ${osmState?.data ? `
          <div class="osm-results-block animate-in">
            <div class="panel-header osm-active-layers-header">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="panel-title" style="font-size: 11px;">Active Layers</span>
                <span class="sunny-pill-tag">${(osmState.data.metadata?.totalFeatures || 0).toLocaleString()} FEATURES</span>
              </div>
              <button class="btn-clear-osm" id="btn-clear-osm-layers" title="Clear vector layers from map">Clear Layers</button>
            </div>

            <!-- Cloud-shaped layer toggle cards styled identically to coordinate boxes -->
            <div class="osm-layer-toggles aoi-cloud-grid">
              ${renderLayerToggle('buildings', '🏢', 'Buildings', osmState.data.metadata?.featureCount?.buildings || 0, osmState.layerVisibility?.buildings !== false)}
              ${renderLayerToggle('roads', '🛣️', 'Roads', osmState.data.metadata?.featureCount?.roads || 0, osmState.layerVisibility?.roads !== false)}
              ${renderLayerToggle('water', '🌊', 'Water', osmState.data.metadata?.featureCount?.water || 0, osmState.layerVisibility?.water !== false)}
              ${renderLayerToggle('waterways', '💧', 'Waterways', osmState.data.metadata?.featureCount?.waterways || 0, osmState.layerVisibility?.waterways !== false)}
              ${renderLayerToggle('railways', '🚆', 'Railways', osmState.data.metadata?.featureCount?.railways || 0, osmState.layerVisibility?.railways !== false)}
              ${renderLayerToggle('pois', '📍', 'POIs', osmState.data.metadata?.featureCount?.pois || 0, osmState.layerVisibility?.pois !== false)}
            </div>

            ${osmState.data.trace ? `
              <details class="osm-trace-details">
                <summary>
                  <span>Observable Execution Trace</span>
                  <span class="osm-trace-badge">${osmState.data.trace.status || 'completed'} &bull; ${osmState.data.trace.durationMs || 0}ms</span>
                </summary>
                <div class="osm-trace-content">
                  <div class="osm-trace-row"><strong>Task:</strong> ${escapeHtml(osmState.data.trace.task || 'geographic_context')}</div>
                  <div class="osm-trace-row"><strong>Tool:</strong> ${escapeHtml(osmState.data.trace.tool?.replace(/OpenStreetMap\s*/i, '') || 'Overpass API (Vector Features)')}</div>
                  <div class="osm-trace-row"><strong>AOI:</strong> ${escapeHtml(osmState.data.trace.input || '')}</div>
                  <div class="osm-trace-row"><strong>Duration:</strong> ${osmState.data.trace.durationMs}ms ${osmState.data.metadata?.cached ? '(cached)' : ''}</div>
                  <div class="osm-trace-row"><strong>Features:</strong> ${osmState.data.metadata?.totalFeatures || 0} vector geometries</div>
                </div>
              </details>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Attach event handlers
  if (onZoomToAOI) {
    document.getElementById('btn-zoom-aoi-panel')?.addEventListener('click', onZoomToAOI);
  }
  document.getElementById('btn-clear-aoi-panel')?.addEventListener('click', onClear);

  // OSM Chip Selection Click Handler
  const chipContainer = document.getElementById('osm-feature-selector');
  if (chipContainer) {
    chipContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => {
        checkbox.closest('.osm-chip')?.classList.toggle('selected', checkbox.checked);
      });
    });
  }

  // Fetch OSM button handler
  document.getElementById('btn-fetch-osm')?.addEventListener('click', (e) => {
    e.preventDefault();
    const selected = [];
    document.querySelectorAll('#osm-feature-selector input[type="checkbox"]:checked').forEach((cb) => {
      selected.push(cb.value);
    });
    console.log('[AOIPanel] Fetch OSM clicked. Features:', selected);
    if (onFetchOSM) {
      onFetchOSM(selected.length > 0 ? selected : ['buildings', 'roads', 'water', 'waterways', 'railways', 'pois']);
    }
  });

  // Clear OSM button handler
  document.getElementById('btn-clear-osm-layers')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (onClearOSM) {
      onClearOSM();
    }
  });

  // Layer toggles handler
  document.querySelectorAll('.osm-layer-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const category = btn.dataset.category;
      const willBeActive = !btn.classList.contains('active');
      btn.classList.toggle('active', willBeActive);
      if (onToggleLayer) {
        onToggleLayer(category, willBeActive);
      }
    });
  });
}

function renderLayerToggle(category, icon, label, count, isVisible) {
  const isDisabled = count === 0;
  return `
    <button
      type="button"
      class="aoi-stat cloud-box osm-layer-toggle-btn ${isVisible && !isDisabled ? 'active' : ''} ${isDisabled ? 'disabled' : ''}"
      data-category="${category}"
      title="${isDisabled ? 'No features in this area' : (isVisible ? 'Click to hide layer from map' : 'Click to show layer on map')}"
      ${isDisabled ? 'disabled' : ''}
    >
      <div class="cloud-puff-tl"></div>
      <div class="cloud-puff-tr"></div>
      <div class="cloud-box-inner">
        <div class="aoi-stat-label">
          <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; min-width: 0;">
            <span class="cloud-mini-icon">${icon}</span>
            <span class="osm-layer-label-text">${label}</span>
          </div>
          <span class="osm-layer-bullet" title="${isVisible && !isDisabled ? 'Layer visible' : 'Layer hidden'}"></span>
        </div>
        <div class="aoi-stat-value">${count.toLocaleString()}</div>
      </div>
    </button>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

