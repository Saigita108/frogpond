import './style.css'
import * as THREE from 'three'

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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.querySelector('#app').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x526342, 2));
const sunlight = new THREE.DirectionalLight(0xffffff, 3);
sunlight.position.set(5, 10, 7);
scene.add(sunlight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.render(scene, camera);
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

const water = new THREE.Mesh(
  waterGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x79cbd4,
    roughness: 0.45,
    flatShading: true,
    side: THREE.DoubleSide
  })
);

water.position.y = 0.025;
scene.add(water);

renderer.render(scene, camera);
