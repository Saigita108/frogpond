// A round radar with the frog in the middle, facing up: fireflies within range show as yellow dots.
const size = 140;
const ringStep = 5; // meters between the faint distance rings

export function mountRadar(app, range) {
  const radar = document.createElement('div');
  radar.className = 'radar';
  radar.setAttribute('role', 'img');
  radar.innerHTML = `
    <canvas width="${size}" height="${size}"></canvas>
    <span class="radar-label">Fireflies within ${range} m</span>
  `;
  app.appendChild(radar);

  const canvas = radar.querySelector('canvas');
  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let lastLabel = '';

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * ratio;
    canvas.height = size * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const center = size / 2;
  const radius = center - 4;

  function drawBackground() {
    const pad = context.createRadialGradient(center * 0.9, center * 0.8, 0, center, center, radius);
    pad.addColorStop(0, '#24452f');
    pad.addColorStop(1, '#12271c');
    context.fillStyle = pad;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();

    // Distance rings and a cross through the frog.
    context.strokeStyle = '#3f6145';
    context.lineWidth = 1;
    for (let meters = ringStep; meters < range; meters += ringStep) {
      context.beginPath();
      context.arc(center, center, radius * meters / range, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(center, center - radius);
    context.lineTo(center, center + radius);
    context.moveTo(center - radius, center);
    context.lineTo(center + radius, center);
    context.stroke();
  }

  // A slow sweep, like a real radar.
  function drawSweep(time) {
    if (reducedMotion.matches) return;
    const angle = (time / 2500) * Math.PI * 2;
    const sweep = context.createConicGradient(angle, center, center);
    sweep.addColorStop(0, '#a9c79f00');
    sweep.addColorStop(0.9, '#a9c79f00');
    sweep.addColorStop(1, '#a9c79f40');
    context.fillStyle = sweep;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
  }

  function drawFrog() {
    // A small arrow: the frog always faces the top of the radar.
    context.fillStyle = '#9fd38a';
    context.strokeStyle = '#12271c';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(center, center - 7);
    context.lineTo(center + 5.5, center + 5);
    context.lineTo(center, center + 2);
    context.lineTo(center - 5.5, center + 5);
    context.closePath();
    context.fill();
    context.stroke();
  }

  // frog: { x, z, heading }; fireflies: [{ x, z, alpha }] in world meters.
  return function updateRadar(frog, fireflies) {
    context.clearRect(0, 0, size, size);
    drawBackground();
    drawSweep(performance.now());

    // Turn world offsets into the frog's view: forward is up, the frog's right is right.
    const sin = Math.sin(frog.heading);
    const cos = Math.cos(frog.heading);
    let inRange = 0;
    context.fillStyle = '#ffe27a';
    context.shadowColor = '#ffc94a';
    context.shadowBlur = 8;
    for (const firefly of fireflies) {
      const dx = firefly.x - frog.x;
      const dz = firefly.z - frog.z;
      const forward = dx * sin + dz * cos;
      const right = -dx * cos + dz * sin;
      if (Math.hypot(forward, right) > range) continue;
      inRange += 1;
      context.globalAlpha = firefly.alpha;
      context.beginPath();
      context.arc(center + right / range * radius, center - forward / range * radius, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.shadowBlur = 0;

    drawFrog();
    context.strokeStyle = '#5d8a5c';
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.stroke();

    const label = `${inRange} ${inRange === 1 ? 'firefly' : 'fireflies'} within ${range} meters`;
    if (label !== lastLabel) {
      radar.setAttribute('aria-label', `Radar: ${label}`);
      lastLabel = label;
    }
  };
}
