/**
 * Demo Selector — Modal with preset demo locations for the college presentation.
 */

export const DEMO_LOCATIONS = [
  {
    id: 'vadodara',
    name: 'Vadodara',
    region: 'Gujarat, India',
    description: 'Mixed urban core, roads & civic landmarks',
    center: [22.3072, 73.1812],
    zoom: 14,
    bounds: [[22.298, 73.180], [22.315, 73.198]],
  },
  {
    id: 'ahmedabad',
    name: 'Ahmedabad',
    region: 'Gujarat, India',
    description: 'Sabarmati riverfront & urban grid',
    center: [23.0225, 72.5714],
    zoom: 14,
    bounds: [[23.015, 72.565], [23.030, 72.580]],
  },
  {
    id: 'delhi',
    name: 'New Delhi',
    region: 'NCR, India',
    description: 'Dense urban core, Connaught Place & green zones',
    center: [28.6289, 77.2180],
    zoom: 14,
    bounds: [[28.620, 77.210], [28.638, 77.228]],
  },
  {
    id: 'mumbai',
    name: 'Mumbai',
    region: 'Maharashtra, India',
    description: 'Coastal urban infrastructure & Bandra',
    center: [19.0600, 72.8350],
    zoom: 14,
    bounds: [[19.050, 72.825], [19.070, 72.845]],
  },
  {
    id: 'bengaluru',
    name: 'Bengaluru',
    region: 'Karnataka, India',
    description: 'Tech corridors, Cubbon Park & road grid',
    center: [12.9716, 77.5946],
    zoom: 14,
    bounds: [[12.965, 77.585], [12.980, 77.605]],
  },
];

/**
 * Render the demo selector modal.
 *
 * @param {HTMLElement} container
 * @param {Function} onSelect - Called with demo location object
 */
export function renderDemoSelector(container, onSelect) {
  container.innerHTML = `
    <div class="demo-dialog">
      <div class="demo-dialog-title">Demo Mode</div>
      <div class="demo-dialog-desc">
        Select a preset location to explore satellite analysis without external API dependencies.
      </div>
      <div class="demo-locations">
        ${DEMO_LOCATIONS.map(
          (loc) => `
          <div class="demo-location-card" data-id="${loc.id}">
            <div class="demo-location-name">${loc.name}</div>
            <div class="demo-location-region">${loc.region}</div>
            <div class="demo-location-desc">${loc.description}</div>
          </div>
        `
        ).join('')}
      </div>
      <button class="demo-close-btn" id="demo-close">Cancel</button>
    </div>
  `;

  container.classList.add('visible');

  // Location card clicks
  container.querySelectorAll('.demo-location-card').forEach((card) => {
    card.addEventListener('click', () => {
      const loc = DEMO_LOCATIONS.find((l) => l.id === card.dataset.id);
      if (loc && onSelect) {
        container.classList.remove('visible');
        onSelect(loc);
      }
    });
  });

  // Close button
  document.getElementById('demo-close')?.addEventListener('click', () => {
    container.classList.remove('visible');
  });

  // Click outside to close
  container.addEventListener('click', (e) => {
    if (e.target === container) {
      container.classList.remove('visible');
    }
  });
}

/**
 * Show the demo modal.
 */
export function showDemoModal() {
  document.getElementById('demo-modal')?.classList.add('visible');
}

/**
 * Hide the demo modal.
 */
export function hideDemoModal() {
  document.getElementById('demo-modal')?.classList.remove('visible');
}
