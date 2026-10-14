import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import fireflyUrl from './assets/models/firefly.glb?url'

const fireflyScale = 0.4;
// The Fly clip loops around the model origin; keep the whole loop inside the spawn radius.
const flightRadius = 1;
// Brightest point of each firefly's light pulse (candela). The exported pulse peaks above
// 10000, which lights up the whole swamp, so it is rescaled to this.
const fireflyLightPeak = 1.5;

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

// Turn the pointer channels into tracks for one firefly's own lantern material and light.
function pointerTracks(model, channels) {
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
      model.traverse((object) => {
        if (object.isLight) target = object;
      });
      if (!target) continue;
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

// A random spot within radius of center that is inside the world.
function fireflySpot(swamp, center, radius) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    // sqrt spreads the fireflies evenly over the disc instead of bunching them in the middle.
    const distance = Math.sqrt(Math.random()) * radius;
    const x = center.x + Math.sin(angle) * distance;
    const z = center.z + Math.cos(angle) * distance;
    const surface = swamp.probeSurface(x, z);
    if (!surface) continue;
    // Over a pond the probe finds the pond floor; fly above the water (y = 0) instead.
    return new THREE.Vector3(x, Math.max(surface.height, 0), z);
  }
  return center.clone();
}

export async function loadFireflies(scene, swamp, center, count, radius) {
  const gltf = await new GLTFLoader().loadAsync(fireflyUrl);
  const clipIndex = gltf.parser.json.animations.findIndex((animation) => animation.name === 'Fly');
  const clip = gltf.animations[clipIndex];
  const channels = await readPointerChannels(gltf.parser, clipIndex);

  const fireflies = [];
  for (let index = 0; index < count; index++) {
    const model = gltf.scene.clone();
    model.scale.setScalar(fireflyScale);
    model.position.copy(fireflySpot(swamp, center, radius - flightRadius));
    model.rotation.y = Math.random() * Math.PI * 2;
    scene.add(model);

    const tracks = [...clip.tracks, ...pointerTracks(model, channels)];
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(new THREE.AnimationClip(clip.name, clip.duration, tracks)).play();
    // Start each firefly at a different point of its loop.
    action.time = Math.random() * clip.duration;
    mixer.update(0);
    fireflies.push({ model, body: model.getObjectByName('Hover'), mixer, state: 'flying' });
  }

  const bodyPosition = new THREE.Vector3();
  return {
    fireflies,
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
    update(delta) {
      for (const firefly of fireflies) {
        if (firefly.state === 'flying') firefly.mixer.update(delta);
      }
    }
  };
}
