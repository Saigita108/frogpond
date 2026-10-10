import './style.css'
import { mountControlsHelp } from './controls-help.js'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import frogModelUrl from './assets/models/frog-eyes.glb?url'
import { Fn, float, vec2, vec3, mat3, uv, time, fract, length, pow, min, uniform, sin, cos, exp, smoothstep } from 'three/tsl'

mountControlsHelp(document.querySelector('#app'));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe6f2e0);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(9, 10, 12);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.querySelector('#app').appendChild(renderer.domElement);

// Initialize the GPU backend before rendering or accepting input.
await renderer.init();
camera.coordinateSystem = renderer.coordinateSystem;
camera.updateProjectionMatrix();

scene.add(new THREE.HemisphereLight(0xffffff, 0x526342, 2));
const sunlight = new THREE.DirectionalLight(0xffffff, 3);
sunlight.position.set(5, 10, 7);
scene.add(sunlight);

let autoCenterPond = true;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  if (!autoCenterPond && camera.view?.enabled) {
    const view = camera.view;
    camera.setViewOffset(
      window.innerWidth, window.innerHeight,
      view.offsetX * window.innerWidth / view.fullWidth,
      view.offsetY * window.innerHeight / view.fullHeight,
      window.innerWidth, window.innerHeight
    );
  }
  camera.updateProjectionMatrix();
  if (autoCenterPond) fitPondToScreen();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// LOW-POLY DUCK POND

// Create an irregular flat shape
function createPondShape(radius, points, variation = 0) {
  const shape = new THREE.Shape();

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius * (
      1 + Math.sin(angle * 3) * variation
      + Math.cos(angle * 5) * variation * 0.5
    );

    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }

  shape.closePath();
  return shape;
}

// 1. GRASS ISLAND
const grassGeometry = new THREE.ExtrudeGeometry(
  createPondShape(5, 12, 0.04),
  {
    depth: 0.45,
    bevelEnabled: false,
    curveSegments: 1
  }
);

grassGeometry.rotateX(-Math.PI / 2);

const grass = new THREE.Mesh(
  grassGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x86b86a,
    flatShading: true
  })
);

grass.position.y = -0.45;
scene.add(grass);

// 2. DARKER WATER EDGE
const edgeGeometry = new THREE.ShapeGeometry(
  createPondShape(3.65, 11, 0.07)
);
edgeGeometry.rotateX(-Math.PI / 2);

const waterEdge = new THREE.Mesh(
  edgeGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x438d9b,
    flatShading: true,
    side: THREE.DoubleSide
  })
);

waterEdge.position.y = 0.012;
scene.add(waterEdge);

// 3. BLUE WATER SURFACE
const waterGeometry = new THREE.ShapeGeometry(
  createPondShape(3.4, 11, 0.07)
);
waterGeometry.rotateX(-Math.PI / 2);

// Each slot stores a click's shape UV coordinates, start time, and active flag.
const rippleStartedAt = performance.now();
const rippleTime = uniform(0);
const rippleLifetime = 0.9;
const ripples = Array.from({ length: 8 }, () => uniform(new THREE.Vector4(0, 0, 0, 0)));
let nextRipple = 0;

const waterRipples = Fn(() => {
  const distortion = vec2(0).toVar();
  const lighting = float(0).toVar();

  for (const ripple of ripples) {
    const age = rippleTime.sub(ripple.z).max(0);
    const delta = uv().sub(ripple.xy);
    const distance = length(delta);
    const front = distance.sub(age.mul(0.8));
    const fade = float(1).sub(age.div(rippleLifetime)).clamp(0, 1)
      .mul(smoothstep(0, 0.08, age)).mul(ripple.w);
    const envelope = exp(front.mul(8).pow(2).negate()).mul(fade.pow(2));
    const phase = front.mul(38);

    // Expanding wave packets distort the texture and add bright/dark rings.
    distortion.addAssign(delta.div(distance.max(0.001))
      .mul(sin(phase)).mul(envelope).mul(0.035));
    lighting.addAssign(cos(phase).mul(envelope).mul(0.16));
  }

  return vec3(distortion, lighting);
});

// 2D Top Down Water
// Shadertoy source: https://www.shadertoy.com/view/wt2GRt
// Ported from the supplied GLSL to TSL for the WebGPU renderer.
const topDownWater = Fn(() => {
  const ripple = waterRipples().toVar();
  // ShapeGeometry UVs are shape coordinates: normalize, then repeat the tile.
  const waterRepeats = 4; // Increase for a smaller water pattern.
  const waterUV = uv().add(ripple.xy).div(6.8).add(0.5).mul(waterRepeats);
  const background = vec3(0.192156862745098, 0.6627450980392157, 0.9333333333333333);
  // Only k.xyw is used in the original shader; store it as a vec3.
  const k = vec3(waterUV.mul(7), time.mul(0.8)).toVar();
  const transform = mat3(
    vec3(-2, -1, 0),
    vec3(3, -1, 1),
    vec3(1, -1, -1)
  );

  // Preserve the original vector * matrix order and three successive updates.
  k.assign(k.mul(transform));
  const val1 = length(float(0.5).sub(fract(k.mul(0.5)))).toVar();
  k.assign(k.mul(transform));
  const val2 = length(float(0.5).sub(fract(k.mul(0.2)))).toVar();
  k.assign(k.mul(transform));
  const val3 = length(float(0.5).sub(fract(k.mul(0.5)))).toVar();
  const highlights = pow(min(min(val1, val2), val3), 7).mul(3);
  return background.add(vec3(highlights)).add(vec3(ripple.z)).max(0);
});

const waterMaterial = new THREE.MeshBasicNodeMaterial({
  side: THREE.DoubleSide,
  toneMapped: false
});
waterMaterial.colorNode = topDownWater();

const water = new THREE.Mesh(waterGeometry, waterMaterial);

water.position.y = 0.025;
scene.add(water);

// Keep placement separate from the model's animated transforms.
let frogMixer = null;
const frogPlacement = new THREE.Group();
frogPlacement.position.set(-4.15, 0.004, 0.65);
frogPlacement.rotation.y = Math.atan2(4.15, -0.65);
scene.add(frogPlacement);

new GLTFLoader().loadAsync(frogModelUrl).then((gltf) => {
  const frog = gltf.scene;
  frog.scale.setScalar(0.5);

  // Rest the feet on the grass, accounting for the asset's origin.
  const bounds = new THREE.Box3().setFromObject(frog);
  frog.position.y -= bounds.min.y;
  frogPlacement.add(frog);

  frogMixer = new THREE.AnimationMixer(frog);
  for (const clip of gltf.animations) {
    frogMixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play();
  }
}).catch((error) => {
  console.error('Could not load the frog model:', error);
});

const waterRaycaster = new THREE.Raycaster();
const pointerPosition = new THREE.Vector2();
let waterClick = null;
const hasInteractionModifier = (event) => event.shiftKey || event.ctrlKey || event.metaKey;

renderer.domElement.addEventListener('pointerdown', (event) => {
  waterClick = event.button === 0 && !hasInteractionModifier(event)
    ? { id: event.pointerId, x: event.clientX, y: event.clientY }
    : null;
});

renderer.domElement.addEventListener('pointerup', (event) => {
  const click = waterClick;
  waterClick = null;
  if (!click || event.pointerId !== click.id || event.button !== 0 || hasInteractionModifier(event)) return;
  if (Math.hypot(event.clientX - click.x, event.clientY - click.y) > 5) return;

  const bounds = renderer.domElement.getBoundingClientRect();
  pointerPosition.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  camera.updateMatrixWorld(true);
  water.updateMatrixWorld(true);
  waterRaycaster.setFromCamera(pointerPosition, camera);
  const hit = waterRaycaster.intersectObject(water, false)[0];
  if (!hit?.uv) return;

  ripples[nextRipple].value.set(
    hit.uv.x, hit.uv.y, (performance.now() - rippleStartedAt) / 1000, 1
  );
  nextRipple = (nextRipple + 1) % ripples.length;
});

renderer.domElement.addEventListener('pointercancel', () => {
  waterClick = null;
});

// Keep the island within 90% of the viewport at every screen size.
function fitPondToScreen() {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const verticalSlope = Math.tan(verticalFov / 2) * 0.9;
  const horizontalSlope = verticalSlope * camera.aspect;
  const viewRotation = camera.quaternion.clone().invert();
  const vertex = new THREE.Vector3();
  let distance = 0;

  for (const mesh of [grass, waterEdge, water]) {
    mesh.updateMatrixWorld(true);
    const positions = mesh.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld)
        .applyQuaternion(viewRotation);
      distance = Math.max(
        distance,
        vertex.z + Math.abs(vertex.x) / horizontalSlope,
        vertex.z + Math.abs(vertex.y) / verticalSlope
      );
    }
  }

  camera.position.normalize().multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  centerPondInView();
}

function centerPondInView() {
  camera.clearViewOffset();
  camera.updateMatrixWorld(true);

  // Center the projected outline, since perspective shifts its visual center.
  const vertex = new THREE.Vector3();
  const bounds = new THREE.Box2();
  for (const mesh of [grass, waterEdge, water]) {
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld)
        .project(camera);
      bounds.expandByPoint(new THREE.Vector2(vertex.x, vertex.y));
    }
  }

  const center = bounds.getCenter(new THREE.Vector2());
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.setViewOffset(
    width, height,
    center.x * width / 2, -center.y * height / 2,
    width, height
  );
}

fitPondToScreen();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = true;
controls.enableZoom = true;
controls.zoomSpeed = 0.8;
controls.minDistance = 3;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
// Enable left-drag only with a modifier; ordinary clicks still make ripples.
controls.mouseButtons.LEFT = null;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = null;

const trackpadOrbit = new THREE.Spherical();
const trackpadOffset = new THREE.Vector3();
let trackpadPinch = null;

renderer.domElement.addEventListener('wheel', (event) => {
  if (!controls.enabled) return;
  // Safari can also send wheel events during its native pinch gesture.
  if (trackpadPinch) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  // Ctrl+wheel represents a trackpad pinch: let OrbitControls zoom.
  if (event.ctrlKey || event.deltaMode !== 0) return;

  // WheelEvent has no device identifier. Keep typical discrete mouse-wheel
  // steps as zoom; treat smooth pixel scrolling as two-finger rotation.
  const discreteWheel = event.deltaX === 0 && (
    Math.abs(event.wheelDeltaY) === 120 ||
    (Math.abs(event.deltaY) >= 100 && event.deltaY % 100 === 0)
  );
  if (discreteWheel) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (!controls.enableRotate) return;

  trackpadOffset.copy(camera.position).sub(controls.target);
  trackpadOrbit.setFromVector3(trackpadOffset);
  trackpadOrbit.theta += event.deltaX * 0.004;
  trackpadOrbit.phi = THREE.MathUtils.clamp(
    trackpadOrbit.phi + event.deltaY * 0.004,
    Math.max(0.02, controls.minPolarAngle),
    controls.maxPolarAngle
  );
  camera.position.copy(controls.target).add(trackpadOffset.setFromSpherical(trackpadOrbit));
  controls.update();
}, { capture: true, passive: false });

// Safari exposes trackpad pinches through GestureEvent rather than Ctrl+wheel.
renderer.domElement.addEventListener('gesturestart', (event) => {
  if (!controls.enabled || !controls.enableZoom) return;
  event.preventDefault();
  trackpadPinch = { distance: controls.getDistance(), scale: event.scale };
}, { passive: false });

renderer.domElement.addEventListener('gesturechange', (event) => {
  if (!trackpadPinch) return;
  event.preventDefault();
  const distance = THREE.MathUtils.clamp(
    trackpadPinch.distance / Math.pow(event.scale / trackpadPinch.scale, controls.zoomSpeed),
    controls.minDistance, controls.maxDistance
  );
  trackpadOffset.copy(camera.position).sub(controls.target).setLength(distance);
  camera.position.copy(controls.target).add(trackpadOffset);
  controls.update();
}, { passive: false });

renderer.domElement.addEventListener('gestureend', (event) => {
  if (trackpadPinch) event.preventDefault();
  trackpadPinch = null;
}, { passive: false });

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 0) {
    // OrbitControls switches ROTATE to panning when Shift is held.
    controls.mouseButtons.LEFT = event.shiftKey
      ? THREE.MOUSE.ROTATE
      : (event.ctrlKey || event.metaKey ? THREE.MOUSE.PAN : null);
  }
  if (event.button === 1) {
    event.preventDefault();
  }
}, { capture: true });

renderer.domElement.addEventListener('auxclick', (event) => {
  if (event.button === 1) event.preventDefault();
});

controls.addEventListener('change', () => {
  // Once panned, preserve the user's framing during rotation and zoom.
  if (controls.target.lengthSq() > 0.000001) autoCenterPond = false;
  if (autoCenterPond) centerPondInView();
});

// Continuous rendering updates the shader's time uniform even while idle.
const animationTimer = new THREE.Timer();
animationTimer.connect(document);
renderer.setAnimationLoop(() => {
  animationTimer.update();
  frogMixer?.update(animationTimer.getDelta());
  rippleTime.value = (performance.now() - rippleStartedAt) / 1000;
  renderer.render(scene, camera);
});
