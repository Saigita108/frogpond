# Frog Pond

A night-time swamp where you play a frog racing the sunrise: hop between lily pads, swim through the ponds and catch all 10 fireflies with your tongue before dawn. Built with three.js and the `WebGPURenderer`.

**Live demo:** https://saigita108.github.io/frogpond/

## Shadertoy shader

The pond water is a port of **2D Top Down Water**:
https://www.shadertoy.com/view/wt2GRt

The original GLSL fragment shader is rewritten in TSL (three.js Shading Language) so it runs on the WebGPU renderer. See `topDownWater` in [`src/swamp.js`](src/swamp.js). Changes from the original:

- It uses the water mesh's second UV set (world meters / 4) instead of `fragCoord / iResolution`, so the pattern runs seamlessly across all six ponds.
- It is combined with a second shader of my own, `waterRipples`, which adds expanding wave rings that bend the water pattern and light it up.

### How the shader responds to interaction

- **Click or tap the water** and a ripple spreads out from that spot.
- **The frog makes ripples:** a splash when it enters a pond, ripples as it swims, and a ripple when it flicks its tongue in the water.

## Controls

| Action | Keys |
|---|---|
| Walk forward / backward | `W` / `S` or `↑` / `↓` |
| Run (or swim fast) | Double-tap `W` / `↑` and hold the second press |
| Turn | `A` / `D` or `←` / `→` |
| Jump | `Space` |
| Flick the tongue to eat a firefly | `F` |
| Zoom | Pinch, or scroll the mouse wheel |
| Look around the frog | Choose **Look around** (top left), then swipe or drag. `Esc` goes back to **Follow**. |
| Make ripples | Click the water |
| Start over | **Reset** (top right) |

The **i** button in the top right shows the controls in the game as well.

## Gameplay: race the night

Eat all **10 fireflies** before the sun comes up, in **3 minutes**.

- **The clock** (top center) starts with the frog's first move and counts down to sunrise. In the last 30 seconds it glows amber.
- **Dawn comes slowly:** after about a minute the sky, fog, light and water start warming toward sunrise. From about 1:48, fireflies start flying off one by one, and the last ones leave at sunrise.
- **Catching:** press `F` when a firefly is within 1 m in front of the frog. The tongue aims at it, stretches to reach it and pulls it into the mouth. This works on land and in the water.
- **The lily-pad meter** (bottom left) lights up one dot for each firefly eaten.
- **Ending the night:** eat all 10 for a "Feast complete" card with your time. Your **best time** is saved. If the sun comes up first, you see how many you caught. Both cards have **Play again**.
- **Progress is saved on your device:** the frog's position, the clock, the fireflies eaten, your best time and the camera mode all survive a refresh.
- **The world edge:** within 5 m of the edge a warning counts down the distance. Touching the edge blows the frog up, and after 5 seconds a new frog starts a new night.

## Extras

### Interaction beyond looking around

Walking, jumping, swimming and eating fireflies, plus ripples in the water shader, plants that bend as the frog passes, the exploding frog and respawn, and a saved score.

### Physics (hand-written, no physics engine)

- **Plants:** 690 plants bend away from the frog and spring back, using a spring model with stiffness and damping from the Blender file's game properties.
- **Collisions:** the frog slides around tree trunks (cylinder colliders) and is stopped by steep rock sides. It can climb logs, and jumps can only land on surfaces within reach.
- **Water:** the frog moves slower and jumps less far in ponds, and floats at the waterline.

### Multiple shaders

- The ported Shadertoy water shader, which also lightens at dawn.
- My own ripple shader, layered on top of it.
- A sky shader that blends the night panorama into a sunrise gradient as the night runs out.

### Blender models and animations controlled from code

All models were made in Blender and exported as glTF (`.glb`):

- **Swamp world** (`src/assets/models/FrogGame_Swamp/`): the whole level. Each object stores its game settings in Blender custom properties (role, collider, bend stiffness and so on), and the code reads them to decide how to treat it.
- **Frog:** separate models with the eye-gaze, walk, jump, swim and tongue-strike animations. The code picks which one plays:
  - The walk speed matches how fast the frog moves, and the walk plays backward when walking backward.
  - The jump moves the frog forward only while it is in the air.
  - The tongue bone is aimed and stretched at the firefly in real time, and the caught firefly is attached to the tongue tip.
- **Firefly:** a flight loop. Its glow and light pulse use `KHR_animation_pointer`, which three.js's `GLTFLoader` skips, so the code rebuilds them.
- **Explosion** (`src/assets/models/explosion-effect/`): a one-shot animation whose fire glow and smoke fade-out are also rebuilt from `KHR_animation_pointer`.

## Running it locally

```bash
npm install
npm run dev
```

`npm run build` creates the production build in `dist/`. Pushing to `main` deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

Best viewed in a browser with WebGPU, such as Chrome or Edge. Other browsers fall back to WebGL 2 automatically.

## Built with

- [three.js](https://threejs.org/) r186: `WebGPURenderer`, TSL and `GLTFLoader`
- [Vite](https://vite.dev/)
- [Blender](https://www.blender.org/) for all models and animations
