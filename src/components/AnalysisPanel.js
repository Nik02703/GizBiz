/**
 * Analysis Panel — Query input, image source toggle (Map, Sentinel-2, Upload),
 * drag-and-drop upload zone, and bi-temporal image sensing system.
 */

const DEFAULT_SUGGESTIONS = [
  'Land use types',
  'Urban areas',
  'Vegetation health',
  'Water bodies',
  'Roads & infra',
  'Describe this region',
];

const BITEMPORAL_SUGGESTIONS = [
  'Urban expansion & new buildings',
  'Vegetation loss & deforestation',
  'Water body & flood changes',
  'New roads & infrastructure',
  'Full change detection report',
];

/**
 * Format bytes to readable size string
 */
function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Calculate difference between two dates in human readable form
 */
function calculateTimeSpan(date1, date2) {
  if (!date1 || !date2) return null;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;

  const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 3600 * 24));
  if (diffDays < 30) return `${diffDays} days apart`;
  const months = Math.round(diffDays / 30.44);
  if (months < 12) return `${months} months apart`;
  const years = (diffDays / 365.25).toFixed(1);
  return `${years} yrs (${diffDays} days) interval`;
}

/**
 * Render the analysis input panel.
 *
 * @param {HTMLElement} container
 * @param {object} opts
 * @param {boolean} opts.hasAOI
 * @param {boolean} opts.aiAvailable
 * @param {'map'|'sentinel'|'upload'} [opts.imageSource='map']
 * @param {'single'|'bitemporal'} [opts.uploadMode='bitemporal']
 * @param {object|null} [opts.uploadedImage]
 * @param {object} [opts.bitemporalState]
 * @param {string|null} opts.imagePreviewUrl
 * @param {object} [opts.sentinelState]
 * @param {Function} opts.onAnalyze - Called with { query }
 * @param {Function} opts.onImageUpload - Called with (file, slot)
 * @param {Function} opts.onImageClear - Called with (slot)
 * @param {Function} opts.onDateChange - Called with (slot, date)
 * @param {Function} opts.onUploadModeChange - Called with ('single'|'bitemporal')
 * @param {Function} opts.onSourceChange - Called with 'map' | 'sentinel' | 'upload'
 * @param {Function} [opts.onSentinelAcquire] - Called with preset
 * @param {Function} [opts.onSentinelPresetChange] - Called with preset
 */
export function renderAnalysisPanel(container, opts) {
  const {
    hasAOI,
    aiAvailable,
    imageSource = 'map',
    uploadMode = 'bitemporal',
    uploadedImage = null,
    bitemporalState = { image1: null, image2: null },
    imagePreviewUrl,
    sentinelState = {},
  } = opts;

  const currentPreset = sentinelState.preset || 'true_color';
  const isUpload = imageSource === 'upload';
  const isBitemporal = isUpload && uploadMode === 'bitemporal';

  // Determine suggestions based on mode
  const suggestions = isBitemporal ? BITEMPORAL_SUGGESTIONS : DEFAULT_SUGGESTIONS;

  // Determine analyze button status and label
  let isAnalyzeDisabled = false;
  let analyzeBtnLabel = 'Analyze Region';

  if (isUpload) {
    if (uploadMode === 'bitemporal') {
      const hasBoth = !!bitemporalState.image1 && !!bitemporalState.image2;
      isAnalyzeDisabled = !hasBoth;
      analyzeBtnLabel = hasBoth ? 'Analyze Bi-temporal Changes' : 'Upload Both Images to Analyze';
    } else {
      isAnalyzeDisabled = !uploadedImage;
      analyzeBtnLabel = uploadedImage ? 'Analyze Uploaded Image' : 'Upload Image to Analyze';
    }
  } else {
    isAnalyzeDisabled = !hasAOI && !imagePreviewUrl;
  }

  const t1Date = bitemporalState.image1?.date || '2021-03-15';
  const t2Date = bitemporalState.image2?.date || '2024-03-15';
  const timeSpanText = calculateTimeSpan(t1Date, t2Date);

  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-header">
        <span class="panel-title">Satellite Analysis</span>
        ${imageSource === 'sentinel' ? '<span class="sunny-badge">COPERNICUS L2A</span>' : ''}
        ${isBitemporal ? '<span class="sunny-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border-color: rgba(245, 158, 11, 0.4);">BI-TEMPORAL SENSING</span>' : ''}
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

        <!-- UPLOAD SECTION (visible when upload is selected) -->
        <div class="upload-section-container animate-in" id="upload-section" style="display: ${isUpload ? 'block' : 'none'};">
          <!-- Upload Mode Tabs: Single Image vs Bi-temporal (2 Images) -->
          <div class="upload-mode-toggle">
            <button class="upload-mode-tab ${uploadMode === 'bitemporal' ? 'active' : ''}" id="tab-bitemporal" data-mode="bitemporal">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="9"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              Bi-temporal (2 Images + Dates)
            </button>
            <button class="upload-mode-tab ${uploadMode === 'single' ? 'active' : ''}" id="tab-single" data-mode="single">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="m21 15-5-5L5 21"/>
              </svg>
              Single Image
            </button>
          </div>

          <!-- SINGLE IMAGE UPLOAD VIEW -->
          <div id="view-single-upload" style="display: ${uploadMode === 'single' ? 'block' : 'none'};">
            ${!uploadedImage ? `
              <div class="dropzone-box" id="dropzone-single">
                <div class="dropzone-icon-ring">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                    <path d="M12 12v9"/>
                    <path d="m16 16-4-4-4 4"/>
                  </svg>
                </div>
                <div class="dropzone-title">Drop satellite image here</div>
                <div class="dropzone-desc">or <span class="dropzone-browse">browse files</span> from your computer</div>
                <div class="dropzone-formats">
                  <span class="fmt-tag">PNG</span>
                  <span class="fmt-tag">JPEG</span>
                  <span class="fmt-tag">WebP</span>
                  <span class="fmt-tag">TIFF</span>
                  <span class="fmt-size">max 10 MB</span>
                </div>
                <input type="file" id="file-input-single" accept="image/jpeg,image/png,image/webp,image/tiff" style="display: none;" />
              </div>
            ` : `
              <div class="uploaded-card">
                <div class="uploaded-thumb-wrap">
                  <img src="${uploadedImage.dataUrl}" class="uploaded-thumb" alt="Uploaded Satellite Image" />
                </div>
                <div class="uploaded-info">
                  <div class="uploaded-filename" title="${escapeHtml(uploadedImage.name || 'image.jpg')}">
                    ${escapeHtml(uploadedImage.name || 'satellite_image.jpg')}
                  </div>
                  <div class="uploaded-meta">
                    <span>${formatSize(uploadedImage.size)}</span>
                    <button class="btn-remove-upload" id="btn-remove-single" title="Remove image">
                      ✕ Remove
                    </button>
                  </div>
                  <div class="date-picker-row">
                    <label class="date-label" for="date-single">📅 Capture Date:</label>
                    <input type="date" class="temporal-date-input" id="date-single" value="${uploadedImage.date || ''}" />
                  </div>
                </div>
              </div>
            `}
          </div>

          <!-- BI-TEMPORAL UPLOAD VIEW -->
          <div id="view-bitemporal-upload" style="display: ${uploadMode === 'bitemporal' ? 'block' : 'none'};">
            <div class="bitemporal-intro">
              <span class="bitemporal-intro-icon">🛰️</span>
              <div class="bitemporal-intro-text">
                Upload two passes of the same area with capture dates for change sensing.
              </div>
            </div>

            <!-- Dual Dropzone Grid -->
            <div class="bitemporal-grid">
              <!-- Slot 1: Image 1 (T1 Baseline / Before) -->
              <div class="bitemporal-slot">
                <div class="slot-header">
                  <div class="slot-header-top">
                    <span class="slot-badge t1-badge">T1 • BASELINE</span>
                  </div>
                  <div class="slot-date-wrap">
                    <label class="slot-date-label" for="date-t1">Date:</label>
                    <input type="date" class="temporal-date-input" id="date-t1" value="${t1Date}" />
                  </div>
                </div>

                ${bitemporalState.image1 ? `
                  <div class="uploaded-mini-card">
                    <img src="${bitemporalState.image1.dataUrl}" class="mini-thumb" alt="T1 Satellite Image" />
                    <div class="mini-info">
                      <div class="mini-name" title="${escapeHtml(bitemporalState.image1.name || 'T1 Image')}">
                        ${escapeHtml(bitemporalState.image1.name || 'T1 Image')}
                      </div>
                      <div class="mini-meta">
                        <span>${formatSize(bitemporalState.image1.size)}</span>
                        <button class="btn-remove-upload" id="btn-remove-t1">Remove</button>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div class="dropzone-box dropzone-compact" id="dropzone-t1">
                    <div class="dropzone-icon-ring compact">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                        <path d="M12 12v9"/>
                        <path d="m16 16-4-4-4 4"/>
                      </svg>
                    </div>
                    <div class="dropzone-title compact">Drop Image 1 (Before)</div>
                    <div class="dropzone-desc compact">or click to browse</div>
                    <input type="file" id="file-input-t1" accept="image/jpeg,image/png,image/webp,image/tiff" style="display: none;" />
                  </div>
                `}
              </div>

              <!-- Slot 2: Image 2 (T2 Recent / After) -->
              <div class="bitemporal-slot">
                <div class="slot-header">
                  <div class="slot-header-top">
                    <span class="slot-badge t2-badge">T2 • RECENT</span>
                  </div>
                  <div class="slot-date-wrap">
                    <label class="slot-date-label" for="date-t2">Date:</label>
                    <input type="date" class="temporal-date-input" id="date-t2" value="${t2Date}" />
                  </div>
                </div>

                ${bitemporalState.image2 ? `
                  <div class="uploaded-mini-card">
                    <img src="${bitemporalState.image2.dataUrl}" class="mini-thumb" alt="T2 Satellite Image" />
                    <div class="mini-info">
                      <div class="mini-name" title="${escapeHtml(bitemporalState.image2.name || 'T2 Image')}">
                        ${escapeHtml(bitemporalState.image2.name || 'T2 Image')}
                      </div>
                      <div class="mini-meta">
                        <span>${formatSize(bitemporalState.image2.size)}</span>
                        <button class="btn-remove-upload" id="btn-remove-t2">Remove</button>
                      </div>
                    </div>
                  </div>
                ` : `
                  <div class="dropzone-box dropzone-compact" id="dropzone-t2">
                    <div class="dropzone-icon-ring compact">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
                        <path d="M12 12v9"/>
                        <path d="m16 16-4-4-4 4"/>
                      </svg>
                    </div>
                    <div class="dropzone-title compact">Drop Image 2 (After)</div>
                    <div class="dropzone-desc compact">or click to browse</div>
                    <input type="file" id="file-input-t2" accept="image/jpeg,image/png,image/webp,image/tiff" style="display: none;" />
                  </div>
                `}
              </div>
            </div>

            <!-- Interval Span Pill (if both or dates set) -->
            ${timeSpanText ? `
              <div class="temporal-span-badge">
                <span class="span-icon">⏱️</span>
                <span>Temporal Baseline: <strong>${t1Date}</strong> ➔ <strong>${t2Date}</strong> (${timeSpanText})</span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Sentinel Preview (if active) -->
        ${imageSource === 'sentinel' && imagePreviewUrl ? `
          <div class="image-upload-area has-image">
            <img src="${imagePreviewUrl}" class="preview-thumb" alt="Sentinel-2 preview" />
            <div class="preview-badge-overlay">🛰️ SENTINEL-2 (${currentPreset.toUpperCase()})</div>
          </div>
        ` : ''}

        <!-- Query input -->
        <div class="query-input-wrap">
          <textarea
            class="query-input"
            id="query-input"
            placeholder="${isBitemporal ? 'Ask about changes between T1 and T2...\ne.g., Detect new urban construction and deforestation' : 'Ask about this area...\ne.g., What land use types are visible?'}"
            rows="3"
          ></textarea>
        </div>

        <!-- Suggestions -->
        <div class="query-suggestions" id="query-suggestions">
          ${suggestions.map(
            (s) => `<button class="query-chip" data-query="${escapeHtml(s)}">${escapeHtml(s)}</button>`
          ).join('')}
        </div>

        <!-- Error display -->
        <div class="error-message" id="analysis-error"></div>

        <!-- Loading stages placeholder -->
        <div class="loading-overlay" id="loading-stages"></div>

        <!-- Sunny Yellow Analyze button -->
        <button class="btn-analyze btn-sunny-primary" id="btn-analyze" ${isAnalyzeDisabled ? 'disabled' : ''}>
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
          ${analyzeBtnLabel}
        </button>

        ${!aiAvailable ? `
          <div style="font-size: 11px; color: var(--text-tertiary); text-align: center; margin-top: var(--space-xs);">
            AI service unavailable — using Smart Simulator
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Source toggle listeners (Map | Sentinel | Upload)
  document.getElementById('src-map')?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('map');
  });

  document.getElementById('src-sentinel')?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('sentinel');
  });

  document.getElementById('src-upload')?.addEventListener('click', () => {
    if (opts.onSourceChange) opts.onSourceChange('upload');
  });

  // Upload Sub-mode Toggle (Single vs Bi-temporal)
  document.getElementById('tab-single')?.addEventListener('click', () => {
    if (opts.onUploadModeChange) opts.onUploadModeChange('single');
  });

  document.getElementById('tab-bitemporal')?.addEventListener('click', () => {
    if (opts.onUploadModeChange) opts.onUploadModeChange('bitemporal');
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

  // Helper to bind drag & drop to a dropzone box
  function bindDropzone(dropzoneId, inputId, slot) {
    const box = document.getElementById(dropzoneId);
    const input = document.getElementById(inputId);
    if (!box || !input) return;

    box.addEventListener('click', () => input.click());

    input.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file && opts.onImageUpload) {
        opts.onImageUpload(file, slot);
      }
    });

    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      box.classList.add('dragover');
    });

    box.addEventListener('dragleave', () => {
      box.classList.remove('dragover');
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      box.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && opts.onImageUpload) {
        opts.onImageUpload(file, slot);
      }
    });
  }

  // Bind single upload dropzone & remove
  bindDropzone('dropzone-single', 'file-input-single', 'single');
  document.getElementById('btn-remove-single')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opts.onImageClear) opts.onImageClear('single');
  });
  document.getElementById('date-single')?.addEventListener('change', (e) => {
    if (opts.onDateChange) opts.onDateChange('single', e.target.value);
  });

  // Bind Bi-temporal T1 dropzone & remove & date
  bindDropzone('dropzone-t1', 'file-input-t1', 'image1');
  document.getElementById('btn-remove-t1')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opts.onImageClear) opts.onImageClear('image1');
  });
  document.getElementById('date-t1')?.addEventListener('change', (e) => {
    if (opts.onDateChange) opts.onDateChange('image1', e.target.value);
  });

  // Bind Bi-temporal T2 dropzone & remove & date
  bindDropzone('dropzone-t2', 'file-input-t2', 'image2');
  document.getElementById('btn-remove-t2')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (opts.onImageClear) opts.onImageClear('image2');
  });
  document.getElementById('date-t2')?.addEventListener('change', (e) => {
    if (opts.onDateChange) opts.onDateChange('image2', e.target.value);
  });

  // Query suggestions click
  document.querySelectorAll('.query-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const qInput = document.getElementById('query-input');
      if (qInput) qInput.value = chip.dataset.query;
    });
  });

  // Analyze button
  document.getElementById('btn-analyze')?.addEventListener('click', () => {
    const query = document.getElementById('query-input')?.value?.trim();
    if (opts.onAnalyze) {
      opts.onAnalyze({ query });
    }
  });

  // Enter key submit
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
