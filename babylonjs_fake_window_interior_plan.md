# Fake Window Interior Mapping Plan — Babylon.js

## Goal

Replace the flat fake-interior surfaces in `Building_Medium_2_001.gltf` with a view-dependent interior-mapping shader while keeping the existing glass geometry as a separate transparent layer.

The result should:

- show convincing room depth when the camera moves sideways or vertically;
- use the supplied HDR room panoramas;
- preserve the original building geometry and submesh layout;
- keep `MI_Glass` responsible for tint, reflection, Fresnel, and transparency;
- require no extra room geometry behind every window.

---

## 1. Recommended Babylon.js approach

Use a dedicated `ShaderMaterial` for the fake-interior submaterials.

This is preferable to extending the existing PBR material because the sample already separates:

- fake room surfaces: `MI_FakeInterior_1` through `MI_FakeInterior_4`;
- exterior glass: `MI_Glass`.

The interior layer can therefore be an opaque or emissive custom shader, while the glass layer remains a normal Babylon.js PBR material.

A `MaterialPluginBase` implementation is also possible, but it is more useful when the custom effect must remain integrated into a complex existing PBR material. Here, a small dedicated shader is simpler, easier to debug, and less dependent on internal PBR shader variable names.

---

## 2. Asset inventory from the supplied sample

### glTF materials

The building contains these relevant materials:

| Material | Intended role |
|---|---|
| `MI_FakeInterior_1` | Lit room type 1 |
| `MI_FakeInterior_2` | Lit room type 2 |
| `MI_FakeInterior_3` | Lit room type 1, repeated variation |
| `MI_FakeInterior_4` | Dark room |
| `MI_Glass` | Transparent exterior glass |

### Existing flat textures

| Material | Existing PNG |
|---|---|
| `MI_FakeInterior_1` | `T_lit_interior_1.png` |
| `MI_FakeInterior_2` | `T_lit_interior_2.png` |
| `MI_FakeInterior_3` | `T_lit_interior_1.png` |
| `MI_FakeInterior_4` | `T_dark_interior.png` |

The PNGs are 512 × 512 front views. Keep them as a low-cost fallback, but do not use them for the final parallax effect.

### Supplied HDR panoramas

| Shader variant | HDR panorama |
|---|---|
| Lit room 1 | `CM_Lit_Interior_1.HDR` |
| Lit room 2 | `CM_Lit_Interior_2.HDR` |
| Dark room | `CM_Dark_Interior_1.HDR` |

Each panorama is 2048 × 1024 and can be loaded by Babylon.js as an `HDRCubeTexture`.

### UV characteristics

The four fake-interior primitives use the same UV0 range:

```text
U: 0.15168294 → 0.84831700
V: 0.00000000 → 1.00000000
```

Normalize it in the shader:

```glsl
vec2 roomUV = vec2(
    (vUV.x - 0.15168294) / 0.69663406,
    vUV.y
);
```

Clamp the normalized UV to avoid sampling numerical values outside the virtual window:

```glsl
roomUV = clamp(roomUV, vec2(0.001), vec2(0.999));
```

---

## 3. Project structure

Suggested files:

```text
src/
  scene/
    createScene.ts
  interior/
    FakeInteriorMaterial.ts
    fakeInterior.vertex.glsl
    fakeInterior.fragment.glsl
    replaceInteriorMaterials.ts
  assets/
    Building_Medium_2_001.gltf
    Building_Medium_2_001.bin
    CM_Lit_Interior_1.HDR
    CM_Lit_Interior_2.HDR
    CM_Dark_Interior_1.HDR
    ...all PNG files referenced by the glTF
```

Install:

```bash
npm install @babylonjs/core @babylonjs/loaders
```

Register the glTF loader once:

```ts
import "@babylonjs/loaders/glTF";
```

Use the module-level loader API instead of the older static `SceneLoader` class:

```ts
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
```

---

## 4. Load the building

```ts
const container = await LoadAssetContainerAsync(
    "/assets/Building_Medium_2_001.gltf",
    scene
);

container.addAllToScene();
```

Keep the load inside an `AssetContainer` until the replacement materials have been created. This makes it easier to inspect and replace the imported materials before or immediately after adding the assets to the scene.

Log the imported structure during the first implementation:

```ts
console.table(
    container.materials.map((material) => ({
        name: material.name,
        className: material.getClassName(),
    }))
);

console.table(
    container.multiMaterials.map((material) => ({
        name: material.name,
        subMaterials: material.subMaterials.map((m) => m?.name),
    }))
);
```

This confirms whether the glTF loader produced one mesh with a `MultiMaterial`, several meshes, or a mixture.

---

## 5. Load the HDR rooms as cube textures

Babylon.js can convert each RGBE equirectangular `.HDR` panorama into a cube texture at load time.

```ts
import { HDRCubeTexture } from "@babylonjs/core/Materials/Textures/hdrCubeTexture";

const litRoom1 = new HDRCubeTexture(
    "/assets/CM_Lit_Interior_1.HDR",
    scene,
    256,
    false, // mipmaps allowed
    false, // no spherical harmonics required
    false, // HDR is linear, not gamma-space
    false  // no PBR prefiltering required for direct room sampling
);

const litRoom2 = new HDRCubeTexture(
    "/assets/CM_Lit_Interior_2.HDR",
    scene,
    256,
    false,
    false,
    false,
    false
);

const darkRoom = new HDRCubeTexture(
    "/assets/CM_Dark_Interior_1.HDR",
    scene,
    256,
    false,
    false,
    false,
    false
);
```

A cube size of 256 is a good starting point. Test 128 for low-end devices and 512 for close-up hero shots.

Do not assign these textures to `scene.environmentTexture`; they are private room textures sampled only by the interior shaders.

Wait for all three textures before enabling the building:

```ts
await Promise.all([
    waitForTexture(litRoom1),
    waitForTexture(litRoom2),
    waitForTexture(darkRoom),
]);

function waitForTexture(texture: HDRCubeTexture): Promise<void> {
    if (texture.isReady()) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        texture.onLoadObservable.addOnce(() => resolve());
        texture.onError = (message, error) => {
            reject(error ?? new Error(message ?? "HDR texture load failed"));
        };
    });
}
```

---

## 6. Shader inputs

The interior material needs:

### Vertex attributes

```text
position
normal
uv
```

### Uniforms

```text
world
worldViewProjection
cameraPosition
uvScaleOffset
roomDepth
roomWidth
roomHeight
cubeRotation
emissiveIntensity
```

### Sampler

```text
interiorCube
```

Recommended values for the first pass:

```ts
roomWidth = 1.0;
roomHeight = 1.0;
roomDepth = 1.5;
emissiveIntensity = 1.0;
uvScaleOffset = [1.435474, 1.0, -0.217737, 0.0];
```

The UV values above encode:

```text
normalizedU = sourceU × 1.435474 - 0.217737
normalizedV = sourceV
```

Keep the explicit min/max formula during initial debugging if it is easier to understand.

---

## 7. Vertex shader plan

The vertex shader should pass:

- world-space position;
- transformed world normal;
- UV0.

GLSL outline:

```glsl
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;

void main() {
    vec4 worldPosition = world * vec4(position, 1.0);

    vPositionW = worldPosition.xyz;
    vNormalW = normalize(mat3(world) * normal);
    vUV = uv;

    gl_Position = worldViewProjection * vec4(position, 1.0);
}
```

For non-uniform building scaling, replace `mat3(world) * normal` with a proper normal matrix.

---

## 8. Build a window-local coordinate frame

Do not hardcode a world-facing direction. The building may be rotated or instanced.

The sample does not need an authored tangent attribute because a tangent frame can be reconstructed from screen-space derivatives of world position and UV:

```glsl
vec3 dpdx = dFdx(vPositionW);
vec3 dpdy = dFdy(vPositionW);
vec2 duvdx = dFdx(vUV);
vec2 duvdy = dFdy(vUV);

vec3 tangent = normalize(dpdx * duvdy.y - dpdy * duvdx.y);
vec3 bitangent = normalize(-dpdx * duvdy.x + dpdy * duvdx.x);
vec3 normalW = normalize(vNormalW);
```

Correct the handedness when necessary:

```glsl
if (dot(cross(tangent, bitangent), normalW) < 0.0) {
    bitangent = -bitangent;
}
```

This makes the shader work after rotating or placing the building elsewhere in the city.

---

## 9. Convert the camera ray into room space

Use a ray pointing from the camera through the window surface:

```glsl
vec3 worldRay = normalize(vPositionW - cameraPosition);
```

The surface normal points toward the exterior. The virtual room extends behind the surface, so use `-normalW` as the room-forward axis:

```glsl
vec3 roomRay = normalize(vec3(
    dot(worldRay, tangent),
    dot(worldRay, bitangent),
    dot(worldRay, -normalW)
));
```

If the room appears mirrored or moves in the wrong direction, invert the tangent or forward component individually rather than changing the entire algorithm.

---

## 10. Ray-box intersection

Treat every window as the front face of a virtual box.

Room-space convention:

```text
X: left/right, range -1 → +1
Y: floor/ceiling, range -1 → +1
Z: front/back, range -1 → +1
Front window plane: Z = -1
Back wall: Z = +1
```

Create the ray origin from the normalized window UV:

```glsl
vec3 rayOrigin = vec3(roomUV * 2.0 - 1.0, -0.999);
```

Apply room proportions by scaling the ray:

```glsl
vec3 shapedRay = vec3(
    roomRay.x / roomWidth,
    roomRay.y / roomHeight,
    roomRay.z / roomDepth
);
```

Use a slab intersection with the `[-1, +1]` room box:

```glsl
vec3 safeRay = sign(shapedRay) * max(abs(shapedRay), vec3(0.00001));

vec3 t0 = (-vec3(1.0) - rayOrigin) / safeRay;
vec3 t1 = ( vec3(1.0) - rayOrigin) / safeRay;

vec3 tFar = max(t0, t1);
float hitDistance = min(tFar.x, min(tFar.y, tFar.z));

vec3 roomHit = rayOrigin + shapedRay * hitDistance;
```

During debugging, visualize `roomHit` as color:

```glsl
gl_FragColor = vec4(roomHit * 0.5 + 0.5, 1.0);
```

The color should change smoothly as the camera moves and should remain stable when the building rotates.

---

## 11. Sample the HDR cube

The cube texture represents the room as seen from its center. Sample it using the direction from the virtual room center to the box hit point:

```glsl
vec3 sampleDirection = normalize(roomHit);
```

Apply an optional cube orientation matrix or a simple Y rotation:

```glsl
float c = cos(cubeRotation);
float s = sin(cubeRotation);

sampleDirection.xz = mat2(
     c, -s,
     s,  c
) * sampleDirection.xz;
```

Sample:

```glsl
vec3 interiorLinear = textureCube(interiorCube, sampleDirection).rgb;
```

Final interior output:

```glsl
vec3 color = interiorLinear * emissiveIntensity;
gl_FragColor = vec4(color, 1.0);
```

Keep this layer opaque. Transparency belongs to the separate `MI_Glass` surface.

---

## 12. Create three ShaderMaterial variants

Create one reusable factory:

```ts
type FakeInteriorOptions = {
    name: string;
    cubeTexture: HDRCubeTexture;
    roomDepth?: number;
    roomWidth?: number;
    roomHeight?: number;
    cubeRotation?: number;
    emissiveIntensity?: number;
};

function createFakeInteriorMaterial(
    scene: Scene,
    options: FakeInteriorOptions
): ShaderMaterial {
    const material = new ShaderMaterial(
        options.name,
        scene,
        {
            vertex: "fakeInterior",
            fragment: "fakeInterior",
        },
        {
            attributes: ["position", "normal", "uv"],
            uniforms: [
                "world",
                "worldViewProjection",
                "cameraPosition",
                "uvScaleOffset",
                "roomDepth",
                "roomWidth",
                "roomHeight",
                "cubeRotation",
                "emissiveIntensity",
            ],
            samplers: ["interiorCube"],
        }
    );

    material.setTexture("interiorCube", options.cubeTexture);
    material.setVector4(
        "uvScaleOffset",
        new Vector4(1.435474, 1.0, -0.217737, 0.0)
    );
    material.setFloat("roomDepth", options.roomDepth ?? 1.5);
    material.setFloat("roomWidth", options.roomWidth ?? 1.0);
    material.setFloat("roomHeight", options.roomHeight ?? 1.0);
    material.setFloat("cubeRotation", options.cubeRotation ?? 0.0);
    material.setFloat(
        "emissiveIntensity",
        options.emissiveIntensity ?? 1.0
    );

    material.backFaceCulling = false;

    return material;
}
```

Create:

```ts
const interiorLit1 = createFakeInteriorMaterial(scene, {
    name: "FakeInterior_Lit1",
    cubeTexture: litRoom1,
    roomDepth: 1.6,
});

const interiorLit2 = createFakeInteriorMaterial(scene, {
    name: "FakeInterior_Lit2",
    cubeTexture: litRoom2,
    roomDepth: 1.6,
});

const interiorDark = createFakeInteriorMaterial(scene, {
    name: "FakeInterior_Dark",
    cubeTexture: darkRoom,
    roomDepth: 1.4,
    emissiveIntensity: 0.75,
});
```

---

## 13. Replace only the fake-interior materials

Mapping:

```ts
const replacementByOriginalName = new Map<string, Material>([
    ["MI_FakeInterior_1", interiorLit1],
    ["MI_FakeInterior_2", interiorLit2],
    ["MI_FakeInterior_3", interiorLit1],
    ["MI_FakeInterior_4", interiorDark],
]);
```

### Replace MultiMaterial slots

```ts
for (const multiMaterial of container.multiMaterials) {
    for (let i = 0; i < multiMaterial.subMaterials.length; i++) {
        const original = multiMaterial.subMaterials[i];

        if (!original) {
            continue;
        }

        const replacement = replacementByOriginalName.get(original.name);

        if (replacement) {
            multiMaterial.subMaterials[i] = replacement;
        }
    }
}
```

### Handle directly assigned materials too

```ts
for (const mesh of container.meshes) {
    const material = mesh.material;

    if (!material) {
        continue;
    }

    const replacement = replacementByOriginalName.get(material.name);

    if (replacement) {
        mesh.material = replacement;
    }
}
```

Do not replace `MI_Glass`.

Dispose the four unused imported fake-interior materials only after verifying no other mesh references them.

---

## 14. Configure the glass layer

Keep `MI_Glass` as a separate `PBRMaterial`.

Initial tuning targets:

```text
alpha: 0.15–0.35
roughness: 0.05–0.25
metallic: 0
index of refraction: about 1.5
environment intensity: adjusted to the outdoor scene
```

The glass should contribute:

- reflections;
- Fresnel;
- tint;
- slight roughness;
- optional dirt or smudge texture.

It should not contain the room panorama.

Rendering requirements:

- interior surfaces render as opaque;
- glass renders as alpha blended;
- interior surfaces remain physically behind the glass;
- use a later `alphaIndex` or rendering group for glass only if transparent sorting is visibly wrong.

---

## 15. Lighting and exposure

The HDR room texture is already the room's baked lighting. Treat it as emissive content.

Do not apply scene lights to the interior surface unless deliberately blending a small facade-light contribution.

Expose these controls:

```ts
interiorLit1.setFloat("emissiveIntensity", dayMode ? 0.65 : 1.2);
interiorLit2.setFloat("emissiveIntensity", dayMode ? 0.65 : 1.2);
interiorDark.setFloat("emissiveIntensity", dayMode ? 0.35 : 0.7);
```

For nighttime, the windows can exceed 1.0 in linear HDR before the scene's image processing and tone mapping.

---

## 16. Quality improvements after the base version works

### Per-window variation

Use the window's object-space position, UV island, vertex color, or a small authored mask to generate a stable hash.

Use the hash to vary:

- cube rotation;
- brightness;
- room depth;
- lit/dark probability;
- curtain tint.

Do not use time-dependent random values.

### Window-frame occlusion

Darken the room near the UV border:

```glsl
vec2 borderDistance = min(roomUV, 1.0 - roomUV);
float frameAO = smoothstep(0.0, 0.06, min(borderDistance.x, borderDistance.y));
color *= mix(0.55, 1.0, frameAO);
```

### Depth fog

Slightly darken the sampled room based on hit distance:

```glsl
float depthFade = exp(-0.12 * hitDistance);
color *= mix(0.72, 1.0, depthFade);
```

### Curtains or blinds

Sample the original `T_lit_interior_*.png` as a front overlay and blend it over the parallax room. This can preserve the pack's original window dressing while the HDR supplies depth.

### Reflection balance

Use a Fresnel term on `MI_Glass`, not the interior shader:

```text
front view: more interior visible
grazing view: stronger exterior reflection
```

---

## 17. Mobile and distance fallback

Use three quality tiers:

### High

- 256 or 512 HDR cube;
- full ray-box intersection;
- glass reflections;
- optional room variation.

### Medium

- 128 HDR cube;
- full ray-box intersection;
- simpler glass.

### Low or distant LOD

- original 512 × 512 PNG material;
- no ray-box calculation;
- no HDR cube allocation.

Switch to the flat texture beyond a camera-distance threshold or for low-capability devices. Avoid swapping every frame near the threshold; use hysteresis.

---

## 18. Validation checklist

### Geometry and materials

- [ ] Only `MI_FakeInterior_1` to `_4` are replaced.
- [ ] `MI_Glass` remains separate.
- [ ] Other building materials are unchanged.
- [ ] Every fake interior submesh still uses the correct indices.

### Shader behavior

- [ ] Rooms show depth while strafing left and right.
- [ ] Rooms show floor and ceiling while moving vertically.
- [ ] Parallax direction is correct.
- [ ] No mirrored room orientation.
- [ ] UV edges do not show seams.
- [ ] The room does not appear in front of the glass.

### Transform robustness

- [ ] Effect works after rotating the building.
- [ ] Effect works after translating the building.
- [ ] Effect works with uniform scaling.
- [ ] Non-uniform scaling is either supported with a normal matrix or prohibited.

### Rendering

- [ ] Glass sorts correctly.
- [ ] HDR is not accidentally gamma-decoded twice.
- [ ] Tone mapping does not crush lit rooms.
- [ ] Dark room remains visible but not self-luminous.
- [ ] No shader errors in both target engines.

### Performance

- [ ] Only three HDR cube textures are created.
- [ ] Materials are shared across all matching submeshes.
- [ ] No per-frame material creation.
- [ ] No per-frame texture rebinding outside Babylon's normal material path.
- [ ] Distant buildings use a cheaper fallback when required.

---

## 19. Implementation milestones

### Milestone 1 — Asset replacement

- Load the glTF into an `AssetContainer`.
- Print all materials and multi-material slots.
- Replace `MI_FakeInterior_*` with a solid-color `ShaderMaterial`.
- Confirm only the intended window surfaces change.

### Milestone 2 — HDR cube sampling

- Load `CM_Lit_Interior_1.HDR` as `HDRCubeTexture`.
- Display a constant cube direction in the shader.
- Confirm the texture orientation and color space.

### Milestone 3 — View-dependent room ray

- Pass world position, world normal, UV, and camera position.
- Reconstruct tangent and bitangent.
- Visualize the tangent-space ray as RGB.

### Milestone 4 — Box intersection

- Implement the virtual room box.
- Visualize `roomHit`.
- Tune room depth and coordinate signs.

### Milestone 5 — Full material mapping

- Create lit 1, lit 2, and dark variants.
- Replace all four fake-interior materials.
- Keep `MI_Glass` unchanged.

### Milestone 6 — Polish

- Tune emissive intensity and HDR rotation.
- Add border darkening.
- Add stable room variation.
- Tune glass Fresnel and transparency.
- Add flat PNG distance fallback.

---

## 20. Expected final architecture

```text
Building mesh
  ├─ opaque facade materials
  ├─ FakeInterior_Lit1 ShaderMaterial
  │    └─ CM_Lit_Interior_1.HDR → HDRCubeTexture
  ├─ FakeInterior_Lit2 ShaderMaterial
  │    └─ CM_Lit_Interior_2.HDR → HDRCubeTexture
  ├─ FakeInterior_Dark ShaderMaterial
  │    └─ CM_Dark_Interior_1.HDR → HDRCubeTexture
  └─ MI_Glass PBRMaterial
       └─ transparent reflection/Fresnel layer
```

This preserves the pack's existing window geometry and material separation while replacing only the flat room images with real view-dependent fake depth.

---

## Official Babylon.js references

- Babylon.js documentation: Material Plugins
- Babylon.js API: `MaterialPluginBase`
- Babylon.js API: `HDRCubeTexture`
- Babylon.js documentation: HDR environments
- Babylon.js API: `LoadAssetContainerAsync`
- Babylon.js documentation: Multi-Materials
- Babylon.js API: `ShaderMaterial`
