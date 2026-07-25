import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL(
  "../public/assets/megakit/manifest.json",
  import.meta.url,
);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target)));
    } else {
      files.push(target);
    }
  }
  return files;
}

test("vendor archive extraction is complete", async () => {
  const sourceRoot = new URL("../source-assets/megakit/", import.meta.url);
  const files = await collectFiles(fileURLToPath(sourceRoot));
  const sizes = await Promise.all(files.map((file) => stat(file)));
  assert.equal(files.length, 371);
  assert.equal(
    sizes.reduce((total, file) => total + file.size, 0),
    197_119_971,
  );
});

test("prepared manifest contains expected runtime models", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  assert.equal(manifest.models.length, 11);
  assert.ok(
    manifest.models.some((model) => model.name === "Building_Large_2"),
  );
  assert.ok(
    manifest.models.some((model) => model.name === "Sidewalk_NoCurb_3m"),
  );
  assert.ok(
    manifest.models.some(
      (model) => model.name === "Street_2Lane_noSidewalk",
    ),
  );
  assert.equal(manifest.shaderTextures.length, 5);
});

test("secondary color data is redirected only for known prepared assets", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const remapped = manifest.models
    .filter((model) => model.remaps.length > 0)
    .map((model) => [model.name, model.remaps.length]);

  assert.deepEqual(remapped, [
    ["Building_Small_1", 3],
    ["Door_2", 1],
    ["Door_3", 1],
  ]);
});

test("prepared building retains its glass and interior material slots", async () => {
  const gltfUrl = new URL(
    "../public/assets/megakit/models/Building_Medium_2_001.gltf",
    import.meta.url,
  );
  const gltf = JSON.parse(await readFile(gltfUrl, "utf8"));
  const materialNames = gltf.materials.map((material) => material.name);

  assert.ok(materialNames.includes("MI_Glass"));
  for (let index = 1; index <= 4; index += 1) {
    assert.ok(materialNames.includes(`MI_FakeInterior_${index}`));
  }
});

test("no-wear control model keeps a white vertex-color buffer", async () => {
  const gltfUrl = new URL(
    "../public/assets/megakit/models/Brick_Plain_3_noWear.gltf",
    import.meta.url,
  );
  const gltf = JSON.parse(await readFile(gltfUrl, "utf8"));
  const binUrl = new URL(
    "../public/assets/megakit/models/Brick_Plain_3_noWear.bin",
    import.meta.url,
  );
  const binary = await readFile(binUrl);
  const accessorIndices = gltf.meshes.flatMap((mesh) =>
    mesh.primitives.map((primitive) => primitive.attributes.COLOR_0),
  );
  const accessors = accessorIndices.map((index) => gltf.accessors[index]);

  assert.ok(accessors.every((accessor) => accessor.normalized));
  assert.ok(accessors.every((accessor) => accessor.type === "VEC4"));
  for (const accessor of accessors) {
    const view = gltf.bufferViews[accessor.bufferView];
    const componentBytes = accessor.componentType === 5121 ? 1 : 2;
    const whiteValue = componentBytes === 1 ? 255 : 65_535;
    const stride = view.byteStride ?? componentBytes * 4;
    const baseOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let vertex = 0; vertex < accessor.count; vertex += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const offset = baseOffset + vertex * stride + channel * componentBytes;
        const value =
          componentBytes === 1
            ? binary.readUInt8(offset)
            : binary.readUInt16LE(offset);
        assert.equal(value, whiteValue);
      }
    }
  }
});
