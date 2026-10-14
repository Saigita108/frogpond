import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import fireflyUrl from './assets/models/firefly.glb?url'

const fireflyScale = 0.4;
// Brightest point of each firefly's light pulse (candela). The exported pulse peaks above
// 10000, which lights up the whole swamp, so it is rescaled to this.
const fireflyLightPeak = 1.5;
// A light per firefly would mean 30 lights, which is slow, and three.js rebuilds every lit
// material whenever the number of lights changes (each time one is eaten). Instead a fixed
// few lights follow the fireflies closest to the frog.
const pooledLightCount = 4;

// GLTFLoader skips KHR_animation_pointer channels, which pulse the lantern's glow and light.
// Read them once; every firefly gets its own copy so they don't all share one material.
async function readPointerChannels(parser, animationIndex) {
  const channels = [];
  const animation = parser.json.animations[animationIndex];
  for (const channel of animation.channels) {
    const pointer = channel.target.extensions?.KHR_animation_pointer?.pointer;
    const glow = pointer?.match(/^\/materials\/(\d+)\/extensions\/KHR_materials_emissive_strength\/emissiveStrength$/);
    const light = pointer?.match(/^\/extensions\/KHR_lights_punctual\/lights\/\d+\/intensity$/);
    if (!glow && !light) continue;

    const sampler = animation.samplers[channel.sampler];
    channels.push({
      materialName: glow ? parser.json.materials[glow[1]].name : null,
      times: (await parser.getDependency('accessor', sampler.input)).array,
      values: (await parser.getDependency('accessor', sampler.output)).array,
      interpolation: sampler.interpolation === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear
    });
  }
  return channels;
}

// Turn the pointer channels into tracks for one firefly's own lantern material and light level.
function pointerTracks(model, lantern, channels) {
  const tracks = [];
  for (const channel of channels) {
    let target = null;
    let property = 'intensity';
    if (channel.materialName) {
      const meshes = [];
      model.traverse((object) => {
        if (object.isMesh && object.material.name === channel.materialName) meshes.push(object);
      });
      if (meshes.length === 0) continue;
      const material = meshes[0].material.clone();
      for (const mesh of meshes) mesh.material = material;
      target = meshes[0];
      property = 'material.emissiveIntensity';
    } else {
      target = lantern;
    }
    let values = channel.values;
    if (!channel.materialName) {
      const brightest = Math.max(...values);
      values = values.map((value) => value / brightest * fireflyLightPeak);
    }
    tracks.push(new THREE.NumberKeyframeTrack(`${target.uuid}.${property}`, channel.times, values, channel.interpolation));
  }
  return tracks;
}

// A random spot on the swamp, at most margin from the middle along x and z.
function fireflySpot(swamp, margin) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = (Math.random() * 2 - 1) * margin;
    const z = (Math.random() * 2 - 1) * margin;
    const surface = swamp.probeSurface(x, z);
    if (!surface) continue;
    // Over a pond the probe finds the pond floor; fly above the water (y = 0) instead.
    return new THREE.Vector3(x, Math.max(surface.height, 0), z);
  }
  return new THREE.Vector3();
}

export async function loadFireflies(scene, swamp) {
  // Add the pooled lights before anything loads, so every shader is built for this light count.
  const lights = [];
  for (let index = 0; index < pooledLightCount; index++) {
    // Same color, range and falloff as the light in firefly.glb.
    const light = new THREE.PointLight(new THREE.Color(1, 0.85, 0.25), 0, 4, 2);
    scene.add(light);
    lights.push(light);
  }

  const gltf = await new GLTFLoader().loadAsync(fireflyUrl);
  const clipIndex = gltf.parser.json.animations.findIndex((animation) => animation.name === 'Fly');
  const clip = gltf.animations[clipIndex];
  const channels = await readPointerChannels(gltf.parser, clipIndex);

  // Swap the model's own light for a marker: it keeps the light's spot and its animated
  // brightness, which a pooled light picks up when this firefly is close to the frog.
  let template = null;
  gltf.scene.traverse((object) => {
    if (object.isLight) template = object;
  });
  const marker = new THREE.Object3D();
  marker.name = 'FireflyLantern';
  (template?.parent ?? gltf.scene).add(marker);
  template?.removeFromParent();


  const fireflies = [];
  function addFirefly(margin) {
    const model = gltf.scene.clone();
    model.scale.setScalar(fireflyScale);
    model.position.copy(fireflySpot(swamp, margin));
    model.rotation.y = Math.random() * Math.PI * 2;
    scene.add(model);

    const lantern = model.getObjectByName('FireflyLantern');
    // The pulse animates this like a light's intensity.
    lantern.intensity = 0;

    const tracks = [...clip.tracks, ...pointerTracks(model, lantern, channels)];
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, tracks)).play();
    // Start each firefly at a different point of its loop.
    action.time = Math.random() * clip.duration;
    mixer.update(0);
    fireflies.push({
      model,
      body: model.getObjectByName('Hover'),
      lantern,
      lanternPosition: new THREE.Vector3(),
      mixer,
      // flying -> caught (on the tongue) -> eaten. Fireflies only leave by being eaten.
      state: 'flying'
    });
  }

  const bodyPosition = new THREE.Vector3();
  return {
    fireflies,
    // Replace the swarm with count fireflies at random spots, at most margin from the middle.
    scatter(count, margin) {
      for (const firefly of fireflies) firefly.model.removeFromParent();
      fireflies.length = 0;
      for (let index = 0; index < count; index++) addFirefly(margin);
    },
    // World position of a firefly's body; the flight moves it away from the model origin.
    bodyPosition(firefly, target) {
      return firefly.body.getWorldPosition(target);
    },
    // Stop flying and hang on the tongue, with the body at a world point.
    holdAt(firefly, point) {
      firefly.state = 'caught';
      firefly.body.getWorldPosition(bodyPosition);
      firefly.model.position.add(point).sub(bodyPosition);
    },
    swallow(firefly) {
      firefly.state = 'eaten';
      firefly.model.removeFromParent();
    },
    // Fly, and light up the fireflies nearest to a world position (the frog).
    update(delta, near) {
      for (const firefly of fireflies) {
        if (firefly.state === 'flying') firefly.mixer.update(delta);
      }
      const glowing = fireflies.filter((firefly) => firefly.model.parent);
      for (const firefly of glowing) firefly.lantern.getWorldPosition(firefly.lanternPosition);
      glowing.sort((a, b) => a.lanternPosition.distanceToSquared(near) - b.lanternPosition.distanceToSquared(near));
      lights.forEach((light, index) => {
        const firefly = glowing[index];
        // Unused lights stay in the scene at zero brightness, so the light count never changes.
        light.intensity = firefly?.lantern.intensity ?? 0;
        if (firefly) light.position.copy(firefly.lanternPosition);
      });
    }
  };
}
