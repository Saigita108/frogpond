// Race the night: the chosen level, the clock until sunrise, best times and the end-of-night card.
const levelKey = 'frog-pond:level';
const nightTimeKey = 'frog-pond:night-time';
const bestTimeKey = (level) => `frog-pond:best-time:${level}`;

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
// Fastest winning time on a level, or null before the first win there.
export const loadBestTime = (level) => loadNumber(bestTimeKey(level));
export const saveBestTime = (level, seconds) => saveNumber(bestTimeKey(level), seconds);

// The level being played (one of the keys of levels), or null before the first game.
export function loadLevel(levels) {
  try {
    const saved = localStorage.getItem(levelKey);
    return saved !== null && Object.hasOwn(levels, saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveLevel(level) {
  try {
    localStorage.setItem(levelKey, level);
  } catch {
    // Storage can be unavailable; the level just won't be remembered.
  }
}

export function formatTime(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

// The pill at the top: time left until sunrise and a bar that fills as the night passes.
export function mountNightClock(app) {
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

  // state: 'demo', 'waiting', 'running', 'won', 'sunrise' or 'exploded'.
  return function setClock(nightTime, state, nightLength) {
    const demo = state === 'demo';
    const timeLeft = demo ? 'Demo' : formatTime(nightLength - nightTime);
    const text = {
      demo: 'free play, no clock',
      waiting: 'Move to start the night',
      running: 'until sunrise',
      won: 'You won',
      sunrise: 'You lost: sunrise',
      exploded: 'You lost'
    }[state];
    const key = `${timeLeft}|${text}`;
    if (key === shown) return;
    shown = key;
    timeText.textContent = timeLeft;
    label.textContent = text;
    const progress = demo ? 0 : Math.min(nightTime / nightLength, 1);
    bar.style.clipPath = `inset(0 ${100 - progress * 100}% 0 0)`;
    // The last 30 seconds (15 on the one-minute level) glow as a warning.
    const lateFrom = Math.min(30, nightLength / 4);
    clock.classList.toggle('is-late', state === 'running' && nightLength - nightTime <= lateFrom);
  };
}

// The card that ends a night, with Play again and Menu buttons.
export function mountEndCard(app, onPlayAgain, onMenu) {
  const card = document.createElement('section');
  card.className = 'end-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-labelledby', 'end-card-title');
  card.hidden = true;
  card.innerHTML = `
    <h2 id="end-card-title"></h2>
    <p class="end-card-result"></p>
    <p class="end-card-best"></p>
    <div class="end-card-actions">
      <button type="button" class="end-card-button">Play again</button>
      <button type="button" class="end-card-menu">Menu</button>
    </div>
  `;
  app.appendChild(card);

  const title = card.querySelector('h2');
  const result = card.querySelector('.end-card-result');
  const best = card.querySelector('.end-card-best');
  const button = card.querySelector('.end-card-button');
  button.addEventListener('click', onPlayAgain);
  card.querySelector('.end-card-menu').addEventListener('click', onMenu);

  return {
    // outcome: 'won', 'sunrise' or 'exploded'.
    show({ result: outcome, eaten, total, time, bestTime, newBest }) {
      title.textContent = {
        won: 'You won! Feast complete',
        sunrise: 'You lost: the sun is up',
        exploded: 'Kaboom! You lost'
      }[outcome];
      result.textContent = {
        won: `You ate ${total} fireflies in ${formatTime(time)}.`,
        sunrise: `You ate ${eaten} of ${total} fireflies before sunrise.`,
        exploded: `Your frog hopped off the edge of the swamp and exploded, with ${eaten} of ${total} fireflies eaten.`
      }[outcome];
      if (newBest) best.textContent = 'New best time!';
      else if (bestTime !== null) best.textContent = `Best time: ${formatTime(bestTime)}`;
      else best.textContent = `Eat ${total} before sunrise to set a best time.`;
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
