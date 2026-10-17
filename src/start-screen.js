import { formatTime } from './night.js'

// The start screen, which is also the pause menu: Continue, Restart, and the level choice.
// levels: { key: { name, nightLength (seconds, or null for no clock), detail } }
export function mountStartScreen(app, levels, { onPlay, onContinue }) {
  const screen = document.createElement('section');
  screen.className = 'start-screen';
  screen.setAttribute('aria-labelledby', 'start-title');
  screen.hidden = true;

  const cards = Object.entries(levels).map(([key, level], index) => `
    <button type="button" class="start-level" data-level="${key}">
      <span class="start-level-top">
        <span class="start-level-name">${level.name}</span>
      </span>
      <span class="start-level-time">${level.nightLength ? formatTime(level.nightLength) : 'no limit'}</span>
      <span class="start-level-detail">${level.detail}</span>
      <span class="start-level-best"></span>
    </button>
  `).join('');

  screen.innerHTML = `
    <div class="start-panel">
      <p class="start-kicker">A night in the swamp</p>
      <h1 class="start-title" id="start-title">Frog Pond</h1>
      <p class="start-tagline">Catch 10 fireflies with your tongue before the sun comes up.</p>
      <div class="start-resume">
        <button type="button" class="start-continue">Continue</button>
      </div>
      <h2 class="start-choose">Choose a level</h2>
      <div class="start-levels">${cards}</div>
    </div>
  `;
  app.appendChild(screen);

  const resume = screen.querySelector('.start-resume');
  const continueButton = screen.querySelector('.start-continue');
  const levelButtons = screen.querySelectorAll('.start-level');
  let current = null;

  continueButton.addEventListener('click', () => onContinue());
  for (const button of levelButtons) {
    button.addEventListener('click', () => onPlay(button.dataset.level));
  }
  // Escape continues the game when there is one to continue.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !screen.hidden && current) {
      event.preventDefault();
      onContinue();
    }
  });

  return {
    // current: the level of a night that can be continued, or null.
    // bests: { level: best time in seconds, or null }.
    show({ current: level, bests }) {
      current = level;
      resume.hidden = !level;
      for (const button of levelButtons) {
        const key = button.dataset.level;
        button.classList.toggle('is-current', key === level);
        const best = bests[key];
        button.querySelector('.start-level-best').textContent = best === null || best === undefined
          ? ''
          : `Best ${formatTime(best)}`;
      }
      screen.hidden = false;
      (level ? continueButton : levelButtons[0]).focus({ preventScroll: true });
    },
    hide() {
      screen.hidden = true;
      // Leave no focus behind, or the frog's keys would be ignored.
      if (screen.contains(document.activeElement)) document.activeElement.blur();
    }
  };
}
