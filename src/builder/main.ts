import "@babylonjs/loaders/glTF";

import {
  ArcRotateCamera,
  Color3,
  Color4,
  CubeTexture,
  DirectionalLight,
  Engine,
  HemisphericLight,
  type Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AssetContainer,
  type Node,
} from "@babylonjs/core";
import { AssetRegistry } from "../assets/AssetRegistry";
import "./styles.css";

type ModuleId = "wall" | "window" | "shopfront" | "door";
type FacadeFamily = "brick" | "metal" | "trim";
type UpperModuleId = "wall" | "single" | "double" | "covered";

interface ModuleDefinition {
  id: ModuleId;
  label: string;
  assetNames: string[];
}

const modules: ModuleDefinition[] = [
  {
    id: "wall",
    label: "Solid wall",
    assetNames: ["Metal_FirstFloor_Wall"],
  },
  {
    id: "window",
    label: "Window",
    assetNames: ["Metal_FirstFloor_Window"],
  },
  {
    id: "shopfront",
    label: "Shopfront",
    assetNames: ["Metal_FullWindow"],
  },
  {
    id: "door",
    label: "Entrance",
    assetNames: ["DoorFrame_Metal_Single", "Door_2"],
  },
];

const moduleById = new Map(modules.map((module) => [module.id, module]));

interface UpperAssetDefinition {
  width: 2 | 4;
  sources: Array<{ assetName: string; offsetX?: number }>;
}

const upperAssets: Record<
  FacadeFamily,
  Record<Exclude<UpperModuleId, "covered">, UpperAssetDefinition>
> = {
  brick: {
    wall: { width: 2, sources: [{ assetName: "Brick_Plain_3" }] },
    single: {
      width: 2,
      sources: [{ assetName: "Brick_Window_Square_Single" }],
    },
    double: {
      width: 4,
      sources: [{ assetName: "Brick_Inset_Window" }],
    },
  },
  metal: {
    wall: { width: 2, sources: [{ assetName: "Metal_Plain_3" }] },
    single: {
      width: 2,
      sources: [{ assetName: "Metal_Window_Half" }],
    },
    double: { width: 4, sources: [{ assetName: "Metal_Window" }] },
  },
  trim: {
    wall: { width: 2, sources: [{ assetName: "Trim_Plain_3" }] },
    single: { width: 2, sources: [{ assetName: "Trim_Window" }] },
    double: {
      width: 4,
      sources: [
        { assetName: "Trim_Window", offsetX: -1 },
        { assetName: "Trim_Window", offsetX: 1 },
      ],
    },
  },
};
const modelRoot = "/assets/megakit/models";
const bayWidth = 2;
const bayCount = 4;

function createMarkup(app: HTMLDivElement): void {
  app.innerHTML = `
    <main class="builder-shell">
      <aside class="builder-panel">
        <p class="eyebrow">Prototype 01 · Ground floor</p>
        <h1>Building module builder</h1>
        <p class="intro">
          Assemble an 8 m small-building frontage from reusable 2 × 3 m GLTF
          elements. Select a bay, then choose its module.
        </p>

        <section class="builder-section" aria-labelledby="bay-label">
          <span class="section-label" id="bay-label">01 / Select facade bay</span>
          <div class="bay-list" role="group" aria-label="Facade bays">
            ${Array.from(
              { length: bayCount },
              (_, index) => `
                <button class="bay-button${index === 0 ? " is-selected" : ""}"
                  type="button" data-ground-bay="${index}" aria-pressed="${index === 0}">
                  <span class="bay-index">0${index + 1}</span>
                </button>
              `,
            ).join("")}
          </div>
        </section>

        <section class="builder-section" aria-labelledby="module-label">
          <span class="section-label" id="module-label">02 / Place module</span>
          <div class="module-list">
            ${modules
              .map(
                (module) => `
                  <button class="module-button" type="button"
                    data-module="${module.id}">
                    <strong>${module.label}</strong>
                    <span class="module-meta">2.0 × 3.0 m</span>
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="builder-section" aria-labelledby="preset-label">
          <span class="section-label" id="preset-label">Quick layouts</span>
          <div class="preset-list">
            <button class="preset-button" type="button" data-preset="residential">
              Residential
            </button>
            <button class="preset-button" type="button" data-preset="shop">
              Small shop
            </button>
            <button class="preset-button" type="button" data-preset="showroom">
              Showroom
            </button>
            <button class="preset-button" type="button" data-preset="private">
              Private entry
            </button>
          </div>
        </section>

        <section class="builder-section" aria-labelledby="upper-label">
          <span class="section-label" id="upper-label">03 / Upper-floor family</span>
          <div class="family-list" role="group" aria-label="Facade family">
            ${(["brick", "metal", "trim"] as const)
              .map(
                (family, index) => `
                  <button class="family-button${index === 0 ? " is-selected" : ""}"
                    type="button" data-family="${family}" aria-pressed="${index === 0}">
                    ${family[0].toUpperCase()}${family.slice(1)}
                  </button>
                `,
              )
              .join("")}
          </div>
        </section>

        <section class="builder-section" aria-labelledby="upper-bay-label">
          <span class="section-label" id="upper-bay-label">04 / Upper-floor pattern</span>
          <div class="bay-list" role="group" aria-label="Upper-floor bays">
            ${Array.from(
              { length: bayCount },
              (_, index) => `
                <button class="bay-button${index === 0 ? " is-selected" : ""}"
                  type="button" data-upper-bay="${index}" aria-pressed="${index === 0}">
                  <span class="bay-index">0${index + 1}</span>
                </button>
              `,
            ).join("")}
          </div>
          <div class="upper-module-list" style="margin-top:8px">
            <button class="upper-module-button" type="button" data-upper-module="wall">
              Wall
            </button>
            <button class="upper-module-button" type="button" data-upper-module="single">
              Window
            </button>
            <button class="upper-module-button" type="button" data-upper-module="double">
              Double · 4 m
            </button>
          </div>
          <div class="upper-preset-list">
            <button class="preset-button" type="button" data-upper-preset="regular">
              Regular
            </button>
            <button class="preset-button" type="button" data-upper-preset="center-wide">
              Center wide
            </button>
            <button class="preset-button" type="button" data-upper-preset="twin-wide">
              Twin wide
            </button>
            <button class="preset-button" type="button" data-upper-preset="solid-ends">
              Solid ends
            </button>
          </div>
          <div class="family-list" style="margin-top:8px">
            <button class="family-button is-selected" type="button"
              data-stack-mode="repeat" aria-pressed="true">
              Repeat
            </button>
            <button class="family-button" type="button"
              data-stack-mode="mirror" aria-pressed="false">
              Mirror
            </button>
          </div>
        </section>

        <section class="builder-section" aria-labelledby="height-label">
          <span class="section-label" id="height-label">05 / Building height</span>
          <div class="floor-control">
            <label for="floor-count">Repeated upper floors</label>
            <output id="floor-count-output">2</output>
            <input id="floor-count" type="range" min="1" max="6" value="2" />
          </div>
        </section>

        <footer class="builder-footer">
          <div class="status" data-status>
            <span class="status-dot"></span>
            <span data-status-text>Loading modules</span>
          </div>
          <a class="back-link" href="/">Shader lab ↗</a>
        </footer>
      </aside>

      <section class="viewport" aria-label="3D building preview">
        <canvas id="builderCanvas"></canvas>
        <p class="viewport-note">Drag to orbit · Wheel to zoom</p>
      </section>
    </main>
  `;
}

interface ShellMeshes {
  walls: Mesh[];
  topCap: Mesh;
}

function createShell(scene: Scene): ShellMeshes {
  const shellMaterial = new StandardMaterial("shell-material", scene);
  shellMaterial.diffuseColor = new Color3(0.49, 0.48, 0.43);
  shellMaterial.specularColor = new Color3(0.08, 0.08, 0.07);

  const floorMaterial = new StandardMaterial("floor-material", scene);
  floorMaterial.diffuseColor = new Color3(0.26, 0.28, 0.25);
  floorMaterial.specularColor = Color3.Black();

  const sideOptions = { width: 0.24, height: 3, depth: 8 };
  const shellWalls: Mesh[] = [];
  for (const x of [-4.12, 4.12]) {
    const side = MeshBuilder.CreateBox(`side-${x}`, sideOptions, scene);
    side.position.set(x, 1.5, 4);
    side.material = shellMaterial;
    shellWalls.push(side);
  }

  const rear = MeshBuilder.CreateBox(
    "rear-wall",
    { width: 8.24, height: 3, depth: 0.24 },
    scene,
  );
  rear.position.set(0, 1.5, 8);
  rear.material = shellMaterial;
  shellWalls.push(rear);

  const floor = MeshBuilder.CreateBox(
    "building-floor",
    { width: 8.5, height: 0.16, depth: 8.5 },
    scene,
  );
  floor.position.set(0, -0.08, 4);
  floor.material = floorMaterial;

  const topCap = MeshBuilder.CreateBox(
    "building-top-cap",
    { width: 8.5, height: 0.16, depth: 8.5 },
    scene,
  );
  topCap.position.set(0, 3.08, 4);
  topCap.material = floorMaterial;

  const ground = MeshBuilder.CreateGround(
    "ground",
    { width: 32, height: 28 },
    scene,
  );
  ground.position.y = -0.17;
  ground.material = floorMaterial;
  return { walls: shellWalls, topCap };
}

function setNodeTransform(node: Node, position: Vector3): void {
  if (!(node instanceof TransformNode)) {
    return;
  }
  node.position.copyFrom(position);
  node.rotationQuaternion = null;
  node.rotation.set(0, 0, 0);
}

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#builder-app");
  if (!app) {
    throw new Error("Missing builder mount point.");
  }
  createMarkup(app);

  const canvas = document.querySelector<HTMLCanvasElement>("#builderCanvas");
  if (!canvas) {
    throw new Error("Missing builder canvas.");
  }

  const engine = new Engine(canvas, true, {
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    stencil: false,
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.12, 0.14, 0.12, 1);
  scene.ambientColor = new Color3(0.35, 0.35, 0.32);
  scene.environmentTexture = CubeTexture.CreateFromPrefilteredData(
    "/assets/megakit/textures/environmentSpecular.env",
    scene,
  );

  const camera = new ArcRotateCamera(
    "builder-camera",
    -Math.PI / 2,
    1.2,
    18,
    new Vector3(0, 4.2, 2.2),
    scene,
  );
  camera.lowerRadiusLimit = 7;
  camera.upperRadiusLimit = 40;
  camera.lowerBetaLimit = 0.55;
  camera.upperBetaLimit = 1.48;
  camera.wheelPrecision = 45;
  camera.panningSensibility = 0;
  camera.attachControl(canvas, true);

  const skyLight = new HemisphericLight(
    "sky-light",
    new Vector3(0.2, 1, -0.3),
    scene,
  );
  skyLight.intensity = 0.65;
  skyLight.groundColor = new Color3(0.25, 0.27, 0.24);

  const keyLight = new DirectionalLight(
    "key-light",
    new Vector3(-0.45, -0.8, 0.55),
    scene,
  );
  keyLight.position.set(8, 12, -8);
  keyLight.intensity = 0.75;

  const shell = createShell(scene);

  const registry = new AssetRegistry(scene);
  const upperAssetNames = Object.values(upperAssets).flatMap((family) =>
    Object.values(family).flatMap((definition) =>
      definition.sources.map((source) => source.assetName),
    ),
  );
  const assetNames = [
    ...new Set([
      ...modules.flatMap((module) => module.assetNames),
      ...upperAssetNames,
    ]),
  ];
  const loaded = await Promise.all(
    assetNames.map(async (name) => {
      const container = await registry.load(
        name,
        `${modelRoot}/${name}.gltf`,
      );
      return [name, container] as const;
    }),
  );
  const assets = new Map<string, AssetContainer>(loaded);
  const bayRoots: TransformNode[] = [];
  let selectedBay = 0;
  let layout: ModuleId[] = ["window", "door", "window", "wall"];

  const disposeBay = (index: number): void => {
    // Instances share their source GLTF materials. Dispose only the replaced
    // hierarchy, never the shared material/texture resources.
    bayRoots[index]?.dispose(false, false);
  };

  const buildBay = (index: number): void => {
    disposeBay(index);
    const module = moduleById.get(layout[index]);
    if (!module) {
      return;
    }

    const bayRoot = new TransformNode(`bay-${index}-${module.id}`, scene);
    bayRoot.position.x = (index - (bayCount - 1) / 2) * bayWidth;

    for (const [assetIndex, assetName] of module.assetNames.entries()) {
      const container = assets.get(assetName);
      if (!container) {
        continue;
      }
      const instance = container.instantiateModelsToScene(
        (name) => `bay-${index}-${module.id}-${name}`,
        false,
        { doNotInstantiate: false },
      );
      for (const rootNode of instance.rootNodes) {
        setNodeTransform(
          rootNode,
          new Vector3(0, 0, assetIndex === 0 ? 0 : -0.035),
        );
        rootNode.parent = bayRoot;
      }
    }
    bayRoots[index] = bayRoot;
  };

  const updateBayButtons = (): void => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-ground-bay]",
    )) {
      const bayIndex = Number(button.dataset.groundBay);
      const isSelected = bayIndex === selectedBay;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
      const type = moduleById.get(layout[bayIndex])?.label;
      button.title = type ?? "Empty bay";
    }
  };

  const applyLayout = (nextLayout: ModuleId[]): void => {
    layout = [...nextLayout];
    for (let index = 0; index < bayCount; index += 1) {
      buildBay(index);
    }
    updateBayButtons();
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-ground-bay]",
  )) {
    button.addEventListener("click", () => {
      selectedBay = Number(button.dataset.groundBay);
      updateBayButtons();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-module]",
  )) {
    button.addEventListener("click", () => {
      layout[selectedBay] = button.dataset.module as ModuleId;
      buildBay(selectedBay);
      updateBayButtons();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-preset]",
  )) {
    button.addEventListener("click", () => {
      switch (button.dataset.preset) {
        case "shop":
          applyLayout(["shopfront", "shopfront", "door", "wall"]);
          break;
        case "showroom":
          applyLayout(["shopfront", "shopfront", "shopfront", "door"]);
          break;
        case "private":
          applyLayout(["wall", "window", "door", "wall"]);
          break;
        default:
          applyLayout(["window", "door", "window", "wall"]);
      }
    });
  }

  let upperFamily: FacadeFamily = "brick";
  let upperLayout: UpperModuleId[] = [
    "single",
    "single",
    "single",
    "single",
  ];
  let selectedUpperBay = 0;
  let upperFloorCount = 2;
  let stackMode: "repeat" | "mirror" = "repeat";
  let upperRoot: TransformNode | null = null;

  const clearUpperOverlap = (index: number): void => {
    if (upperLayout[index] === "covered" && index > 0) {
      upperLayout[index - 1] = "wall";
      upperLayout[index] = "wall";
    } else if (upperLayout[index] === "double") {
      upperLayout[index] = "wall";
      if (index + 1 < bayCount) {
        upperLayout[index + 1] = "wall";
      }
    }
  };

  const updateShellHeight = (): void => {
    const totalHeight = 3 + upperFloorCount * 3;
    for (const wall of shell.walls) {
      wall.scaling.y = totalHeight / 3;
      wall.position.y = totalHeight / 2;
    }
    shell.topCap.position.y = totalHeight + 0.08;
  };

  const buildUpperFloors = (): void => {
    upperRoot?.dispose(false, false);
    upperRoot = new TransformNode("upper-floors", scene);

    for (let floorIndex = 0; floorIndex < upperFloorCount; floorIndex += 1) {
      const placements = upperLayout.flatMap((moduleId, bayIndex) => {
        if (moduleId === "covered") {
          return [];
        }
        const isMirrored = stackMode === "mirror" && floorIndex % 2 === 1;
        const mirroredIndex =
          moduleId === "double"
            ? bayCount - 2 - bayIndex
            : bayCount - 1 - bayIndex;
        return [{ moduleId, bayIndex: isMirrored ? mirroredIndex : bayIndex }];
      });

      for (const { moduleId, bayIndex } of placements) {
        const definition = upperAssets[upperFamily][moduleId];
        const moduleCenterX =
          definition.width === 4
            ? (bayIndex - 1) * bayWidth
            : (bayIndex - (bayCount - 1) / 2) * bayWidth;
        const moduleRoot = new TransformNode(
          `upper-${floorIndex}-${bayIndex}-${upperFamily}-${moduleId}`,
          scene,
        );
        moduleRoot.position.set(moduleCenterX, 3 + floorIndex * 3, 0);
        moduleRoot.parent = upperRoot;

        for (const [sourceIndex, source] of definition.sources.entries()) {
          const container = assets.get(source.assetName);
          if (!container) {
            continue;
          }
          const instance = container.instantiateModelsToScene(
            (name) =>
              `upper-${floorIndex}-${bayIndex}-${sourceIndex}-${name}`,
            false,
            { doNotInstantiate: false },
          );
          for (const rootNode of instance.rootNodes) {
            setNodeTransform(
              rootNode,
              new Vector3(source.offsetX ?? 0, 0, 0),
            );
            rootNode.parent = moduleRoot;
          }
        }
      }
    }
    updateShellHeight();
  };

  const updateUpperControls = (): void => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-upper-bay]",
    )) {
      const index = Number(button.dataset.upperBay);
      const isSelected = index === selectedUpperBay;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
      const moduleId = upperLayout[index];
      button.title =
        moduleId === "covered" ? "Part of double window" : moduleId;
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-family]",
    )) {
      const isSelected = button.dataset.family === upperFamily;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "[data-stack-mode]",
    )) {
      const isSelected = button.dataset.stackMode === stackMode;
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    }
  };

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-upper-bay]",
  )) {
    button.addEventListener("click", () => {
      selectedUpperBay = Number(button.dataset.upperBay);
      updateUpperControls();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-family]",
  )) {
    button.addEventListener("click", () => {
      upperFamily = button.dataset.family as FacadeFamily;
      buildUpperFloors();
      updateUpperControls();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-upper-module]",
  )) {
    button.addEventListener("click", () => {
      const nextModule = button.dataset.upperModule as Exclude<
        UpperModuleId,
        "covered"
      >;
      if (nextModule === "double") {
        const start = Math.min(selectedUpperBay, bayCount - 2);
        clearUpperOverlap(start);
        clearUpperOverlap(start + 1);
        upperLayout[start] = "double";
        upperLayout[start + 1] = "covered";
        selectedUpperBay = start;
      } else {
        clearUpperOverlap(selectedUpperBay);
        upperLayout[selectedUpperBay] = nextModule;
      }
      buildUpperFloors();
      updateUpperControls();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-upper-preset]",
  )) {
    button.addEventListener("click", () => {
      switch (button.dataset.upperPreset) {
        case "center-wide":
          upperLayout = ["single", "double", "covered", "single"];
          break;
        case "twin-wide":
          upperLayout = ["double", "covered", "double", "covered"];
          break;
        case "solid-ends":
          upperLayout = ["wall", "single", "single", "wall"];
          break;
        default:
          upperLayout = ["single", "single", "single", "single"];
      }
      selectedUpperBay = 0;
      buildUpperFloors();
      updateUpperControls();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-stack-mode]",
  )) {
    button.addEventListener("click", () => {
      stackMode = button.dataset.stackMode as "repeat" | "mirror";
      buildUpperFloors();
      updateUpperControls();
    });
  }

  const floorCountInput =
    document.querySelector<HTMLInputElement>("#floor-count");
  const floorCountOutput =
    document.querySelector<HTMLOutputElement>("#floor-count-output");
  floorCountInput?.addEventListener("input", () => {
    upperFloorCount = Number(floorCountInput.value);
    if (floorCountOutput) {
      floorCountOutput.value = String(upperFloorCount);
    }
    buildUpperFloors();
  });

  applyLayout(layout);
  buildUpperFloors();
  updateUpperControls();
  const status = document.querySelector<HTMLElement>("[data-status]");
  const statusText =
    document.querySelector<HTMLElement>("[data-status-text]");
  status?.classList.add("is-ready");
  if (statusText) {
    statusText.textContent = `${assetNames.length} sources ready`;
  }

  engine.runRenderLoop(() => scene.render());
  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", resize);
    void registry.dispose();
    scene.dispose();
    engine.dispose();
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  const app = document.querySelector<HTMLDivElement>("#builder-app");
  if (app) {
    app.innerHTML = `
      <main style="padding:32px;font-family:system-ui">
        <p>Building builder failed to start.</p>
        <strong>${error instanceof Error ? error.message : "Unknown error"}</strong>
      </main>
    `;
  }
});
