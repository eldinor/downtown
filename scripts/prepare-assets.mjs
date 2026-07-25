import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "source-assets", "megakit");
const gltfRoot = path.join(sourceRoot, "Exports", "glTF (Godot)");
const textureRoot = path.join(sourceRoot, "Textures");
const babylonAssetRoot = path.join(root, "vendor-assets", "babylon");
const outputRoot = path.join(root, "public", "assets", "megakit");
const modelOutput = path.join(outputRoot, "models");
const textureOutput = path.join(outputRoot, "textures");

const runtimeModels = [
  "Building_Medium_2_001",
  "Building_Large_2",
  "Street_2Lane",
  "Street_2Lane_noSidewalk",
  "Sidewalk_Straight_3m",
  "Sidewalk_NoCurb_3m",
  "Brick_Plain_3",
  "Brick_Plain_3_noWear",
  "Building_Small_1",
  "Door_2",
  "Door_3",
];

const shaderTextures = [
  "CM_Lit_Interior_1.HDR",
  "CM_Lit_Interior_2.HDR",
  "CM_Dark_Interior_1.HDR",
  "T_CornerDamage_Normal.png",
  "T_Noise_Drips.png",
];

const environmentTextures = ["environmentSpecular.env"];

async function assertExists(target) {
  await stat(target);
}

async function prepareModel(name) {
  const gltfPath = path.join(gltfRoot, `${name}.gltf`);
  const binPath = path.join(gltfRoot, `${name}.bin`);
  const gltf = JSON.parse(await readFile(gltfPath, "utf8"));
  const binary = await readFile(binPath);
  const remaps = [];
  const images = new Set();

  for (const image of gltf.images ?? []) {
    if (image.uri && !image.uri.startsWith("data:")) {
      images.add(image.uri);
    }
  }

  function accessorHasPaintedRgb(accessorIndex) {
    const accessor = gltf.accessors?.[accessorIndex];
    const view = gltf.bufferViews?.[accessor?.bufferView];
    if (!accessor || !view || accessor.type !== "VEC4") {
      return false;
    }

    const componentBytes =
      accessor.componentType === 5121
        ? 1
        : accessor.componentType === 5123
          ? 2
          : accessor.componentType === 5126
            ? 4
            : 0;
    if (componentBytes === 0) {
      return false;
    }

    const stride = view.byteStride ?? componentBytes * 4;
    const baseOffset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let index = 0; index < accessor.count; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const offset = baseOffset + index * stride + channel * componentBytes;
        const value =
          accessor.componentType === 5121
            ? binary.readUInt8(offset) / 255
            : accessor.componentType === 5123
              ? binary.readUInt16LE(offset) / 65535
              : binary.readFloatLE(offset);
        if (value < 0.99999) {
          return true;
        }
      }
    }
    return false;
  }

  for (let meshIndex = 0; meshIndex < (gltf.meshes ?? []).length; meshIndex += 1) {
    const mesh = gltf.meshes[meshIndex];
    for (
      let primitiveIndex = 0;
      primitiveIndex < (mesh.primitives ?? []).length;
      primitiveIndex += 1
    ) {
      const primitive = mesh.primitives[primitiveIndex];
      const color1 = primitive.attributes?.COLOR_1;
      if (color1 === undefined) {
        continue;
      }

      const color0 = primitive.attributes.COLOR_0;
      const color0Accessor = color0 === undefined ? undefined : gltf.accessors?.[color0];
      const color1Accessor = gltf.accessors?.[color1];

      // In this pack, the authored secondary set is normalized UNSIGNED_SHORT,
      // while the placeholder primary set is normalized UNSIGNED_BYTE.
      if (
        color1Accessor?.componentType === 5123 &&
        color0Accessor?.componentType === 5121 &&
        !accessorHasPaintedRgb(color0) &&
        accessorHasPaintedRgb(color1)
      ) {
        primitive.attributes.COLOR_0 = color1;
        delete primitive.attributes.COLOR_1;
        remaps.push({
          meshIndex,
          primitiveIndex,
          fromAccessor: color0,
          toAccessor: color1,
        });
      }
    }
  }

  await writeFile(
    path.join(modelOutput, `${name}.gltf`),
    `${JSON.stringify(gltf, null, 2)}\n`,
  );
  await cp(binPath, path.join(modelOutput, `${name}.bin`));

  for (const image of images) {
    await cp(path.join(gltfRoot, image), path.join(modelOutput, image));
  }

  return {
    name,
    source: path.relative(root, gltfPath).replaceAll("\\", "/"),
    runtime: `/assets/megakit/models/${name}.gltf`,
    materials: (gltf.materials ?? []).map((material) => material.name),
    images: [...images],
    remaps,
  };
}

async function main() {
  try {
    await assertExists(gltfRoot);
    await assertExists(textureRoot);
  } catch (error) {
    try {
      await assertExists(path.join(outputRoot, "manifest.json"));
      process.stdout.write(
        "Vendor source is unavailable; using committed prepared runtime assets.\n",
      );
      return;
    } catch {
      throw error;
    }
  }
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(modelOutput, { recursive: true });
  await mkdir(textureOutput, { recursive: true });

  const models = [];
  for (const model of runtimeModels) {
    models.push(await prepareModel(model));
  }

  for (const texture of shaderTextures) {
    await cp(path.join(textureRoot, texture), path.join(textureOutput, texture));
  }
  for (const texture of environmentTextures) {
    await cp(
      path.join(babylonAssetRoot, texture),
      path.join(textureOutput, texture),
    );
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceRoot: "source-assets/megakit",
    models,
    shaderTextures: shaderTextures.map(
      (name) => `/assets/megakit/textures/${name}`,
    ),
    environmentTextures: environmentTextures.map(
      (name) => `/assets/megakit/textures/${name}`,
    ),
  };

  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  process.stdout.write(
    `Prepared ${models.length} models and ${shaderTextures.length} shader textures.\n`,
  );
}

await main();
