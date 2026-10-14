// Race the night: the clock until sunrise, the best time, and the end-of-night card.
const nightTimeKey = 'frog-pond:night-time';
const bestTimeKey = 'frog-pond:best-time';

function loadNumber(key) {
  try {
    const saved = localStorage.getItem(key);
    const value = saved === null ? NaN : Number(saved);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function saveNumber(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable; the night just won't be remembered.
  }
}

// Seconds of the current night that have passed (0 when it hasn't started).
export const loadNightTime = () => loadNumber(nightTimeKey) ?? 0;
export const saveNightTime = (seconds) => saveNumber(nightTimeKey, seconds);
// Fastest time to eat every firefly, or null before the first win.
export const loadBestTime = () => loadNumber(bestTimeKey);
export const saveBestTime = (seconds) => saveNumber(bestTimeKey, seconds);

export function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// The pill at the top: time left until sunrise and a bar that fills as the night passes.
export function mountNightClock(app, nightLength) {
  const clock = document.createElement('div');
  clock.className = 'night-clock';
  clock.setAttribute('role', 'timer');
  clock.setAttribute('aria-label', 'Time until sunrise');
  clock.innerHTML = `
    <svg class="night-clock-moon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 15.2A9 9 0 0 1 15.5 3.5Z" />
    </svg>
    <div class="night-clock-body">
      <div class="night-clock-text">
        <span class="night-clock-time"></span>
        <span class="night-clock-label"></span>
      </div>
      <div class="night-clock-bar"><span></span></div>
    </div>
  `;
  app.appendChild(clock);

  const timeText = clock.querySelector('.night-clock-time');
  const label = clock.querySelector('.night-clock-label');
  const bar = clock.querySelector('.night-clock-bar span');
  let shown = null;

  return function setClock(nightTime, state) {
    const timeLeft = formatTime(nightLength - nightTime);
    const text = {
      waiting: 'Move to start the night',
      running: 'until sunrise',
      won: 'Feast complete',
      sunrise: 'The sun is up'
    }[state];
    const key = `${timeLeft}|${text}`;
    if (key === shown) return;
    shown = key;
    timeText.textContent = timeLeft;
    label.textContent = text;
    bar.style.clipPath = `inset(0 ${100 - Math.min(nightTime / nightLength, 1) * 100}% 0 0)`;
    // The last 30 seconds glow as a warning.
    clock.classList.toggle('is-late', state === 'running' && nightLength - nightTime <= 30);
  };
}

// The card that ends a night, with a Play again button.
export function mountEndCard(app, onPlayAgain) {
  const card = document.createElement('section');
  card.className = 'end-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'end-card-title');
  card.hidden = true;
  card.innerHTML = `
    <h2 id="end-card-title"></h2>
    <p class="end-card-result"></p>
    <p class="end-card-best"></p>
    <button type="button" class="end-card-button">Play again</button>
  `;
  app.appendChild(card);

  const title = card.querySelector('h2');
  const result = card.querySelector('.end-card-result');
  const best = card.querySelector('.end-card-best');
  const button = card.querySelector('button');
  button.addEventListener('click', onPlayAgain);

  return {
    show({ won, eaten, total, time, bestTime, newBest }) {
      title.textContent = won ? 'Feast complete!' : 'The sun is up';
      result.textContent = won
        ? `You ate all ${total} fireflies in ${formatTime(time)}.`
        : `You ate ${eaten} of ${total} fireflies before sunrise.`;
      if (newBest) best.textContent = 'New best time!';
      else if (bestTime !== null) best.textContent = `Best time: ${formatTime(bestTime)}`;
      else best.textContent = `Eat all ${total} before sunrise to set a best time.`;
      best.classList.toggle('is-new', newBest);
      card.hidden = false;
      // Focus the button so Enter or Space plays again (the frog ignores keys while it has focus).
      button.focus();
    },
    hide() {
      card.hidden = true;
    }
  };
}
