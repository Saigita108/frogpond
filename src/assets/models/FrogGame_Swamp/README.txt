# Frog Game – Swamp World

Files
- swamp_world.glb          The whole level (load this in your game)
- game_properties.json     Every object type and its game properties (reference)
- swamp_world.blend        Blender source (edit here, then re-export)

Units: meters. Up axis in the .glb is +Y (Blender Z becomes Y).
Every object has its settings in the glTF node "extras" (three.js: object.userData, Godot: node metadata, Unity: needs a glTF importer that reads extras).
Read `game_role` on each object to decide what it is.

## Object types (game_role)

ground          Terrain. collider "mesh", static. The frog walks on this, also under the water.
water           6 ponds. NO collision; use as a trigger zone.
                water_depth 0.2, water_surface_z 0 (height), move_speed_multiplier 0.6,
                jump_strength_multiplier 0.75, linear_drag 2.5, buoyancy 0, object_buoyancy 1.2,
                splash_on_enter, ripple_on_move, ripple_speed, ripple_decay.
                Material "Water_Shader_Slot" = placeholder: replace it with your water/Shadertoy shader.
                UV 0 (TEXCOORD_0): 0..1 across each pond  -> use instead of fragCoord/iResolution
                UV 1 (TEXCOORD_1): world meters / 4      -> seamless across ponds
lily_pad        collider "convex", static, jumpable. Top surface at 0.035 m above water.
bendable_plant  690 plants. collider "none", is_trigger. Bend when something comes within hit_radius.
                bend_stiffness, bend_damping, bend_max_angle_deg, plant_height, hit_radius,
                morph targets "BendX" and "BendY" (start at 0 = straight).
tree            collider "cylinder", collider_radius, collider_height, static.
rock / log      collider "convex", static. Logs: climbable.
firefly         Decoration, emissive, no collision. Animate if you like (bobbing).
backdrop        Sky_Dome: unlit, no fog, follow_camera_xy (move it with the camera every frame).
player_spawn    Frog_Spawn: where the frog starts.

## Plant bending (spring)

Per plant keep: angle (amount 0..1), velocity, direction.
When an object (frog) is within hit_radius of the plant base:
    dir   = direction from the object to the plant (horizontal)
    velocity += impact_strength            // e.g. based on the frog's speed
Every frame:
    accel     = -bend_stiffness * amount - bend_damping * velocity
    velocity += accel * dt
    amount   += velocity * dt              // clamp to -1..1
    morphX = cos(dir) * amount             // BendX weight
    morphY = sin(dir) * amount             // BendY weight
Note: dir must be measured in the plant's LOCAL space (subtract the plant's own rotation).
In glTF/Y-up: BendX bends toward local +X, BendY toward Blender +Y = glTF -Z.
Only update plants near the frog (e.g. within 10 m) to keep it fast.

## Water

if frog position is inside a pond (distance to pond center < pond_radius * ~1.1, and height < 0.05):
    speed *= move_speed_multiplier; jump *= jump_strength_multiplier; apply linear_drag
    on enter: splash; while moving: send frog position + time to the water shader for ripples

## Camera
Follow camera is done in code (Blender cameras are not exported).
Add fog in the engine (the Blender fog box is preview-only and not exported).
