/**
 * Image utility functions — resize, compress, convert for AI analysis.
 */

/**
 * Resize an image using canvas to fit within maxDimension.
 *
 * @param {string} dataUrl - Image data URL
 * @param {number} maxDimension - Maximum width or height
 * @param {number} quality - JPEG quality 0-1
 * @returns {Promise<{ dataUrl: string, blob: Blob }>}
 */
export function resizeImage(dataUrl, maxDimension = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width <= maxDimension && height <= maxDimension) {
        // No resize needed — convert to JPEG
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), blob }),
          'image/jpeg',
          quality
        );
        return;
      }

      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => resolve({ dataUrl: canvas.toDataURL('image/jpeg', quality), blob }),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.crossOrigin = 'anonymous';
    img.src = dataUrl;
  });
}

/**
 * Convert a File to a data URL.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert a data URL to a Blob.
 *
 * @param {string} dataUrl
 * @returns {Blob}
 */
export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

/**
 * Capture the current map view as an image, cropped to the AOI if provided.
 *
 * @param {HTMLElement} mapContainer - The map DOM element
 * @param {object | null} aoi - Selected Area of Interest
 * @param {object | null} mapInstance - Leaflet map instance
 * @returns {Promise<{ dataUrl: string, blob: Blob, isCropped: boolean }>}
 */
export async function captureMapView(mapContainer, aoi = null, mapInstance = null) {
  if (typeof html2canvas === 'undefined') {
    throw new Error('html2canvas not loaded');
  }

  // Hide UI overlays, controls, and vector drawing overlays during capture
  // so the AI receives pure satellite imagery without UI buttons or blue tints
  const controls = mapContainer.querySelector('.leaflet-control-container');
  const overlayPane = mapContainer.querySelector('.leaflet-overlay-pane');
  const popups = mapContainer.querySelectorAll('.leaflet-popup');

  const origControlsDisplay = controls ? controls.style.display : '';
  const origOverlayDisplay = overlayPane ? overlayPane.style.display : '';

  if (controls) controls.style.display = 'none';
  if (overlayPane) overlayPane.style.display = 'none';
  popups.forEach((p) => { p.style.display = 'none'; });

  let canvas;
  try {
    canvas = await html2canvas(mapContainer, {
      useCORS: true,
      allowTaint: true,
      scale: window.devicePixelRatio && window.devicePixelRatio > 1 ? 1.5 : 1,
      logging: false,
      backgroundColor: '#0a0e17',
      ignoreElements: (el) => {
        if (el.classList?.contains('leaflet-control-container')) return true;
        if (el.classList?.contains('leaflet-draw-toolbar')) return true;
        return false;
      },
    });
  } finally {
    // Restore UI visibility immediately
    if (controls) controls.style.display = origControlsDisplay;
    if (overlayPane) overlayPane.style.display = origOverlayDisplay;
    popups.forEach((p) => { p.style.display = ''; });
  }

  // If an Area of Interest is defined and mapInstance is provided, crop strictly to the AOI bounding box
  if (aoi && mapInstance && aoi.coordinates && aoi.coordinates.length >= 2) {
    const scaleX = canvas.width / mapContainer.offsetWidth;
    const scaleY = canvas.height / mapContainer.offsetHeight;

    // Convert all AOI geographic coordinates to pixel coordinates on the map container
    const points = aoi.coordinates.map(([lat, lng]) =>
      mapInstance.latLngToContainerPoint(window.L ? window.L.latLng(lat, lng) : [lat, lng])
    );

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));

    // Calculate crop rectangle in canvas coordinate space
    let cropX = Math.floor(minX * scaleX);
    let cropY = Math.floor(minY * scaleY);
    let cropW = Math.ceil((maxX - minX) * scaleX);
    let cropH = Math.ceil((maxY - minY) * scaleY);

    // Keep within valid canvas bounds with safety margins
    cropX = Math.max(0, Math.min(cropX, canvas.width - 20));
    cropY = Math.max(0, Math.min(cropY, canvas.height - 20));
    cropW = Math.max(20, Math.min(cropW, canvas.width - cropX));
    cropH = Math.max(20, Math.min(cropH, canvas.height - cropY));

    if (cropW > 30 && cropH > 30) {
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const ctx = croppedCanvas.getContext('2d');

      // Draw only the cropped AOI region from the full map canvas
      ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      const dataUrl = croppedCanvas.toDataURL('image/jpeg', 0.92);
      const blob = dataUrlToBlob(dataUrl);
      return { dataUrl, blob, isCropped: true };
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  const blob = dataUrlToBlob(dataUrl);
  return { dataUrl, blob, isCropped: false };
}
