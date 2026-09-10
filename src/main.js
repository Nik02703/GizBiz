/**
 * SatQuery AI — Main Application Entry Point
 *
 * Wires together all components, services, and event handling
 * for the end-to-end satellite intelligence workflow.
 */

import { renderNavbar, updateAIStatus } from './components/Navbar.js';
import { initMap, clearAOI, flyTo, setRectangleAOI, getMap, getMapElement, ensureSatelliteView, displayHighlights, clearHighlights, focusHighlight, toggleHighlightsVisibility, displayOSMData, toggleOSMLayer, clearOSMData, getOSMStats, startDrawingRectangle, startDrawingPolygon, cancelDrawing } from './components/MapView.js';
import { renderAOIPanel } from './components/AOIPanel.js';
import { renderAnalysisPanel, showAnalysisError, setAnalyzeEnabled } from './components/AnalysisPanel.js';
import { renderResults, clearResults } from './components/ResultsPanel.js';
import { renderHistoryPanel, toggleHistoryDrawer } from './components/HistoryPanel.js';
import { renderDemoSelector, DEMO_LOCATIONS } from './components/DemoSelector.js';
import { renderImagePreview } from './components/ImagePreview.js';
import { showLoading, hideLoading } from './components/LoadingStages.js';
import { preloadThemeTransitionVideo } from './components/ThemeTransition.js';

import { checkHealth, analyzeImage } from './services/apiClient.js';
import { queryOSMData } from './services/osmClient.js';
import { captureFromMap, acquireFromSentinel } from './services/satelliteService.js';
import { saveToHistory } from './services/historyService.js';
import { reverseGeocode } from './utils/geoUtils.js';
import { fileToDataUrl, resizeImage } from './utils/imageUtils.js';

// ─── Application State ──────────────────────────────────────

const state = {
  aoi: null,
  imageSource: 'map', // 'map' | 'sentinel' | 'upload'
  uploadedImage: null, // { dataUrl, blob, file }
  capturedImage: null, // { dataUrl, blob }
  sentinelImage: null, // { dataUrl, metadata }
  sentinelPreset: 'true_color', // 'true_color' | 'false_color' | 'ndvi' | 'swir'
  isFetchingSentinel: false,
  sentinelError: null,
  currentResult: null,
  aiAvailable: false,
  aiProvider: 'none',
  isAnalyzing: false,
  osm: {
    isLoading: false,
    error: null,
    data: null,
    selectedFeatures: new Set(['buildings', 'roads', 'water', 'waterways', 'railways', 'pois']),
    layerVisibility: {
      buildings: true,
      roads: true,
      water: true,
      waterways: true,
      railways: true,
      pois: true,
    },
  },
};

// ─── DOM References ──────────────────────────────────────────

const els = {
  navbar: null,
  aoiPanel: null,
  analysisPanel: null,
  resultsPanel: null,
  historyDrawer: null,
  demoModal: null,
  loadingContainer: null,
};

// ─── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Cache DOM elements
  els.navbar = document.getElementById('navbar');
  els.aoiPanel = document.getElementById('aoi-panel');
  els.analysisPanel = document.getElementById('analysis-panel');
  els.resultsPanel = document.getElementById('results-panel');
  els.historyDrawer = document.getElementById('history-drawer');
  els.demoModal = document.getElementById('demo-modal');

  // Theme Management
  const savedTheme = localStorage.getItem('satquery_theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  // Preload theme transition video for instant playback
  preloadThemeTransitionVideo();

  // Render navbar
  renderNavbar(els.navbar, {
    initialTheme: savedTheme,
    onDemoClick: handleDemoClick,
    onHistoryClick: handleHistoryClick,
    onThemeToggle: (newTheme) => {
      if (newTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      localStorage.setItem('satquery_theme', newTheme);
    },
  });

  // Initialize map
  initMap('map', {
    onAOISelected: handleAOISelected,
    onAOICleared: handleAOICleared,
  });

  // Render initial panels
  updateAOIPanel();
  renderAnalysisPanelFull();

  // Check AI health
  updateAIStatus('checking', '');
  const health = await checkHealth();
  state.aiAvailable = health.ai?.available || false;
  state.aiProvider = health.ai?.provider || 'none';
  updateAIStatus(
    state.aiAvailable ? 'online' : 'offline',
    state.aiProvider
  );

  // Re-render analysis panel with updated AI status
  renderAnalysisPanelFull();
});

// ─── Event Handlers ──────────────────────────────────────────

function updateAOIPanel() {
  renderAOIPanel(
    els.aoiPanel,
    state.aoi,
    () => {
      clearAOI();
      handleAOICleared();
    },
    handleZoomToAOI,
    {
      osmState: state.osm,
      onFetchOSM: handleFetchOSM,
      onToggleLayer: handleToggleOSMLayer,
      onClearOSM: handleClearOSM,
      onStartDrawRect: () => startDrawingRectangle(),
      onStartDrawPoly: () => startDrawingPolygon(),
    }
  );
}

function handleAOISelected(aoi) {
  state.aoi = aoi;
  state.osm.data = null;
  state.osm.error = null;
  state.sentinelImage = null;
  state.sentinelError = null;
  clearOSMData();
  updateAOIPanel();
  renderAnalysisPanelFull();
}

function handleZoomToAOI() {
  if (!state.aoi) return;
  const mapInstance = getMap();
  if (mapInstance && state.aoi.coordinates?.length >= 2 && window.L) {
    const latLngs = state.aoi.coordinates.map(([lat, lng]) => window.L.latLng(lat, lng));
    const bounds = window.L.latLngBounds(latLngs);
    mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }
}

function handleAOICleared() {
  state.aoi = null;
  state.capturedImage = null;
  state.osm.data = null;
  state.osm.error = null;
  clearOSMData();
  updateAOIPanel();
  renderAnalysisPanelFull();
}

async function handleFetchOSM(features) {
  if (!state.aoi) return;

  state.osm.isLoading = true;
  state.osm.error = null;
  state.osm.selectedFeatures = new Set(features);
  updateAOIPanel();

  try {
    const result = await queryOSMData({
      aoi: state.aoi,
      features,
    });

    state.osm.data = result;
    state.osm.isLoading = false;

    // Display on the map
    displayOSMData(result);
    updateAOIPanel();
  } catch (err) {
    console.error('[SatQuery] OSM query failed:', err.message);
    state.osm.isLoading = false;
    state.osm.error = err.message || 'Failed to retrieve geographic vector data.';
    updateAOIPanel();
  }
}

function handleToggleOSMLayer(category, visible) {
  state.osm.layerVisibility[category] = visible;
  toggleOSMLayer(category, visible);
  updateAOIPanel();
}

function handleClearOSM() {
  state.osm.data = null;
  state.osm.error = null;
  clearOSMData();
  updateAOIPanel();
}

function handleDemoClick() {
  renderDemoSelector(els.demoModal, handleDemoLocationSelected);
}

function handleHistoryClick() {
  renderHistoryPanel(
    els.historyDrawer,
    handleHistoryEntrySelected,
    () => toggleHistoryDrawer()
  );
  toggleHistoryDrawer();
}

async function handleDemoLocationSelected(location) {
  // Fly to location
  ensureSatelliteView();
  flyTo(location.center[0], location.center[1], location.zoom);

  // Wait for map to settle, then set AOI
  setTimeout(() => {
    setRectangleAOI(location.bounds);
  }, 1800);
}

function handleHistoryEntrySelected(entry) {
  // Restore the result
  state.currentResult = entry.result;
  renderResults(els.resultsPanel, entry.result, entry.imageThumbnail);

  // Close history
  toggleHistoryDrawer();

  // Fly to AOI if available
  if (entry.aoi && entry.aoi.center) {
    flyTo(entry.aoi.center.lat, entry.aoi.center.lng, 14);
  }
}

async function handleImageUpload(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    const resized = await resizeImage(dataUrl, 1024, 0.85);

    state.uploadedImage = {
      dataUrl: resized.dataUrl,
      blob: resized.blob,
      file,
    };

    renderAnalysisPanelFull();
  } catch (err) {
    showAnalysisError(`Failed to load image: ${err.message}`);
  }
}

function handleSourceChange(source) {
  state.imageSource = source;
  renderAnalysisPanelFull();
}

async function handleSentinelAcquire(preset = state.sentinelPreset) {
  if (!state.aoi) {
    state.sentinelError = 'Please draw or select an Area of Interest on the map first.';
    renderAnalysisPanelFull();
    return;
  }

  state.isFetchingSentinel = true;
  state.sentinelError = null;
  state.sentinelPreset = preset;
  renderAnalysisPanelFull();

  try {
    const res = await acquireFromSentinel(state.aoi, { preset });
    state.sentinelImage = res;
    state.isFetchingSentinel = false;
    renderAnalysisPanelFull();
  } catch (err) {
    console.error('[Sentinel Acquire Error]:', err.message);
    state.isFetchingSentinel = false;
    state.sentinelError = err.message || 'Failed to acquire Sentinel-2 satellite image.';
    renderAnalysisPanelFull();
  }
}

function handleSentinelPresetChange(preset) {
  state.sentinelPreset = preset;
  renderAnalysisPanelFull();
  if (state.aoi && state.sentinelImage) {
    handleSentinelAcquire(preset);
  }
}

// ─── Analysis Flow ───────────────────────────────────────────

async function handleAnalyze({ query }) {
  // Validation
  if (!query || query.trim().length === 0) {
    showAnalysisError('Please enter a question about the satellite image.');
    return;
  }

  if (state.imageSource === 'map' && !state.aoi) {
    showAnalysisError('Please select an Area of Interest on the map first.');
    return;
  }

  if (state.imageSource === 'sentinel' && !state.aoi) {
    showAnalysisError('Please select an Area of Interest on the map first.');
    return;
  }

  if (state.imageSource === 'upload' && !state.uploadedImage) {
    showAnalysisError('Please upload a satellite image first.');
    return;
  }

  if (!state.aiAvailable) {
    showAnalysisError('AI service is not available. Check your API key in .env and restart the server.');
    return;
  }

  if (state.isAnalyzing) return;
  state.isAnalyzing = true;

  // Clear previous results and map highlights
  clearResults(els.resultsPanel);
  clearHighlights();
  setAnalyzeEnabled(false);

  // Show loading stages
  const loadingContainer = document.getElementById('loading-stages');
  showLoading(loadingContainer);

  try {
    let imageData = null;

    if (state.imageSource === 'sentinel') {
      // If Sentinel image isn't acquired yet, fetch it automatically
      if (!state.sentinelImage) {
        const res = await acquireFromSentinel(state.aoi, { preset: state.sentinelPreset });
        state.sentinelImage = res;
      }
      imageData = {
        imageFile: null,
        imageBase64: state.sentinelImage.dataUrl,
      };
    } else if (state.imageSource === 'upload' && state.uploadedImage) {
      imageData = {
        imageFile: state.uploadedImage.blob,
        imageBase64: null,
      };
    } else {
      // Ensure the selected AOI is within the viewport before capture
      if (state.imageSource === 'map' && state.aoi) {
        const mapInstance = getMap();
        if (mapInstance && state.aoi.coordinates?.length >= 2 && window.L) {
          const latLngs = state.aoi.coordinates.map(([lat, lng]) => window.L.latLng(lat, lng));
          const bounds = window.L.latLngBounds(latLngs);
          const mapBounds = mapInstance.getBounds();

          // Calculate size of AOI on screen
          const points = state.aoi.coordinates.map(([lat, lng]) =>
            mapInstance.latLngToContainerPoint(window.L.latLng(lat, lng))
          );
          const w = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
          const h = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));

          if (!mapBounds.contains(bounds) || w < 160 || h < 120) {
            mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: false });
            // Wait for Leaflet to render tiles at the new bounds
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
      }

      // Capture map view cropped to selected Area of Interest
      const mapEl = getMapElement();
      const mapInstance = getMap();
      const captured = await captureFromMap(mapEl, state.aoi, mapInstance);
      state.capturedImage = captured;
      imageData = {
        imageFile: null,
        imageBase64: captured.dataUrl,
      };
    }

    // Call AI analysis
    const result = await analyzeImage({
      imageFile: imageData.imageFile,
      imageBase64: imageData.imageBase64,
      query: query.trim(),
      aoi: state.aoi,
    });

    state.currentResult = result;

    // Get the image URL for display
    const imageUrl = state.imageSource === 'upload'
      ? state.uploadedImage.dataUrl
      : state.imageSource === 'sentinel'
      ? state.sentinelImage?.dataUrl
      : state.capturedImage?.dataUrl;

    // Hide loading
    hideLoading(loadingContainer);

    // Render results
    setTimeout(() => {
      renderResults(els.resultsPanel, result, imageUrl, {
        onHighlightClick: (idx) => focusHighlight(idx),
        onToggleHighlights: (visible) => toggleHighlightsVisibility(visible),
      });

      // Display AI highlights directly on the map if present
      if (result.highlights && result.highlights.length > 0 && state.aoi) {
        displayHighlights(result.highlights, state.aoi);
      }
    }, 600);

    // Save to history
    let locationName = 'Unknown';
    if (state.aoi?.center) {
      locationName = await reverseGeocode(state.aoi.center.lat, state.aoi.center.lng);
    }

    // Create a small thumbnail for history
    let thumbnail = null;
    if (imageUrl) {
      try {
        const resized = await resizeImage(imageUrl, 200, 0.5);
        thumbnail = resized.dataUrl;
      } catch {
        // Non-critical
      }
    }

    saveToHistory({
      query: query.trim(),
      location: locationName,
      result,
      imageThumbnail: thumbnail,
      aoi: state.aoi,
    });

  } catch (err) {
    hideLoading(loadingContainer);
    console.error('Analysis failed:', err);
    showAnalysisError(err.message || 'Analysis failed. Please try again.');
  } finally {
    state.isAnalyzing = false;
    setAnalyzeEnabled(true);
  }
}

// ─── Render Helpers ──────────────────────────────────────────

function renderAnalysisPanelFull() {
  const imagePreviewUrl =
    state.imageSource === 'sentinel'
      ? state.sentinelImage?.dataUrl
      : state.imageSource === 'upload'
      ? state.uploadedImage?.dataUrl
      : null;

  renderAnalysisPanel(els.analysisPanel, {
    hasAOI: !!state.aoi,
    aiAvailable: state.aiAvailable,
    imageSource: state.imageSource,
    imagePreviewUrl,
    sentinelState: {
      image: state.sentinelImage,
      preset: state.sentinelPreset,
      isLoading: state.isFetchingSentinel,
      error: state.sentinelError,
    },
    onAnalyze: handleAnalyze,
    onImageUpload: handleImageUpload,
    onSourceChange: handleSourceChange,
    onSentinelAcquire: handleSentinelAcquire,
    onSentinelPresetChange: handleSentinelPresetChange,
  });
}

