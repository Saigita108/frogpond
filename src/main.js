import './style.css'
import { mountControlsHelp } from './controls-help.js'
import { loadCameraMode, mountCameraToggle } from './camera-toggle.js'
import { loadExplosion } from './explosion.js'
import { loadFireflies } from './fireflies.js'
import { loadFirefliesEaten, mountFireflyMeter, saveFirefliesEaten } from './firefly-meter.js'
import { mountRadar } from './radar.js'
import { createRain } from './rain.js'
import {
  loadBestTime, loadLevel, loadNightTime, mountEndCard, mountNightClock, saveBestTime, saveLevel, saveNightTime
} from './night.js'
import { mountStartScreen } from './start-screen.js'
import { mountTutorial } from './tutorial.js'
import { loadSwamp } from './swamp.js'
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import frogModelUrl from './assets/models/frog-eyes.glb?url'
import frogJumpModelUrl from './assets/models/frog-jump-fixed.glb?url'
import frogWalkModelUrl from './assets/models/frog-walk.glb?url'
import frogSwimModelUrl from './assets/models/frog-swim.glb?url'
import frogTongueModelUrl from './assets/models/frog-tongue.glb?url'

mountControlsHelp(document.querySelector('#app'));

const nightColor = 0x0b1733;
const scene = new THREE.Scene();
scene.background = new THREE.Color(nightColor);
// The Blender fog box is preview-only, so the fog lives here.
scene.fog = new THREE.FogExp2(nightColor, 0.04);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.05,
  400
);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.querySelector('#app').appendChild(renderer.domElement);

// Initialize the GPU backend before rendering or accepting input.
await renderer.init();
camera.coordinateSystem = renderer.coordinateSystem;
camera.updateProjectionMatrix();

const hemisphereLight = new THREE.HemisphereLight(0x9fb4e0, 0x2a3324, 1.4);
scene.add(hemisphereLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const swamp = await loadSwamp(scene);

// Rain over the whole screen, with drops ringing the ponds and lightning now and then.
// The Rain switch in the bottom right turns it on and off, and the choice is remembered.
const rainKey = 'frog-pond:rain';

function loadRaining() {
  try {
    return localStorage.getItem(rainKey) !== 'off';
  } catch {
    return true;
  }
}

let raining = loadRaining();
const rain = createRain(scene, swamp, raining);

const rainButton = document.createElement('button');
rainButton.type = 'button';
rainButton.className = 'rain-toggle';
rainButton.innerHTML = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path class="rain-toggle-cloud" d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 0 7.5Z" />
    <path class="rain-toggle-drops" d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5" />
  </svg>
  <span>Rain</span>
  <span class="rain-toggle-switch" aria-hidden="true"></span>
`;
rainButton.title = 'Turn the rain, lightning and their sound on or off';

function showRaining() {
  rainButton.setAttribute('aria-pressed', String(raining));
}

rainButton.addEventListener('click', (event) => {
  raining = !raining;
  rain.setRaining(raining);
  showRaining();
  try {
    localStorage.setItem(rainKey, raining ? 'on' : 'off');
  } catch {
    // Storage can be unavailable; the choice just won't be remembered.
  }
  // A mouse click shouldn't leave focus here, or the frog's keys would be ignored.
  if (event.detail > 0) rainButton.blur();
});
showRaining();
document.querySelector('#app').appendChild(rainButton);

// FROG -----------------------------------------------------------------------

// Keep placement separate from the model's animated transforms.
let frogMixer = null;
// True from the moment the frog explodes at the world edge until it respawns.
let frogExploded = false;
let idleFrog = null;
let jumpFrog = null;
let frogJumpMixer = null;
let frogIsJumping = false;
let walkFrog = null;
let frogWalkMixer = null;
let frogWalkDirection = 0;
const frogWalkActions = [];
let swimFrog = null;
let frogSwimMixer = null;
const frogSwimActions = [];
let tongueFrog = null;
let frogTongueMixer = null;
let frogIsStriking = false;
const frogTongueActions = [];
const unfinishedTongueActions = new Set();
const frogKeys = new Set();
const frogMovementKeys = new Set([
  'KeyW', 'ArrowUp', 'KeyS', 'ArrowDown',
  'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'
]);
const frogScale = 0.35;
const frogRadius = 0.25;
const frogWalkSpeed = 0.9;
// The walk cycle was timed for 0.85 m/s at scale 0.5; match the feet to the speed.
const frogWalkTimeScale = frogWalkSpeed / (0.85 * frogScale / 0.5);
// Double-tap forward and hold the second press to run (or swim fast): twice the speed and
// twice the walk or swim cycle.
const frogRunMultiplier = 2;
const frogDoubleTapWindow = 300; // milliseconds between the two presses
let frogRunning = false;
let lastForwardTapAt = -Infinity;
const isForwardKey = (code) => code === 'KeyW' || code === 'ArrowUp';
const frogTurnSpeed = Math.PI * 0.75;
// Stroke rate while swimming, and a slow paddle while floating in place.
const frogSwimTimeScale = 1;
const frogFloatTimeScale = 0.45;
// Float low in the water, with the body partly below the waterline.
const frogSwimHeight = -0.22;
// How far a swimming frog may sink below the pond floor (the shallow edges).
const frogSwimSink = 0.1;
// Flicking the tongue in water, the frog rises until its mouth is just above the surface.
const frogStrikeWaterHeight = -0.1;
// The jump clip lifts the frog in place; move it forward while it is airborne.
const frogJumpDistance = 1.6;
const frogJumpAirborne = [1.05, 2.0];
const frogMaxStep = 0.28;
const frogMaxClimb = 0.55;
const frogMaxJumpStep = 0.9;
const worldLimit = 33;
const frogJumpActions = [];
const unfinishedJumpActions = new Set();
const frogPlacement = new THREE.Group();
scene.add(frogPlacement);

// Remember where the frog was on this device, so a reload puts it back there.
const frogSaveKey = 'frog-pond:frog';

function loadFrogSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(frogSaveKey));
    if (!saved || ![saved.x, saved.z, saved.rotation].every(Number.isFinite)) return null;
    // The swamp may have changed since the save; only reuse spots that are still walkable.
    const surface = swamp.probeSurface(saved.x, saved.z);
    if (!surface) return null;
    return { ...saved, surface };
  } catch {
    return null;
  }
}

function saveFrog() {
  // An exploded frog has no position worth keeping; it respawns somewhere random.
  if (frogExploded) return;
  try {
    const { x, z } = frogPlacement.position;
    localStorage.setItem(frogSaveKey, JSON.stringify({ x, z, rotation: frogPlacement.rotation.y }));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the frog just won't be remembered.
  }
}

function clearFrogSave() {
  try {
    localStorage.removeItem(frogSaveKey);
  } catch {
    // Nothing was saved if storage is unavailable.
  }
}

// Drop the frog where it was last time, or at a random spot in the swamp.
const savedFrog = loadFrogSave();
const spawn = savedFrog
  ? new THREE.Vector3(savedFrog.x, savedFrog.surface.height, savedFrog.z)
  : swamp.randomSpawn();
let frogGroundHeight = spawn.y;
let frogSurfaceRole = savedFrog?.surface.role ?? 'ground';
frogPlacement.position.copy(spawn);
frogPlacement.rotation.y = savedFrog?.rotation ?? Math.random() * Math.PI * 2;
let frogPond = frogSurfaceRole === 'lily_pad' ? null : swamp.pondAt(spawn.x, spawn.z, spawn.y);
let frogSpeed = 0;
let lastRippleAt = 0;

// Build a hidden model's shaders now, so it doesn't stall the game the first time it shows up.
// compileAsync picks its objects before it awaits, so the model never shows on screen.
function precompile(model) {
  const culled = [];
  model.traverse((object) => {
    if (object.frustumCulled) {
      object.frustumCulled = false;
      culled.push(object);
    }
  });
  const wasVisible = model.visible;
  model.visible = true;
  renderer.compileAsync(model, camera, scene).catch((error) => {
    console.warn('Could not precompile a model:', error);
  });
  model.visible = wasVisible;
  for (const object of culled) object.frustumCulled = true;
}

function prepareFrog(gltf) {
  const frog = gltf.scene;
  frog.scale.setScalar(frogScale);

  // Rest the feet on the ground, accounting for the asset's origin.
  const bounds = new THREE.Box3().setFromObject(frog);
  frog.position.y -= bounds.min.y;
  frogPlacement.add(frog);
  return frog;
}

const frogLoader = new GLTFLoader();
frogLoader.loadAsync(frogModelUrl).then((gltf) => {
  idleFrog = prepareFrog(gltf);

  frogMixer = new THREE.AnimationMixer(idleFrog);
  for (const clip of gltf.animations) {
    frogMixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
}).catch((error) => {
  console.error('Could not load the frog model:', error);
});

frogLoader.loadAsync(frogJumpModelUrl).then((gltf) => {
  jumpFrog = prepareFrog(gltf);
  jumpFrog.visible = false;
  precompile(jumpFrog);
  frogJumpMixer = new THREE.AnimationMixer(jumpFrog);
  for (const clip of gltf.animations) {
    const action = frogJumpMixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    frogJumpActions.push(action);
  }
  // Exports may split an animation into clips for separate bones/objects.
  // Keep the jump visible until every clip has reached its last frame.
  frogJumpMixer.addEventListener('finished', ({ action }) => {
    unfinishedJumpActions.delete(action);
    if (frogIsJumping && unfinishedJumpActions.size === 0) finishFrogJump();
  });
  if (frogJumpActions.length === 0) {
    console.warn('frog-jump-fixed.glb contains no animation clips. Export the rig and jump animation with the model.');
  }
}).catch((error) => {
  console.error('Could not load the jump model:', error);
});

frogLoader.loadAsync(frogWalkModelUrl).then((gltf) => {
  walkFrog = prepareFrog(gltf);
  walkFrog.visible = false;
  precompile(walkFrog);
  frogWalkMixer = new THREE.AnimationMixer(walkFrog);
  for (const clip of gltf.animations) {
    frogWalkActions.push(frogWalkMixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity));
  }
}).catch((error) => {
  console.error('Could not load the walk model:', error);
});

frogLoader.loadAsync(frogSwimModelUrl).then((gltf) => {
  swimFrog = prepareFrog(gltf);
  swimFrog.visible = false;
  precompile(swimFrog);
  frogSwimMixer = new THREE.AnimationMixer(swimFrog);
  for (const clip of gltf.animations) {
    frogSwimActions.push(frogSwimMixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play());
  }
}).catch((error) => {
  console.error('Could not load the swim model:', error);
});

// The tongue rig hangs off tongue_aim: rotating it aims the tongue, scaling its z stretches it.
let tongueAim = null;
let tongueTip = null;
// How far the tip sits in front of tongue_aim at full stretch, in tongue_aim's units.
let tongueReach = 1;
// TongueStrike: the tongue is fully out at tongueHitTime and back in the closed mouth by tongueSwallowTime.
const tongueHitTime = 0.42;
const tongueSwallowTime = 0.75;

frogLoader.loadAsync(frogTongueModelUrl).then((gltf) => {
  tongueFrog = prepareFrog(gltf);
  tongueFrog.visible = false;
  precompile(tongueFrog);
  tongueAim = tongueFrog.getObjectByName('tongue_aim');
  tongueTip = tongueFrog.getObjectByName('tongue_9');
  // The stretched tongue leaves the skinned mesh's bounds; don't let it get culled.
  tongueFrog.traverse((object) => {
    if (object.isSkinnedMesh) object.frustumCulled = false;
  });
  frogTongueMixer = new THREE.AnimationMixer(tongueFrog);
  for (const clip of gltf.animations) {
    const action = frogTongueMixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    frogTongueActions.push(action);
  }
  frogTongueMixer.addEventListener('finished', ({ action }) => {
    unfinishedTongueActions.delete(action);
    if (frogIsStriking && unfinishedTongueActions.size === 0) finishFrogTongue();
  });
  if (!tongueAim || !tongueTip || frogTongueActions.length === 0) {
    console.warn('frog-tongue.glb needs the tongue_aim and tongue_9 bones and the TongueStrike animation.');
    return;
  }

  // Measure the tongue at full stretch, so it can be stretched to exactly reach a firefly.
  for (const action of frogTongueActions) action.play();
  frogTongueMixer.setTime(tongueHitTime);
  tongueReach = tongueAim.worldToLocal(tongueTip.getWorldPosition(new THREE.Vector3())).z;
  for (const action of frogTongueActions) action.stop();
}).catch((error) => {
  console.error('Could not load the tongue model:', error);
});

const frogIsSwimming = () => Boolean(frogPond && swimFrog && frogSwimActions.length && !frogIsJumping);

// Show exactly one model: jump, tongue, swim (whenever the frog is in water), walk or idle.
function showFrogModel() {
  if (!idleFrog) return;
  // In water the tongue model takes over from the swim model while the tongue is out.
  const swimming = frogIsSwimming() && !frogIsStriking;
  if (jumpFrog) jumpFrog.visible = frogIsJumping;
  if (tongueFrog) tongueFrog.visible = frogIsStriking;
  if (swimFrog) swimFrog.visible = swimming;
  const standing = !frogIsJumping && !frogIsStriking && !swimming;
  if (walkFrog) walkFrog.visible = standing && frogWalkDirection !== 0;
  idleFrog.visible = standing && frogWalkDirection === 0;
}

// Move the frog over the swamp surfaces, blocked by trunks, steep rocks and the world edge.
function moveFrog(distance, airborne) {
  if (Math.abs(distance) < 1e-6) return 0;
  const position = frogPlacement.position;
  const forwardX = Math.sin(frogPlacement.rotation.y) * Math.sign(distance);
  const forwardZ = Math.cos(frogPlacement.rotation.y) * Math.sign(distance);
  const step = Math.abs(distance);
  let x = THREE.MathUtils.clamp(position.x + forwardX * step, -worldLimit, worldLimit);
  let z = THREE.MathUtils.clamp(position.z + forwardZ * step, -worldLimit, worldLimit);

  // Slide around tree trunks (cylinder colliders).
  for (const tree of swamp.trees) {
    const dx = x - tree.x;
    const dz = z - tree.z;
    const gap = Math.hypot(dx, dz);
    const minimum = tree.radius + frogRadius;
    if (gap < minimum && gap > 1e-4) {
      x = tree.x + dx / gap * minimum;
      z = tree.z + dz / gap * minimum;
    }
  }

  const surface = swamp.probeSurface(x, z);
  if (!surface) return 0;
  if (airborne) {
    if (surface.height - frogGroundHeight > frogMaxJumpStep) return 0;
  } else {
    // Look a little ahead so steep rock sides block instead of being climbed slowly.
    const ahead = swamp.probeSurface(x + forwardX * frogRadius, z + forwardZ * frogRadius);
    const maxStep = surface.role === 'log' || ahead?.role === 'log' ? frogMaxClimb : frogMaxStep;
    if (!ahead || ahead.height - frogGroundHeight > maxStep) return 0;
    if (surface.height - frogGroundHeight > maxStep) return 0;
  }

  const moved = Math.hypot(x - position.x, z - position.z);
  position.x = x;
  position.z = z;
  frogGroundHeight = surface.height;
  frogSurfaceRole = surface.role;
  return moved;
}

function updateFrogWater(elapsed, moving) {
  const position = frogPlacement.position;
  // Standing on a lily pad keeps the frog dry.
  const pond = frogSurfaceRole === 'lily_pad' ? null : swamp.pondAt(position.x, position.z, frogGroundHeight);
  if (pond && !frogPond && pond.props.splash_on_enter !== false) {
    swamp.addRipple(position.x, position.z, 1.6);
    lastRippleAt = elapsed;
  } else if (pond && moving && pond.props.ripple_on_move !== false && elapsed - lastRippleAt > 0.35) {
    swamp.addRipple(position.x, position.z, 0.8);
    lastRippleAt = elapsed;
  }
  frogPond = pond;
}

function stopFrogWalk() {
  frogWalkDirection = 0;
  for (const action of frogWalkActions) action.stop();
}

// What the frog has done so far, for the demo's tutorial (see tutorial.js).
const practice = {
  forward: 0,
  backward: 0,
  swum: 0,
  turned: 0,
  running: 0,
  jumps: 0,
  eaten: 0,
  nearestFirefly: Infinity,
  cameraMode: 'follow'
};

function recordMove(direction, run, moved, delta, swimming) {
  if (direction > 0) practice.forward += moved;
  if (direction < 0) practice.backward += moved;
  if (run > 1 && moved > 0) practice.running += delta;
  if (swimming) practice.swum += moved;
}

function updateFrogMovement(delta) {
  // The frog holds still while its tongue is out, and for good once the night is won or lost.
  if (!idleFrog || frogExploded || frogIsStriking) return 0;
  if (nightResult || menuOpen) {
    if (frogWalkDirection) stopFrogWalk();
    return 0;
  }
  const held = (first, second) => frogKeys.has(first) || frogKeys.has(second);
  const turn = Number(held('KeyA', 'ArrowLeft')) - Number(held('KeyD', 'ArrowRight'));
  // Rotating the shared placement turns whichever model is currently visible.
  frogPlacement.rotation.y += turn * frogTurnSpeed * delta;
  practice.turned += Math.abs(turn) * frogTurnSpeed * delta;
  // Ponds slow the frog down (move/jump multipliers from the water's game properties).
  const speedMultiplier = frogPond?.props.move_speed_multiplier ?? 1;
  const jumpMultiplier = frogPond?.props.jump_strength_multiplier ?? 1;

  if (frogIsJumping) {
    const jumpTime = frogJumpActions[0].time;
    const [takeoff, landing] = frogJumpAirborne;
    if (jumpTime < takeoff || jumpTime > landing) return 0;
    const jumpSpeed = frogJumpDistance * jumpMultiplier / (landing - takeoff);
    return moveFrog(jumpSpeed * delta, true);
  }

  const direction = Number(held('KeyW', 'ArrowUp')) - Number(held('KeyS', 'ArrowDown'));
  // Running (and fast swimming) only works forward.
  const run = direction > 0 && frogRunning ? frogRunMultiplier : 1;
  if (frogIsSwimming()) {
    // In water the swim model replaces both idle and walk.
    if (frogWalkDirection) stopFrogWalk();
    for (const action of frogSwimActions) {
      action.setEffectiveTimeScale(direction ? direction * frogSwimTimeScale * run : frogFloatTimeScale);
    }
    frogSwimMixer.update(delta);
    const swam = moveFrog(direction * frogWalkSpeed * speedMultiplier * run * delta, false);
    recordMove(direction, run, swam, delta, true);
    return swam;
  }
  if (!direction || !walkFrog || frogWalkActions.length === 0) {
    if (frogWalkDirection) stopFrogWalk();
    return 0;
  }

  if (direction !== frogWalkDirection) {
    for (const action of frogWalkActions) {
      if (frogWalkDirection === 0) {
        action.reset();
        // Backward playback starts at the last frame of the walk cycle.
        if (direction < 0) action.time = action.getClip().duration;
      }
      action.setEffectiveWeight(1).play();
    }
    frogWalkDirection = direction;
  }
  for (const action of frogWalkActions) {
    action.setEffectiveTimeScale(direction * frogWalkTimeScale * speedMultiplier * run);
  }
  frogWalkMixer.update(delta);
  const walked = moveFrog(direction * frogWalkSpeed * speedMultiplier * run * delta, false);
  recordMove(direction, run, walked, delta, false);
  return walked;
}

function startFrogJump() {
  if (!idleFrog || frogJumpActions.length === 0 || frogIsJumping || frogIsStriking || frogExploded || nightResult) return;
  frogIsJumping = true;
  practice.jumps += 1;
  stopFrogWalk();
  showFrogModel();
  unfinishedJumpActions.clear();
  for (const action of frogJumpActions) {
    unfinishedJumpActions.add(action);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  }
  frogJumpMixer.update(0);
}

function finishFrogJump() {
  frogIsJumping = false;
  for (const action of frogJumpActions) action.stop();
  updateFrogMovement(0);
  showFrogModel();
}

// LEVELS AND NIGHT --------------------------------------------------------------
// Race the night: eat enough fireflies before sunrise. Each level gives a different amount of
// night; the demo has no clock at all. The clock starts with the frog's first move, survives a
// reload, pauses while the menu is open, and a new frog starts a new night.
const levels = {
  demo: { name: 'Demo', nightLength: null, detail: 'Free play, no clock' },
  easy: { name: 'Easy', nightLength: 180, detail: 'Three minutes until sunrise' },
  medium: { name: 'Medium', nightLength: 120, detail: 'Two minutes until sunrise' },
  hard: { name: 'Hard', nightLength: 60, detail: 'One minute until sunrise' }
};
// null until the first level is chosen on the start screen.
let level = loadLevel(levels);
const isDemo = () => level === 'demo';
const nightLength = () => levels[level ?? 'easy'].nightLength ?? Infinity;

let nightTime = isDemo() ? 0 : loadNightTime();
let nightStarted = nightTime > 0;
// 'won', 'sunrise' or 'exploded' once the night has ended, otherwise null.
let nightResult = null;
const setNightClock = mountNightClock(document.querySelector('#app'));
const endCard = mountEndCard(document.querySelector('#app'), (event) => {
  resetGame();
  if (event.detail > 0) event.currentTarget.blur();
}, () => openMenu());

// Dawn colors for the fog and the ambient light; the sky dome and water change in swamp.js.
const nightSky = new THREE.Color(nightColor);
const dawnSky = new THREE.Color(0x8d8fb5);
const nightAmbient = new THREE.Color(0x9fb4e0);
const dawnAmbient = new THREE.Color(0xffd2b0);

function startNight() {
  if (!nightStarted && !nightResult && !frogExploded && !menuOpen && !isDemo()) nightStarted = true;
}

// result: 'won', 'sunrise' or 'exploded'.
function endNight(result) {
  nightResult = result;
  // The game is over: the frog stops where it is until Play again or Reset.
  frogKeys.clear();
  frogRunning = false;
  stopFrogWalk();
  // An exploded frog's night is already cleared, so a reload starts fresh.
  if (result !== 'exploded') saveNightTime(nightTime);
  let bestTime = loadBestTime(level);
  const newBest = result === 'won' && (bestTime === null || nightTime < bestTime);
  if (newBest) {
    bestTime = nightTime;
    saveBestTime(level, bestTime);
  }
  endCard.show({
    result,
    eaten: firefliesEaten,
    total: fireflyGoal,
    time: nightTime,
    bestTime,
    newBest
  });
}

function startNewNight() {
  nightTime = 0;
  nightStarted = false;
  nightResult = null;
  saveNightTime(0);
  endCard.hide();
}

function updateNight(delta) {
  const length = nightLength();
  if (nightStarted && !nightResult && !frogExploded && !menuOpen && !isDemo()) {
    nightTime = Math.min(nightTime + delta, length);
    if (nightTime >= length) endNight('sunrise');
  }
  // The demo stays night. Otherwise the sky starts to lighten 40% of the way through the
  // night, and is fully lit at sunrise.
  const progress = isDemo() ? 0 : nightTime / length;
  const dawn = THREE.MathUtils.smoothstep(progress, 0.4, 1);
  scene.background.lerpColors(nightSky, dawnSky, dawn);
  scene.fog.color.copy(scene.background);
  hemisphereLight.color.lerpColors(nightAmbient, dawnAmbient, dawn);
  hemisphereLight.intensity = THREE.MathUtils.lerp(1.4, 2.4, dawn);
  swamp.setDawn(dawn);
  const state = isDemo() ? 'demo' : nightResult ?? (nightStarted ? 'running' : 'waiting');
  setNightClock(nightTime, state, length);
}

// START SCREEN AND MENU -------------------------------------------------------
// The start screen opens with the game and doubles as the pause menu (the Menu button).
let menuOpen = false;
const startScreen = mountStartScreen(document.querySelector('#app'), levels, {
  onPlay: (chosen) => startLevel(chosen),
  onContinue: () => closeMenu()
});

// A finished night can't be continued, and neither can the demo once its tutorial is over.
function canContinueNight() {
  if (level === null || nightResult) return false;
  return !isDemo() || tutorial.isActive();
}

function openMenu(canContinue = canContinueNight()) {
  menuOpen = true;
  frogKeys.clear();
  frogRunning = false;
  stopFrogWalk();
  document.body.classList.add('menu-open');
  const bests = Object.fromEntries(Object.keys(levels).map((key) => [key, loadBestTime(key)]));
  startScreen.show({ current: canContinue ? level : null, bests });
}

function closeMenu() {
  menuOpen = false;
  document.body.classList.remove('menu-open');
  startScreen.hide();
}

// The demo's tutorial: a coach card that teaches the controls and the goal step by step.
const tutorial = mountTutorial(document.querySelector('#app'), { onChooseLevel: () => openMenu() });

// A new frog, a full swarm and a fresh night on the chosen level.
function startLevel(chosen) {
  level = chosen;
  saveLevel(level);
  closeMenu();
  resetGame();
  if (isDemo()) tutorial.start();
  else tutorial.stop();
}

window.addEventListener('pagehide', () => {
  if (!frogExploded) saveNightTime(nightTime);
});

// FIREFLIES AND TONGUE -------------------------------------------------------
// Fireflies flutter all over the swamp; F flicks the tongue to eat one.
const fireflyCount = 20;
// Eating this many wins the night; the extra fireflies give some room to miss.
const fireflyGoal = 10;
// Keep them clear of the edge warning zone, so none is lost to the explosion.
const fireflyMargin = 26;
// A firefly can be eaten when it is this close to the mouth (meters) and within this angle
// to either side of where the frog faces.
const tongueRange = 1.5;
const tongueAimAngle = THREE.MathUtils.degToRad(60);
let fireflies = null;
// Eaten fireflies stay eaten across reloads; a new frog after an explosion starts over at 0.
let firefliesEaten = loadFirefliesEaten(fireflyGoal);
const setFireflyMeter = mountFireflyMeter(document.querySelector('#app'), fireflyGoal, firefliesEaten);
// A night that was still going when the page closed can be continued from the start screen;
// a finished one can't (the player picks a level and starts fresh).
const savedNightFinished = !isDemo() && (firefliesEaten >= fireflyGoal || nightTime >= nightLength());
// The firefly the tongue is flying at, and the one stuck to it on the way back.
let tongueTarget = null;
let tongueCatch = null;
let tongueHasHit = false;
const mouthPosition = new THREE.Vector3();
const fireflyPosition = new THREE.Vector3();
const tongueAimPoint = new THREE.Vector3();
const tongueForward = new THREE.Vector3(0, 0, 1);
const tongueAimRotation = new THREE.Quaternion();
const tongueAimScale = new THREE.Vector3();

// RADAR: shows where the fireflies around the frog are.
const radarRange = 20;
const updateRadar = mountRadar(document.querySelector('#app'), radarRange);
const radarFrog = { x: 0, z: 0, heading: 0 };
const radarFireflies = [];

function refreshRadar() {
  radarFrog.x = frogPlacement.position.x;
  radarFrog.z = frogPlacement.position.z;
  radarFrog.heading = frogPlacement.rotation.y;
  radarFireflies.length = 0;
  practice.nearestFirefly = Infinity;
  for (const firefly of fireflies?.fireflies ?? []) {
    if (firefly.state !== 'flying') continue;
    fireflies.bodyPosition(firefly, fireflyPosition);
    radarFireflies.push({ x: fireflyPosition.x, z: fireflyPosition.z, alpha: 1 });
    practice.nearestFirefly = Math.min(practice.nearestFirefly, Math.hypot(
      fireflyPosition.x - radarFrog.x,
      fireflyPosition.z - radarFrog.z
    ));
  }
  updateRadar(radarFrog, radarFireflies);
}

loadFireflies(scene, swamp).then((loaded) => {
  fireflies = loaded;
  // Only the fireflies this frog hasn't eaten yet come back after a reload.
  fireflies.scatter(fireflyCount - firefliesEaten, fireflyMargin);
}).catch((error) => {
  console.error('Could not load the fireflies:', error);
});

// Distance from the mouth to a flying firefly in front of the frog, or null if it is out of reach.
function tongueDistanceTo(firefly) {
  if (firefly.state !== 'flying') return null;
  tongueAim.getWorldPosition(mouthPosition);
  fireflies.bodyPosition(firefly, fireflyPosition);
  const distance = mouthPosition.distanceTo(fireflyPosition);
  const heading = Math.atan2(fireflyPosition.x - mouthPosition.x, fireflyPosition.z - mouthPosition.z);
  const offAim = Math.atan2(
    Math.sin(heading - frogPlacement.rotation.y),
    Math.cos(heading - frogPlacement.rotation.y)
  );
  return distance <= tongueRange && Math.abs(offAim) <= tongueAimAngle ? distance : null;
}

function nearestFireflyInReach() {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const firefly of fireflies?.fireflies ?? []) {
    const distance = tongueDistanceTo(firefly);
    if (distance !== null && distance < nearestDistance) {
      nearest = firefly;
      nearestDistance = distance;
    }
  }
  return nearest;
}

// Point the tongue at the target firefly (or straight ahead) and stretch it to reach that point.
function aimTongue() {
  if (tongueTarget) {
    fireflies.bodyPosition(tongueTarget, tongueAimPoint);
  } else {
    tongueAim.getWorldPosition(tongueAimPoint);
    tongueAimPoint.x += Math.sin(frogPlacement.rotation.y) * tongueRange;
    tongueAimPoint.z += Math.cos(frogPlacement.rotation.y) * tongueRange;
  }
  tongueAim.parent.worldToLocal(tongueAimPoint).sub(tongueAim.position);
  const stretch = tongueAimPoint.length() / tongueReach;
  tongueAim.quaternion.setFromUnitVectors(tongueForward, tongueAimPoint.normalize());
  tongueAim.scale.set(1, 1, stretch);
}

function startFrogTongue() {
  if (!idleFrog || !tongueAim || frogTongueActions.length === 0) return;
  // Once the night is over the score is final.
  if (frogIsStriking || frogIsJumping || frogExploded || nightResult) return;
  if (frogIsSwimming()) swamp.addRipple(frogPlacement.position.x, frogPlacement.position.z, 0.8);
  frogIsStriking = true;
  stopFrogWalk();
  showFrogModel();
  tongueTarget = nearestFireflyInReach();
  tongueCatch = null;
  tongueHasHit = false;
  unfinishedTongueActions.clear();
  for (const action of frogTongueActions) {
    unfinishedTongueActions.add(action);
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  }
  updateFrogTongue(0);
}

function updateFrogTongue(delta) {
  if (!frogIsStriking) return;
  // The mixer resets tongue_aim every update, so the aim is applied again afterwards.
  tongueAimRotation.copy(tongueAim.quaternion);
  tongueAimScale.copy(tongueAim.scale);
  frogTongueMixer.update(delta);
  const time = frogTongueActions[0].time;

  if (!tongueHasHit) {
    // Follow the firefly until the tongue reaches it.
    aimTongue();
    if (time >= tongueHitTime) {
      tongueHasHit = true;
      // The tongue follows its firefly, so once aimed it always catches it, even if the
      // firefly fluttered a little out of reach on the way.
      if (tongueTarget?.state === 'flying') tongueCatch = tongueTarget;
      tongueTarget = null;
    }
  } else {
    tongueAim.quaternion.copy(tongueAimRotation);
    tongueAim.scale.copy(tongueAimScale);
  }

  if (!tongueCatch) return;
  if (time >= tongueSwallowTime) {
    swallowFirefly();
  } else {
    // Stuck to the tip, it gets pulled back into the mouth.
    fireflies.holdAt(tongueCatch, tongueTip.getWorldPosition(fireflyPosition));
  }
}

function swallowFirefly() {
  fireflies.swallow(tongueCatch);
  tongueCatch = null;
  practice.eaten += 1;
  // The demo has no winning: after a full meter it starts counting again.
  if (isDemo() && firefliesEaten >= fireflyGoal) firefliesEaten = 0;
  firefliesEaten += 1;
  saveFirefliesEaten(firefliesEaten);
  setFireflyMeter(firefliesEaten);
  if (isDemo()) {
    // ...and the swarm comes back once every firefly has been eaten.
    if (!fireflies.fireflies.some((firefly) => firefly.state === 'flying')) {
      fireflies.scatter(fireflyCount, fireflyMargin);
    }
  } else if (firefliesEaten >= fireflyGoal && !nightResult) {
    endNight('won');
  }
}

function finishFrogTongue() {
  frogIsStriking = false;
  if (tongueCatch) swallowFirefly();
  tongueTarget = null;
  for (const action of frogTongueActions) action.stop();
  showFrogModel();
}

window.addEventListener('keydown', (event) => {
  if ((!frogMovementKeys.has(event.code) && event.code !== 'Space' && event.code !== 'KeyF') || event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target?.isContentEditable || event.target?.closest?.(
    'input, textarea, select, button, a[href], [role="button"]'
  )) return;
  event.preventDefault();
  // The start screen / menu pauses the frog.
  if (menuOpen) return;
  startNight();
  if (event.code === 'Space') {
    if (!event.repeat) startFrogJump();
  } else if (event.code === 'KeyF') {
    if (!event.repeat) startFrogTongue();
  } else {
    if (isForwardKey(event.code) && !event.repeat) {
      frogRunning = event.timeStamp - lastForwardTapAt < frogDoubleTapWindow;
      lastForwardTapAt = event.timeStamp;
    }
    frogKeys.add(event.code);
  }
});

window.addEventListener('keyup', (event) => {
  frogKeys.delete(event.code);
  // Letting go of forward stops the run (unless the other forward key is still held).
  if (isForwardKey(event.code) && !frogKeys.has('KeyW') && !frogKeys.has('ArrowUp')) frogRunning = false;
});
window.addEventListener('blur', () => {
  frogKeys.clear();
  frogRunning = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    frogKeys.clear();
    saveFrog();
  }
});
window.addEventListener('pagehide', saveFrog);

// CAMERA ----------------------------------------------------------------------
// Follow: sits behind the frog and swings around with it, like a third-person game camera.
// Look around: orbits the frog freely, steered by scrolling or dragging.
const cameraMinDistance = 1.2;
const cameraMaxDistance = 8;
const cameraMinPitch = -0.1;
const cameraMaxPitch = 1.35;
let cameraMode = loadCameraMode();
let cameraDistance = 2.6;
let cameraYaw = frogPlacement.rotation.y;
let cameraPitch = 0.4;
const cameraTarget = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();

const setCameraMode = mountCameraToggle(document.querySelector('#app'), cameraMode, (mode) => {
  // Start looking around from the current follow angle, so the switch doesn't jump.
  if (mode === 'look' && cameraMode !== 'look') {
    cameraPitch = Math.atan2(0.15 + cameraDistance * 0.38, cameraDistance);
  }
  cameraMode = mode;
});

// Escape always snaps back to the follow camera.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cameraMode !== 'follow') setCameraMode('follow');
});

function lookAround(yawChange, pitchChange) {
  cameraYaw += yawChange;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + pitchChange, cameraMinPitch, cameraMaxPitch);
}

function placeCamera(delta, snap = false) {
  const position = frogPlacement.position;
  const follow = (rate) => (snap ? 1 : 1 - Math.exp(-rate * delta));

  // The start screen slowly circles the frog; Look around orbits it by hand.
  if (cameraMode === 'look' || menuOpen) {
    const pivotY = position.y + 0.3;
    // The start screen shows a wider view of the swamp from a little higher up.
    const distance = menuOpen ? Math.max(cameraDistance, 4.5) : cameraDistance;
    const pitch = menuOpen ? 0.45 : cameraPitch;
    const across = Math.cos(pitch) * distance;
    cameraGoal.set(
      position.x - Math.sin(cameraYaw) * across,
      pivotY + Math.sin(pitch) * distance,
      position.z - Math.cos(cameraYaw) * across
    );
    lookGoal.set(position.x, pivotY, position.z);
  } else {
    // Ease the yaw toward the frog's heading so turns feel smooth, not rigid.
    const yawDifference = Math.atan2(
      Math.sin(frogPlacement.rotation.y - cameraYaw),
      Math.cos(frogPlacement.rotation.y - cameraYaw)
    );
    cameraYaw += yawDifference * follow(4);

    const height = 0.45 + cameraDistance * 0.38;
    cameraGoal.set(
      position.x - Math.sin(cameraYaw) * cameraDistance,
      position.y + height,
      position.z - Math.cos(cameraYaw) * cameraDistance
    );
    lookGoal.set(
      position.x + Math.sin(cameraYaw) * 0.8,
      position.y + 0.3,
      position.z + Math.cos(cameraYaw) * 0.8
    );
  }
  // Never dip below the terrain (e.g. behind the frog on a slope).
  cameraGoal.y = Math.max(cameraGoal.y, swamp.groundHeight(cameraGoal.x, cameraGoal.z) + 0.35);

  camera.position.lerp(cameraGoal, follow(6));
  cameraTarget.lerp(lookGoal, follow(10));
  camera.lookAt(cameraTarget);
}

function zoomCamera(factor) {
  cameraDistance = THREE.MathUtils.clamp(cameraDistance * factor, cameraMinDistance, cameraMaxDistance);
}

renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  // Ctrl+wheel is a trackpad pinch; plain wheel is a mouse wheel or two-finger scroll.
  if (cameraMode === 'look' && !event.ctrlKey) {
    // Two-finger scrolling swings the camera around the frog.
    lookAround(event.deltaX * 0.005, event.deltaY * 0.004);
    return;
  }
  const speed = event.ctrlKey ? 0.01 : 0.0015;
  zoomCamera(Math.exp(event.deltaY * speed));
}, { passive: false });

// Safari exposes trackpad pinches through GestureEvent rather than Ctrl+wheel.
let pinchStart = null;
renderer.domElement.addEventListener('gesturestart', (event) => {
  event.preventDefault();
  pinchStart = { distance: cameraDistance, scale: event.scale };
}, { passive: false });
renderer.domElement.addEventListener('gesturechange', (event) => {
  if (!pinchStart) return;
  event.preventDefault();
  cameraDistance = pinchStart.distance;
  zoomCamera(pinchStart.scale / event.scale);
}, { passive: false });
renderer.domElement.addEventListener('gestureend', (event) => {
  if (pinchStart) event.preventDefault();
  pinchStart = null;
}, { passive: false });

// RIPPLES ON CLICK ------------------------------------------------------------
const waterRaycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
let waterClick = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  waterClick = event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
});

// In look-around mode, dragging (click-and-drag or a mouse) also swings the camera.
renderer.domElement.addEventListener('pointermove', (event) => {
  if (cameraMode !== 'look' || !waterClick || event.pointerId !== waterClick.id) return;
  lookAround(-event.movementX * 0.006, event.movementY * 0.005);
});

renderer.domElement.addEventListener('pointerup', (event) => {
  const click = waterClick;
  waterClick = null;
  if (!click || event.pointerId !== click.id || event.button !== 0) return;
  if (Math.hypot(event.clientX - click.x, event.clientY - click.y) > 5) return;

  const bounds = renderer.domElement.getBoundingClientRect();
  pointerPosition.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  waterRaycaster.setFromCamera(pointerPosition, camera);
  // The terrain hides the parts of each water plane that lie outside the pond.
  const hit = waterRaycaster.intersectObject(swamp.world, true)
    .find((intersection) => intersection.object !== swamp.sky);
  if (!hit || !swamp.isWater(hit.object)) return;
  swamp.addRipple(hit.point.x, hit.point.z, 1);
});

renderer.domElement.addEventListener('pointercancel', () => {
  waterClick = null;
});

// SCREEN MESSAGE --------------------------------------------------------------
// One overlay in the middle of the screen, for the edge warning and the respawn countdown.
const screenMessage = document.createElement('div');
screenMessage.className = 'screen-message';
screenMessage.setAttribute('role', 'status');
document.querySelector('#app').appendChild(screenMessage);
let screenMessageText = null;

// Pass null to hide the message.
function showScreenMessage(text) {
  if (text === screenMessageText) return;
  screenMessageText = text;
  if (text !== null) screenMessage.textContent = text;
  screenMessage.classList.toggle('is-visible', text !== null);
}

// EDGE WARNING ----------------------------------------------------------------
// Warn the player once the frog is within a few meters of the world edge.
const edgeWarningDistance = 5;

function frogDistanceToEdge() {
  const { x, z } = frogPlacement.position;
  return worldLimit - Math.max(Math.abs(x), Math.abs(z));
}

function edgeWarningText(distanceToEdge) {
  if (distanceToEdge > edgeWarningDistance) return null;
  // Count down in whole meters: 5, 4, 3, 2, 1.
  const meters = Math.max(0, Math.ceil(distanceToEdge));
  return `${meters} ${meters === 1 ? 'meter' : 'meters'} from the edge, turn back`;
}

// EXPLOSION AND RESPAWN -------------------------------------------------------
// Touching the edge blows the frog up; after a countdown it respawns somewhere random.
const explosionScale = 0.6;
const respawnDelay = 5;
let explosion = null;
let respawnCountdown = null;

loadExplosion(scene, explosionScale).then((loaded) => {
  explosion = loaded;
  precompile(explosion.model);
}).catch((error) => {
  console.error('Could not load the explosion model:', error);
});

function startRespawnCountdown() {
  respawnCountdown = respawnDelay;
}

function explodeFrog() {
  frogExploded = true;
  frogKeys.clear();
  stopFrogWalk();
  if (frogIsJumping) {
    frogIsJumping = false;
    for (const action of frogJumpActions) action.stop();
  }
  // Hide every frog model; the explosion takes its place.
  frogPlacement.visible = false;
  showScreenMessage(null);
  // A reload after this should not put the frog back on the edge,
  // and brings a new frog with an empty belly.
  clearFrogSave();
  saveFirefliesEaten(0);
  saveNightTime(0);
  // Exploding during a running night loses the game: after the blast the end card offers
  // Play again. Before the night starts (or after it ends) a new frog just comes back.
  const losesNight = nightStarted && !nightResult;
  const afterBlast = losesNight ? () => endNight('exploded') : startRespawnCountdown;
  if (explosion) {
    explosion.play(frogPlacement.position, afterBlast);
  } else {
    afterBlast();
  }
}

function updateRespawn(delta) {
  if (respawnCountdown === null) return;
  respawnCountdown -= delta;
  if (respawnCountdown > 0) {
    showScreenMessage(`New frog in ${Math.ceil(respawnCountdown)}`);
    return;
  }
  spawnNewFrog();
}

// A fresh frog at a random spot, with an empty meter, a full swarm of fireflies and a new night.
function spawnNewFrog() {
  const spawn = swamp.randomSpawn();
  frogPlacement.position.copy(spawn);
  frogPlacement.rotation.y = Math.random() * Math.PI * 2;
  frogGroundHeight = spawn.y;
  frogSurfaceRole = 'ground';
  frogPond = swamp.pondAt(spawn.x, spawn.z, spawn.y);
  frogPlacement.visible = true;
  frogExploded = false;
  respawnCountdown = null;
  showScreenMessage(null);
  saveFrog();

  firefliesEaten = 0;
  saveFirefliesEaten(0);
  setFireflyMeter(0);
  fireflies?.scatter(fireflyCount, fireflyMargin);
  startNewNight();

  // Jump the camera to the new spot instead of flying across the swamp.
  cameraYaw = frogPlacement.rotation.y;
  placeCamera(0, true);
  camera.position.copy(cameraGoal);
}

// RESET -----------------------------------------------------------------------
// Start the night over: drop whatever the frog is doing and spawn a new one.
function resetGame() {
  frogKeys.clear();
  stopFrogWalk();
  if (frogIsJumping) {
    frogIsJumping = false;
    for (const action of frogJumpActions) action.stop();
  }
  if (frogIsStriking) finishFrogTongue();
  spawnNewFrog();
  showFrogModel();
}

// The Menu button pauses the game and opens the start screen: Continue, Restart or another level.
const menuButton = document.createElement('button');
menuButton.type = 'button';
menuButton.className = 'menu-button';
menuButton.textContent = 'Menu';
menuButton.title = 'Pause, restart or choose another level';
menuButton.addEventListener('click', () => openMenu());
document.querySelector('#app').appendChild(menuButton);

// LOOP ------------------------------------------------------------------------
// After a reload, a real level's night can be continued, but the demo always starts over.
openMenu(level !== null && !savedNightFinished && !isDemo());
placeCamera(0, true);
camera.position.copy(cameraGoal);

let lastSavedAt = 0;
const animationTimer = new THREE.Timer();
animationTimer.connect(document);
renderer.setAnimationLoop(() => {
  animationTimer.update();
  const delta = Math.min(animationTimer.getDelta(), 0.1);
  const elapsed = animationTimer.getElapsed();

  frogMixer?.update(delta);
  const moved = updateFrogMovement(delta);
  if (frogIsJumping) frogJumpMixer.update(delta);
  updateFrogTongue(delta);
  fireflies?.update(delta, frogPlacement.position);
  updateNight(delta);
  refreshRadar();
  if (menuOpen) cameraYaw += delta * 0.15;
  practice.cameraMode = cameraMode;
  if (isDemo() && !menuOpen) tutorial.update(practice);
  frogSpeed = delta > 0 ? moved / delta : 0;

  updateFrogWater(elapsed, moved > 0);
  showFrogModel();
  explosion?.update(delta);
  if (frogExploded) {
    updateRespawn(delta);
  } else {
    const distanceToEdge = frogDistanceToEdge();
    if (distanceToEdge <= 0) explodeFrog();
    else showScreenMessage(edgeWarningText(distanceToEdge));
  }

  // Save now and then while playing, in case the tab is closed without a pagehide.
  if (elapsed - lastSavedAt > 2) {
    saveFrog();
    if (!frogExploded && !nightResult) saveNightTime(nightTime);
    lastSavedAt = elapsed;
  }

  // Settle smoothly onto the surface below (terrain, lily pad, log or rock),
  // or float at the waterline while swimming.
  const position = frogPlacement.position;
  const swimHeight = frogIsStriking ? frogStrikeWaterHeight : frogSwimHeight;
  const restHeight = frogIsSwimming() ? Math.max(frogGroundHeight - frogSwimSink, swimHeight) : frogGroundHeight;
  position.y += (restHeight - position.y) * (1 - Math.exp(-20 * delta));
  swamp.updatePlants(position, frogRadius, frogSpeed, delta);
  placeCamera(delta);
  rain.update(camera, delta);
  swamp.update(elapsed, camera);
  renderer.render(scene, camera);
});
