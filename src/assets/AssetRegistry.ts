import type { AssetContainer, Scene } from "@babylonjs/core";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";

export class AssetRegistry {
  private readonly containers = new Map<string, Promise<AssetContainer>>();

  constructor(private readonly scene: Scene) {}

  load(key: string, url: string): Promise<AssetContainer> {
    const cached = this.containers.get(key);
    if (cached) {
      return cached;
    }

    const pending = LoadAssetContainerAsync(url, this.scene);
    this.containers.set(key, pending);
    return pending;
  }

  async dispose(): Promise<void> {
    const containers = await Promise.all(this.containers.values());
    for (const container of containers) {
      container.dispose();
    }
    this.containers.clear();
  }
}
