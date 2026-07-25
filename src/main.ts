import { Engine } from "@babylonjs/core";
import { createScene } from "./scene/createScene";
import "./styles.css";

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("Missing application mount point.");
  }

  // The HUD creates the final canvas. A provisional canvas lets the engine
  // initialize before async scene setup replaces the application markup.
  app.innerHTML = '<canvas id="renderCanvas"></canvas>';
  let canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance",
  });

  const resources = await createScene(engine);
  canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas")!;

  engine.runRenderLoop(() => {
    resources.scene.render();
  });

  const resize = () => engine.resize();
  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", resize);
    resources.dispose();
    engine.dispose();
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  const app = document.querySelector<HTMLDivElement>("#app");
  if (app) {
    app.innerHTML = `
      <div class="fatal-error">
        <span>Scene initialization failed</span>
        <strong>${error instanceof Error ? error.message : "Unknown error"}</strong>
        <button onclick="location.reload()">Reload shader lab</button>
      </div>
    `;
  }
});
