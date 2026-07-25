import type {
  InteriorControlState,
  InteriorVariantId,
  WeatherDebugMode,
} from "../core/contracts";
import type { WeatherController } from "../core/WeatherController";

export interface HudBindings {
  setCameraMode(mode: "orbit" | "walk"): void;
  setSsrEnabled(enabled: boolean): void;
  setInteriorPreviewVariant(variant: InteriorVariantId): void;
  getInteriorState(variant: InteriorVariantId): InteriorControlState;
  updateInterior(
    variant: InteriorVariantId,
    patch: Partial<InteriorControlState>,
  ): void;
  resetInterior(variant: InteriorVariantId): void;
}

export function createHud(
  controller: WeatherController,
  bindings: HudBindings,
): {
  setStatus(message: string, ready?: boolean): void;
  setFps(value: number): void;
} {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing #app mount point");
  }

  const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
  if (!canvas) {
    throw new Error("Missing rendering canvas");
  }
  canvas.setAttribute(
    "aria-label",
    "Interactive downtown shader scene",
  );

  app.insertAdjacentHTML(
    "beforeend",
    `
    <div class="vignette" aria-hidden="true"></div>
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">DT</span>
        <div>
          <strong>Downtown</strong>
          <span>Material systems laboratory</span>
        </div>
      </div>
      <div class="scene-state">
        <span class="pulse"></span>
        <span id="statusText">Preparing city assets</span>
      </div>
    </header>
    <aside class="control-panel">
      <div class="panel-kicker">Surface conditions</div>
      <h1>After the rain</h1>
      <p class="lede">Inspect authored wear, wet-road reflections, and view-dependent rooms in one dusk scene.</p>

      <label class="range-control">
        <span><b>Wetness</b><output id="wetnessValue">72%</output></span>
        <input id="wetnessRange" type="range" min="0" max="100" value="72" />
      </label>

      <label class="range-control">
        <span><b>Wear</b><output id="wearValue">55%</output></span>
        <input id="wearRange" type="range" min="0" max="100" value="55" />
      </label>

      <div class="field">
        <span class="field-label">Diagnostic view</span>
        <div class="segmented" id="debugModes">
          <button class="active" data-debug="off">Beauty</button>
          <button data-debug="wear">Wear mask</button>
          <button data-debug="wetness">Wet mask</button>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Camera</span>
        <div class="segmented two" id="cameraModes">
          <button class="active" data-camera="orbit">Orbit</button>
          <button data-camera="walk">Walk</button>
        </div>
      </div>

      <div class="field">
        <span class="field-label">Screen-space reflections</span>
        <div class="segmented two" id="ssrModes">
          <button class="active" data-ssr="off" aria-pressed="true">Off</button>
          <button data-ssr="on" aria-pressed="false">On</button>
        </div>
      </div>

      <div class="hint">
        <span>Controls</span>
        <p id="controlHint">Drag to orbit · wheel to zoom</p>
      </div>
    </aside>
    <aside class="interior-panel" aria-labelledby="interiorPanelTitle">
      <div class="panel-heading">
        <div>
          <div class="panel-kicker">Window system</div>
          <h2 id="interiorPanelTitle">Fake interior</h2>
        </div>
        <span class="live-badge">Live</span>
      </div>
      <p class="panel-description">Tune the selected window material. Changes apply immediately and remain independent per variant.</p>

      <div class="select-grid">
        <label class="select-control">
          <span>Material variant</span>
          <select id="interiorVariant">
            <option value="lit1">Lit interior 1</option>
            <option value="lit2">Lit interior 2</option>
            <option value="dark">Dark interior</option>
          </select>
        </label>
        <label class="select-control">
          <span>Room panorama</span>
          <select id="interiorTexture">
            <option value="lit1">Lit room 1</option>
            <option value="lit2">Lit room 2</option>
            <option value="dark">Dark room</option>
          </select>
        </label>
      </div>

      <section class="control-section" aria-labelledby="roomGeometryTitle">
        <h3 id="roomGeometryTitle">Room geometry</h3>
        <div class="three-column-controls">
        <label class="range-control compact">
          <span><b>Width</b><output data-interior-output="roomWidth">1.00&times;</output></span>
          <input data-interior-control="roomWidth" type="range" min="0.25" max="3" step="0.05" value="1" />
        </label>
        <label class="range-control compact">
          <span><b>Height</b><output data-interior-output="roomHeight">1.00&times;</output></span>
          <input data-interior-control="roomHeight" type="range" min="0.25" max="3" step="0.05" value="1" />
        </label>
        <label class="range-control compact">
          <span><b>Depth</b><output data-interior-output="roomDepth">1.60&times;</output></span>
          <input data-interior-control="roomDepth" type="range" min="0" max="4" step="0.05" value="1.6" />
        </label>
        </div>
      </section>

      <section class="control-section" aria-labelledby="roomLookTitle">
        <h3 id="roomLookTitle">Panorama</h3>
        <div class="two-column-controls">
        <label class="range-control compact">
          <span><b>Cube rotation</b><output data-interior-output="cubeRotation">0&deg;</output></span>
          <input data-interior-control="cubeRotation" type="range" min="-180" max="180" step="1" value="0" />
        </label>
        <label class="range-control compact">
          <span><b>Emission</b><output data-interior-output="emissiveIntensity">1.14&times;</output></span>
          <input data-interior-control="emissiveIntensity" type="range" min="0" max="3" step="0.01" value="1.14" />
        </label>
        </div>
        <div class="inline-control">
          <span>Vertical orientation</span>
          <div class="segmented two" id="interiorFlip">
            <button data-flip="false" aria-pressed="false">Normal</button>
            <button class="active" data-flip="true" aria-pressed="true">Flipped</button>
          </div>
        </div>
      </section>

      <section class="control-section" aria-labelledby="uvTitle">
        <h3 id="uvTitle">UV normalization</h3>
        <div class="two-column-controls">
          <label class="range-control compact">
            <span><b>Scale X</b><output data-interior-output="uvScaleX">1.435</output></span>
            <input data-interior-control="uvScaleX" type="range" min="0.25" max="3" step="0.005" value="1.435474" />
          </label>
          <label class="range-control compact">
            <span><b>Scale Y</b><output data-interior-output="uvScaleY">1.000</output></span>
            <input data-interior-control="uvScaleY" type="range" min="0.25" max="3" step="0.005" value="1" />
          </label>
          <label class="range-control compact">
            <span><b>Offset X</b><output data-interior-output="uvOffsetX">-0.218</output></span>
            <input data-interior-control="uvOffsetX" type="range" min="-1" max="1" step="0.005" value="-0.217737" />
          </label>
          <label class="range-control compact">
            <span><b>Offset Y</b><output data-interior-output="uvOffsetY">0.000</output></span>
            <input data-interior-control="uvOffsetY" type="range" min="-1" max="1" step="0.005" value="0" />
          </label>
        </div>
      </section>

      <button class="secondary-action" id="resetInterior" type="button">Reset selected variant</button>
    </aside>
    <footer class="telemetry">
      <span><i></i> WebGL2</span>
      <span id="reflectionMode">IBL / SSR off</span>
      <span id="fpsValue">-- FPS</span>
    </footer>
  `,
  );

  const wetnessRange =
    document.querySelector<HTMLInputElement>("#wetnessRange")!;
  const wetnessValue =
    document.querySelector<HTMLOutputElement>("#wetnessValue")!;
  const wearRange = document.querySelector<HTMLInputElement>("#wearRange")!;
  const wearValue = document.querySelector<HTMLOutputElement>("#wearValue")!;

  wetnessRange.addEventListener("input", () => {
    const value = Number(wetnessRange.value);
    wetnessValue.value = `${value}%`;
    controller.setWetness(value / 100);
  });

  wearRange.addEventListener("input", () => {
    const value = Number(wearRange.value);
    wearValue.value = `${value}%`;
    controller.setWear(value / 100);
  });

  document.querySelector("#debugModes")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-debug]",
    );
    if (!button) {
      return;
    }
    const mode = button.dataset.debug as WeatherDebugMode;
    document
      .querySelectorAll("#debugModes button")
      .forEach((item) => item.classList.toggle("active", item === button));
    controller.setDebugMode(mode);
  });

  document.querySelector("#cameraModes")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-camera]",
    );
    if (!button) {
      return;
    }
    const mode = button.dataset.camera as "orbit" | "walk";
    document
      .querySelectorAll("#cameraModes button")
      .forEach((item) => item.classList.toggle("active", item === button));
    document.querySelector("#controlHint")!.textContent =
      mode === "orbit"
        ? "Drag to orbit · wheel to zoom"
        : "WASD to move · drag to look";
    bindings.setCameraMode(mode);
  });

  document.querySelector("#ssrModes")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-ssr]",
    );
    if (!button) {
      return;
    }
    const enabled = button.dataset.ssr === "on";
    document.querySelectorAll<HTMLButtonElement>("#ssrModes button").forEach(
      (item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      },
    );
    document.querySelector("#reflectionMode")!.textContent = enabled
      ? "IBL / SSR on"
      : "IBL / SSR off";
    bindings.setSsrEnabled(enabled);
  });

  let activeInterior: InteriorVariantId = "lit1";
  const interiorVariant =
    document.querySelector<HTMLSelectElement>("#interiorVariant")!;
  const interiorTexture =
    document.querySelector<HTMLSelectElement>("#interiorTexture")!;
  const rangeFormatters: Record<
    Exclude<keyof InteriorControlState, "texture" | "flipY">,
    (value: number) => string
  > = {
    roomWidth: (value) => `${value.toFixed(2)}×`,
    roomHeight: (value) => `${value.toFixed(2)}×`,
    roomDepth: (value) => `${value.toFixed(2)}×`,
    cubeRotation: (value) => `${Math.round((value * 180) / Math.PI)}°`,
    emissiveIntensity: (value) => `${value.toFixed(2)}×`,
    uvScaleX: (value) => value.toFixed(3),
    uvScaleY: (value) => value.toFixed(3),
    uvOffsetX: (value) => value.toFixed(3),
    uvOffsetY: (value) => value.toFixed(3),
  };

  const syncInteriorPanel = () => {
    const state = bindings.getInteriorState(activeInterior);
    interiorVariant.value = activeInterior;
    interiorTexture.value = state.texture;
    document
      .querySelectorAll<HTMLInputElement>("[data-interior-control]")
      .forEach((input) => {
        const key = input.dataset
          .interiorControl as Exclude<
          keyof InteriorControlState,
          "texture" | "flipY"
        >;
        const value = state[key];
        input.value = String(
          key === "cubeRotation" ? (value * 180) / Math.PI : value,
        );
        const output = document.querySelector<HTMLOutputElement>(
          `[data-interior-output="${key}"]`,
        );
        if (output) {
          output.value = rangeFormatters[key](value);
        }
      });
    document.querySelectorAll<HTMLButtonElement>("#interiorFlip button").forEach(
      (button) => {
        const active = (button.dataset.flip === "true") === state.flipY;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      },
    );
  };

  interiorVariant.addEventListener("change", () => {
    activeInterior = interiorVariant.value as InteriorVariantId;
    bindings.setInteriorPreviewVariant(activeInterior);
    syncInteriorPanel();
  });

  interiorTexture.addEventListener("change", () => {
    bindings.updateInterior(activeInterior, {
      texture: interiorTexture.value as InteriorControlState["texture"],
    });
  });

  document
    .querySelectorAll<HTMLInputElement>("[data-interior-control]")
    .forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset
          .interiorControl as Exclude<
          keyof InteriorControlState,
          "texture" | "flipY"
        >;
        const inputValue = Number(input.value);
        const value =
          key === "cubeRotation" ? (inputValue * Math.PI) / 180 : inputValue;
        bindings.updateInterior(activeInterior, { [key]: value });
        const output = document.querySelector<HTMLOutputElement>(
          `[data-interior-output="${key}"]`,
        );
        if (output) {
          output.value = rangeFormatters[key](value);
        }
      });
    });

  document.querySelector("#interiorFlip")?.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-flip]",
    );
    if (!button) {
      return;
    }
    bindings.updateInterior(activeInterior, {
      flipY: button.dataset.flip === "true",
    });
    syncInteriorPanel();
  });

  document.querySelector("#resetInterior")?.addEventListener("click", () => {
    bindings.resetInterior(activeInterior);
    syncInteriorPanel();
  });

  syncInteriorPanel();

  return {
    setStatus(message, ready = false) {
      document.querySelector("#statusText")!.textContent = message;
      document.querySelector(".scene-state")?.classList.toggle("ready", ready);
    },
    setFps(value) {
      document.querySelector("#fpsValue")!.textContent =
        `${Math.round(value)} FPS`;
    },
  };
}
