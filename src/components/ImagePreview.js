/**
 * ImagePreview Component — Shows the satellite image being analyzed
 * with support for future overlay annotations.
 */

/**
 * Render an image preview with optional overlay elements.
 *
 * @param {HTMLElement} container
 * @param {string} imageUrl - Data URL or URL of the image
 * @param {object} [options]
 * @param {Array} [options.overlays] - Future: bounding boxes, markers, regions
 */
export function renderImagePreview(container, imageUrl, options = {}) {
  if (!imageUrl) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-header">
        <span class="panel-title">Satellite Image</span>
        <span class="panel-badge">PREVIEW</span>
      </div>
      <div class="result-image-preview" style="position: relative;">
        <img src="${imageUrl}" alt="Satellite image" style="height: 180px;" />
        <div id="image-overlays" style="position: absolute; inset: 0; pointer-events: none;"></div>
      </div>
    </div>
  `;

  // Future: render bounding boxes, segmentation masks, markers
  if (options.overlays && options.overlays.length > 0) {
    renderOverlays(options.overlays);
  }
}

/**
 * Render overlay annotations on the image.
 * Stub for future implementation with actual detection models.
 *
 * @param {Array} overlays
 */
function renderOverlays(overlays) {
  const container = document.getElementById('image-overlays');
  if (!container) return;

  // Future: render SVG bounding boxes, colored regions, markers
  // For now, this is a clean stub that doesn't fake detections
}
