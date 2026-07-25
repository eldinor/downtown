import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

await mkdir("test-results", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
page.setDefaultTimeout(90_000);

const failures = [];
page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") {
    failures.push(`console: ${message.text()}`);
  }
});

await page.goto("http://127.0.0.1:4173", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await page
  .locator("#statusText")
  .filter({ hasText: "Shader systems online" })
  .waitFor({ timeout: 90_000 });

await page.locator('button[data-debug="wear"]').click();
await page.locator('button[data-debug="wetness"]').click();
await page.locator('button[data-debug="off"]').click();
await page.locator("#wetnessRange").fill("35");
await page.locator("#wearRange").fill("70");
await page.locator('button[data-camera="walk"]').click();
await page.locator('button[data-camera="orbit"]').click();
await page.locator("#wetnessRange").fill("72");
await page.locator("#wearRange").fill("55");

const snapshot = await page.evaluate(() => ({
  status: document.querySelector("#statusText")?.textContent,
  wetness: document.querySelector("#wetnessValue")?.textContent,
  wear: document.querySelector("#wearValue")?.textContent,
  canvas: {
    width: document.querySelector("canvas")?.width,
    height: document.querySelector("canvas")?.height,
  },
  activeDebug: document.querySelector("#debugModes .active")?.textContent,
  activeCamera: document.querySelector("#cameraModes .active")?.textContent,
}));

await page.screenshot({
  path: "test-results/downtown-shader-lab.png",
  fullPage: false,
  timeout: 90_000,
});
await browser.close();

if (failures.length > 0) {
  throw new Error(`Browser QA failed:\n${failures.join("\n")}`);
}

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
