import type { WeatherDebugMode } from "../core/contracts";
import type { WeatherController } from "../core/WeatherController";

export interface HudBindings {
  setCameraMode(mode: "orbit" | "walk"): void;
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

      <div class="hint">
        <span>Controls</span>
        <p id="controlHint">Drag to orbit · wheel to zoom</p>
      </div>
    </aside>
    <footer class="telemetry">
      <span><i></i> WebGL2</span>
      <span>SSR + IBL</span>
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
