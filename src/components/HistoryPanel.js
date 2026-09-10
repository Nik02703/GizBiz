/**
 * History Panel — Collapsible drawer showing recent analyses.
 */

import { getHistory, getHistoryEntry, clearHistory } from '../services/historyService.js';

/**
 * Render the history drawer content.
 *
 * @param {HTMLElement} container
 * @param {Function} onSelect - Called with history entry when clicked
 * @param {Function} onClose - Called when close button is clicked
 */
export function renderHistoryPanel(container, onSelect, onClose) {
  const history = getHistory();

  container.innerHTML = `
    <div class="history-content">
      <div class="history-header">
        <div class="history-title-wrap">
          <svg class="history-header-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span class="history-title">Recent Analyses</span>
          ${history.length > 0 ? `<span class="history-count-badge">${history.length}</span>` : ''}
        </div>
        <button class="history-close-btn" id="history-close" title="Close History" aria-label="Close history">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="history-items" id="history-items">
        ${history.length === 0
          ? `
            <div class="history-empty">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="opacity: 0.5; margin-bottom: 8px;">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <div>No analyses recorded yet.</div>
              <div style="font-size: 11px; opacity: 0.7; margin-top: 4px;">Run an analysis to build your history log.</div>
            </div>
          `
          : history.map((entry) => {
              const time = new Date(entry.timestamp);
              const timeStr = time.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              });
              return `
                <div class="history-item" data-id="${entry.id}">
                  <div class="history-time">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:3px;">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${timeStr}
                  </div>
                  <div class="history-query">${escapeHtml(entry.query)}</div>
                  <div class="history-location">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block; vertical-align:middle; margin-right:3px;">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    ${escapeHtml(entry.location)}
                  </div>
                </div>
              `;
            }).join('')
        }
      </div>
      ${history.length > 0 ? `
        <div class="history-footer">
          <button class="btn-clear-history" id="btn-clear-history">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear History
          </button>
        </div>
      ` : ''}
    </div>
  `;

  document.getElementById('history-close')?.addEventListener('click', onClose);

  document.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const entry = getHistoryEntry(el.dataset.id);
      if (entry && onSelect) onSelect(entry);
    });
  });

  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    clearHistory();
    renderHistoryPanel(container, onSelect, onClose);
  });
}

/**
 * Toggle the history drawer open/closed.
 */
export function toggleHistoryDrawer() {
  const drawer = document.getElementById('history-drawer');
  if (drawer) drawer.classList.toggle('open');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
