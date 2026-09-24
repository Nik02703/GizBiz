/**
 * SatQuery AI — Main Application Entry Point
 *
 * Wires together all components, services, and event handling
 * for the end-to-end satellite intelligence workflow.
 */

import { renderNavbar, updateAIStatus } from './components/Navbar.js';
import { initMap, clearAOI, flyTo, setRectangleAOI, getMap, getMapElement, ensureSatelliteView, displayHighlights, clearHighlights, focusHighlight, toggleHighlightsVisibility, displayOSMData, toggleOSMLayer, clearOSMData, getOSMStats, startDrawingRectangle, startDrawingPolygon, cancelDrawing, setSearchLocationMarker, clearSearchLocationMarker } from './components/MapView.js';
import { renderAOIPanel } from './components/AOIPanel.js';
import { renderAnalysisPanel, showAnalysisError, setAnalyzeEnabled } from './components/AnalysisPanel.js';
import { renderResults, clearResults } from './components/ResultsPanel.js';
import { renderHistoryPanel, toggleHistoryDrawer } from './components/HistoryPanel.js';
import { renderDemoSelector, DEMO_LOCATIONS } from './components/DemoSelector.js';
import { renderImagePreview } from './components/ImagePreview.js';
import { showLoading, hideLoading } from './components/LoadingStages.js';
import { preloadThemeTransitionVideo } from './components/ThemeTransition.js';
import { initLocationSearch } from './components/LocationSearch.js';

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
  uploadMode: 'bitemporal', // 'single' | 'bitemporal'
  uploadedImage: null, // { dataUrl, blob, file, name, size, date }
  bitemporal: {
    image1: null, // { dataUrl, blob, file, name, size, date }
    image2: null, // { dataUrl, blob, file, name, size, date }
  },
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

  // Initialize location search bar on the map
  initLocationSearch(handleSearchLocationSelected, () => {
    clearSearchLocationMarker();
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

/**
 * Handle a location selected from the search bar.
 * Flies the map to the geocoded coordinates and drops a pin.
 */
function handleSearchLocationSelected(location) {
  const mapInstance = getMap();
  if (!mapInstance) return;

  ensureSatelliteView();

  // If the result has bounds, fit to them; otherwise fly to the point
  if (location.bounds) {
    const bounds = window.L.latLngBounds(
      window.L.latLng(location.bounds[0][0], location.bounds[0][1]),
      window.L.latLng(location.bounds[1][0], location.bounds[1][1])
    );
    mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  } else {
    flyTo(location.lat, location.lng, 14);
  }

  // Drop high-visibility search location pin
  setSearchLocationMarker(location.lat, location.lng, location.name, location.fullName);
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

async function handleImageUpload(file, slot = 'single') {
  try {
    const dataUrl = await fileToDataUrl(file);
    const resized = await resizeImage(dataUrl, 1024, 0.85);

    const imageObj = {
      dataUrl: resized.dataUrl,
      blob: resized.blob,
      file,
      name: file.name,
      size: file.size,
      date: slot === 'image1' ? (state.bitemporal.image1?.date || '2021-03-15')
          : slot === 'image2' ? (state.bitemporal.image2?.date || '2024-03-15')
          : (state.uploadedImage?.date || new Date().toISOString().split('T')[0]),
    };

    if (slot === 'image1') {
      state.bitemporal.image1 = imageObj;
    } else if (slot === 'image2') {
      state.bitemporal.image2 = imageObj;
    } else {
      state.uploadedImage = imageObj;
    }

    renderAnalysisPanelFull();
  } catch (err) {
    showAnalysisError(`Failed to load image: ${err.message}`);
  }
}

function handleImageClear(slot = 'single') {
  if (slot === 'image1') {
    state.bitemporal.image1 = null;
  } else if (slot === 'image2') {
    state.bitemporal.image2 = null;
  } else {
    state.uploadedImage = null;
  }
  renderAnalysisPanelFull();
}

function handleDateChange(slot, date) {
  if (slot === 'image1') {
    if (state.bitemporal.image1) state.bitemporal.image1.date = date;
    else state.bitemporal.image1 = { date };
  } else if (slot === 'image2') {
    if (state.bitemporal.image2) state.bitemporal.image2.date = date;
    else state.bitemporal.image2 = { date };
  } else if (slot === 'single') {
    if (state.uploadedImage) state.uploadedImage.date = date;
  }
  renderAnalysisPanelFull();
}

function handleUploadModeChange(mode) {
  state.uploadMode = mode;
  renderAnalysisPanelFull();
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

  if (state.imageSource === 'upload') {
    if (state.uploadMode === 'bitemporal') {
      if (!state.bitemporal.image1 || !state.bitemporal.image2) {
        showAnalysisError('Please upload both satellite images (T1 baseline and T2 recent) for bi-temporal sensing.');
        return;
      }
    } else {
      if (!state.uploadedImage) {
        showAnalysisError('Please upload a satellite image first.');
        return;
      }
    }
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
    let result = null;
    let imageUrl = null;
    let bitemporalData = null;

    if (state.imageSource === 'upload' && state.uploadMode === 'bitemporal') {
      const img1 = state.bitemporal.image1;
      const img2 = state.bitemporal.image2;
      bitemporalData = {
        image1Url: img1.dataUrl,
        image2Url: img2.dataUrl,
        date1: img1.date || '2021-03-15',
        date2: img2.date || '2024-03-15',
      };
      imageUrl = img2.dataUrl;

      result = await analyzeImage({
        isBitemporal: true,
        image1File: img1.blob,
        date1: bitemporalData.date1,
        image2File: img2.blob,
        date2: bitemporalData.date2,
        query: query.trim(),
        aoi: state.aoi,
      });
    } else if (state.imageSource === 'upload' && state.uploadedImage) {
      imageUrl = state.uploadedImage.dataUrl;
      result = await analyzeImage({
        imageFile: state.uploadedImage.blob,
        imageBase64: null,
        query: query.trim(),
        aoi: state.aoi,
      });
    } else if (state.imageSource === 'sentinel') {
      if (!state.sentinelImage) {
        const res = await acquireFromSentinel(state.aoi, { preset: state.sentinelPreset });
        state.sentinelImage = res;
      }
      imageUrl = state.sentinelImage.dataUrl;
      result = await analyzeImage({
        imageFile: null,
        imageBase64: state.sentinelImage.dataUrl,
        query: query.trim(),
        aoi: state.aoi,
      });
    } else {
      // Map view capture
      const mapEl = getMapElement();
      const mapInstance = getMap();
      const captured = await captureFromMap(mapEl, state.aoi, mapInstance);
      state.capturedImage = captured;
      imageUrl = captured.dataUrl;
      result = await analyzeImage({
        imageFile: null,
        imageBase64: captured.dataUrl,
        query: query.trim(),
        aoi: state.aoi,
      });
    }

    state.currentResult = result;

    // Hide loading
    hideLoading(loadingContainer);

    // Render results
    setTimeout(() => {
      renderResults(els.resultsPanel, result, imageUrl, {
        onHighlightClick: (idx) => focusHighlight(idx),
        onToggleHighlights: (visible) => toggleHighlightsVisibility(visible),
      }, bitemporalData);

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
      ? (state.uploadMode === 'bitemporal'
          ? (state.bitemporal.image2?.dataUrl || state.bitemporal.image1?.dataUrl)
          : state.uploadedImage?.dataUrl)
      : null;

  renderAnalysisPanel(els.analysisPanel, {
    hasAOI: !!state.aoi,
    aiAvailable: state.aiAvailable,
    imageSource: state.imageSource,
    uploadMode: state.uploadMode,
    uploadedImage: state.uploadedImage,
    bitemporalState: state.bitemporal,
    imagePreviewUrl,
    sentinelState: {
      image: state.sentinelImage,
      preset: state.sentinelPreset,
      isLoading: state.isFetchingSentinel,
      error: state.sentinelError,
    },
    onAnalyze: handleAnalyze,
    onImageUpload: handleImageUpload,
    onImageClear: handleImageClear,
    onDateChange: handleDateChange,
    onUploadModeChange: handleUploadModeChange,
    onSourceChange: handleSourceChange,
    onSentinelAcquire: handleSentinelAcquire,
    onSentinelPresetChange: handleSentinelPresetChange,
  });
}

