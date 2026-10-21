const eatenKey = 'frog-pond:fireflies-eaten';

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

// A little firefly: two wings, a head and a tail that glows once it has been eaten.
const fireflyIcon = `
  <svg class="firefly-meter-dot" viewBox="0 0 16 20" aria-hidden="true">
    <ellipse class="firefly-meter-wing" cx="4.6" cy="7.5" rx="3.4" ry="5" transform="rotate(-24 4.6 7.5)" />
    <ellipse class="firefly-meter-wing" cx="11.4" cy="7.5" rx="3.4" ry="5" transform="rotate(24 11.4 7.5)" />
    <circle class="firefly-meter-head" cx="8" cy="4" r="2.2" />
    <ellipse class="firefly-meter-tail" cx="8" cy="12.5" rx="3" ry="5" />
  </svg>
`;

export function mountFireflyMeter(app, max, initialCount) {
  // A wide card with the count on top and a row of fireflies, one per firefly to eat.
  const meter = document.createElement('div');
  meter.className = 'firefly-meter';
  meter.setAttribute('role', 'meter');
  meter.setAttribute('aria-label', 'Fireflies eaten');
  meter.setAttribute('aria-valuemin', '0');
  meter.setAttribute('aria-valuemax', String(max));
  meter.innerHTML = `
    <div class="firefly-meter-top">
      <span class="firefly-meter-label">Fireflies eaten</span>
      <span class="firefly-meter-score">
        <span class="firefly-meter-count"></span><span class="firefly-meter-total">/ ${max}</span>
      </span>
    </div>
    <div class="firefly-meter-row">${fireflyIcon.repeat(max)}</div>
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
    // The newest firefly flares up as it lights.
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
