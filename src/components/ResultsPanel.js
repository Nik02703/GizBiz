/**
 * Results Panel — Displays structured AI analysis results.
 */

import { resolveHighlightColor } from '../utils/colorUtils.js';

const HIGHLIGHT_META = {
  water: { color: '#06b6d4', icon: '💧', name: 'Water' },
  water_body: { color: '#06b6d4', icon: '💧', name: 'Water Body' },
  vegetation: { color: '#10b981', icon: '🌿', name: 'Vegetation' },
  forest: { color: '#10b981', icon: '🌲', name: 'Forest' },
  agriculture: { color: '#84cc16', icon: '🌾', name: 'Agriculture' },
  urban: { color: '#f59e0b', icon: '🏙️', name: 'Urban' },
  built_up: { color: '#f59e0b', icon: '🏢', name: 'Built-up' },
  infrastructure: { color: '#8b5cf6', icon: '🛣️', name: 'Infrastructure' },
  hazard: { color: '#ef4444', icon: '⚠️', name: 'Hazard' },
  terrain: { color: '#3b82f6', icon: '⛰️', name: 'Terrain' },
  default: { color: '#00f2fe', icon: '📍', name: 'Feature' },
};

/**
 * Render the analysis results.
 *
 * @param {HTMLElement} container
 * @param {import('../types/analysis.js').AnalysisResult} result
 * @param {string|null} imageUrl - Preview image URL
 * @param {object} [callbacks]
 * @param {Function} [callbacks.onHighlightClick] - Called when a highlight chip is clicked
 * @param {Function} [callbacks.onToggleHighlights] - Called when map highlights visibility is toggled
 */
export function renderResults(container, result, imageUrl, callbacks = {}) {
  if (!result) {
    container.innerHTML = '';
    return;
  }

  const confidence = Math.round((result.confidence || 0) * 100);
  const confLevel = confidence >= 75 ? 'high' : confidence >= 50 ? 'medium' : 'low';

  const analysisTypeLabel = (result.analysis_type || 'general_analysis')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const highlights = result.highlights || [];
  let highlightsVisible = true;

  container.innerHTML = `
    <div class="panel-section results-container visible animate-in">
      <div class="panel-header">
        <span class="panel-title">Analysis Results</span>
      </div>

      <!-- Analysis type -->
      <div class="analysis-type-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
        </svg>
        ${analysisTypeLabel}
      </div>

      <!-- Image preview with detection overlays -->
      ${imageUrl ? `
        <div class="result-image-preview" style="position: relative; overflow: hidden; border-radius: var(--radius-md);">
          <img src="${imageUrl}" alt="Analyzed satellite image" style="width: 100%; display: block;" />
          ${highlights.length > 0 ? `
            <svg class="preview-overlay-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"
              style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
              ${highlights.map((h, i) => {
                const color = resolveHighlightColor(h.color, h.category);

                let shapeSvg = '';
                let labelX = 50;
                let labelY = 50;

                if (h.polygon && Array.isArray(h.polygon) && h.polygon.length >= 3) {
                  const pointsStr = h.polygon.map(([y, x]) => `${x},${y}`).join(' ');
                  shapeSvg += `<polygon points="${pointsStr}" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-width="5" stroke-linejoin="round"></polygon>`;
                  labelX = h.polygon[0][1];
                  labelY = h.polygon[0][0];
                }

                if (h.point && Array.isArray(h.point) && h.point.length === 2) {
                  const [py, px] = h.point;
                  shapeSvg += `
                    <circle cx="${px}" cy="${py}" r="18" fill="none" stroke="${color}" stroke-width="3.5" stroke-dasharray="6, 3"></circle>
                    <circle cx="${px}" cy="${py}" r="7" fill="${color}" stroke="#ffffff" stroke-width="2.5"></circle>
                  `;
                  if (!h.polygon || h.polygon.length < 3) {
                    labelX = px;
                    labelY = py;
                  }
                }

                if (!shapeSvg && h.box_2d && h.box_2d.length === 4) {
                  const [ymin, xmin, ymax, xmax] = h.box_2d;
                  const w = Math.max(20, xmax - xmin);
                  const hBox = Math.max(20, ymax - ymin);
                  shapeSvg = `
                    <rect x="${xmin}" y="${ymin}" width="${w}" height="${hBox}"
                      fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="6" stroke-dasharray="12, 6" rx="6">
                    </rect>
                  `;
                  labelX = xmin;
                  labelY = ymin;
                }

                if (!shapeSvg) return '';

                const badgeX = Math.max(8, Math.min(760, labelX));
                const badgeY = Math.max(8, labelY - 34);
                const badgeWidth = Math.min(360, (h.label || '').length * 15 + 36);

                return `
                  <g class="preview-highlight-group" data-index="${i}">
                    ${shapeSvg}
                    <rect x="${badgeX}" y="${badgeY}" width="${badgeWidth}" height="28"
                      fill="rgba(10, 14, 23, 0.9)" rx="6" stroke="${color}" stroke-width="2"></rect>
                    <text x="${badgeX + 8}" y="${badgeY + 19}" fill="#ffffff" font-size="16" font-family="sans-serif" font-weight="700">
                      ${escapeHtml(h.label)}
                    </text>
                  </g>
                `;
              }).join('')}
            </svg>
          ` : ''}
        </div>
      ` : ''}

      <!-- AI Visual Highlights on Map -->
      ${highlights.length > 0 ? `
        <div class="highlights-section">
          <div class="panel-header" style="margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="panel-title">AI Highlights</span>
              <span class="panel-badge highlight-count" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: rgba(6, 182, 212, 0.3);">${highlights.length} DETECTED</span>
            </div>
            <button class="btn-toggle-highlights" id="btn-toggle-map-highlights" title="Toggle map highlight overlays">
              <span class="toggle-dot on" id="toggle-highlight-dot"></span>
              <span id="toggle-highlights-label">Map: ON</span>
            </button>
          </div>
          <p class="highlights-hint">Click any detected feature to zoom and highlight it on the map:</p>
          <div class="highlights-grid">
            ${highlights.map((h, i) => {
              const cat = (h.category || 'default').toLowerCase();
              const meta = HIGHLIGHT_META[cat] || HIGHLIGHT_META.default;
              const color = resolveHighlightColor(h.color, h.category);
              const conf = Math.round((h.confidence || 0.85) * 100);
              return `
                <button class="highlight-chip" data-index="${i}" style="--chip-color: ${color}; border-left: 3px solid ${color};">
                  <div class="chip-top">
                    <span class="chip-icon">${meta.icon}</span>
                    <span class="chip-label">${escapeHtml(h.label)}</span>
                    <span class="chip-conf" style="color: ${color};">${conf}%</span>
                  </div>
                  ${h.description ? `<div class="chip-desc">${escapeHtml(h.description)}</div>` : ''}
                </button>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Confidence -->
      <div class="confidence-section">
        <div class="confidence-header">
          <span class="confidence-label">AI Confidence</span>
          <span class="confidence-value ${confLevel}">${confidence}%</span>
        </div>
        <div class="confidence-bar">
          <div class="confidence-fill ${confLevel}" style="width: ${confidence}%"></div>
        </div>
      </div>

      <!-- Answer -->
      <div>
        <div class="panel-header">
          <span class="panel-title">Analysis</span>
        </div>
        <div class="result-answer">${formatAnswer(result.answer)}</div>
      </div>

      <!-- Observations -->
      ${result.observations && result.observations.length > 0 ? `
        <div>
          <div class="panel-header">
            <span class="panel-title">Key Observations</span>
            <span class="panel-badge">${result.observations.length}</span>
          </div>
          <ul class="observations-list">
            ${result.observations.map((obs) => {
              const obsConf = Math.round((obs.confidence || 0) * 100);
              return `
                <li class="observation-item">
                  <div class="observation-dot"></div>
                  <div class="observation-content">
                    <div class="observation-label">${escapeHtml(obs.label)}</div>
                    ${obs.description ? `<div class="observation-desc">${escapeHtml(obs.description)}</div>` : ''}
                  </div>
                  <div class="observation-conf">${obsConf}%</div>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Evidence -->
      ${result.evidence && result.evidence.length > 0 ? `
        <div>
          <div class="panel-header">
            <span class="panel-title">Evidence</span>
          </div>
          <ul class="evidence-list">
            ${result.evidence.map((ev) => `
              <li class="evidence-item">
                <span class="evidence-marker">›</span>
                <span>${escapeHtml(ev)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}

      <!-- Model info -->
      ${result.metadata ? `
        <div class="model-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <line x1="8" y1="21" x2="16" y2="21"/>
            <line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span>Satellite Intelligence Engine · ${result.metadata.processing_time_ms ? (result.metadata.processing_time_ms / 1000).toFixed(1) + 's' : ''}</span>
        </div>
      ` : ''}
    </div>
  `;

  // Attach highlight event listeners
  const chips = container.querySelectorAll('.highlight-chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const idx = parseInt(chip.dataset.index, 10);
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (callbacks.onHighlightClick) {
        callbacks.onHighlightClick(idx);
      }
    });
  });

  const toggleBtn = container.querySelector('#btn-toggle-map-highlights');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      highlightsVisible = !highlightsVisible;
      const dot = container.querySelector('#toggle-highlight-dot');
      const label = container.querySelector('#toggle-highlights-label');
      if (dot) dot.className = `toggle-dot ${highlightsVisible ? 'on' : 'off'}`;
      if (label) label.textContent = `Map: ${highlightsVisible ? 'ON' : 'OFF'}`;
      if (callbacks.onToggleHighlights) {
        callbacks.onToggleHighlights(highlightsVisible);
      }
    });
  }
}

/**
 * Clear the results panel.
 */
export function clearResults(container) {
  container.innerHTML = '';
}

// ─── Helpers ─────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatAnswer(text) {
  if (!text) return '';
  return text
    .split(/\n\n+/)
    .map((p) => `<p style="margin-bottom: 8px;">${escapeHtml(p.trim())}</p>`)
    .join('');
}
