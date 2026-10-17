// Bigger screens get a bigger interface. The buttons, cards and panels are designed for a
// 1440 × 900 window; on larger screens they grow with it (whichever side is tighter decides),
// up to maxScale. Smaller screens keep the designed size and their own compact layouts.
// CSS reads the factor as --ui-scale (see "INTERFACE SCALE" in style.css).
const designWidth = 1440;
const designHeight = 900;
const maxScale = 1.8;

export function uiScale() {
  const fit = Math.min(window.innerWidth / designWidth, window.innerHeight / designHeight);
  return Math.min(Math.max(fit, 1), maxScale);
}

export function applyUiScale() {
  const update = () => document.documentElement.style.setProperty('--ui-scale', uiScale().toFixed(3));
  update();
  window.addEventListener('resize', update);
}
