// The swamp's own sounds while playing: a soft ambient night, frogs croaking in the distance,
// the buzz of fireflies, which gets louder as the frog closes in on one, and splashing while
// the frog swims. Plus the bang when the frog blows up.
import ambientUrl from './assets/sounds/ambient.mp3?url'
import croakUrl from './assets/sounds/croak.mp3?url'
import buzzingUrl from './assets/sounds/buzzing.mp3?url'
import swimmingUrl from './assets/sounds/swimming.mp3?url'
import explosionUrl from './assets/sounds/explosion.mp3?url'

const ambientVolume = 0.25;
const croakVolume = 0.4;
// The buzz starts this far from the nearest firefly (meters) and is loudest right next to it.
const buzzRange = 5;
const buzzVolume = 0.6;
const swimVolume = 0.5;
// The splashing eases in as the frog slips into the water and trails off after it climbs out.
const swimFadeIn = 0.5;
const swimFadeOut = 1.2;
const explosionVolume = 0.8;
// How quickly the background fades in and out when a game starts or the menu opens (seconds).
const fade = 0.6;

export function createSwampSound() {
  let context = null;
  let ambient = null;
  let croak = null;
  let buzz = null;
  let swim = null;
  let swimming = false;
  let explosionSound = null;
  let playing = false;
  let buzzLevel = 0;

  // A looping sound with its own volume, silent until it is turned up.
  async function loop(url) {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    try {
      const response = await fetch(url);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
    } catch (error) {
      console.error('Could not load a swamp sound:', error);
    }
    return gain;
  }

  // A sound that plays once each time it is asked for, loaded up front so it plays without delay.
  async function oneShot(url) {
    try {
      const response = await fetch(url);
      return await context.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      console.error('Could not load a swamp sound:', error);
      return null;
    }
  }

  function fadeTo(gain, volume, seconds = fade) {
    if (!gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(volume, context.currentTime, seconds / 3);
  }

  // Browsers only allow sound after the player has done something, so start on the first input.
  function start() {
    if (context) return;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return;
    context = new AudioContext();
    loop(ambientUrl).then((gain) => {
      ambient = gain;
      if (playing) fadeTo(ambient, ambientVolume);
    });
    loop(croakUrl).then((gain) => {
      croak = gain;
      if (playing) fadeTo(croak, croakVolume);
    });
    loop(buzzingUrl).then((gain) => {
      buzz = gain;
    });
    loop(swimmingUrl).then((gain) => {
      swim = gain;
      if (swimming) fadeTo(swim, swimVolume, swimFadeIn);
    });
    oneShot(explosionUrl).then((buffer) => {
      explosionSound = buffer;
    });
  }

  // Same unlock as the rain: keep trying on every click, tap and key press until it runs.
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
    // The ambience and croaking play during a game or the demo, not on the menu.
    setPlaying(on) {
      if (on === playing) return;
      playing = on;
      fadeTo(ambient, on ? ambientVolume : 0);
      fadeTo(croak, on ? croakVolume : 0);
    },
    // Splashing only while the swim model is showing (the frog is in the water).
    setSwimming(on) {
      if (on === swimming) return;
      swimming = on;
      fadeTo(swim, on ? swimVolume : 0, on ? swimFadeIn : swimFadeOut);
    },
    // The bang, the moment the explosion appears.
    explode() {
      if (!explosionSound || context.state !== 'running') return;
      const gain = context.createGain();
      gain.gain.value = explosionVolume;
      gain.connect(context.destination);
      const source = context.createBufferSource();
      source.buffer = explosionSound;
      source.connect(gain);
      source.start();
      source.addEventListener('ended', () => gain.disconnect());
    },
    // Call every frame with the distance to the nearest flying firefly (Infinity for none).
    setNearestFirefly(distance) {
      if (!buzz) return;
      const closeness = playing ? Math.max(1 - distance / buzzRange, 0) : 0;
      const level = closeness * closeness * buzzVolume;
      if (level === buzzLevel) return;
      buzzLevel = level;
      buzz.gain.cancelScheduledValues(context.currentTime);
      // Nothing close any more (the firefly was just eaten): stop at once, not with a fade.
      if (level === 0) buzz.gain.setValueAtTime(0, context.currentTime);
      else buzz.gain.setTargetAtTime(level, context.currentTime, 0.05);
    }
  };
}
