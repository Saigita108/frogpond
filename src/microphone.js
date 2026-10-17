// Listens to the microphone for sudden loud sounds (a clap, a shout) that startle the frog.
// Nothing is recorded or sent anywhere: the sound is only measured, frame by frame.
// Without a microphone (none, blocked, or no HTTPS) it stays quiet and the game plays as usual.

// A sound must be at least this loud (RMS of the waveform, 0..1) to startle the frog...
const minimumLoudness = 0.12;
// ...and this many times louder than the room's background noise.
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
        // Echo cancellation keeps the game's own rain and thunder from startling the frog.
        // The rest is off, so a clap reaches us at its real loudness.
        audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false }
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
      for (const sample of samples) sum += sample * sample;
      const loudness = Math.sqrt(sum / samples.length);
      const loud = loudness > Math.max(minimumLoudness, background * aboveBackground);
      if (!loud) background += (loudness - background) * Math.min(1, delta * 0.5);
      return { level: Math.min(loudness / minimumLoudness, 1), loud };
    }
  };
}
