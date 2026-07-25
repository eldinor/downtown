import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent";

import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  Engine,
  ImageProcessingConfiguration,
  Mesh,
  PBRMaterial,
  Scene,
  Texture,
  UniversalCamera,
  Vector3,
  type AbstractMesh,
  type AssetContainer,
  type Camera,
  type TransformNode,
} from "@babylonjs/core";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSRRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssrRenderingPipeline";
import { AssetRegistry } from "../assets/AssetRegistry";
import type { PreparedAssetManifest } from "../core/contracts";
import { WeatherController } from "../core/WeatherController";
import { FakeInteriorMaterial } from "../interior/FakeInteriorMaterial";
import { createHud } from "../ui/createHud";
import {
  ensureWeatherColor,
  SurfaceWeatheringPlugin,
} from "../weather/SurfaceWeatheringPlugin";
import { getWeatherProfile } from "../weather/weatherProfiles";

const modelRoot = "/assets/megakit/models";
const textureRoot = "/assets/megakit/textures";

interface SceneResources {
  scene: Scene;
  dispose(): void;
}

function setRootTransform(
  root: TransformNode,
  position: Vector3,
  rotationY = 0,
  scale = 1,
): void {
  root.position.copyFrom(position);
  root.rotationQuaternion = null;
  root.rotation.set(0, rotationY, 0);
  root.scaling.setAll(scale);
}

function configureGlass(material: PBRMaterial): void {
  material.alpha = 0.22;
  material.metallic = 0;
  material.roughness = 0.08;
  material.environmentIntensity = 1.15;
  material.needDepthPrePass = true;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
}

function prepareWeathering(
  container: AssetContainer,
  controller: WeatherController,
  dripTexture: Texture,
  damageTexture: Texture,
): void {
  for (const mesh of container.meshes) {
    if (mesh instanceof Mesh && mesh.getTotalVertices() > 0) {
      ensureWeatherColor(mesh);
      mesh.useVertexColors = false;
      mesh.hasVertexAlpha = false;
    }
  }

  for (const material of container.materials) {
    if (!(material instanceof PBRMaterial)) {
      continue;
    }

    if (material.name.includes("Glass")) {
      configureGlass(material);
      continue;
    }

    const profile = getWeatherProfile(material.name);
    if (!profile) {
      continue;
    }

    material.environmentIntensity = 1.1;
    new SurfaceWeatheringPlugin(
      material,
      controller,
      profile,
      dripTexture,
      damageTexture,
    );
  }
}

function replaceInteriorMaterials(
  container: AssetContainer,
  replacements: Map<string, PBRMaterial | FakeInteriorMaterial["material"]>,
): void {
  for (const multiMaterial of container.multiMaterials) {
    for (let index = 0; index < multiMaterial.subMaterials.length; index += 1) {
      const original = multiMaterial.subMaterials[index];
      const replacement = original
        ? replacements.get(original.name)
        : undefined;
      if (replacement) {
        multiMaterial.subMaterials[index] = replacement;
      }
    }
  }

  for (const mesh of container.meshes) {
    const original = mesh.material;
    const replacement = original ? replacements.get(original.name) : undefined;
    if (replacement) {
      mesh.material = replacement;
    }
  }
}

function enableCollisions(meshes: AbstractMesh[]): void {
  for (const mesh of meshes) {
    if (mesh.getTotalVertices() > 0) {
      mesh.checkCollisions = true;
    }
  }
}

export async function createScene(engine: Engine): Promise<SceneResources> {
  const scene = new Scene(engine);
  const controller = new WeatherController();
  const registry = new AssetRegistry(scene);

  scene.clearColor = new Color4(0.025, 0.035, 0.055, 1);
  scene.ambientColor = new Color3(0.08, 0.1, 0.16);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.006;
  scene.fogColor = new Color3(0.09, 0.115, 0.16);
  scene.collisionsEnabled = true;
  scene.gravity.set(0, -0.28, 0);

  const canvas = engine.getRenderingCanvas();
  if (!canvas) {
    throw new Error("Rendering canvas is unavailable.");
  }

  const orbitCamera = new ArcRotateCamera(
    "orbit-camera",
    -0.82,
    1.08,
    36,
    new Vector3(3, 8, 0),
    scene,
  );
  orbitCamera.lowerRadiusLimit = 10;
  orbitCamera.upperRadiusLimit = 58;
  orbitCamera.lowerBetaLimit = 0.45;
  orbitCamera.upperBetaLimit = 1.5;
  orbitCamera.wheelDeltaPercentage = 0.01;
  orbitCamera.panningSensibility = 45;
  orbitCamera.setPosition(new Vector3(-18, 10.5, 18));
  orbitCamera.setTarget(new Vector3(5.5, 7, 0));

  const walkCamera = new UniversalCamera(
    "walk-camera",
    new Vector3(-1.5, 1.8, 4.5),
    scene,
  );
  walkCamera.setTarget(new Vector3(6, 4, 0));
  walkCamera.speed = 0.35;
  walkCamera.angularSensibility = 2800;
  walkCamera.minZ = 0.05;
  walkCamera.applyGravity = true;
  walkCamera.checkCollisions = true;
  walkCamera.ellipsoid = new Vector3(0.45, 0.9, 0.45);

  scene.activeCamera = orbitCamera;
  orbitCamera.attachControl(canvas, true);

  let activeCamera: Camera = orbitCamera;
  const setCameraMode = (mode: "orbit" | "walk") => {
    activeCamera.detachControl();
    activeCamera = mode === "orbit" ? orbitCamera : walkCamera;
    scene.activeCamera = activeCamera;
    activeCamera.attachControl(canvas, true);
  };

  const hud = createHud(controller, { setCameraMode });
  hud.setStatus("Loading environment");

  const environment = CubeTexture.CreateFromPrefilteredData(
    `${textureRoot}/environmentSpecular.env`,
    scene,
  );
  scene.environmentTexture = environment;
  scene.environmentIntensity = 0.72;

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = 0.82;
  scene.imageProcessingConfiguration.contrast = 1.18;

  const keyLight = new DirectionalLight(
    "dusk-key",
    new Vector3(-0.45, -0.75, 0.35),
    scene,
  );
  keyLight.position.set(10, 28, -18);
  keyLight.diffuse = new Color3(1, 0.63, 0.42);
  keyLight.specular = new Color3(0.85, 0.72, 0.64);
  keyLight.intensity = 2.1;

  const post = new DefaultRenderingPipeline(
    "dusk-post",
    true,
    scene,
    [orbitCamera, walkCamera],
  );
  post.samples = 2;
  post.fxaaEnabled = true;
  post.bloomEnabled = true;
  post.bloomThreshold = 0.82;
  post.bloomWeight = 0.17;
  post.bloomKernel = 48;

  const ssr = new SSRRenderingPipeline(
    "wet-ssr",
    scene,
    [orbitCamera, walkCamera],
    true,
  );
  ssr.environmentTexture = environment;
  ssr.strength = 0.72;
  ssr.maxDistance = 70;
  ssr.maxSteps = 96;
  ssr.step = 2;
  ssr.thickness = 0.32;
  ssr.selfCollisionNumSkip = 2;
  ssr.reflectivityThreshold = 0.02;
  ssr.blurDispersionStrength = 0.025;
  ssr.roughnessFactor = 0;
  ssr.ssrDownsample = 1;
  ssr.blurDownsample = 1;

  const dripTexture = new Texture(
    `${textureRoot}/T_Noise_Drips.png`,
    scene,
    false,
    false,
  );
  dripTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  dripTexture.wrapV = Texture.WRAP_ADDRESSMODE;

  const damageTexture = new Texture(
    `${textureRoot}/T_CornerDamage_Normal.png`,
    scene,
    false,
    false,
  );

  const interiorLit1 = new FakeInteriorMaterial(scene, {
    name: "FakeInterior_Lit1",
    roomTextureUrl: `${textureRoot}/CM_Lit_Interior_1.HDR`,
    roomDepth: 1.6,
    emissiveIntensity: 1.14,
  });
  const interiorLit2 = new FakeInteriorMaterial(scene, {
    name: "FakeInterior_Lit2",
    roomTextureUrl: `${textureRoot}/CM_Lit_Interior_2.HDR`,
    roomDepth: 1.6,
    cubeRotation: 0.35,
    emissiveIntensity: 1.08,
  });
  const interiorDark = new FakeInteriorMaterial(scene, {
    name: "FakeInterior_Dark",
    roomTextureUrl: `${textureRoot}/CM_Dark_Interior_1.HDR`,
    roomDepth: 1.4,
    cubeRotation: -0.18,
    emissiveIntensity: 0.62,
  });

  controller.subscribe(() => {
    const duskBoost = 0.9 + controller.wetness * 0.25;
    interiorLit1.setIntensity(1.14 * duskBoost);
    interiorLit2.setIntensity(1.08 * duskBoost);
    interiorDark.setIntensity(0.62 * duskBoost);
  });

  hud.setStatus("Loading architecture");
  const [manifest, building, street, sidewalk] = await Promise.all([
    fetch("/assets/megakit/manifest.json").then(
      (response) => response.json() as Promise<PreparedAssetManifest>,
    ),
    registry.load(
      "Building_Medium_2_001",
      `${modelRoot}/Building_Medium_2_001.gltf`,
    ),
    registry.load("Street_2Lane", `${modelRoot}/Street_2Lane.gltf`),
    registry.load(
      "Sidewalk_Straight_3m",
      `${modelRoot}/Sidewalk_Straight_3m.gltf`,
    ),
  ]);

  if (manifest.models.length < 3) {
    throw new Error("Prepared asset manifest is incomplete.");
  }

  replaceInteriorMaterials(
    building,
    new Map([
      ["MI_FakeInterior_1", interiorLit1.material],
      ["MI_FakeInterior_2", interiorLit2.material],
      ["MI_FakeInterior_3", interiorLit1.material],
      ["MI_FakeInterior_4", interiorDark.material],
    ]),
  );

  for (const container of [building, street, sidewalk]) {
    prepareWeathering(container, controller, dripTexture, damageTexture);
  }

  const buildingInstance = building.instantiateModelsToScene(
    (name) => `hero-${name}`,
    false,
    { doNotInstantiate: true },
  );
  setRootTransform(
    buildingInstance.rootNodes[0] as TransformNode,
    new Vector3(6, 0, 0),
    -Math.PI / 2,
  );
  enableCollisions(buildingInstance.rootNodes[0].getChildMeshes(false));

  const streetInstance = street.instantiateModelsToScene(
    (name) => `street-${name}`,
    false,
    { doNotInstantiate: true },
  );
  setRootTransform(
    streetInstance.rootNodes[0] as TransformNode,
    Vector3.Zero(),
  );
  enableCollisions(streetInstance.rootNodes[0].getChildMeshes(false));

  for (let index = -2; index <= 2; index += 1) {
    const sidewalkInstance = sidewalk.instantiateModelsToScene(
      (name) => `sidewalk-${index}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      sidewalkInstance.rootNodes[0] as TransformNode,
      new Vector3(4.5, 0.01, index * 3),
    );
    enableCollisions(sidewalkInstance.rootNodes[0].getChildMeshes(false));
  }

  const fpsObserver = scene.onBeforeRenderObservable.add(() => {
    hud.setFps(engine.getFps());
  });

  hud.setStatus("Shader systems online", true);

  return {
    scene,
    dispose() {
      scene.onBeforeRenderObservable.remove(fpsObserver);
      post.dispose();
      ssr.dispose();
      interiorLit1.dispose();
      interiorLit2.dispose();
      interiorDark.dispose();
      dripTexture.dispose();
      damageTexture.dispose();
      environment.dispose();
      void registry.dispose();
      scene.dispose();
    },
  };
}
