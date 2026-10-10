import './style.css'
import { mountControlsHelp } from './controls-help.js'
import { loadSwamp } from './swamp.js'
import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import frogModelUrl from './assets/models/frog-eyes.glb?url'
import frogJumpModelUrl from './assets/models/frog-jump-fixed.glb?url'
import frogWalkModelUrl from './assets/models/frog-walk.glb?url'
import frogSwimModelUrl from './assets/models/frog-swim.glb?url'

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

scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x2a3324, 1.4));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const swamp = await loadSwamp(scene);

// FROG -----------------------------------------------------------------------

// Keep placement separate from the model's animated transforms.
let frogMixer = null;
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
const frogTurnSpeed = Math.PI * 0.75;
// Stroke rate while swimming, and a slow paddle while floating in place.
const frogSwimTimeScale = 1;
const frogFloatTimeScale = 0.45;
// Float low in the water, with the body partly below the waterline.
const frogSwimHeight = -0.22;
// How far a swimming frog may sink below the pond floor (the shallow edges).
const frogSwimSink = 0.1;
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

// Drop the frog at a random spot in the swamp.
const spawn = swamp.randomSpawn();
let frogGroundHeight = spawn.y;
let frogSurfaceRole = 'ground';
frogPlacement.position.copy(spawn);
frogPlacement.rotation.y = Math.random() * Math.PI * 2;
let frogPond = swamp.pondAt(spawn.x, spawn.z, spawn.y);
let frogSpeed = 0;
let lastRippleAt = 0;

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
  frogSwimMixer = new THREE.AnimationMixer(swimFrog);
  for (const clip of gltf.animations) {
    frogSwimActions.push(frogSwimMixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play());
  }
}).catch((error) => {
  console.error('Could not load the swim model:', error);
});

const frogIsSwimming = () => Boolean(frogPond && swimFrog && frogSwimActions.length && !frogIsJumping);

// Show exactly one model: jump, swim (whenever the frog is in water), walk or idle.
function showFrogModel() {
  if (!idleFrog) return;
  const swimming = frogIsSwimming();
  if (jumpFrog) jumpFrog.visible = frogIsJumping;
  if (swimFrog) swimFrog.visible = swimming;
  if (walkFrog) walkFrog.visible = !frogIsJumping && !swimming && frogWalkDirection !== 0;
  idleFrog.visible = !frogIsJumping && !swimming && frogWalkDirection === 0;
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

function updateFrogMovement(delta) {
  if (!idleFrog) return 0;
  const held = (first, second) => frogKeys.has(first) || frogKeys.has(second);
  const turn = Number(held('KeyA', 'ArrowLeft')) - Number(held('KeyD', 'ArrowRight'));
  // Rotating the shared placement turns whichever model is currently visible.
  frogPlacement.rotation.y += turn * frogTurnSpeed * delta;
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
  if (frogIsSwimming()) {
    // In water the swim model replaces both idle and walk.
    if (frogWalkDirection) stopFrogWalk();
    for (const action of frogSwimActions) {
      action.setEffectiveTimeScale(direction ? direction * frogSwimTimeScale : frogFloatTimeScale);
    }
    frogSwimMixer.update(delta);
    return moveFrog(direction * frogWalkSpeed * speedMultiplier * delta, false);
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
    action.setEffectiveTimeScale(direction * frogWalkTimeScale * speedMultiplier);
  }
  frogWalkMixer.update(delta);
  return moveFrog(direction * frogWalkSpeed * speedMultiplier * delta, false);
}

function startFrogJump() {
  if (!idleFrog || frogJumpActions.length === 0 || frogIsJumping) return;
  frogIsJumping = true;
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

window.addEventListener('keydown', (event) => {
  if ((!frogMovementKeys.has(event.code) && event.code !== 'Space') || event.defaultPrevented) return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target?.isContentEditable || event.target?.closest?.(
    'input, textarea, select, button, a[href], [role="button"]'
  )) return;
  event.preventDefault();
  if (event.code === 'Space') {
    if (!event.repeat) startFrogJump();
  } else {
    frogKeys.add(event.code);
  }
});

window.addEventListener('keyup', (event) => frogKeys.delete(event.code));
window.addEventListener('blur', () => frogKeys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) frogKeys.clear();
});

// FOLLOW CAMERA ---------------------------------------------------------------
// Sits behind the frog and swings around with it, like a third-person game camera.
const cameraMinDistance = 1.2;
const cameraMaxDistance = 8;
let cameraDistance = 2.6;
let cameraYaw = frogPlacement.rotation.y;
const cameraTarget = new THREE.Vector3();
const cameraGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();

function placeCamera(delta, snap = false) {
  const position = frogPlacement.position;
  // Ease the yaw toward the frog's heading so turns feel smooth, not rigid.
  const yawDifference = Math.atan2(
    Math.sin(frogPlacement.rotation.y - cameraYaw),
    Math.cos(frogPlacement.rotation.y - cameraYaw)
  );
  const follow = (rate) => (snap ? 1 : 1 - Math.exp(-rate * delta));
  cameraYaw += yawDifference * follow(4);

  const height = 0.45 + cameraDistance * 0.38;
  cameraGoal.set(
    position.x - Math.sin(cameraYaw) * cameraDistance,
    position.y + height,
    position.z - Math.cos(cameraYaw) * cameraDistance
  );
  // Never dip below the terrain (e.g. behind the frog on a slope).
  cameraGoal.y = Math.max(cameraGoal.y, swamp.groundHeight(cameraGoal.x, cameraGoal.z) + 0.35);
  lookGoal.set(
    position.x + Math.sin(cameraYaw) * 0.8,
    position.y + 0.3,
    position.z + Math.cos(cameraYaw) * 0.8
  );

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

// LOOP ------------------------------------------------------------------------
placeCamera(0, true);
camera.position.copy(cameraGoal);

const animationTimer = new THREE.Timer();
animationTimer.connect(document);
renderer.setAnimationLoop(() => {
  animationTimer.update();
  const delta = Math.min(animationTimer.getDelta(), 0.1);
  const elapsed = animationTimer.getElapsed();

  frogMixer?.update(delta);
  const moved = updateFrogMovement(delta);
  if (frogIsJumping) frogJumpMixer.update(delta);
  frogSpeed = delta > 0 ? moved / delta : 0;

  updateFrogWater(elapsed, moved > 0);
  showFrogModel();

  // Settle smoothly onto the surface below (terrain, lily pad, log or rock),
  // or float at the waterline while swimming.
  const position = frogPlacement.position;
  const restHeight = frogIsSwimming() ? Math.max(frogGroundHeight - frogSwimSink, frogSwimHeight) : frogGroundHeight;
  position.y += (restHeight - position.y) * (1 - Math.exp(-20 * delta));
  swamp.updatePlants(position, frogRadius, frogSpeed, delta);
  placeCamera(delta);
  swamp.update(elapsed, camera);
  renderer.render(scene, camera);
});
