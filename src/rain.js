import * as THREE from 'three/webgpu'
import { Fn, vec2, vec3, vec4, uniform, uv, texture, time, pow, positionGeometry } from 'three/tsl'
import { createRainSound } from './rain-sound.js'

// Banished
// Shadertoy source: https://www.shadertoy.com/view/XsX3DB
// The rain from the end of mainImage is ported (GLSL to TSL) and drawn over the swamp as a
// full-screen layer. The lightning's flicker comes from Render(); here it also lights the 3D
// swamp. The dog and the kennel are left out.

// How bright the drops are, on top of the original's strength.
const rainBrightness = 0.75;
// The original keeps noise peaks above pow(f, 23); a higher power keeps fewer, so less rain.
const rainSparseness = 34;
// Seconds for the rain to fade in or out when it is switched on or off.
const rainFadeTime = 1.5;
// How far the streaks lean when the wind blows straight across the view.
const windLean = 0.8;
// Seconds between lightning strikes, picked at random in this range.
const strikeInterval = [8, 20];
// How strongly a flash lights the swamp, and its cold blue-white color (the original's 1.9, 1.9, 3.7).
const flashLightIntensity = 3;
const flashColor = new THREE.Color(1.9, 1.9, 3.7).multiplyScalar(1 / 3.7);

// The original's flicker: four quick pulses, each rising in 0.05 s and dying away over 0.4 s.
// t is seconds since the strike began; returns the summed brightness (0 when it is over).
const pulseOffsets = [0.25, 0.5, 0.65, 0.9];
// The last pulse has died away 0.5 s after it starts.
const strikeLength = pulseOffsets.at(-1) - 0.25 + 0.5;
function lightningAt(t, pulses) {
  const smoothstep = THREE.MathUtils.smoothstep;
  let flash = 0;
  for (const offset of pulses) {
    const start = offset - 0.25;
    flash += smoothstep(t, start, start + 0.05) * (1 - smoothstep(t, start + 0.1, start + 0.5));
  }
  return flash;
}

// Shadertoy's iChannel3: a 256 × 256 texture of random values that repeats and is sampled smoothly.
function noiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  for (let index = 0; index < data.length; index++) data[index] = Math.floor(Math.random() * 256);
  const noise = new THREE.DataTexture(data, size, size);
  noise.wrapS = THREE.RepeatWrapping;
  noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = THREE.LinearFilter;
  noise.minFilter = THREE.LinearFilter;
  noise.needsUpdate = true;
  return noise;
}

export function createRain(scene, swamp, startRaining = true) {
  const noise = noiseTexture();
  // 0 = dry, 1 = full rain.
  const amount = uniform(startRaining ? 1 : 0);
  const aspect = uniform(1);
  const lean = uniform(0);
  // 0 normally, up to about 2 during a lightning strike.
  const flash = uniform(0);

  const rain = Fn(() => {
    // The quad's UV is the original's q: 0..1 across the screen, y pointing up.
    const q = uv();
    const p = q.mul(2).sub(1).mul(vec2(aspect, 1));
    // Squashing the noise vertically (0.01) stretches it into streaks; scrolling it makes them
    // fall, and the lean shifts the top of the screen sideways like rain in the wind.
    const st = p.mul(vec2(0.5, 0.01)).add(vec2(time.mul(0.3).add(q.y.mul(0.6).mul(lean)), time.mul(0.3)));
    // Two samples at different scales hide the texture repeating.
    const f = texture(noise, st).y.mul(texture(noise, st.mul(0.773)).x).mul(1.55);
    // Only the brightest peaks become drops, fainter toward the bottom of the screen.
    // The original multiplies by (lightning * 0.7 + 1), so the drops glint during a flash.
    const drops = pow(f, rainSparseness).mul(13).clamp(0, q.y.mul(0.14)).mul(flash.mul(0.7).add(1));
    const rainColor = vec3(0.8, 0.88, 1).mul(drops).mul(rainBrightness);
    // A faint blue-white wash over the whole screen, so the flash also reaches what is in shadow.
    const sky = vec3(flashColor.r, flashColor.g, flashColor.b).mul(flash).mul(0.06);
    return rainColor.add(sky).mul(amount);
  });

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    fog: false
  });
  // Skip the camera: the plane's corners (-1..1) go straight to the corners of the screen.
  material.vertexNode = vec4(positionGeometry.xy, 0, 1);
  material.colorNode = rain();

  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  overlay.frustumCulled = false;
  overlay.renderOrder = 1000;
  scene.add(overlay);

  // The flash lights the swamp from above. The light is always there (at 0 between strikes),
  // so the number of lights never changes and no shaders need rebuilding.
  const flashLight = new THREE.DirectionalLight(flashColor, 0);
  flashLight.position.set(-3, 13, -5);
  scene.add(flashLight);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const randomInterval = () => THREE.MathUtils.randFloat(...strikeInterval);
  let nextStrikeIn = randomInterval();
  let strikeTime = null;

  let raining = startRaining;
  // The rain's hiss and the thunder, from the same Shadertoy (see rain-sound.js).
  const sound = createRainSound();
  const forward = new THREE.Vector3();

  return {
    setRaining(on) {
      raining = on;
    },
    update(camera, delta) {
      const step = delta / rainFadeTime;
      amount.value = THREE.MathUtils.clamp(amount.value + (raining ? step : -step), 0, 1);
      overlay.visible = amount.value > 0;
      swamp.setRain(amount.value);
      sound.setLevel(amount.value);

      // Lightning only strikes while it rains.
      if (strikeTime === null) {
        nextStrikeIn -= delta;
        if (nextStrikeIn <= 0 && amount.value > 0.5) {
          strikeTime = 0;
          sound.thunder();
        }
      } else {
        strikeTime += delta;
        if (strikeTime > strikeLength) {
          strikeTime = null;
          nextStrikeIn = randomInterval();
        }
      }
      // With reduced motion: one softer pulse instead of the flicker.
      const pulses = reducedMotion.matches ? pulseOffsets.slice(0, 1) : pulseOffsets;
      const strength = reducedMotion.matches ? 0.5 : 1;
      flash.value = strikeTime === null ? 0 : lightningAt(strikeTime, pulses) * strength * amount.value;
      flashLight.intensity = flash.value * flashLightIntensity;

      aspect.value = camera.aspect;
      // The wind blows along world x. Its sideways part on screen is the camera's right
      // vector (-forward.z, 0, forward.x) along x, so the rain leans more when you face across it.
      camera.getWorldDirection(forward);
      lean.value = -forward.z * windLean;
    }
  };
}
