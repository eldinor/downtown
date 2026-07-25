# Downtown Shader Lab

An interactive Babylon.js 9.18.0 test scene for the Downtown City MegaKit. It
validates view-dependent window interiors, authored material wear, and
post-rain PBR reflections before the same systems are used to assemble a
configuration-driven 3×3 city center.

## Run locally

```bash
npm install
npm run dev
```

The dev and production build commands run the asset-preparation step
automatically. The full vendor archive remains untouched under
`source-assets/megakit`; only the runtime subset is generated under
`public/assets/megakit`.

## Commands

```bash
npm run prepare:assets
npm test
  npm run build
  ```

## Rendering systems

- `FakeInteriorMaterial` replaces only `MI_FakeInterior_1` through `_4` with
  three shared HDR-backed ray-box materials. `MI_Glass` remains transparent PBR.
- `SurfaceWeatheringPlugin` consumes vertex colors as data without allowing
  Babylon's default vertex-color albedo multiplication.
- Red carries wear (`1 - R`) and green carries wetness (`1 - G`). White color
  buffers are preserved for future painting and receive configurable uniform
  or procedural fallback effects.
- The prepared glTF files redirect the five meaningful `COLOR_1` primitives in
  `Building_Small_1`, `Door_2`, and `Door_3` to `COLOR_0`; their BIN data is not
  rewritten.
- Wet materials combine PBR roughness changes with the locally bundled Babylon
  `environmentSpecular.env`; SSR is available from the UI and defaults to off.

## City foundation

`src/city/cityCenterConfig.ts` defines deterministic block data for a 3×3 city
center. Runtime assets are loaded through `AssetRegistry`, while materials,
textures, interior cubes, and global weather controls remain shared so later
city assembly can use instances and LODs without changing shader interfaces.
