// Banished (sound)
// Shadertoy source: https://www.shadertoy.com/view/XsX3DB (the "Sound" tab)
// Shadertoy runs mainSound on the GPU, once per audio sample, reading noise textures. Here the
// same maths runs in JavaScript once, into audio buffers: a rain loop, and a thunder rumble that
// plays with each lightning flash. The dog's sniffing is left out.

const textureSize = 256;
// Length of the rain loop; the noise has no pattern, so the loop point can't be heard.
const rainLoopSeconds = 16;
// The original's thunder envelope runs from 1.5 to 9 s of its 12 s cycle.
const thunderStart = 1.5;
const thunderEnd = 9;
// Its thunder starts 0.4 s after the cycle and its flash at 1.55 s, so the rumble follows
// the flash by about 0.35 s.
const thunderDelay = 0.35;
const masterVolume = 0.6;
// Both are played softer than in the original and muffled above these frequencies, so the
// rain is a soft background hiss and the thunder a distant rumble instead of a loud crack.
const rainVolume = 0.5;
const rainMuffle = 3500; // Hz
const thunderVolume = 0.2;
const thunderMuffle = 500; // Hz
// The original fades its sound in over the first 3 seconds.
const fadeInSeconds = 3;

// Shadertoy's iChannel noise textures: 256 × 256 random RGBA values.
function noiseTexture() {
  const data = new Float32Array(textureSize * textureSize * 4);
  for (let index = 0; index < data.length; index++) data[index] = Math.random();
  return data;
}

// texture(iChannel, uv) with linear filtering and repeat wrapping, like Shadertoy's default.
function sampleTexture(data, u, v, out) {
  const x = u * textureSize - 0.5;
  const y = v * textureSize - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (value) => ((value % textureSize) + textureSize) % textureSize;
  const left = wrap(x0);
  const right = wrap(x0 + 1);
  const bottom = wrap(y0);
  const top = wrap(y0 + 1);
  for (let channel = 0; channel < 4; channel++) {
    const at = (column, row) => data[(row * textureSize + column) * 4 + channel];
    const lower = at(left, bottom) + (at(right, bottom) - at(left, bottom)) * fx;
    const upper = at(left, top) + (at(right, top) - at(left, top)) * fx;
    out[channel] = lower + (upper - lower) * fy;
  }
  return out;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

const texel = [0, 0, 0, 0];

// vec2 Rain(float n): noise read along a fast-moving line, so it hisses like rain on a roof.
// The original also subtracts two reads of iChannel0 as a "high pass", but in a sound shader
// both reads hit the same full-resolution texture and cancel out, so only the last term remains.
function rain(channel1, n, out) {
  const vary = Math.sin(n * 0.1) * 0.5;
  sampleTexture(channel1, n * (5.7331 + vary), n * (43.66927 - vary), texel);
  out[0] = (texel[0] - 0.5) * 0.5;
  out[1] = (texel[1] - 0.5) * 0.5;
}

// vec2 Thunder(float n, float pitch, float time): slower noise, so it rumbles.
function thunder(channel0, n, pitch, time, out) {
  sampleTexture(channel0, n * pitch * 4.88238 + time, n * pitch * 3.834181, texel);
  out[0] = (texel[0] - 0.5) * 2;
  out[1] = (texel[2] - 0.5) * 2;
}

function rainBuffer(context, channel1) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(2, rainLoopSeconds * rate, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const value = [0, 0];
  for (let index = 0; index < left.length; index++) {
    rain(channel1, index / rate, value);
    // mainSound: Rain(time) * .6
    left[index] = value[0] * 0.6;
    right[index] = value[1] * 0.6;
  }
  return buffer;
}

function thunderBuffer(context, channel0) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(2, Math.ceil((thunderEnd - thunderStart) * rate), rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  const value = [0, 0];
  for (let index = 0; index < left.length; index++) {
    const ti = thunderStart + index / rate;
    // mainSound: the rumble swells quickly, fades slowly, and drops in pitch as it fades.
    const lightning = smoothstep(1.5, 2.2, ti) * (1 - smoothstep(2.2, 9, ti));
    thunder(channel0, ti, lightning + 0.75, ti + 0.4, value);
    left[index] = value[0] * lightning;
    right[index] = value[1] * lightning;
  }
  return buffer;
}

export function createRainSound() {
  let context = null;
  let master = null;
  let rainGain = null;
  let thunderSound = null;
  let level = 0;

  // Browsers only allow sound after the player has done something, so start on the first input.
  function start() {
    if (context) return;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();

    master = context.createGain();
    master.gain.setValueAtTime(0, context.currentTime);
    master.gain.linearRampToValueAtTime(masterVolume, context.currentTime + fadeInSeconds);
    master.connect(context.destination);

    rainGain = context.createGain();
    rainGain.gain.value = level * rainVolume;
    rainGain.connect(master);
    const rainSoftener = context.createBiquadFilter();
    rainSoftener.type = 'lowpass';
    rainSoftener.frequency.value = rainMuffle;
    rainSoftener.connect(rainGain);
    const rainSource = context.createBufferSource();
    rainSource.buffer = rainBuffer(context, noiseTexture());
    rainSource.loop = true;
    rainSource.connect(rainSoftener);
    rainSource.start();

    thunderSound = thunderBuffer(context, noiseTexture());
  }

  // Browsers differ in which input counts as permission to play sound (Safari ignores
  // pointerdown, for example), and an AudioContext made too early starts paused. So keep
  // trying on every click, tap and key press until the sound is actually running.
  const unlockEvents = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'];
  function unlock() {
    start();
    if (!context) return;
    if (context.state === 'running') {
      for (const type of unlockEvents) window.removeEventListener(type, unlock, true);
    } else if (!document.hidden) {
      context.resume();
    }
  }
  for (const type of unlockEvents) window.addEventListener(type, unlock, true);

  // Stay quiet while the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (!context) return;
    if (document.hidden) context.suspend();
    else context.resume();
  });

  return {
    // 0 = dry, 1 = full rain; follows the rain's fade in and out.
    setLevel(amount) {
      level = amount;
      if (rainGain) rainGain.gain.setTargetAtTime(amount * rainVolume, context.currentTime, 0.05);
    },
    // Play a rumble of thunder, just after a lightning flash.
    thunder() {
      if (!context || !thunderSound || context.state !== 'running') return;
      const gain = context.createGain();
      gain.gain.value = level * thunderVolume;
      gain.connect(master);
      const muffle = context.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = thunderMuffle;
      muffle.connect(gain);
      const source = context.createBufferSource();
      source.buffer = thunderSound;
      source.connect(muffle);
      source.start(context.currentTime + thunderDelay);
      source.addEventListener('ended', () => {
        muffle.disconnect();
        gain.disconnect();
      });
    }
  };
}
