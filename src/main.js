import './style.css'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Fn, float, vec2, vec3, uv, time, sin, cos, mod, length, pow, abs, clamp } from 'three/tsl'

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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  fitPondToScreen();
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

// Tileable Water Caustic by David Hoskins; original turbulence by joltz0r.
// Shadertoy source: https://www.shadertoy.com/view/MdlXz8
// Ported from the supplied GLSL to TSL for the WebGPU renderer.
const waterCaustics = Fn(() => {
  const tau = 6.28318530718;
  const iterations = 5;
  const intensity = 0.005;
  const shaderTime = time.mul(0.5).add(23).toVar();
  // ShapeGeometry UVs are shape coordinates: normalize, then repeat the tile.
  const waterRepeats = 4; // Increase for smaller, more frequent caustics.
  const waterUV = uv().div(6.8).add(0.5).mul(waterRepeats);
  const p = mod(waterUV.mul(tau), tau).sub(250).toVar();
  const swirl = vec2(p).toVar();
  const c = float(1).toVar();

  for (let n = 0; n < iterations; n++) {
    const t = shaderTime.mul(1 - 3.5 / (n + 1));
    swirl.assign(p.add(vec2(
      cos(t.sub(swirl.x)).add(sin(t.add(swirl.y))),
      sin(t.sub(swirl.y)).add(cos(t.add(swirl.x)))
    )));
    // Multiplying by intensity/sin is equivalent to the original divisions.
    const turbulence = vec2(
      p.x.mul(intensity).div(sin(swirl.x.add(t))),
      p.y.mul(intensity).div(cos(swirl.y.add(t)))
    );
    c.addAssign(float(1).div(length(turbulence).max(0.000001)));
  }

  c.divAssign(iterations);
  c.assign(float(1.17).sub(pow(c, 1.4)));
  const highlights = vec3(pow(abs(c), 8));
  return clamp(highlights.add(vec3(0, 0.35, 0.5)), 0, 1);
});

const waterMaterial = new THREE.MeshBasicNodeMaterial({
  side: THREE.DoubleSide,
  toneMapped: false
});
waterMaterial.colorNode = waterCaustics();

const water = new THREE.Mesh(waterGeometry, waterMaterial);

water.position.y = 0.025;
scene.add(water);

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
controls.enablePan = false;
controls.enableZoom = false;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
// OrbitControls switches PAN to rotation when Shift is held.
// With panning disabled, an ordinary left drag has no effect.
controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button === 1) {
    event.preventDefault();
    controls.mouseButtons.MIDDLE = event.shiftKey || event.ctrlKey || event.metaKey
      ? THREE.MOUSE.PAN
      : THREE.MOUSE.ROTATE;
  }
}, { capture: true });

renderer.domElement.addEventListener('auxclick', (event) => {
  if (event.button === 1) event.preventDefault();
});

controls.addEventListener('change', () => {
  centerPondInView();
});

// Continuous rendering updates the shader's time uniform even while idle.
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
