import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Fn, float, vec2, vec3, mat3, uv, time, fract, length, pow, min, uniform, sin, cos, exp, smoothstep, positionWorld } from 'three/tsl'
import swampUrl from './assets/models/FrogGame_Swamp/swamp_world.glb?url'

// Solid objects the frog can stand on (see README: ground, lily_pad, rock, log).
const SURFACE_ROLES = new Set(['ground', 'lily_pad', 'rock', 'log']);
const PLANT_UPDATE_DISTANCE = 10;

export async function loadSwamp(scene) {
  const gltf = await new GLTFLoader().loadAsync(swampUrl);
  const world = gltf.scene;
  scene.add(world);
  world.updateMatrixWorld(true);

  // Every node carries its game settings in userData (glTF extras).
  const byRole = {};
  world.traverse((object) => {
    const role = object.userData.game_role;
    if (role) (byRole[role] ??= []).push(object);
  });

  // Moonlight comes in with Blender's (physical) intensity; scale it for three.js.
  world.traverse((object) => {
    if (object.isDirectionalLight) object.intensity = 1.8;
  });

  // SURFACES ---------------------------------------------------------------
  const surfaceRole = new Map();
  const surfaces = [];
  for (const role of SURFACE_ROLES) {
    for (const object of byRole[role] ?? []) {
      surfaces.push(object);
      object.traverse((child) => {
        if (child.isMesh) surfaceRole.set(child, role);
      });
    }
  }
  const terrain = byRole.ground ?? [];

  const raycaster = new THREE.Raycaster();
  const rayOrigin = new THREE.Vector3();
  const down = new THREE.Vector3(0, -1, 0);

  // Highest walkable surface below (x, 20, z), or null outside the world.
  function probeSurface(x, z, targets = surfaces) {
    rayOrigin.set(x, 20, z);
    raycaster.set(rayOrigin, down);
    const hit = raycaster.intersectObjects(targets, true)[0];
    return hit ? { height: hit.point.y, role: surfaceRole.get(hit.object) } : null;
  }

  const groundHeight = (x, z) => probeSurface(x, z, terrain)?.height ?? 0;

  // Trees use a cylinder collider around their trunk.
  const trees = (byRole.tree ?? []).map((tree) => ({
    x: tree.position.x,
    z: tree.position.z,
    radius: tree.userData.collider_radius ?? 0.4
  }));

  // WATER ------------------------------------------------------------------
  const ponds = (byRole.water ?? []).map((pond) => ({
    x: pond.position.x,
    z: pond.position.z,
    radius: pond.userData.pond_radius ?? 8,
    props: pond.userData
  }));
  const waterProps = ponds[0]?.props ?? {};

  function pondAt(x, z, height = 0) {
    if (height > 0.05) return null;
    return ponds.find((pond) => Math.hypot(x - pond.x, z - pond.z) < pond.radius * 1.1) ?? null;
  }

  // Each slot stores a ripple's world x/z, start time, and strength.
  const rippleStartedAt = performance.now();
  const rippleTime = uniform(0);
  const rippleSpeed = waterProps.ripple_speed ?? 1.5;
  const rippleLifetime = waterProps.ripple_decay ?? 1.2;
  const ripples = Array.from({ length: 12 }, () => uniform(new THREE.Vector4(0, 0, 0, 0)));
  let nextRipple = 0;

  function addRipple(x, z, strength = 1) {
    ripples[nextRipple].value.set(x, z, rippleTime.value, strength);
    nextRipple = (nextRipple + 1) % ripples.length;
  }

  const waterRipples = Fn(() => {
    const distortion = vec2(0).toVar();
    const lighting = float(0).toVar();

    for (const ripple of ripples) {
      const age = rippleTime.sub(ripple.z).max(0);
      const delta = positionWorld.xz.sub(ripple.xy);
      const distance = length(delta);
      const front = distance.sub(age.mul(rippleSpeed));
      const fade = float(1).sub(age.div(rippleLifetime)).clamp(0, 1)
        .mul(smoothstep(0, 0.08, age)).mul(ripple.w);
      const envelope = exp(front.mul(5).pow(2).negate()).mul(fade.pow(2));
      const phase = front.mul(24);

      // Expanding wave packets distort the texture and add bright/dark rings.
      distortion.addAssign(delta.div(distance.max(0.001))
        .mul(sin(phase)).mul(envelope).mul(0.06));
      lighting.addAssign(cos(phase).mul(envelope).mul(0.16));
    }

    return vec3(distortion, lighting);
  });

  // 2D Top Down Water
  // Shadertoy source: https://www.shadertoy.com/view/wt2GRt
  // Ported from the supplied GLSL to TSL for the WebGPU renderer.
  const topDownWater = Fn(() => {
    const ripple = waterRipples().toVar();
    // UV 1 is world meters / 4, so the pattern is seamless across all ponds.
    const waterRepeats = 2.4; // Increase for a smaller water pattern.
    const waterUV = uv(1).mul(waterRepeats).add(ripple.xy);
    const background = vec3(0.05, 0.2, 0.32);
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
    const highlights = pow(min(min(val1, val2), val3), 7).mul(1.4);
    return background.add(vec3(highlights)).add(vec3(ripple.z)).max(0);
  });

  // Slightly see-through, so the pond floor and the frog's legs show underneath.
  const waterOpacity = 0.25;
  const waterMaterial = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: waterOpacity,
    depthWrite: false
  });
  waterMaterial.colorNode = topDownWater();

  // SKY --------------------------------------------------------------------
  const sky = byRole.backdrop?.[0];
  world.traverse((object) => {
    if (!object.isMesh) return;
    if (object.material.name === 'Water_Shader_Slot') object.material = waterMaterial;
    if (object.material.name === 'Sky_Dome_Unlit') {
      const source = object.material;
      object.material = new THREE.MeshBasicNodeMaterial({
        map: source.emissiveMap ?? source.map,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false
      });
      object.renderOrder = -1;
      object.frustumCulled = false;
    }
  });

  // PLANTS -----------------------------------------------------------------
  const plants = (byRole.bendable_plant ?? []).map((plant) => {
    const meshes = [];
    plant.traverse((child) => {
      if (child.morphTargetInfluences?.length >= 2) meshes.push(child);
    });
    const props = plant.userData;
    return {
      plant,
      meshes,
      inverseRotation: plant.getWorldQuaternion(new THREE.Quaternion()).invert(),
      position: plant.getWorldPosition(new THREE.Vector3()),
      hitRadius: props.hit_radius ?? 0.25,
      stiffness: props.bend_stiffness ?? 18,
      damping: props.bend_damping ?? 3,
      amount: 0,
      velocity: 0,
      direction: new THREE.Vector3(1, 0, 0)
    };
  });

  // Spring-based bending (README "Plant bending").
  function updatePlants(frogPosition, frogRadius, frogSpeed, delta) {
    for (const p of plants) {
      const dx = p.position.x - frogPosition.x;
      const dz = p.position.z - frogPosition.z;
      const distance = Math.hypot(dx, dz);
      if (distance > PLANT_UPDATE_DISTANCE) continue;
      const resting = Math.abs(p.amount) < 0.0005 && Math.abs(p.velocity) < 0.0005;

      if (distance < p.hitRadius + frogRadius && frogSpeed > 0.05) {
        // Direction from the frog to the plant, measured in the plant's local space.
        p.direction.set(dx, 0, dz).normalize().applyQuaternion(p.inverseRotation);
        p.velocity += 25 * frogSpeed * delta;
      } else if (resting) {
        continue;
      }

      const acceleration = -p.stiffness * p.amount - p.damping * p.velocity;
      p.velocity += acceleration * delta;
      p.amount = THREE.MathUtils.clamp(p.amount + p.velocity * delta, -1, 1);
      // BendX bends toward local +X, BendY toward glTF -Z.
      for (const mesh of p.meshes) {
        mesh.morphTargetInfluences[0] = p.direction.x * p.amount;
        mesh.morphTargetInfluences[1] = -p.direction.z * p.amount;
      }
    }
  }

  // FIREFLIES --------------------------------------------------------------
  const fireflies = (byRole.firefly ?? []).map((firefly) => ({
    firefly,
    anchor: firefly.position.clone(),
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 0.4,
    drift: 0.15 + Math.random() * 0.25
  }));

  function updateFireflies(elapsed) {
    for (const { firefly, anchor, phase, speed, drift } of fireflies) {
      const motion = elapsed * speed + phase;
      firefly.position.set(
        anchor.x + Math.sin(motion) * drift,
        anchor.y + Math.sin(motion * 1.3 + phase) * 0.16,
        anchor.z + Math.cos(motion * 0.8 + phase) * drift
      );
    }
  }

  // SPAWN ------------------------------------------------------------------
  // A random dry spot on the terrain, clear of ponds and tree trunks.
  function randomSpawn(margin = 26) {
    for (let attempt = 0; attempt < 300; attempt++) {
      const x = (Math.random() * 2 - 1) * margin;
      const z = (Math.random() * 2 - 1) * margin;
      if (ponds.some((pond) => Math.hypot(x - pond.x, z - pond.z) < pond.radius * 1.1 + 0.5)) continue;
      if (trees.some((tree) => Math.hypot(x - tree.x, z - tree.z) < tree.radius + 0.8)) continue;
      const surface = probeSurface(x, z);
      if (surface?.role !== 'ground' || surface.height > 1.5) continue;
      return new THREE.Vector3(x, surface.height, z);
    }
    const spawn = byRole.player_spawn?.[0];
    const fallback = spawn ? spawn.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    fallback.y = probeSurface(fallback.x, fallback.z)?.height ?? fallback.y;
    return fallback;
  }

  return {
    world,
    sky,
    trees,
    isWater: (object) => object.material === waterMaterial,
    probeSurface,
    groundHeight,
    pondAt,
    addRipple,
    randomSpawn,
    update(elapsed, camera) {
      rippleTime.value = (performance.now() - rippleStartedAt) / 1000;
      updateFireflies(elapsed);
      // follow_camera_xy: keep the sky dome centred on the camera.
      if (sky) sky.position.set(camera.position.x, 0, camera.position.z);
    },
    updatePlants
  };
}
