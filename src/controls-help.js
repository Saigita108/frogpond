export function mountControlsHelp(app) {
  const menu = document.createElement('div');
  menu.className = 'controls-help';
  menu.innerHTML = `
    <button class="info-button" type="button" aria-label="Show swamp controls"
      aria-expanded="false" aria-controls="controls-panel">i</button>
    <section class="controls-panel" id="controls-panel" aria-label="Swamp controls" hidden>
      <div class="controls-panel-top">
        <h2>Explore the swamp</h2>
        <button class="close-button" type="button" aria-label="Close swamp controls">×</button>
      </div>
      <p class="controls-intro">Eat 10 of the 20 fireflies before the sun comes up. The night starts when you first move, and the camera follows your frog. <b>Menu</b> (top right) pauses the game and lets you restart or change level.</p>
      <dl class="shortcut-list"></dl>
    </section>
  `;
  app.appendChild(menu);

  const infoButton = menu.querySelector('.info-button');
  const panel = menu.querySelector('.controls-panel');
  const shortcuts = menu.querySelector('.shortcut-list');
  // The game is played with a keyboard and a trackpad.
  const controls = [
    ['Walk', 'Hold <kbd>W</kbd> / <kbd>↑</kbd> to walk forward, <kbd>S</kbd> / <kbd>↓</kbd> to walk backward.'],
    ['Run', 'Double-tap <kbd>W</kbd> / <kbd>↑</kbd> and hold the second press to run at twice the speed. In the water the frog swims twice as fast.'],
    ['Turn', 'Hold <kbd>A</kbd> / <kbd>←</kbd> or <kbd>D</kbd> / <kbd>→</kbd>. The camera swings around with the frog.'],
    ['Jump', 'Press <kbd>Space</kbd> to hop forward, onto lily pads, logs and rocks.'],
    ['Rain', 'Use the <b>Rain</b> switch in the bottom right to turn the rain, lightning and their sound on or off.'],
    ['Eat', 'Press <kbd>F</kbd> to flick your tongue. It catches a firefly up to 1.5 meters away, anywhere roughly in front of the frog.'],
    ['Zoom', 'Pinch two fingers together or apart.'],
    ['Look around', 'Pick <b>Look around</b> at the top left, then swipe with two fingers to swing the camera around the frog. Press <kbd>Esc</kbd> to go back to <b>Follow</b>.'],
  ];
  shortcuts.innerHTML = controls
    .map(([action, gesture]) => `<div><dt>${action}</dt><dd>${gesture}</dd></div>`)
    .join('');

  function closeMenu(restoreFocus = false) {
    panel.hidden = true;
    infoButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus) infoButton.focus();
  }

  infoButton.addEventListener('click', () => {
    if (!panel.hidden) {
      closeMenu();
      return;
    }
    panel.hidden = false;
    infoButton.setAttribute('aria-expanded', 'true');
    menu.querySelector('.close-button').focus();
  });
  menu.querySelector('.close-button').addEventListener('click', () => closeMenu(true));
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });
}
