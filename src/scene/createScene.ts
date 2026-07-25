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
  MultiMaterial,
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
import type {
  InteriorControlState,
  InteriorTextureId,
  InteriorVariantId,
  PreparedAssetManifest,
} from "../core/contracts";
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

    material.environmentIntensity = 1.35;
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

function setAllInteriorMaterials(
  container: AssetContainer,
  material: FakeInteriorMaterial["material"],
): void {
  for (const multiMaterial of container.multiMaterials) {
    for (let index = 0; index < multiMaterial.subMaterials.length; index += 1) {
      const current = multiMaterial.subMaterials[index];
      if (
        current?.name.startsWith("MI_FakeInterior") ||
        current?.name.startsWith("FakeInterior_")
      ) {
        multiMaterial.subMaterials[index] = material;
      }
    }
  }
  setInteriorMaterialOnMeshes(container.meshes, material);
}

function setInteriorMaterialOnMeshes(
  meshes: AbstractMesh[],
  material: FakeInteriorMaterial["material"],
): void {
  for (const mesh of meshes) {
    const current = mesh.material;
    if (current instanceof MultiMaterial) {
      for (let index = 0; index < current.subMaterials.length; index += 1) {
        const subMaterial = current.subMaterials[index];
        if (
          subMaterial?.name.startsWith("MI_FakeInterior") ||
          subMaterial?.name.startsWith("FakeInterior_")
        ) {
          current.subMaterials[index] = material;
        }
      }
      continue;
    }
    if (
      current?.name.startsWith("MI_FakeInterior") ||
      current?.name.startsWith("FakeInterior_")
    ) {
      mesh.material = material;
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
  scene.gravity.set(0, 0, 0);

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
  walkCamera.applyGravity = false;
  walkCamera.checkCollisions = false;
  walkCamera.ellipsoid = new Vector3(0.45, 0.9, 0.45);
  const walkInspectionHeight = walkCamera.position.y;
  walkCamera.onAfterCheckInputsObservable.add(() => {
    walkCamera.position.y = walkInspectionHeight;
  });
  const walkKeys = new Set<string>();
  const movementCodes = new Set(["KeyW", "KeyA", "KeyS", "KeyD"]);
  const onWalkKeyDown = (event: KeyboardEvent) => {
    if (scene.activeCamera === walkCamera && movementCodes.has(event.code)) {
      walkKeys.add(event.code);
      event.preventDefault();
    }
  };
  const onWalkKeyUp = (event: KeyboardEvent) => {
    walkKeys.delete(event.code);
  };
  const clearWalkKeys = () => walkKeys.clear();
  window.addEventListener("keydown", onWalkKeyDown);
  window.addEventListener("keyup", onWalkKeyUp);
  window.addEventListener("blur", clearWalkKeys);

  const localForward = Vector3.Forward();
  const localRight = Vector3.Right();
  const walkForward = new Vector3();
  const walkRight = new Vector3();
  const walkDelta = new Vector3();
  const walkMovementObserver = scene.onBeforeRenderObservable.add(() => {
    if (scene.activeCamera !== walkCamera || walkKeys.size === 0) {
      return;
    }

    walkCamera.getDirectionToRef(localForward, walkForward);
    walkCamera.getDirectionToRef(localRight, walkRight);
    walkForward.y = 0;
    walkRight.y = 0;
    walkForward.normalize();
    walkRight.normalize();
    walkDelta.setAll(0);

    if (walkKeys.has("KeyW")) walkDelta.addInPlace(walkForward);
    if (walkKeys.has("KeyS")) walkDelta.subtractInPlace(walkForward);
    if (walkKeys.has("KeyD")) walkDelta.addInPlace(walkRight);
    if (walkKeys.has("KeyA")) walkDelta.subtractInPlace(walkRight);

    if (walkDelta.lengthSquared() > 0) {
      walkDelta
        .normalize()
        .scaleInPlace((4.5 * engine.getDeltaTime()) / 1000);
      walkCamera.position.addInPlace(walkDelta);
      walkCamera.position.y = walkInspectionHeight;
    }
  });

  scene.activeCamera = orbitCamera;
  orbitCamera.attachControl(canvas, true);

  let activeCamera: Camera = orbitCamera;
  const setCameraMode = (mode: "orbit" | "walk") => {
    activeCamera.detachControl();
    activeCamera = mode === "orbit" ? orbitCamera : walkCamera;
    scene.activeCamera = activeCamera;
    activeCamera.attachControl(canvas, true);
    canvas.focus({ preventScroll: true });
  };

  let ssr: SSRRenderingPipeline | null = null;
  let ssrEnabled = false;
  const setSsrEnabled = (enabled: boolean) => {
    if (ssrEnabled === enabled) {
      return;
    }
    ssrEnabled = enabled;
    if (!ssr) {
      return;
    }
    if (enabled) {
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(
        ssr.name,
        [orbitCamera, walkCamera],
      );
    } else {
      scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
        ssr.name,
        [orbitCamera, walkCamera],
      );
    }
  };

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

  ssr = new SSRRenderingPipeline(
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
  scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(
    ssr.name,
    [orbitCamera, walkCamera],
  );

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

  const interiorTextureUrls: Record<InteriorTextureId, string> = {
    lit1: `${textureRoot}/CM_Lit_Interior_1.HDR`,
    lit2: `${textureRoot}/CM_Lit_Interior_2.HDR`,
    dark: `${textureRoot}/CM_Dark_Interior_1.HDR`,
  };
  const interiorDefaults: Record<InteriorVariantId, InteriorControlState> = {
    lit1: {
      texture: "lit1",
      roomWidth: 1,
      roomHeight: 1,
      roomDepth: 1.6,
      cubeRotation: 0,
      emissiveIntensity: 1.14,
      uvScaleX: 1.435474,
      uvScaleY: 1,
      uvOffsetX: -0.217737,
      uvOffsetY: 0,
      flipY: true,
    },
    lit2: {
      texture: "lit2",
      roomWidth: 1,
      roomHeight: 1,
      roomDepth: 1.6,
      cubeRotation: 0.35,
      emissiveIntensity: 1.08,
      uvScaleX: 1.435474,
      uvScaleY: 1,
      uvOffsetX: -0.217737,
      uvOffsetY: 0,
      flipY: true,
    },
    dark: {
      texture: "dark",
      roomWidth: 1,
      roomHeight: 1,
      roomDepth: 1.4,
      cubeRotation: -0.18,
      emissiveIntensity: 0.62,
      uvScaleX: 1.435474,
      uvScaleY: 1,
      uvOffsetX: -0.217737,
      uvOffsetY: 0,
      flipY: true,
    },
  };
  const interiorStates: Record<InteriorVariantId, InteriorControlState> = {
    lit1: { ...interiorDefaults.lit1 },
    lit2: { ...interiorDefaults.lit2 },
    dark: { ...interiorDefaults.dark },
  };
  const interiorMaterials: Record<
    InteriorVariantId,
    FakeInteriorMaterial
  > = {
    lit1: interiorLit1,
    lit2: interiorLit2,
    dark: interiorDark,
  };
  const applyInteriorState = (variant: InteriorVariantId) => {
    const state = interiorStates[variant];
    const material = interiorMaterials[variant];
    const duskBoost = 0.9 + controller.wetness * 0.25;
    material.setRoomTexture(interiorTextureUrls[state.texture]);
    material.setRoomDimensions(
      state.roomWidth,
      state.roomHeight,
      state.roomDepth,
    );
    material.setCubeRotation(state.cubeRotation);
    material.setUvScaleOffset(
      state.uvScaleX,
      state.uvScaleY,
      state.uvOffsetX,
      state.uvOffsetY,
    );
    material.setFlipY(state.flipY);
    material.setIntensity(state.emissiveIntensity * duskBoost);
  };
  const updateInterior = (
    variant: InteriorVariantId,
    patch: Partial<InteriorControlState>,
  ) => {
    Object.assign(interiorStates[variant], patch);
    applyInteriorState(variant);
  };
  const resetInterior = (variant: InteriorVariantId) => {
    interiorStates[variant] = { ...interiorDefaults[variant] };
    applyInteriorState(variant);
  };
  let buildingContainer: AssetContainer | null = null;
  let buildingPreviewMeshes: AbstractMesh[] = [];
  let previewInteriorVariant: InteriorVariantId = "lit1";
  const setInteriorPreviewVariant = (variant: InteriorVariantId) => {
    previewInteriorVariant = variant;
    if (buildingContainer) {
      setAllInteriorMaterials(
        buildingContainer,
        interiorMaterials[previewInteriorVariant].material,
      );
    }
    setInteriorMaterialOnMeshes(
      buildingPreviewMeshes,
      interiorMaterials[previewInteriorVariant].material,
    );
  };

  controller.subscribe(() => {
    const duskBoost = 0.9 + controller.wetness * 0.25;
    interiorLit1.setIntensity(
      interiorStates.lit1.emissiveIntensity * duskBoost,
    );
    interiorLit2.setIntensity(
      interiorStates.lit2.emissiveIntensity * duskBoost,
    );
    interiorDark.setIntensity(
      interiorStates.dark.emissiveIntensity * duskBoost,
    );
  });

  const hud = createHud(controller, {
    setCameraMode,
    setSsrEnabled,
    setInteriorPreviewVariant,
    getInteriorState: (variant) => ({ ...interiorStates[variant] }),
    updateInterior,
    resetInterior,
  });
  hud.setStatus("Loading architecture");
  const [
    manifest,
    building,
    largeBuilding,
    smallBuilding,
    street,
    sidewalkWithCurb,
    sidewalkNoCurb,
  ] =
    await Promise.all([
    fetch("/assets/megakit/manifest.json").then(
      (response) => response.json() as Promise<PreparedAssetManifest>,
    ),
    registry.load(
      "Building_Medium_2_001",
      `${modelRoot}/Building_Medium_2_001.gltf`,
    ),
    registry.load(
      "Building_Large_2",
      `${modelRoot}/Building_Large_2.gltf`,
    ),
    registry.load(
      "Building_Small_1",
      `${modelRoot}/Building_Small_1.gltf`,
    ),
    registry.load(
      "Street_2Lane_noSidewalk",
      `${modelRoot}/Street_2Lane_noSidewalk.gltf`,
    ),
    registry.load(
      "Sidewalk_Straight_3m",
      `${modelRoot}/Sidewalk_Straight_3m.gltf`,
    ),
    registry.load(
      "Sidewalk_NoCurb_3m",
      `${modelRoot}/Sidewalk_NoCurb_3m.gltf`,
    ),
  ]);

  if (manifest.models.length < 3) {
    throw new Error("Prepared asset manifest is incomplete.");
  }

  const interiorReplacements = new Map([
    ["MI_FakeInterior_1", interiorLit1.material],
    ["MI_FakeInterior_2", interiorLit2.material],
    ["MI_FakeInterior_3", interiorLit1.material],
    ["MI_FakeInterior_4", interiorDark.material],
  ]);
  replaceInteriorMaterials(building, interiorReplacements);
  replaceInteriorMaterials(largeBuilding, interiorReplacements);
  replaceInteriorMaterials(smallBuilding, interiorReplacements);
  buildingContainer = building;
  setInteriorPreviewVariant(previewInteriorVariant);

  for (const container of [
    building,
    largeBuilding,
    smallBuilding,
    street,
    sidewalkWithCurb,
    sidewalkNoCurb,
  ]) {
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
  buildingPreviewMeshes =
    buildingInstance.rootNodes[0].getChildMeshes(false);
  setInteriorPreviewVariant(previewInteriorVariant);
  enableCollisions(buildingPreviewMeshes);

  // The structural side walls span exactly 14 m along the frontage.
  const neighboringBuildingOffset = 14;
  const neighboringBuilding = building.instantiateModelsToScene(
    (name) => `neighbor-${name}`,
    false,
    { doNotInstantiate: true },
  );
  setRootTransform(
    neighboringBuilding.rootNodes[0] as TransformNode,
    new Vector3(6, 0, neighboringBuildingOffset),
    -Math.PI / 2,
  );
  const neighboringBuildingMeshes =
    neighboringBuilding.rootNodes[0].getChildMeshes(false);
  buildingPreviewMeshes.push(...neighboringBuildingMeshes);
  setInteriorPreviewVariant(previewInteriorVariant);
  enableCollisions(neighboringBuildingMeshes);

  const largeBuildingInstance = largeBuilding.instantiateModelsToScene(
    (name) => `right-large-${name}`,
    false,
    { doNotInstantiate: true },
  );
  setRootTransform(
    largeBuildingInstance.rootNodes[0] as TransformNode,
    new Vector3(6, 0, -24),
    -Math.PI / 2,
  );
  const largeBuildingMeshes =
    largeBuildingInstance.rootNodes[0].getChildMeshes(false);
  buildingPreviewMeshes.push(...largeBuildingMeshes);
  setInteriorPreviewVariant(previewInteriorVariant);
  enableCollisions(largeBuildingMeshes);

  const pedestrianNeighborOffset = 34;
  const pedestrianNeighbor = smallBuilding.instantiateModelsToScene(
    (name) => `pedestrian-neighbor-${name}`,
    false,
    { doNotInstantiate: true },
  );
  setRootTransform(
    pedestrianNeighbor.rootNodes[0] as TransformNode,
    new Vector3(6, 0, pedestrianNeighborOffset),
    -Math.PI / 2,
  );
  const pedestrianNeighborMeshes =
    pedestrianNeighbor.rootNodes[0].getChildMeshes(false);
  buildingPreviewMeshes.push(...pedestrianNeighborMeshes);
  setInteriorPreviewVariant(previewInteriorVariant);
  enableCollisions(pedestrianNeighborMeshes);

  const roadZPositions = Array.from(
    { length: 13 },
    (_, index) => -34.5 + index * 6,
  );
  for (const roadX of [-3, -9]) {
    for (const roadZ of roadZPositions) {
      const streetInstance = street.instantiateModelsToScene(
        (name) => `street-${roadX}-${roadZ}-${name}`,
        false,
        { doNotInstantiate: true },
      );
      setRootTransform(
        streetInstance.rootNodes[0] as TransformNode,
        new Vector3(roadX, 0, roadZ),
        -Math.PI / 2,
      );
      enableCollisions(streetInstance.rootNodes[0].getChildMeshes(false));
    }
  }

  // Continue both sidewalk rows beyond the second building on one side.
  const sidewalkZPositions = Array.from(
    { length: 11 },
    (_, index) => -6 + index * 3,
  );
  for (const sidewalkZ of sidewalkZPositions) {
    const curbInstance = sidewalkWithCurb.instantiateModelsToScene(
      (name) => `curb-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      curbInstance.rootNodes[0] as TransformNode,
      new Vector3(1.5, 0.01, sidewalkZ),
      -Math.PI / 2,
    );
    enableCollisions(curbInstance.rootNodes[0].getChildMeshes(false));

    const noCurbInstance = sidewalkNoCurb.instantiateModelsToScene(
      (name) => `no-curb-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      noCurbInstance.rootNodes[0] as TransformNode,
      new Vector3(4.5, 0.01, sidewalkZ),
    );
    enableCollisions(noCurbInstance.rootNodes[0].getChildMeshes(false));
  }

  for (let index = 0; index < 5; index += 1) {
    const sidewalkZ = 27 + index * 3;
    const curbExtension = sidewalkWithCurb.instantiateModelsToScene(
      (name) => `curb-extension-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      curbExtension.rootNodes[0] as TransformNode,
      new Vector3(1.5, 0.01, sidewalkZ),
      -Math.PI / 2,
    );
    enableCollisions(curbExtension.rootNodes[0].getChildMeshes(false));

    const noCurbExtension = sidewalkNoCurb.instantiateModelsToScene(
      (name) => `no-curb-extension-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      noCurbExtension.rootNodes[0] as TransformNode,
      new Vector3(4.5, 0.01, sidewalkZ),
    );
    enableCollisions(noCurbExtension.rootNodes[0].getChildMeshes(false));
  }

  for (let index = 1; index <= 10; index += 1) {
    const sidewalkZ = -6 - index * 3;
    const curbExtension = sidewalkWithCurb.instantiateModelsToScene(
      (name) => `large-curb-extension-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      curbExtension.rootNodes[0] as TransformNode,
      new Vector3(1.5, 0.01, sidewalkZ),
      -Math.PI / 2,
    );
    enableCollisions(curbExtension.rootNodes[0].getChildMeshes(false));

    const noCurbExtension = sidewalkNoCurb.instantiateModelsToScene(
      (name) => `large-no-curb-extension-${sidewalkZ}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      noCurbExtension.rootNodes[0] as TransformNode,
      new Vector3(4.5, 0.01, sidewalkZ),
    );
    enableCollisions(noCurbExtension.rootNodes[0].getChildMeshes(false));
  }

  const placeNoCurbSidewalk = (
    namePrefix: string,
    position: Vector3,
    rotationY: number,
  ) => {
    const instance = sidewalkNoCurb.instantiateModelsToScene(
      (name) => `${namePrefix}-${name}`,
      false,
      { doNotInstantiate: true },
    );
    setRootTransform(
      instance.rootNodes[0] as TransformNode,
      position,
      rotationY,
    );
    enableCollisions(instance.rootNodes[0].getChildMeshes(false));
  };

  // Back of the united building footprint.
  for (let index = 0; index < 26; index += 1) {
    const sidewalkZ = -36 + index * 3;
    placeNoCurbSidewalk(
      `back-no-curb-${sidewalkZ}`,
      new Vector3(19.5, 0.01, sidewalkZ),
      Math.PI,
    );
  }

  // Close both ends, joining the front and back sidewalk rows.
  for (const [sideName, sidewalkZ, rotationY] of [
    ["first", -8.5, Math.PI / 2],
    ["first-outer", -11.5, Math.PI / 2],
    ["large-far", -34.5, Math.PI / 2],
    ["large-far-outer", -37.5, Math.PI / 2],
    ["far", 22.5, -Math.PI / 2],
    ["far-outer", 25.5, -Math.PI / 2],
    ["small-far", 40.5, -Math.PI / 2],
    ["small-far-outer", 43.5, -Math.PI / 2],
  ] as const) {
    for (let index = 0; index < 4; index += 1) {
      const sidewalkX = 7.5 + index * 3;
      placeNoCurbSidewalk(
        `${sideName}-no-curb-${sidewalkX}`,
        new Vector3(sidewalkX, 0.01, sidewalkZ),
        rotationY,
      );
    }
  }

  const fpsObserver = scene.onBeforeRenderObservable.add(() => {
    hud.setFps(engine.getFps());
  });

  hud.setStatus("Ready", true);

  return {
    scene,
    dispose() {
      window.removeEventListener("keydown", onWalkKeyDown);
      window.removeEventListener("keyup", onWalkKeyUp);
      window.removeEventListener("blur", clearWalkKeys);
      scene.onBeforeRenderObservable.remove(walkMovementObserver);
      scene.onBeforeRenderObservable.remove(fpsObserver);
      post.dispose();
      ssr?.dispose();
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
