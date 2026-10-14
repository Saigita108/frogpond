const cameraModeKey = 'frog-pond:camera-mode';
const cameraModes = ['follow', 'look'];

export function loadCameraMode() {
  try {
    const saved = localStorage.getItem(cameraModeKey);
    return cameraModes.includes(saved) ? saved : 'follow';
  } catch {
    return 'follow';
  }
}

export function mountCameraToggle(app, initialMode, onChange) {
  const toggle = document.createElement('div');
  toggle.className = 'camera-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Camera angle');
  toggle.innerHTML = `
    <button type="button" data-mode="follow" title="The camera stays behind the frog">Follow</button>
    <button type="button" data-mode="look" title="Scroll or drag to look around the frog">Look around</button>
  `;
  app.appendChild(toggle);

  const buttons = toggle.querySelectorAll('[data-mode]');

  function selectMode(mode) {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
  }

  function setMode(mode) {
    selectMode(mode);
    try {
      localStorage.setItem(cameraModeKey, mode);
    } catch {
      // Storage can be unavailable; the choice just won't be remembered.
    }
    onChange(mode);
  }

  for (const button of buttons) {
    button.addEventListener('click', (event) => {
      setMode(button.dataset.mode);
      // A mouse click shouldn't leave focus here, or the frog's keys would be ignored.
      if (event.detail > 0) button.blur();
    });
  }

  selectMode(initialMode);
  return setMode;
}
