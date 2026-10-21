// Listens to the microphone for sudden loud sounds (a clap, a shout) that startle the frog.
// Nothing is recorded or sent anywhere: the sound is only measured, frame by frame.
// Without a microphone (none, blocked, or no HTTPS) it stays quiet and the game plays as usual.

// A sound startles the frog when it is loud on average (RMS of the waveform, 0..1) or has a
// sharp peak, like the crack of a clap, which is too short to raise the average much...
const minimumLoudness = 0.05;
const minimumPeak = 0.3;
// ...and is this many times louder than the room's background noise.
const aboveBackground = 4;

export function createMicrophone({ onStateChange = () => {} } = {}) {
  let state = 'off';
  let stream = null;
  let context = null;
  let analyser = null;
  let samples = null;
  // The room's background noise level, followed slowly while nothing loud is happening.
  let background = 0.01;

  function setState(next) {
    state = next;
    // Shown in the browser console, to check whether the frog can hear you.
    console.info(`Frog Pond microphone: ${state}`);
    onStateChange(state);
  }

  // Browsers keep an AudioContext paused until the player clicks or presses a key.
  const unlockEvents = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  function unlock() {
    if (!context) return;
    if (context.state === 'running') {
      for (const type of unlockEvents) window.removeEventListener(type, unlock, true);
    } else {
      context.resume();
    }
  }

  async function enable() {
    if (state === 'on' || state === 'starting') return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported');
      return;
    }
    setState('starting');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // All processing off, so a clap reaches us at its real loudness. (Echo cancellation
        // would treat a clap over the game's rain sound as echo and turn it right down; the
        // rain is steady, so it just becomes part of the background noise below.)
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch {
      // No microphone, or the player said no: carry on without startles.
      setState('blocked');
      return;
    }
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    context ??= new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    samples = new Float32Array(analyser.fftSize);
    context.createMediaStreamSource(stream).connect(analyser);
    // Safari only feeds an analyser that leads to the speakers, so connect it through a
    // silent gain (nothing from the microphone is ever heard).
    const silence = context.createGain();
    silence.gain.value = 0;
    analyser.connect(silence).connect(context.destination);
    if (context.state !== 'running') {
      context.resume();
      for (const type of unlockEvents) window.addEventListener(type, unlock, true);
    }
    background = 0.01;
    setState('on');
  }

  function disable() {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    analyser = null;
    setState('off');
  }

  return {
    enable,
    disable,
    get state() {
      return state;
    },
    // Call every frame: how loud it is (0..1) and whether a sudden loud sound was heard.
    listen(delta) {
      if (!analyser) return { level: 0, loud: false };
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      let peak = 0;
      for (const sample of samples) {
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const loudness = Math.sqrt(sum / samples.length);
      const loud = (loudness > minimumLoudness || peak > minimumPeak)
        && loudness > background * aboveBackground;
      if (!loud) background += (loudness - background) * Math.min(1, delta * 0.5);
      return { level: Math.min(loudness / minimumLoudness, 1), loud };
    }
  };
}
