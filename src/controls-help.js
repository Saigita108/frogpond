export function mountControlsHelp(app) {
  const menu = document.createElement('div');
  menu.className = 'controls-help';
  menu.innerHTML = `
    <button class="info-button" type="button" aria-label="Show pond controls"
      aria-expanded="false" aria-controls="controls-panel">i</button>
    <section class="controls-panel" id="controls-panel" aria-label="Pond controls" hidden>
      <div class="controls-panel-top">
        <div class="device-toggle" role="group" aria-label="Choose shortcut guide">
          <button type="button" data-device="trackpad" aria-pressed="true">Trackpad</button>
          <button type="button" data-device="mouse" aria-pressed="false">Mouse</button>
        </div>
        <button class="close-button" type="button" aria-label="Close pond controls">×</button>
      </div>
      <h2>Explore the pond</h2>
      <p class="controls-intro">Move around or make a little splash.</p>
      <dl class="shortcut-list"></dl>
      <p class="controls-footer">Press <kbd>Esc</kbd> to close</p>
    </section>
  `;
  app.appendChild(menu);

  const infoButton = menu.querySelector('.info-button');
  const panel = menu.querySelector('.controls-panel');
  const deviceButtons = menu.querySelectorAll('[data-device]');
  const shortcuts = menu.querySelector('.shortcut-list');
  const guides = {
    trackpad: [
      ['Rotate', 'Slide two fingers across the trackpad.'],
      ['Zoom', 'Pinch two fingers together or apart.'],
      ['Make ripples', 'Click on the water.'],
      ['Frog jump', 'Press <kbd>Space</kbd>.'],
      ['Frog walk', 'Hold <kbd>W</kbd> / <kbd>↑</kbd> to walk forward, <kbd>S</kbd> / <kbd>↓</kbd> to walk backward.'],
      ['Frog turn', 'Hold <kbd>A</kbd> / <kbd>←</kbd> or <kbd>D</kbd> / <kbd>→</kbd>.'],
      ['Pan', 'Hold <kbd>Shift</kbd> and click-drag.']
    ],
    mouse: [
      ['Rotate', 'Hold the middle mouse button and drag.'],
      ['Pan', 'Hold <kbd>Shift</kbd> and drag with the left mouse button.'],
      ['Zoom', 'Scroll the mouse wheel up or down.'],
      ['Frog jump', 'Press <kbd>Space</kbd>.'],
      ['Frog walk', 'Hold <kbd>W</kbd> / <kbd>↑</kbd> to walk forward, <kbd>S</kbd> / <kbd>↓</kbd> to walk backward.'],
      ['Frog turn', 'Hold <kbd>A</kbd> / <kbd>←</kbd> or <kbd>D</kbd> / <kbd>→</kbd>.'],
      ['Make ripples', 'Left-click on the water.']
    ]
  };

  function selectDevice(device) {
    for (const button of deviceButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.device === device));
    }
    shortcuts.innerHTML = guides[device]
      .map(([action, gesture]) => `<div><dt>${action}</dt><dd>${gesture}</dd></div>`)
      .join('');
  }

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
    menu.querySelector('[aria-pressed="true"]').focus();
  });
  menu.querySelector('.close-button').addEventListener('click', () => closeMenu(true));
  for (const button of deviceButtons) {
    button.addEventListener('click', () => selectDevice(button.dataset.device));
  }
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });

  selectDevice('trackpad');
}
