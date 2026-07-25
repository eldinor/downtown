export type WeatherDebugMode = "off" | "wear" | "wetness";

export interface FakeInteriorOptions {
  name: string;
  roomTextureUrl: string;
  roomDepth: number;
  roomWidth?: number;
  roomHeight?: number;
  cubeRotation?: number;
  emissiveIntensity?: number;
}

export interface WeatherMaterialProfile {
  wearStrength: number;
  wetnessStrength: number;
  baselineWear: number;
  proceduralWear: number;
  wearRoughnessBoost: number;
  wetRoughness: number;
  wetDarkening: number;
  damageNormalStrength: number;
}

export interface PreparedAssetModel {
  name: string;
  source: string;
  runtime: string;
  materials: string[];
  images: string[];
  remaps: Array<{
    meshIndex: number;
    primitiveIndex: number;
    fromAccessor: number;
    toAccessor: number;
  }>;
}

export interface PreparedAssetManifest {
  generatedAt: string;
  sourceRoot: string;
  models: PreparedAssetModel[];
  shaderTextures: string[];
  environmentTextures: string[];
}

export interface CityPlacement {
  asset: string;
  position: readonly [number, number, number];
  rotationY?: number;
  scale?: number;
  variant?: number;
}

export interface CityBlockConfig {
  id: string;
  grid: readonly [number, number];
  roads: CityPlacement[];
  sidewalks: CityPlacement[];
  buildings: CityPlacement[];
  props: CityPlacement[];
}
