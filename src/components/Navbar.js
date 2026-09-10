/**
 * Navbar Component
 * Featuring interactive Day/Storm theme transitions, animated celestial
 * bodies (sun flight & moon rise), and hanging upside-down bats.
 */

import { playThemeTransition } from './ThemeTransition.js';

export function renderNavbar(container, { onDemoClick, onHistoryClick, onThemeToggle, initialTheme = 'light' }) {
  let currentTheme = initialTheme;
  let isAnimating = false;

  container.innerHTML = `


    <!-- Brand / Interactive Celestial Logo -->
    <div class="nav-brand">
      <div class="nav-logo">
        <div class="nav-sun-cloud-logo" id="nav-logo-toggle" role="button" tabindex="0" title="Click to toggle Day / Storm Dark Mode" aria-label="Toggle Day / Storm Dark Mode">
          <!-- Buttery Smooth Sun Runner (100% Aligned with Logo Sun) -->
          <div class="nav-sun-runner" id="nav-sun-runner" aria-hidden="true">
            <svg class="sun-runner-svg" width="48" height="48" viewBox="0 0 100 100">
              <defs>
                <radialGradient id="sunRunnerGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#fffbeb"/>
                  <stop offset="45%" stop-color="#fde047"/>
                  <stop offset="85%" stop-color="#f59e0b"/>
                  <stop offset="100%" stop-color="#d97706"/>
                </radialGradient>
              </defs>
              <circle cx="62" cy="38" r="22" fill="url(#sunRunnerGlow)" class="sun-body"/>
              <g class="sun-rays" stroke="#f59e0b" stroke-width="3.2" stroke-linecap="round">
                <line x1="62" y1="10" x2="62" y2="3"/>
                <line x1="82" y1="18" x2="87" y2="13"/>
                <line x1="90" y1="38" x2="97" y2="38"/>
                <line x1="82" y1="58" x2="87" y2="63"/>
                <line x1="42" y1="18" x2="37" y2="13"/>
              </g>
            </svg>
          </div>

          <svg class="sun-peaking-svg" width="48" height="48" viewBox="0 0 100 100">
            <defs>
              <!-- Sun Gradient -->
              <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#fffbeb"/>
                <stop offset="45%" stop-color="#fde047"/>
                <stop offset="85%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#d97706"/>
              </radialGradient>

              <!-- Moon Gradient (Lunar Glow & Texture) -->
              <radialGradient id="moonGlow" cx="42%" cy="40%" r="58%">
                <stop offset="0%" stop-color="#ffffff"/>
                <stop offset="45%" stop-color="#f1f5f9"/>
                <stop offset="78%" stop-color="#cbd5e1"/>
                <stop offset="100%" stop-color="#94a3b8"/>
              </radialGradient>

              <!-- Moon Moonlight Halo -->
              <radialGradient id="moonHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(224, 242, 254, 0.7)"/>
                <stop offset="50%" stop-color="rgba(186, 230, 253, 0.35)"/>
                <stop offset="100%" stop-color="rgba(186, 230, 253, 0)"/>
              </radialGradient>

              <linearGradient id="cloudGradDarkLogo" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#475569"/>
                <stop offset="55%" stop-color="#334155"/>
                <stop offset="100%" stop-color="#1e293b"/>
              </linearGradient>

              <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(14, 165, 233, 0.25)"/>
              </filter>
            </defs>

            <!-- Glowing Moon (Peeking prominently above-right of cloud in Dark Mode) -->
            <g class="peaking-moon-group" id="peaking-moon-group">
              <circle cx="68" cy="30" r="32" fill="url(#moonHalo)" class="moon-halo-pulse"/>
              <circle cx="68" cy="30" r="23" fill="url(#moonGlow)" class="moon-body"/>
              <!-- Crescent shadow to create a glowing crescent moon -->
              <circle cx="61" cy="27" r="19" fill="rgba(15, 23, 42, 0.5)" class="moon-shadow-crescent"/>
              <!-- Moon Craters -->
              <circle cx="78" cy="24" r="3.2" fill="#94a3b8" opacity="0.6"/>
              <circle cx="83" cy="33" r="3.6" fill="#94a3b8" opacity="0.55"/>
              <circle cx="75" cy="40" r="2.8" fill="#94a3b8" opacity="0.5"/>
              <circle cx="82" cy="18" r="2" fill="#e2e8f0" opacity="0.8"/>
              <!-- Little Twinkling Night Star -->
              <path d="M92,16 L94,11 L96,16 L101,18 L96,20 L94,25 L92,20 L87,18 Z" fill="#f8fafc" opacity="0.95" class="moon-sparkle"/>
            </g>

            <!-- Sun peaking out (upper-right) -->
            <g class="peaking-sun-group" id="peaking-sun-group">
              <circle cx="62" cy="38" r="22" fill="url(#sunGlow)" class="sun-body"/>
              <g class="sun-rays" stroke="#f59e0b" stroke-width="3" stroke-linecap="round">
                <line x1="62" y1="10" x2="62" y2="3"/>
                <line x1="82" y1="18" x2="87" y2="13"/>
                <line x1="90" y1="38" x2="97" y2="38"/>
                <line x1="82" y1="58" x2="87" y2="63"/>
                <line x1="42" y1="18" x2="37" y2="13"/>
              </g>
            </g>

            <!-- Illustrated Vector Cloud in front (Matching Reference with Organic Puffy Bottoms) -->
            <g filter="url(#softShadow)" class="nav-logo-cloud-wrap">
              <!-- Base Body in Soft Pastel Sky Blue -->
              <path class="nav-logo-cloud-path" d="M 22,70 C 12,70 4,62 4,52 C 4,43 11,36 20,35 C 23,22 35,14 48,14 C 62,14 74,24 76,38 C 85,39 92,46 92,55 C 92,64 84,70 74,70 C 66,74 52,74 44,68 C 36,74 26,74 22,70 Z" fill="#d2eeff"/>
              <!-- Crisp Pure White Top Crest Highlight -->
              <path class="nav-logo-cloud-crest" d="M 20,35 C 23,22 35,14 48,14 C 62,14 74,24 76,38 C 74,39 68,38 64,32 C 56,20 40,20 32,30 C 28,34 22,35 20,35 Z" fill="#ffffff"/>
              <!-- Inner Crescent Accent -->
              <path class="nav-logo-cloud-inner" d="M 26,42 C 34,36 48,36 56,42 C 46,44 36,44 26,42 Z" fill="#ffffff" opacity="0.85"/>
            </g>
          </svg>
        </div>
        <div class="nav-title-group">
          <span class="nav-logo-text">SatQuery <span class="nav-logo-badge">AI</span></span>
          <span class="nav-tagline">Satellite Intelligence Platform</span>
        </div>
      </div>
    </div>

    <!-- Actions & Controls -->
    <div class="nav-actions">
      <!-- Dedicated Theme Switch Button -->
      <button class="nav-btn btn-sunny btn-theme-toggle" id="btn-theme-toggle" title="Toggle Day / Storm Dark Mode" aria-label="Toggle Dark Mode">
        <span class="theme-btn-icon" id="theme-btn-icon">☀️</span>
        <span class="theme-btn-label" id="theme-btn-label">Dark Mode</span>
      </button>

      <div class="nav-status" id="ai-status">
        <span class="status-dot checking" id="status-dot"></span>
        <span id="status-text">Checking...</span>
      </div>

      <button class="nav-btn btn-sunny" id="btn-demo" title="Demo Mode">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Demo
      </button>

      <button class="nav-btn btn-sunny" id="btn-history" title="Analysis History">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        History
      </button>
    </div>
  `;

  const sunRunner = document.getElementById('nav-sun-runner');
  const peakingSun = document.getElementById('peaking-sun-group');
  const peakingMoon = document.getElementById('peaking-moon-group');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const logoToggle = document.getElementById('nav-logo-toggle');
  const themeBtnIcon = document.getElementById('theme-btn-icon');
  const themeBtnLabel = document.getElementById('theme-btn-label');

  // Set initial UI state
  syncThemeUI(currentTheme);

  function syncThemeUI(theme) {
    if (theme === 'dark') {
      themeBtnIcon.textContent = '🌙';
      themeBtnLabel.textContent = 'Light Mode';
      peakingSun.classList.add('sun-hidden');
      peakingMoon.classList.add('moon-visible');
    } else {
      themeBtnIcon.textContent = '☀️';
      themeBtnLabel.textContent = 'Dark Mode';
      peakingSun.classList.remove('sun-hidden');
      peakingMoon.classList.remove('moon-visible');
    }
  }

  function handleToggle() {
    if (isAnimating) return;
    isAnimating = true;

    const targetTheme = currentTheme === 'light' ? 'dark' : 'light';

    playThemeTransition({
      targetTheme,
      onSwitch: (theme) => {
        if (theme === 'dark') {
          // Transitioning: Light -> Dark
          // 1. Launch sun runner from logo across navbar to far right
          sunRunner.classList.remove('flying-left');
          sunRunner.classList.add('flying-right');
          peakingSun.classList.add('sun-hidden');

          // 2. Trigger theme transition immediately at string pull
          currentTheme = 'dark';
          if (onThemeToggle) onThemeToggle('dark');

          // 3. Moon gently rises behind cloud
          setTimeout(() => {
            peakingMoon.classList.add('moon-visible');
          }, 400);

          // 4. Update toggle button state
          syncThemeUI('dark');

          // 5. Complete celestial flight sequence
          setTimeout(() => {
            sunRunner.classList.remove('flying-right');
          }, 2450);
        } else {
          // Transitioning: Dark -> Light
          // 1. Sun runner flies back in from right across navbar
          sunRunner.classList.remove('flying-right');
          sunRunner.classList.add('flying-left');
          peakingMoon.classList.remove('moon-visible');

          // 2. Transition theme back to daytime sky blue
          currentTheme = 'light';
          if (onThemeToggle) onThemeToggle('light');

          // 3. Update toggle button state
          syncThemeUI('light');

          // 4. Once sun arrives home, dock back behind cloud
          setTimeout(() => {
            peakingSun.classList.remove('sun-hidden');
            sunRunner.classList.remove('flying-left');
          }, 2250);
        }
      },
      onComplete: () => {
        isAnimating = false;
      }
    });
  }

  // Event Listeners
  themeToggleBtn.addEventListener('click', handleToggle);
  logoToggle.addEventListener('click', handleToggle);
  logoToggle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  });

  document.getElementById('btn-demo').addEventListener('click', onDemoClick);
  document.getElementById('btn-history').addEventListener('click', onHistoryClick);
}

/**
 * Update the AI status indicator.
 * @param {'online'|'offline'|'checking'} status
 * @param {string} providerName
 */
export function updateAIStatus(status, providerName) {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  if (!dot || !text) return;

  dot.className = 'status-dot';

  switch (status) {
    case 'online':
      dot.classList.add('online');
      text.textContent = 'AI Online';
      break;
    case 'offline':
      dot.classList.add('offline');
      text.textContent = 'AI Offline';
      break;
    case 'checking':
      dot.classList.add('checking');
      text.textContent = 'Checking...';
      break;
  }
}

