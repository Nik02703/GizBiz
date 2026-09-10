/**
 * Theme Transition Component
 * Plays the character pulling the string animation (mode_change.mp4)
 * rendered in a compact corner widget with real-time black removal (no background)
 * so the character floats directly over the UI.
 */

let isTransitioning = false;
let preloadedVideo = null;

/**
 * Preload the transition video on page load for instant zero-lag playback.
 */
export function preloadThemeTransitionVideo() {
  if (preloadedVideo) return;
  preloadedVideo = document.createElement('video');
  preloadedVideo.src = '/mode_change.mp4';
  preloadedVideo.preload = 'auto';
  preloadedVideo.muted = true;
  preloadedVideo.load();
}

/**
 * Play the corner theme transition animation.
 *
 * @param {Object} options
 * @param {'light'|'dark'} options.targetTheme - The theme being switched to
 * @param {Function} options.onSwitch - Called at the exact moment string is pulled
 * @param {Function} options.onComplete - Called when the entire animation finishes
 */
export function playThemeTransition({ targetTheme, onSwitch, onComplete }) {
  if (isTransitioning) return;
  isTransitioning = true;

  // Clean up any existing widget
  const oldWidget = document.getElementById('theme-corner-widget');
  if (oldWidget) oldWidget.remove();

  // Create corner widget container
  const widget = document.createElement('div');
  widget.id = 'theme-corner-widget';
  widget.className = 'theme-corner-widget';
  widget.title = 'Click to skip animation';

  widget.innerHTML = `
    <svg width="0" height="0" style="position:absolute;width:0;height:0;pointer-events:none;opacity:0;">
      <defs>
        <filter id="remove-black-bg" color-interpolation-filters="sRGB">
          <feColorMatrix type="matrix" values="
            1   0   0   0   0
            0   1   0   0   0
            0   0   1   0   0
            3.5 3.5 3.5 0  -0.35
          "/>
        </filter>
      </defs>
    </svg>
    <div class="theme-corner-inner">
      <video id="theme-corner-video" class="theme-corner-video" playsinline preload="auto">
        <source src="/mode_change.mp4" type="video/mp4">
      </video>
      <div id="theme-pull-spark" class="theme-pull-spark"></div>
      <button class="theme-corner-close" id="theme-corner-close" title="Dismiss animation">✕</button>
    </div>
  `;

  document.body.appendChild(widget);

  const video = widget.querySelector('#theme-corner-video');
  const spark = widget.querySelector('#theme-pull-spark');
  const closeBtn = widget.querySelector('#theme-corner-close');

  let hasSwitched = false;
  let hasCleanedUp = false;
  let rafId = null;

  // Watchdog safety timeout (12s)
  const safetyTimeout = setTimeout(() => {
    cleanup();
  }, 12000);

  function doSwitch() {
    if (hasSwitched) return;
    hasSwitched = true;

    if (onSwitch) {
      onSwitch(targetTheme);
    }

    // Trigger spark burst effect at pull point
    if (spark) {
      spark.classList.add('spark-active');
      setTimeout(() => {
        spark.classList.remove('spark-active');
      }, 400);
    }
  }

  function cleanup() {
    if (hasCleanedUp) return;
    hasCleanedUp = true;
    clearTimeout(safetyTimeout);
    if (rafId) cancelAnimationFrame(rafId);

    doSwitch(); // Ensure theme is definitely switched if not already

    widget.classList.remove('active');
    widget.classList.add('fade-out');

    setTimeout(() => {
      video.pause();
      widget.remove();
      isTransitioning = false;
      if (onComplete) onComplete();
    }, 350);
  }

  // Exact frame timing check (spark happens at 5.75s in original video)
  function checkProgress() {
    if (hasCleanedUp) return;

    if (!hasSwitched && video.currentTime >= 5.72) {
      doSwitch();
    }

    // Character has fully retreated by 9.1s
    if (video.currentTime >= 9.1) {
      cleanup();
      return;
    }

    rafId = requestAnimationFrame(checkProgress);
  }

  // Playback rate: 1.25x for brisk, dynamic pacing
  video.playbackRate = 1.25;

  // Audio setup: unmuted with gentle volume, gracefully fallback to muted if blocked
  video.muted = false;
  video.volume = 0.75;

  // Trigger entrance animation
  void widget.offsetWidth;
  widget.classList.add('active');

  const playPromise = video.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        rafId = requestAnimationFrame(checkProgress);
      })
      .catch(() => {
        video.muted = true;
        video.play()
          .then(() => {
            rafId = requestAnimationFrame(checkProgress);
          })
          .catch(() => {
            cleanup();
          });
      });
  }

  video.addEventListener('ended', cleanup);
  video.addEventListener('error', cleanup);

  // Close / skip button
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });

  // Clicking widget dismisses
  setTimeout(() => {
    widget.addEventListener('click', () => {
      cleanup();
    });
  }, 250);
}
