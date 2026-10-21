// The demo's coach: a card that walks the player through the controls and the goal, one step
// at a time. Each step watches what the frog does (the practice stats from main.js), fills a
// progress bar, and moves on by itself once it is done. Every step can be skipped.

// Practice stats (all counted since the page opened, so each step compares with its start):
// forward, backward, swum (meters), turned (radians), running (seconds), jumps, eaten,
// startles, nearestFirefly (meters), cameraMode ('follow' or 'look').
const grow = (key, goal) => (stats, start) => (stats[key] - start[key]) / goal;

const steps = [
  {
    title: 'Look around',
    text: 'Pick <b>Look around</b> at the top left, then swipe with two fingers to swing the camera around your frog. Pinch to zoom.',
    highlight: '.camera-toggle',
    progress: (stats) => (stats.cameraMode === 'look' ? 1 : 0)
  },
  {
    title: 'Back to Follow',
    text: 'Press <kbd>Esc</kbd> or pick <b>Follow</b> to put the camera back behind your frog.',
    highlight: '.camera-toggle',
    progress: (stats) => (stats.cameraMode === 'follow' ? 1 : 0)
  },
  {
    title: 'Walk',
    text: 'Hold <kbd>W</kbd> or <kbd>↑</kbd> to hop forward.',
    progress: grow('forward', 3)
  },
  {
    title: 'Turn',
    text: 'Hold <kbd>A</kbd> / <kbd>←</kbd> or <kbd>D</kbd> / <kbd>→</kbd> to turn. The camera swings around with you.',
    progress: grow('turned', Math.PI)
  },
  {
    title: 'Walk backward',
    text: 'Hold <kbd>S</kbd> or <kbd>↓</kbd> to back up.',
    progress: grow('backward', 1.5)
  },
  {
    title: 'Run',
    text: 'Double-tap <kbd>W</kbd> or <kbd>↑</kbd> and keep holding the second press to run at twice the speed.',
    progress: grow('running', 2)
  },
  {
    title: 'Jump',
    text: 'Press <kbd>Space</kbd> to hop forward. Jumps get you onto lily pads, logs and rocks.',
    progress: grow('jumps', 1)
  },
  {
    title: 'Swim',
    text: 'Hop into a pond and swim. Ponds slow you down, so double-tap <kbd>W</kbd> to swim faster. You can eat fireflies in the water too.',
    progress: grow('swum', 2)
  },
  {
    title: 'Find a firefly',
    text: 'The <b>radar</b> shows fireflies within 20 m as yellow dots. The arrow is you, so a dot above it is straight ahead. Walk to one.',
    highlight: '.radar',
    // Fills as you close in, done within 2.5 m.
    progress: (stats, start) => {
      if (stats.nearestFirefly <= 2.5) return 1;
      const from = Math.max(start.nearestFirefly, 3);
      return Number.isFinite(from) ? (from - stats.nearestFirefly) / (from - 2.5) : 0;
    }
  },
  {
    title: 'Eat it',
    text: 'Face the firefly and press <kbd>F</kbd> when it is within 1.5 m. Your tongue does the aiming. The <b>lily pad</b> lights up a dot for each one you eat.',
    highlight: '.firefly-meter',
    progress: grow('eaten', 1)
  },
  {
    title: 'Shh, stay quiet',
    text: 'Your frog listens through the microphone. A loud sound, like a clap or a shout, startles it: it hops three times in fright and is too shocked to eat for 5 seconds. So keep it down, especially near the edge!',
    // Nothing to do here: Got it moves on (or startling the frog to try it out).
    acknowledge: 'Got it',
    // In the demo, loud sounds only startle the frog from this step on.
    introducesSound: true,
    progress: grow('startles', 1)
  },
  {
    title: 'The goal',
    text: '1. In a real level, eat <b>10 fireflies</b> before the <b>clock</b> at the top runs out and the sun comes up. </br> 2. Stay away from the edge of the swamp: touching it blows your frog up. </br> 3. Want to refresh the info? Click the <b>i</b> button in the top right.',
    highlight: '.night-clock, .firefly-meter, .info-button',
    final: true
  }
];

// How long a finished step stays on screen with its tick before the next one.
const doneDelay = 1200;

export function mountTutorial(app, { onChooseLevel }) {
  const card = document.createElement('section');
  card.className = 'coach';
  card.setAttribute('aria-live', 'polite');
  card.hidden = true;
  card.innerHTML = `
    <div class="coach-top">
      <span class="coach-step"></span>
      <button type="button" class="coach-skip">Skip</button>
      <button type="button" class="coach-close" aria-label="Close the tutorial">×</button>
    </div>
    <h2 class="coach-title"></h2>
    <p class="coach-text"></p>
    <div class="coach-progress"><span></span></div>
    <div class="coach-actions">
      <button type="button" class="coach-play">Choose a level</button>
      <button type="button" class="coach-practice">Keep practicing</button>
    </div>
  `;
  app.appendChild(card);

  const stepLabel = card.querySelector('.coach-step');
  const title = card.querySelector('.coach-title');
  const text = card.querySelector('.coach-text');
  const bar = card.querySelector('.coach-progress span');
  const skip = card.querySelector('.coach-skip');
  let index = -1;
  let start = null;
  let latest = null;
  let done = false;
  let doneTimer = null;

  // A mouse click shouldn't leave focus on a button, or the frog's keys would be ignored.
  const onClick = (button, action) => button.addEventListener('click', (event) => {
    action();
    if (event.detail > 0) button.blur();
  });
  onClick(skip, () => showStep(index + 1));
  onClick(card.querySelector('.coach-close'), () => stop());
  onClick(card.querySelector('.coach-practice'), () => stop());
  onClick(card.querySelector('.coach-play'), () => {
    stop();
    onChooseLevel();
  });

  function setHighlight(selector) {
    for (const element of document.querySelectorAll('.coach-highlight')) {
      element.classList.remove('coach-highlight');
    }
    if (!selector) return;
    for (const element of document.querySelectorAll(selector)) element.classList.add('coach-highlight');
  }

  function showStep(next) {
    clearTimeout(doneTimer);
    if (next >= steps.length) {
      stop();
      return;
    }
    index = next;
    const step = steps[index];
    if (step.introducesSound) soundIntroduced = true;
    start = latest && { ...latest };
    done = false;
    stepLabel.textContent = `Step ${index + 1} of ${steps.length}`;
    title.textContent = step.title;
    text.innerHTML = step.text;
    bar.style.width = '0%';
    card.classList.remove('is-done');
    card.classList.toggle('is-final', Boolean(step.final));
    skip.hidden = Boolean(step.final);
    skip.textContent = step.acknowledge ?? 'Skip';
    card.classList.toggle('is-info', Boolean(step.acknowledge));
    setHighlight(step.highlight);
  }

  // Whether the coach has told the player that loud sounds startle the frog (this demo).
  let soundIntroduced = false;

  function stop() {
    clearTimeout(doneTimer);
    index = -1;
    card.hidden = true;
    setHighlight(null);
  }

  return {
    start() {
      soundIntroduced = false;
      card.hidden = false;
      showStep(0);
    },
    stop,
    // True while the coach is still going through its steps.
    isActive: () => index >= 0,
    soundIntroduced: () => soundIntroduced,
    // Called every frame in the demo with the latest practice stats.
    update(stats) {
      latest = stats;
      if (index < 0 || done) return;
      const step = steps[index];
      if (step.final) return;
      start ??= { ...stats };
      const progress = Math.min(Math.max(step.progress(stats, start), 0), 1);
      bar.style.width = `${progress * 100}%`;
      if (progress < 1) return;
      done = true;
      card.classList.add('is-done');
      doneTimer = setTimeout(() => showStep(index + 1), doneDelay);
    }
  };
}
