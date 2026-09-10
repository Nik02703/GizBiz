/**
 * Loading Stages — Pipeline-style loading indicator.
 */

const STAGES = [
  { id: 'acquire', label: 'Acquiring satellite imagery' },
  { id: 'prepare', label: 'Preparing image for analysis' },
  { id: 'understand', label: 'Understanding query intent' },
  { id: 'analyze', label: 'Running AI analysis' },
  { id: 'evidence', label: 'Generating evidence report' },
];

let currentStageIndex = -1;
let stageInterval = null;

/**
 * Show the loading stages animation.
 * @param {HTMLElement} container
 */
export function showLoading(container) {
  container.innerHTML = `
    <div class="loading-overlay visible" id="loading-overlay">
      ${STAGES.map(
        (stage, i) => `
        <div class="loading-stage" id="stage-${stage.id}" data-index="${i}">
          <div class="stage-indicator" id="indicator-${stage.id}"></div>
          <span>${stage.label}</span>
        </div>
      `
      ).join('')}
    </div>
  `;

  currentStageIndex = -1;
  advanceStage();

  // Auto-advance stages for visual effect
  stageInterval = setInterval(() => {
    if (currentStageIndex < STAGES.length - 1) {
      advanceStage();
    }
  }, 1500);
}

/**
 * Advance to the next loading stage.
 */
function advanceStage() {
  // Mark previous as done
  if (currentStageIndex >= 0) {
    const prevStage = STAGES[currentStageIndex];
    const prevEl = document.getElementById(`stage-${prevStage.id}`);
    const prevIndicator = document.getElementById(`indicator-${prevStage.id}`);
    if (prevEl) {
      prevEl.classList.remove('active');
      prevEl.classList.add('done');
    }
    if (prevIndicator) prevIndicator.innerHTML = '✓';
  }

  currentStageIndex++;

  if (currentStageIndex < STAGES.length) {
    const stage = STAGES[currentStageIndex];
    const el = document.getElementById(`stage-${stage.id}`);
    const indicator = document.getElementById(`indicator-${stage.id}`);
    if (el) el.classList.add('active');
    if (indicator) indicator.innerHTML = '<div class="stage-spinner"></div>';
  }
}

/**
 * Hide the loading stages and clean up.
 * @param {HTMLElement} container
 */
export function hideLoading(container) {
  if (stageInterval) {
    clearInterval(stageInterval);
    stageInterval = null;
  }

  // Mark all as done briefly
  STAGES.forEach((stage) => {
    const el = document.getElementById(`stage-${stage.id}`);
    const indicator = document.getElementById(`indicator-${stage.id}`);
    if (el) {
      el.classList.remove('active');
      el.classList.add('done');
    }
    if (indicator) indicator.innerHTML = '✓';
  });

  setTimeout(() => {
    container.innerHTML = '';
  }, 500);
}
