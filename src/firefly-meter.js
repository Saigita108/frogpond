const eatenKey = 'frog-pond:fireflies-eaten';
// The dial sweeps 270°, from bottom left (0) to bottom right (max).
const sweep = 270;
const center = 60;
const padRadius = 56;
const dotRadius = 46;

export function loadFirefliesEaten(max) {
  try {
    const saved = Number(localStorage.getItem(eatenKey));
    return Number.isInteger(saved) ? Math.min(Math.max(saved, 0), max) : 0;
  } catch {
    return 0;
  }
}

export function saveFirefliesEaten(count) {
  try {
    localStorage.setItem(eatenKey, String(count));
  } catch {
    // Storage can be unavailable; the count just won't be remembered.
  }
}

// A point on the dial, at an angle in degrees clockwise from straight up.
function dialPoint(angle, distance) {
  const radians = angle * Math.PI / 180;
  return [center + Math.sin(radians) * distance, center - Math.cos(radians) * distance]
    .map((value) => value.toFixed(2));
}

// A lily pad with its notch at the bottom, where the ring of fireflies leaves a gap.
function lilyPadPath() {
  const notch = 9;
  const [leftX, leftY] = dialPoint(180 + notch, padRadius);
  const [rightX, rightY] = dialPoint(180 - notch, padRadius);
  return `M ${center} ${center + 22} L ${leftX} ${leftY} A ${padRadius} ${padRadius} 0 1 1 ${rightX} ${rightY} Z`;
}

export function mountFireflyMeter(app, max, initialCount) {
  // Veins fan out from the middle of the pad, skipping the notch.
  const veins = [-150, -110, -70, -30, 10, 50, 90, 130]
    .map((angle) => {
      const [x, y] = dialPoint(angle, padRadius - 6);
      return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" />`;
    })
    .join('');
  // One dot per firefly around the edge; it lights up once that firefly is eaten.
  const dots = Array.from({ length: max }, (_, index) => {
    const angle = -sweep / 2 + sweep * index / Math.max(max - 1, 1);
    const [x, y] = dialPoint(angle, dotRadius);
    return `<circle class="firefly-meter-dot" cx="${x}" cy="${y}" r="2.6" />`;
  }).join('');

  const meter = document.createElement('div');
  meter.className = 'firefly-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Fireflies eaten');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(max));
  meter.innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="firefly-meter-pad" cx="45%" cy="40%" r="65%">
          <stop offset="0" stop-color="#3d6b45" />
          <stop offset="1" stop-color="#1c3a29" />
        </radialGradient>
        <filter id="firefly-meter-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path class="firefly-meter-pad" d="${lilyPadPath()}" />
      <g class="firefly-meter-veins">${veins}</g>
      <circle class="firefly-meter-hollow" cx="${center}" cy="${center}" r="26" />
      <g class="firefly-meter-dots">${dots}</g>
      <text class="firefly-meter-count" x="${center}" y="${center + 4}"></text>
      <text class="firefly-meter-total" x="${center}" y="${center + 17}">of ${max}</text>
    </svg>
    <span class="firefly-meter-label">Fireflies eaten</span>
  `;
  app.appendChild(meter);

  const dotElements = meter.querySelectorAll('.firefly-meter-dot');
  const countText = meter.querySelector('.firefly-meter-count');
  let shownCount = initialCount;

  function setCount(count) {
    dotElements.forEach((dot, index) => {
      dot.classList.toggle('is-lit', index < count);
      dot.classList.remove('is-new');
    });
    // The newest firefly flares up as it joins the ring.
    if (count > shownCount && dotElements[count - 1]) {
      const dot = dotElements[count - 1];
      dot.getBoundingClientRect();
      dot.classList.add('is-new');
    }
    shownCount = count;
    countText.textContent = String(count);
    meter.setAttribute('aria-valuenow', String(count));
  }

  setCount(initialCount);
  return setCount;
}
