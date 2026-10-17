# Frog Pond

A night-time swamp where you play a frog racing the sunrise: hop between lily pads, swim through the ponds and catch 10 of the 20 fireflies with your tongue before dawn. Built with three.js and the `WebGPURenderer`.

**Live demo:** https://saigita108.github.io/frogpond/

## Shadertoy shaders

### 1. Pond water: 2D Top Down Water

The pond water is a port of **2D Top Down Water**:
https://www.shadertoy.com/view/wt2GRt

The original GLSL fragment shader is rewritten in TSL (three.js Shading Language) so it runs on the WebGPU renderer. See `topDownWater` in [`src/swamp.js`](src/swamp.js). Changes from the original:

- It uses the water mesh's second UV set (world meters / 4) instead of `fragCoord / iResolution`, so the pattern runs seamlessly across all six ponds.
- It is combined with a second shader of my own, `waterRipples`, which adds expanding wave rings that bend the water pattern and light it up.

How it responds to interaction:

- **Click or tap the water** and a ripple spreads out from that spot.
- **The frog makes ripples:** a splash when it enters a pond, ripples as it swims, and a ripple when it flicks its tongue in the water.

### 2. Rain: Banished

The rain is ported from **Banished**:
https://www.shadertoy.com/view/XsX3DB

The original shows a dog in its kennel in a thunderstorm. Only the rain and the lightning are used; the dog and the kennel are left out. See [`src/rain.js`](src/rain.js).

- **Rain:** the lines at the end of `mainImage` that slide a noise texture down the screen, squashed into streaks, and keep only its brightest specks as raindrops.
- **Lightning:** the flicker from `Render()`, four quick pulses that light up the scene, and the original's trick of making the raindrops glint during a flash.
- **Sound** (the shader's "Sound" tab, `mainSound`): the hiss of the rain and the rumble of thunder. Shadertoy computes sound on the GPU, one sample at a time; here the same maths runs in JavaScript once, into Web Audio buffers. See [`src/rain-sound.js`](src/rain-sound.js). The rain loops, and the thunder plays about 0.35 s after each lightning flash, like in the original. The dog's sniffing is left out.

Changes from the original:

- It is drawn as a full-screen layer on top of the 3D swamp instead of over its own scene.
- Shadertoy's built-in noise texture (`iChannel3`) is replaced by a 256 × 256 texture of random values made in code.
- The drops are tinted a cool moonlit blue-white, and there are fewer of them, so the game stays easy to see.
- The lightning lights up the actual 3D swamp: a cold blue-white light flashes over the whole level, along with a faint wash over the screen. It strikes at a random moment every 8 to 20 seconds instead of exactly every 12. Players whose system asks for less animation get one softer flash instead of the flicker.
- To make it feel like rain *in* the swamp, a shader of my own (`rainDrops` in [`src/swamp.js`](src/swamp.js)) adds raindrop rings to the ponds.

How it responds to interaction:

- **The rain leans with the wind.** The wind blows from one direction across the swamp, so the streaks slant depending on which way the camera faces. Turning the frog swings the angle around.
- **The Rain switch** (bottom right) turns the rain on or off. The rain, its sound and the rings on the ponds fade in or out together, lightning and thunder only come while it rains, and the choice is remembered on your device.
- **Sound starts with your first click or key press,** because browsers don't allow sound before the player interacts with the page.

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
| Rain on / off | **Rain** switch (bottom right) |
| Start over | **Reset** (top right) |

The **i** button in the top right shows the controls in the game as well.

## Gameplay: race the night

**20 fireflies** fly around the swamp. Eat **10** of them before the sun comes up, in **3 minutes**.

- **The clock** (top center) starts with the frog's first move and counts down to sunrise. In the last 30 seconds it glows amber.
- **Dawn comes slowly:** after about a minute the sky, fog, light and water start warming toward sunrise.
- **Fireflies stay until eaten:** they only disappear when the frog eats them. A new night (Play again, Reset or a new frog) brings back all 20.
- **Catching:** press `F` when a firefly is within 1 m in front of the frog. The tongue aims at it, stretches to reach it and pulls it into the mouth. This works on land and in the water.
- **The lily-pad meter** (bottom left) lights up one dot for each firefly eaten.
- **Ending the night:** eat 10 for a "Feast complete" card with your time. Your **best time** is saved. If the sun comes up first, you see how many you caught. Both cards have **Play again**.
- **Progress is saved on your device:** the frog's position, the clock, the fireflies eaten, your best time and the camera mode all survive a refresh.
- **The world edge:** within 5 m of the edge a warning counts down the distance. Touching the edge blows the frog up. While the clock is running that loses the night: a "Kaboom! You lost" card offers **Play again**. Before the night starts, a new frog simply appears after 5 seconds.

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
- The ported Shadertoy rain and lightning shader, drawn over the whole screen.
- My own raindrop shader, which rings the ponds while it rains.
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
