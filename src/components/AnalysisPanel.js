/**
 * Analysis Panel — Query input, image source toggle (Map, Sentinel-2, Upload), and analyze button.
 */

const QUERY_SUGGESTIONS = [
  'Land use types',
  'Urban areas',
  'Vegetation health',
  'Water bodies',
  'Roads & infra',
  'Describe this region',
];

/**
 * Render the analysis input panel.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {boolean} opts.hasAOI
 * @param {boolean} opts.aiAvailable
 * @param {'map'|'sentinel'|'upload'} [opts.imageSource='map']
 * @param {string|null} opts.imagePreviewUrl
 * @param {object} [opts.sentinelState]
 * @param {Function} opts.onAnalyze - Called with { query }
 * @param {Function} opts.onImageUpload - Called with File
 * @param {Function} opts.onSourceChange - Called with 'map' | 'sentinel' | 'upload'
 * @param {Function} [opts.onSentinelAcquire] - Called with preset
 * @param {Function} [opts.onSentinelPresetChange] - Called with preset
 */
export function renderAnalysisPanel(container, opts) {
  const {
    hasAOI,
    aiAvailable,
    imageSource = 'map',
    imagePreviewUrl,
    sentinelState = {},
  } = opts;

  const currentPreset = sentinelState.preset || 'true_color';

  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-header">
        <span class="panel-title">Satellite Analysis</span>
        ${imageSource === 'sentinel' ? '<span class="sunny-badge">COPERNICUS L2A</span>' : ''}
      </div>
      <div class="query-section">
        <!-- Image source toggle: Map Capture | Sentinel-2 | Upload -->
        <div class="source-toggle">
          <button class="source-toggle-btn ${imageSource === 'map' ? 'active' : ''}" data-source="map" id="src-map">Map View</button>
          <button class="source-toggle-btn ${imageSource === 'sentinel' ? 'active' : ''}" data-source="sentinel" id="src-sentinel">🛰️ Sentinel-2</button>
          <button class="source-toggle-btn ${imageSource === 'upload' ? 'active' : ''}" data-source="upload" id="src-upload">Upload</button>
        </div>

        <!-- Copernicus Sentinel-2 Controls (visible when sentinel is selected) -->
        <div class="sentinel-control-panel animate-in" id="sentinel-control-panel" style="display: ${imageSource === 'sentinel' ? 'flex' : 'none'};">
          <div class="sentinel-preset-selector">
            <button class="sentinel-preset-chip ${currentPreset === 'true_color' ? 'active' : ''}" data-preset="true_color" title="B04, B03, B02 Natural Color RGB">
              🌿 True Color
            </button>
            <button class="sentinel-preset-chip ${currentPreset === 'false_color' ? 'active' : ''}" data-preset="false_color" title="B08, B04, B03 NIR Vegetation">
              🌾 False Color
            </button>
            <button class="sentinel-preset-chip ${currentPreset === 'ndvi' ? 'active' : ''}" data-preset="ndvi" title="NDVI Vegetation Health Index">
              🌱 NDVI
            </button>
            <button class="sentinel-preset-chip ${currentPreset === 'swir' ? 'active' : ''}" data-preset="swir" title="B12, B8A, B04 Short-Wave Infrared">
              🏗️ SWIR
            </button>
          </div>

          ${sentinelState.error ? `
            <div class="osm-error-banner" style="margin-top: 4px; margin-bottom: 4px;">
              <span class="osm-error-icon">⚠️</span>
              <span class="osm-error-text">${escapeHtml(sentinelState.error)}</span>
            </div>
          ` : ''}

          <button
            class="btn-fetch-sentinel btn-sunny ${sentinelState.isLoading ? 'loading' : ''}"
            id="btn-fetch-sentinel"
            ${!hasAOI || sentinelState.isLoading ? 'disabled' : ''}
            title="${!hasAOI ? 'Select an Area of Interest on the map first' : 'Acquire real 10m Sentinel-2 raster from Copernicus'}"
          >
            ${sentinelState.isLoading ? `
              <span class="osm-spinner"></span>
              <span>Acquiring Sentinel-2 Pass...</span>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="12" cy="12" r="9"/>
                <path d="M12 3v18"/>
                <path d="M3 12h18"/>
              </svg>
              <span>${sentinelState.image ? 'Refresh Sentinel-2 Image' : 'Acquire Sentinel-2 Pass'}</span>
            `}
          </button>

          ${!hasAOI ? `
            <div class="sentinel-hint">📍 Draw or select an Area of Interest on the map to acquire Copernicus satellite imagery</div>
          ` : (sentinelState.image ? `
            <div class="sentinel-meta-tag">
              <span>🛰️ Sentinel-2 L2A</span>
              <span>•</span>
              <span>10m / px (ESA)</span>
            </div>
          ` : '')}
        </div>

        <!-- Upload area (hidden unless upload is selected) -->
        <div class="image-upload-area" id="upload-area" style="display: ${imageSource === 'upload' ? '' : 'none'};">
          <div class="upload-icon">📡</div>
          <div class="upload-text">Drop satellite image or click to upload</div>
          <div class="upload-subtext">JPEG, PNG, WebP, TIFF — max 10 MB</div>
          <input type="file" id="file-input" accept="image/jpeg,image/png,image/webp,image/tiff" style="display: none;" />
        </div>

        <!-- Image preview -->
        ${imagePreviewUrl ? `
          <div class="image-upload-area has-image">
            <img src="${imagePreviewUrl}" class="preview-thumb" alt="Satellite image preview" />
            ${imageSource === 'sentinel' ? `
              <div class="preview-badge-overlay">🛰️ SENTINEL-2 (${currentPreset.toUpperCase()})</div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Query input -->
        <div class="query-input-wrap">
          <textarea
            class="query-input"
            id="query-input"
            placeholder="Ask about this area...\ne.g., What land use types are visible?"
            rows="3"
          ></textarea>
        </div>

        <!-- Suggestions -->
        <div class="query-suggestions" id="query-suggestions">
          ${QUERY_SUGGESTIONS.map(
            (s) => `<button class="query-chip" data-query="${s}">${s}</button>`
          ).join('')}
        </div>

        <!-- Error display -->
        <div class="error-message" id="analysis-error"></div>

        <!-- Loading stages placeholder -->
        <div class="loading-overlay" id="loading-stages"></div>

        <!-- Sunny Yellow Analyze button -->
        <button class="btn-analyze btn-sunny-primary" id="btn-analyze" ${!hasAOI && !imagePreviewUrl ? 'disabled' : ''}>
          <svg class="sun-analyze-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="12" cy="12" r="5" fill="#fde047"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          Analyze Region
        </button>

        ${!aiAvailable ? `
          <div style="font-size: 11px; color: var(--text-tertiary); text-align: center; margin-top: var(--space-xs);">
            AI service unavailable — use Demo Mode
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Source toggle listeners
  const srcMap = document.getElementById('src-map');
  const srcSentinel = document.getElementById('src-sentinel');
  const srcUpload = document.getElementById('src-upload');

  srcMap?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('map');
  });

  srcSentinel?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('sentinel');
  });

  srcUpload?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('upload');
  });

  // Sentinel Preset chips
  document.querySelectorAll('.sentinel-preset-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const preset = chip.dataset.preset;
      if (opts.onSentinelPresetChange) {
        opts.onSentinelPresetChange(preset);
      }
    });
  });

  // Fetch Sentinel button
  document.getElementById('btn-fetch-sentinel')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (opts.onSentinelAcquire) {
      opts.onSentinelAcquire(currentPreset);
    }
  });

  // File upload
  const uploadArea = document.getElementById('upload-area');
  const fileInput = document.getElementById('file-input');
  uploadArea?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && opts.onImageUpload) {
      opts.onImageUpload(file);
    }
  });

  // Drag and drop
  uploadArea?.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--accent-blue)';
  });

  uploadArea?.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '';
  });

  uploadArea?.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && opts.onImageUpload) {
      opts.onImageUpload(file);
    }
  });

  // Query suggestions
  document.querySelectorAll('.query-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.getElementById('query-input').value = chip.dataset.query;
    });
  });

  // Analyze button
  document.getElementById('btn-analyze')?.addEventListener('click', () => {
    const query = document.getElementById('query-input')?.value?.trim();
    if (opts.onAnalyze) {
      opts.onAnalyze({ query });
    }
  });

  // Enter key to submit (Ctrl+Enter or Cmd+Enter)
  document.getElementById('query-input')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-analyze')?.click();
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Show an error message in the analysis panel.
 * @param {string} message
 */
export function showAnalysisError(message) {
  const el = document.getElementById('analysis-error');
  if (el) {
    el.textContent = message;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 8000);
  }
}

/**
 * Enable/disable the analyze button.
 * @param {boolean} enabled
 */
export function setAnalyzeEnabled(enabled) {
  const btn = document.getElementById('btn-analyze');
  if (btn) btn.disabled = !enabled;
}
