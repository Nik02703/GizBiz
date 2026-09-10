/**
 * MapView Component — Leaflet interactive map with satellite tiles and drawing tools.
 */

import { calculateAreaKm2, formatArea, getCenter, getBounds, formatCoord } from '../utils/geoUtils.js';
import { resolveHighlightColor } from '../utils/colorUtils.js';

let map = null;
let drawnItems = null;
let highlightItems = null;
let activeHighlights = [];
let drawControlFull = null;
let currentLayer = null;
let satelliteTile = null;
let streetTile = null;
let isSatelliteView = true;

// OpenStreetMap vector feature layers
let osmLayerGroup = null;
const osmSubLayers = {
  buildings: null,
  roads: null,
  water: null,
  waterways: null,
  railways: null,
  pois: null,
};
const osmLayerVisibility = {
  buildings: true,
  roads: true,
  water: true,
  waterways: true,
  railways: true,
  pois: true,
};
let osmFeatureCounts = {
  buildings: 0,
  roads: 0,
  water: 0,
  waterways: 0,
  railways: 0,
  pois: 0,
};

// Active drawing handler reference
let activeDrawHandler = null;

const HIGHLIGHT_STYLES = {
  water: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.35)', icon: '💧', label: 'Water' },
  water_body: { stroke: '#06b6d4', fill: 'rgba(6, 182, 212, 0.35)', icon: '💧', label: 'Water' },
  vegetation: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.35)', icon: '🌿', label: 'Vegetation' },
  forest: { stroke: '#10b981', fill: 'rgba(16, 185, 129, 0.35)', icon: '🌲', label: 'Forest' },
  agriculture: { stroke: '#84cc16', fill: 'rgba(132, 204, 22, 0.35)', icon: '🌾', label: 'Agriculture' },
  urban: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.35)', icon: '🏙️', label: 'Urban' },
  built_up: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.35)', icon: '🏢', label: 'Built-up' },
  infrastructure: { stroke: '#8b5cf6', fill: 'rgba(139, 92, 246, 0.35)', icon: '🛣️', label: 'Infrastructure' },
  hazard: { stroke: '#ef4444', fill: 'rgba(239, 68, 68, 0.35)', icon: '⚠️', label: 'Hazard' },
  terrain: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.35)', icon: '⛰️', label: 'Terrain' },
  default: { stroke: '#00f2fe', fill: 'rgba(0, 242, 254, 0.35)', icon: '📍', label: 'Feature' },
};

// Callbacks
let onAOISelected = null;
let onAOICleared = null;

/**
 * Initialize the Leaflet map.
 *
 * @param {string} containerId - Map container element ID
 * @param {object} callbacks
 * @param {Function} callbacks.onAOISelected - Called with AOI data when user draws a shape
 * @param {Function} callbacks.onAOICleared - Called when AOI is cleared
 * @returns {L.Map}
 */
export function initMap(containerId, callbacks) {
  onAOISelected = callbacks.onAOISelected;
  onAOICleared = callbacks.onAOICleared;

  // Create map centered on India
  map = L.map(containerId, {
    center: [22.5, 78.9],
    zoom: 5,
    zoomControl: false,
    attributionControl: false,
  });

  // Add zoom control to bottom-right
  L.control.zoom({ position: 'bottomright' }).addTo(map);



  // Satellite tile layer (Esri World Imagery — free)
  satelliteTile = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
    }
  ).addTo(map);

  // Street tile layer (OSM dark)
  streetTile = L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    {
      maxZoom: 19,
    }
  );

  // Feature group for drawn items
  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  // Feature group for AI detected highlights
  highlightItems = new L.FeatureGroup();
  map.addLayer(highlightItems);

  // Feature group for OpenStreetMap vector layers
  osmLayerGroup = new L.FeatureGroup();
  map.addLayer(osmLayerGroup);

  // Draw controls
  drawControlFull = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polyline: false,
      circle: false,
      circlemarker: false,
      marker: false,
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
        },
      },
      rectangle: {
        shapeOptions: {
          color: '#3b82f6',
          weight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
        },
      },
    },
    edit: {
      featureGroup: drawnItems,
      remove: true,
    },
  });
  map.addControl(drawControlFull);

  // Drawing event handlers
  map.on(L.Draw.Event.CREATED, (e) => {
    cancelDrawing();

    // Clear previous
    drawnItems.clearLayers();
    currentLayer = e.layer;
    drawnItems.addLayer(currentLayer);

    const latlngs = getLayerLatLngs(currentLayer);
    const aoi = buildAOIData(latlngs, e.layerType);
    if (onAOISelected) onAOISelected(aoi);
  });

  map.on(L.Draw.Event.DRAWSTOP, () => {
    cancelDrawing();
  });

  map.on(L.Draw.Event.EDITED, (e) => {
    e.layers.eachLayer((layer) => {
      currentLayer = layer;
      const latlngs = getLayerLatLngs(currentLayer);
      const aoi = buildAOIData(latlngs, currentLayer instanceof L.Rectangle ? 'rectangle' : 'polygon');
      if (onAOISelected) onAOISelected(aoi);
    });
  });

  map.on(L.Draw.Event.DELETED, () => {
    currentLayer = null;
    if (onAOICleared) onAOICleared();
  });

  // Build custom map controls
  buildMapControls();

  return map;
}

/**
 * Build the custom map controls (draw buttons, layer switch, search).
 */
function buildMapControls() {
  const controlsContainer = document.getElementById('map-controls');

  // Drawing buttons
  controlsContainer.innerHTML = `
    <div class="map-control-group">
      <button class="map-ctrl-btn" id="btn-draw-rect" title="Draw Rectangle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="1"/>
        </svg>
        Rectangle
      </button>
      <button class="map-ctrl-btn" id="btn-draw-poly" title="Draw Polygon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2 L22 8.5 L18 21 L6 21 L2 8.5 Z"/>
        </svg>
        Polygon
      </button>
      <button class="map-ctrl-btn" id="btn-clear-aoi" title="Clear Selection">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        Clear
      </button>
    </div>
  `;

  // Location search bar
  const searchDiv = document.createElement('div');
  searchDiv.className = 'location-search';
  searchDiv.innerHTML = `
    <svg class="location-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
    <input type="text" id="location-search-input" placeholder="Search location..." autocomplete="off" />
    <div class="search-results" id="search-results"></div>
  `;
  document.getElementById('map-container').appendChild(searchDiv);

  // Layer switch
  const layerDiv = document.createElement('div');
  layerDiv.className = 'layer-switch';
  layerDiv.innerHTML = `
    <button class="layer-switch-btn" id="btn-layer-switch">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 22 8.5 12 15 2 8.5"/>
        <polyline points="2 15.5 12 22 22 15.5"/>
      </svg>
      <span id="layer-label">Street View</span>
    </button>
  `;
  document.getElementById('map-container').appendChild(layerDiv);

  // Event listeners
  document.getElementById('btn-draw-rect').addEventListener('click', () => {
    startDrawingRectangle();
  });

  document.getElementById('btn-draw-poly').addEventListener('click', () => {
    startDrawingPolygon();
  });

  document.getElementById('btn-clear-aoi').addEventListener('click', () => {
    cancelDrawing();
    clearAOI();
  });

  document.getElementById('btn-layer-switch').addEventListener('click', () => {
    toggleLayer();
  });

  // Location search with debounce
  let searchTimer = null;
  const searchInput = document.getElementById('location-search-input');
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 3) {
      document.getElementById('search-results').classList.remove('visible');
      return;
    }
    searchTimer = setTimeout(() => searchLocation(q), 400);
  });

  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      document.getElementById('search-results').classList.remove('visible');
    }, 200);
  });

  // Map Legal Attribution Banner (Esri & OpenStreetMap)
  const attrDiv = document.createElement('div');
  attrDiv.className = 'map-attribution-banner';
  attrDiv.id = 'map-attribution-banner';
  attrDiv.innerHTML = `
    <span>Tiles &copy; <a href="https://www.esri.com" target="_blank" rel="noopener">Esri</a></span>
    <span class="attr-sep">&bull;</span>
    <span>Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a></span>
  `;
  document.getElementById('map-container').appendChild(attrDiv);
}

/**
 * Search for a location using Nominatim.
 */
async function searchLocation(query) {
  const resultsDiv = document.getElementById('search-results');
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`
    );
    const data = await res.json();

    if (data.length === 0) {
      resultsDiv.innerHTML = '<div class="search-result-item">No results found</div>';
      resultsDiv.classList.add('visible');
      return;
    }

    resultsDiv.innerHTML = data
      .map(
        (item) =>
          `<div class="search-result-item" data-lat="${item.lat}" data-lng="${item.lon}">${item.display_name}</div>`
      )
      .join('');

    resultsDiv.classList.add('visible');

    resultsDiv.querySelectorAll('.search-result-item').forEach((el) => {
      el.addEventListener('click', () => {
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        map.setView([lat, lng], 14);
        resultsDiv.classList.remove('visible');
        document.getElementById('location-search-input').value = el.textContent.substring(0, 40);
      });
    });
  } catch {
    resultsDiv.innerHTML = '<div class="search-result-item">Search failed</div>';
    resultsDiv.classList.add('visible');
  }
}

/**
 * Toggle between satellite and street view.
 */
function toggleLayer() {
  if (isSatelliteView) {
    map.removeLayer(satelliteTile);
    streetTile.addTo(map);
    document.getElementById('layer-label').textContent = 'Satellite View';
  } else {
    map.removeLayer(streetTile);
    satelliteTile.addTo(map);
    document.getElementById('layer-label').textContent = 'Street View';
  }
  isSatelliteView = !isSatelliteView;
}

/**
 * Clear the current AOI selection and any AI highlights.
 */
export function clearAOI() {
  drawnItems.clearLayers();
  currentLayer = null;
  clearHighlights();
  clearOSMData();
  if (onAOICleared) onAOICleared();
}

/**
 * Fly to a specific location and zoom level.
 */
export function flyTo(lat, lng, zoom = 14) {
  if (map) map.flyTo([lat, lng], zoom, { duration: 1.5 });
}

/**
 * Set a rectangle AOI programmatically (for demo mode).
 */
export function setRectangleAOI(bounds) {
  drawnItems.clearLayers();

  const rect = L.rectangle(bounds, {
    color: '#3b82f6',
    weight: 2,
    fillColor: '#3b82f6',
    fillOpacity: 0.15,
  });

  drawnItems.addLayer(rect);
  currentLayer = rect;

  const latlngs = getLayerLatLngs(rect);
  const aoi = buildAOIData(latlngs, 'rectangle');
  if (onAOISelected) onAOISelected(aoi);
}

/**
 * Get the Leaflet map instance.
 */
export function getMap() {
  return map;
}

/**
 * Get the map container element.
 */
export function getMapElement() {
  return document.getElementById('map');
}

/**
 * Ensure satellite view is active.
 */
export function ensureSatelliteView() {
  if (!isSatelliteView) {
    toggleLayer();
  }
}

/**
 * Render visual highlight layers on the map based on AI detections.
 *
 * @param {Array} highlights - Array of highlight objects with box_2d or polygon
 * @param {object} aoi - Current Area of Interest with geographic bounds
 * @returns {number} Count of successfully rendered highlights
 */
export function displayHighlights(highlights, aoi) {
  if (!map || !highlightItems) return 0;
  highlightItems.clearLayers();
  activeHighlights = [];

  if (!highlights || !Array.isArray(highlights) || highlights.length === 0 || !aoi?.bounds) {
    return 0;
  }

  const { north, south, east, west } = aoi.bounds;

  highlights.forEach((item, idx) => {
    const cat = (item.category || 'default').toLowerCase();
    const defaultMeta = HIGHLIGHT_STYLES[cat] || HIGHLIGHT_STYLES.default;
    const strokeColor = resolveHighlightColor(item.color, item.category);
    const conf = Math.round((item.confidence || 0.85) * 100);

    let layer = null;
    let polyLayer = null;
    let beaconLayer = null;

    // 1. Delineate multi-vertex contour polygon
    if (item.polygon && Array.isArray(item.polygon) && item.polygon.length >= 3) {
      const latlngs = item.polygon.map(([y, x]) => {
        const normY = y > 1 ? y / 1000 : y;
        const normX = x > 1 ? x / 1000 : x;
        const lat = north - normY * (north - south);
        const lng = west + normX * (east - west);
        return [lat, lng];
      });

      polyLayer = L.polygon(latlngs, {
        color: strokeColor,
        weight: 3.5,
        fillColor: strokeColor,
        fillOpacity: 0.38,
        lineJoin: 'round',
        lineCap: 'round',
        className: 'ai-highlight-polygon',
      });
    }

    // 2. Exact summit/peak beacon point
    if (item.point && Array.isArray(item.point) && item.point.length >= 2) {
      const [py, px] = item.point;
      const normPy = py > 1 ? py / 1000 : py;
      const normPx = px > 1 ? px / 1000 : px;
      const pLat = north - normPy * (north - south);
      const pLng = west + normPx * (east - west);

      const beaconDot = L.circleMarker([pLat, pLng], {
        radius: 7,
        color: '#ffffff',
        weight: 2.5,
        fillColor: strokeColor,
        fillOpacity: 1,
        className: 'ai-highlight-peak-point',
      });

      const auraRing = L.circleMarker([pLat, pLng], {
        radius: 16,
        color: strokeColor,
        weight: 2,
        fillColor: strokeColor,
        fillOpacity: 0.22,
        className: 'ai-highlight-peak-aura',
      });

      beaconLayer = L.featureGroup([auraRing, beaconDot]);
    }

    // Combine polygon contour and summit beacon
    if (polyLayer && beaconLayer) {
      layer = L.featureGroup([polyLayer, beaconLayer]);
    } else if (polyLayer) {
      layer = polyLayer;
    } else if (beaconLayer) {
      layer = beaconLayer;
    } else if (item.box_2d && Array.isArray(item.box_2d) && item.box_2d.length === 4) {
      // Coarse fallback only if neither polygon nor point is available
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      const normYmin = ymin > 1 ? ymin / 1000 : ymin;
      const normXmin = xmin > 1 ? xmin / 1000 : xmin;
      const normYmax = ymax > 1 ? ymax / 1000 : ymax;
      const normXmax = xmax > 1 ? xmax / 1000 : xmax;

      const latMax = north - normYmin * (north - south);
      const latMin = north - normYmax * (north - south);
      const lngMin = west + normXmin * (east - west);
      const lngMax = west + normXmax * (east - west);

      layer = L.rectangle([[latMin, lngMin], [latMax, lngMax]], {
        color: strokeColor,
        weight: 3,
        fillColor: strokeColor,
        fillOpacity: 0.32,
        className: 'ai-highlight-box',
      });
    }

    if (layer) {
      layer.bindTooltip(
        `<div class="ai-tooltip-content" style="border-left: 3px solid ${strokeColor};">
          <span class="ai-tooltip-icon">${defaultMeta.icon}</span>
          <span class="ai-tooltip-text"><strong>${escapeHtml(item.label || 'Detected Area')}</strong> (${conf}%)</span>
        </div>`,
        { permanent: false, sticky: true, className: 'ai-map-tooltip' }
      );

      layer.bindPopup(`
        <div class="ai-highlight-popup">
          <div class="ai-popup-header">
            <span class="ai-popup-icon">${defaultMeta.icon}</span>
            <span class="ai-popup-title">${escapeHtml(item.label || 'Feature')}</span>
          </div>
          <div class="ai-popup-meta">
            <span class="ai-popup-tag" style="background: rgba(255, 255, 255, 0.1); color: ${strokeColor}; border: 1px solid ${strokeColor};">${cat.toUpperCase()}</span>
            <span class="ai-popup-conf">${conf}% Confidence</span>
          </div>
          ${item.description ? `<div class="ai-popup-desc">${escapeHtml(item.description)}</div>` : ''}
        </div>
      `);

      highlightItems.addLayer(layer);
      activeHighlights.push({ layer, data: item, index: idx });
    }
  });

  if (activeHighlights.length > 0) {
    highlightItems.bringToFront();
  }

  return activeHighlights.length;
}

/**
 * Clear all highlight layers from the map.
 */
export function clearHighlights() {
  if (highlightItems) {
    highlightItems.clearLayers();
  }
  activeHighlights = [];
}

/**
 * Zoom or focus map to a specific highlight by index.
 *
 * @param {number} index
 */
export function focusHighlight(index) {
  const item = activeHighlights[index];
  if (item && item.layer && map) {
    if (typeof item.layer.getBounds === 'function') {
      const bounds = item.layer.getBounds();
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds, { padding: [80, 80], maxZoom: 16 });
      }
    } else if (typeof item.layer.getLatLng === 'function') {
      map.setView(item.layer.getLatLng(), Math.max(map.getZoom(), 12));
    }
    item.layer.openPopup();
  }
}

/**
 * Toggle visibility of all highlight layers.
 *
 * @param {boolean} visible
 */
export function toggleHighlightsVisibility(visible) {
  if (!map || !highlightItems) return;
  if (visible) {
    if (!map.hasLayer(highlightItems)) map.addLayer(highlightItems);
    highlightItems.bringToFront();
  } else {
    if (map.hasLayer(highlightItems)) map.removeLayer(highlightItems);
  }
}

// ─── OpenStreetMap Layer Management ──────────────────────────

/**
 * Render OpenStreetMap vector layers on the map.
 *
 * @param {object} osmResult - Response from backend /api/osm/query
 * @returns {object} Layer feature counts
 */
export function displayOSMData(osmResult) {
  if (!map || !osmLayerGroup) return {};
  clearOSMData();

  if (!osmResult || !osmResult.layers) {
    return {};
  }

  const layers = osmResult.layers;

  // 1. Buildings Layer (Warm amber polygon fill + subtle outline)
  if (layers.buildings && layers.buildings.features.length > 0) {
    osmSubLayers.buildings = L.geoJSON(layers.buildings, {
      style: (feature) => ({
        color: '#b45309',
        weight: 1.2,
        fillColor: '#f59e0b',
        fillOpacity: 0.38,
        className: 'osm-feature-building',
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'buildings'));
        layer.bindTooltip(
          `<div class="osm-tooltip">🏢 <strong>${escapeHtml(feature.properties.name || feature.properties.feature_type || 'Building')}</strong></div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.buildings = layers.buildings.features.length;
    if (osmLayerVisibility.buildings) {
      osmLayerGroup.addLayer(osmSubLayers.buildings);
    }
  }

  // 2. Roads Layer (Hierarchical line width and color)
  if (layers.roads && layers.roads.features.length > 0) {
    osmSubLayers.roads = L.geoJSON(layers.roads, {
      style: (feature) => {
        const h = (feature.properties.highway || '').toLowerCase();
        let color = '#94a3b8';
        let weight = 1.8;
        if (['motorway', 'trunk', 'primary'].includes(h)) {
          color = '#f97316';
          weight = 3.5;
        } else if (['secondary', 'tertiary'].includes(h)) {
          color = '#fbbf24';
          weight = 2.4;
        } else if (['residential', 'living_street', 'service'].includes(h)) {
          color = '#e2e8f0';
          weight = 1.5;
        }
        return {
          color,
          weight,
          opacity: 0.9,
          className: 'osm-feature-road',
        };
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'roads'));
        layer.bindTooltip(
          `<div class="osm-tooltip">🛣️ <strong>${escapeHtml(feature.properties.name || feature.properties.ref || 'Road')}</strong> (${feature.properties.highway || 'road'})</div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.roads = layers.roads.features.length;
    if (osmLayerVisibility.roads) {
      osmLayerGroup.addLayer(osmSubLayers.roads);
    }
  }

  // 3. Water Bodies Layer (Calm azure polygon fill + outline)
  if (layers.water && layers.water.features.length > 0) {
    osmSubLayers.water = L.geoJSON(layers.water, {
      style: (feature) => ({
        color: '#0284c7',
        weight: 1.5,
        fillColor: '#0ea5e9',
        fillOpacity: 0.45,
        className: 'osm-feature-water',
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'water'));
        layer.bindTooltip(
          `<div class="osm-tooltip">🌊 <strong>${escapeHtml(feature.properties.name || feature.properties.natural || 'Water Body')}</strong></div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.water = layers.water.features.length;
    if (osmLayerVisibility.water) {
      osmLayerGroup.addLayer(osmSubLayers.water);
    }
  }

  // 4. Waterways Layer (Cyan stream line)
  if (layers.waterways && layers.waterways.features.length > 0) {
    osmSubLayers.waterways = L.geoJSON(layers.waterways, {
      style: (feature) => ({
        color: '#06b6d4',
        weight: 2.2,
        opacity: 0.85,
        className: 'osm-feature-waterway',
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'waterways'));
        layer.bindTooltip(
          `<div class="osm-tooltip">💧 <strong>${escapeHtml(feature.properties.name || feature.properties.waterway || 'Waterway')}</strong></div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.waterways = layers.waterways.features.length;
    if (osmLayerVisibility.waterways) {
      osmLayerGroup.addLayer(osmSubLayers.waterways);
    }
  }

  // 5. Railways Layer (Dashed slate tracks)
  if (layers.railways && layers.railways.features.length > 0) {
    osmSubLayers.railways = L.geoJSON(layers.railways, {
      style: (feature) => ({
        color: '#475569',
        weight: 2.4,
        dashArray: '6, 5',
        opacity: 0.9,
        className: 'osm-feature-railway',
      }),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'railways'));
        layer.bindTooltip(
          `<div class="osm-tooltip">🚆 <strong>${escapeHtml(feature.properties.name || 'Railway')}</strong></div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.railways = layers.railways.features.length;
    if (osmLayerVisibility.railways) {
      osmLayerGroup.addLayer(osmSubLayers.railways);
    }
  }

  // 6. POIs Layer (Distinct category beacon points)
  if (layers.pois && layers.pois.features.length > 0) {
    osmSubLayers.pois = L.geoJSON(layers.pois, {
      pointToLayer: (feature, latlng) => {
        let color = '#8b5cf6';
        if (feature.properties.amenity === 'hospital' || feature.properties.amenity === 'pharmacy') color = '#ef4444';
        else if (feature.properties.amenity === 'school' || feature.properties.amenity === 'university') color = '#3b82f6';
        else if (feature.properties.shop) color = '#ec4899';
        else if (feature.properties.tourism) color = '#10b981';

        return L.circleMarker(latlng, {
          radius: 6.5,
          fillColor: color,
          color: '#ffffff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
          className: 'osm-feature-poi',
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(buildOSMPopupHtml(feature, 'pois'));
        layer.bindTooltip(
          `<div class="osm-tooltip">📍 <strong>${escapeHtml(feature.properties.name || feature.properties.feature_type || 'POI')}</strong></div>`,
          { sticky: true }
        );
      },
    });
    osmFeatureCounts.pois = layers.pois.features.length;
    if (osmLayerVisibility.pois) {
      osmLayerGroup.addLayer(osmSubLayers.pois);
    }
  }

  // Keep AI highlights on top of OSM base context if both exist
  if (highlightItems && map.hasLayer(highlightItems)) {
    highlightItems.bringToFront();
  }

  return { ...osmFeatureCounts };
}

/**
 * Toggle visibility of an individual OSM layer category.
 *
 * @param {string} category - 'buildings' | 'roads' | 'water' | 'waterways' | 'railways' | 'pois'
 * @param {boolean} visible
 */
export function toggleOSMLayer(category, visible) {
  if (!osmLayerGroup || !osmSubLayers[category]) return;
  osmLayerVisibility[category] = visible;

  if (visible) {
    if (!osmLayerGroup.hasLayer(osmSubLayers[category])) {
      osmLayerGroup.addLayer(osmSubLayers[category]);
    }
  } else {
    if (osmLayerGroup.hasLayer(osmSubLayers[category])) {
      osmLayerGroup.removeLayer(osmSubLayers[category]);
    }
  }
}

/**
 * Clear all OSM layers from the map.
 */
export function clearOSMData() {
  if (osmLayerGroup) {
    osmLayerGroup.clearLayers();
  }
  for (const cat of Object.keys(osmSubLayers)) {
    osmSubLayers[cat] = null;
    osmFeatureCounts[cat] = 0;
  }
}

/**
 * Get current OSM feature counts and layer states.
 */
export function getOSMStats() {
  return {
    counts: { ...osmFeatureCounts },
    visibility: { ...osmLayerVisibility },
  };
}

/**
 * Build interactive popup HTML for an OSM feature.
 */
function buildOSMPopupHtml(feature, category) {
  const p = feature.properties || {};
  const tags = p.all_tags || {};
  const osmUrl = `https://www.openstreetmap.org/${p.osm_id || ''}`;

  let catBadge = 'VECTOR FEATURE';
  let catIcon = '🗺️';
  let details = [];

  switch (category) {
    case 'buildings':
      catBadge = 'VECTOR BUILDING';
      catIcon = '🏢';
      if (p.feature_type) details.push({ label: 'Type', val: p.feature_type });
      if (p.levels) details.push({ label: 'Levels', val: `${p.levels} floors` });
      if (p.height) details.push({ label: 'Height', val: p.height });
      if (p.addr_street) details.push({ label: 'Address', val: `${p.addr_housenumber || ''} ${p.addr_street}`.trim() });
      if (p.amenity) details.push({ label: 'Amenity', val: p.amenity });
      break;

    case 'roads':
      catBadge = 'VECTOR ROAD';
      catIcon = '🛣️';
      if (p.highway) details.push({ label: 'Class', val: p.highway });
      if (p.ref) details.push({ label: 'Reference', val: p.ref });
      if (p.lanes) details.push({ label: 'Lanes', val: p.lanes });
      if (p.maxspeed) details.push({ label: 'Max Speed', val: p.maxspeed });
      if (p.surface) details.push({ label: 'Surface', val: p.surface });
      if (p.oneway) details.push({ label: 'Oneway', val: 'Yes' });
      break;

    case 'water':
      catBadge = 'VECTOR WATER';
      catIcon = '🌊';
      if (p.natural) details.push({ label: 'Natural', val: p.natural });
      if (p.feature_type) details.push({ label: 'Type', val: p.feature_type });
      break;

    case 'waterways':
      catBadge = 'VECTOR WATERWAY';
      catIcon = '💧';
      if (p.waterway) details.push({ label: 'Type', val: p.waterway });
      if (p.intermittent) details.push({ label: 'Intermittent', val: 'Yes' });
      break;

    case 'railways':
      catBadge = 'VECTOR RAILWAY';
      catIcon = '🚆';
      if (p.feature_type) details.push({ label: 'Type', val: p.feature_type });
      if (p.electrified) details.push({ label: 'Electrified', val: p.electrified });
      break;

    case 'pois':
      catBadge = 'VECTOR POI';
      catIcon = '📍';
      if (p.amenity) details.push({ label: 'Amenity', val: p.amenity });
      if (p.shop) details.push({ label: 'Shop', val: p.shop });
      if (p.tourism) details.push({ label: 'Tourism', val: p.tourism });
      if (p.opening_hours) details.push({ label: 'Hours', val: p.opening_hours });
      break;
  }

  const tagsList = Object.entries(tags)
    .filter(([k]) => !['name', 'building', 'highway', 'natural', 'waterway', 'railway'].includes(k))
    .slice(0, 10);

  return `
    <div class="osm-popup-card">
      <div class="osm-popup-header">
        <span class="osm-popup-icon">${catIcon}</span>
        <div class="osm-popup-title-wrap">
          <div class="osm-popup-badge">${catBadge}</div>
          <div class="osm-popup-title">${escapeHtml(p.name || p.feature_type || 'Mapped Feature')}</div>
        </div>
      </div>
      <div class="osm-popup-body">
        ${details.map((d) => `
          <div class="osm-prop-row">
            <span class="osm-prop-label">${escapeHtml(d.label)}</span>
            <span class="osm-prop-value">${escapeHtml(String(d.val))}</span>
          </div>
        `).join('')}
        <div class="osm-prop-row">
          <span class="osm-prop-label">Feature ID</span>
          <span class="osm-prop-value">
            <a href="${osmUrl}" target="_blank" rel="noopener" class="osm-link">#${escapeHtml(p.id || '')} &nearr;</a>
          </span>
        </div>
      </div>
      ${tagsList.length > 0 ? `
        <details class="osm-tags-details">
          <summary>View attributes (${tagsList.length})</summary>
          <div class="osm-tags-grid">
            ${tagsList.map(([k, v]) => `
              <div class="osm-tag-pair">
                <code>${escapeHtml(k)}</code>: <span>${escapeHtml(v)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

// ─── Drawing Management Exports ──────────────────────────────

/**
 * Start rectangle drawing mode on the map.
 */
export function startDrawingRectangle() {
  if (!map || !drawControlFull) return;
  const rectBtn = document.getElementById('btn-draw-rect');
  const polyBtn = document.getElementById('btn-draw-poly');

  // If already active, toggle off
  if (activeDrawHandler instanceof L.Draw.Rectangle && activeDrawHandler._enabled) {
    cancelDrawing();
    return;
  }

  cancelDrawing();

  const options = drawControlFull.options.draw.rectangle || {
    shapeOptions: {
      color: '#3b82f6',
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
    },
  };

  activeDrawHandler = new L.Draw.Rectangle(map, options);
  activeDrawHandler.enable();
  rectBtn?.classList.add('active');
  polyBtn?.classList.remove('active');
}

/**
 * Start polygon drawing mode on the map.
 */
export function startDrawingPolygon() {
  if (!map || !drawControlFull) return;
  const rectBtn = document.getElementById('btn-draw-rect');
  const polyBtn = document.getElementById('btn-draw-poly');

  // If already active, toggle off
  if (activeDrawHandler instanceof L.Draw.Polygon && activeDrawHandler._enabled) {
    cancelDrawing();
    return;
  }

  cancelDrawing();

  const options = drawControlFull.options.draw.polygon || {
    allowIntersection: false,
    showArea: true,
    shapeOptions: {
      color: '#3b82f6',
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.15,
    },
  };

  activeDrawHandler = new L.Draw.Polygon(map, options);
  activeDrawHandler.enable();
  polyBtn?.classList.add('active');
  rectBtn?.classList.remove('active');
}

/**
 * Cancel any currently active drawing mode.
 */
export function cancelDrawing() {
  if (activeDrawHandler) {
    activeDrawHandler.disable();
    activeDrawHandler = null;
  }
  document.getElementById('btn-draw-rect')?.classList.remove('active');
  document.getElementById('btn-draw-poly')?.classList.remove('active');
}

// ─── Helpers ─────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getLayerLatLngs(layer) {
  if (!layer) return [];
  if (typeof layer.getLatLngs === 'function') {
    let lls = layer.getLatLngs();
    while (Array.isArray(lls) && lls.length > 0 && Array.isArray(lls[0])) {
      lls = lls[0];
    }
    return Array.isArray(lls) ? lls : [];
  }
  return [];
}

function buildAOIData(latlngs, type) {
  const center = getCenter(latlngs);
  const bounds = getBounds(latlngs);
  const areaKm2 = calculateAreaKm2(latlngs);

  return {
    center,
    bounds,
    area: formatArea(areaKm2),
    areaKm2,
    type: type || 'polygon',
    coordinates: latlngs.map((ll) => [ll.lat, ll.lng]),
  };
}

