import type { WeatherDebugMode } from "./contracts";

export class WeatherController {
  wetness = 0.72;
  wear = 0.55;
  debugMode: WeatherDebugMode = "off";

  private readonly listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setWetness(value: number): void {
    this.wetness = Math.min(1, Math.max(0, value));
    this.notify();
  }

  setWear(value: number): void {
    this.wear = Math.min(1, Math.max(0, value));
    this.notify();
  }

  setDebugMode(mode: WeatherDebugMode): void {
    this.debugMode = mode;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
