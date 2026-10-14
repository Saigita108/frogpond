import * as THREE from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import explosionUrl from './assets/models/explosion-effect/explosion.glb?url'

// Which three.js material property each animated glTF material pointer drives.
const POINTER_PROPERTIES = {
  'emissiveFactor': ['emissive', THREE.ColorKeyframeTrack],
  'extensions/KHR_materials_emissive_strength/emissiveStrength': ['emissiveIntensity', THREE.NumberKeyframeTrack],
  'pbrMetallicRoughness/baseColorFactor': ['color', THREE.ColorKeyframeTrack]
};

// GLTFLoader skips KHR_animation_pointer channels, which fade the fire's glow and the smoke.
// Rebuild them as material tracks so the explosion burns out instead of popping.
async function materialPointerTracks(parser, scene) {
  const tracks = [];
  const animation = parser.json.animations?.[0];
  if (!animation) return tracks;

  for (const channel of animation.channels) {
    const pointer = channel.target.extensions?.KHR_animation_pointer?.pointer;
    const match = pointer?.match(/^\/materials\/(\d+)\/(.+)$/);
    if (!match || !POINTER_PROPERTIES[match[2]]) continue;
    const materialName = parser.json.materials[match[1]].name;
    const meshes = [];
    scene.traverse((object) => {
      if (object.isMesh && object.material.name === materialName) meshes.push(object);
    });
    if (meshes.length === 0) continue;

    const sampler = animation.samplers[channel.sampler];
    const times = (await parser.getDependency('accessor', sampler.input)).array;
    const values = (await parser.getDependency('accessor', sampler.output)).array;
    const interpolation = sampler.interpolation === 'STEP' ? THREE.InterpolateDiscrete : THREE.InterpolateLinear;
    const [property, TrackType] = POINTER_PROPERTIES[match[2]];
    const isRgba = match[2] === 'pbrMetallicRoughness/baseColorFactor';
    const rgb = isRgba ? values.filter((_, index) => index % 4 !== 3) : values;

    // The material is shared, so one mesh using it is enough to animate it.
    const target = meshes[0].uuid;
    tracks.push(new TrackType(`${target}.material.${property}`, times, rgb, interpolation));
    if (isRgba) {
      const alpha = values.filter((_, index) => index % 4 === 3);
      tracks.push(new THREE.NumberKeyframeTrack(`${target}.material.opacity`, times, alpha, interpolation));
    }
  }
  return tracks;
}

export async function loadExplosion(scene, scale) {
  const gltf = await new GLTFLoader().loadAsync(explosionUrl);
  const explosion = gltf.scene;
  explosion.scale.setScalar(scale);
  explosion.visible = false;
  scene.add(explosion);

  const clip = gltf.animations[0];
  clip.tracks.push(...await materialPointerTracks(gltf.parser, explosion));
  clip.resetDuration();

  const mixer = new THREE.AnimationMixer(explosion);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  let onFinished = null;
  mixer.addEventListener('finished', () => {
    explosion.visible = false;
    onFinished?.();
  });

  return {
    model: explosion,
    // Play the explosion once at a world position, then call done().
    play(position, done) {
      explosion.position.copy(position);
      explosion.visible = true;
      onFinished = done;
      action.reset().play();
      mixer.update(0);
    },
    update(delta) {
      if (explosion.visible) mixer.update(delta);
    }
  };
}
