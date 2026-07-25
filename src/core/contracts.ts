export type WeatherDebugMode = "off" | "wear" | "wetness";

export interface FakeInteriorOptions {
  name: string;
  roomTextureUrl: string;
  roomDepth: number;
  roomWidth?: number;
  roomHeight?: number;
  cubeRotation?: number;
  emissiveIntensity?: number;
  uvScaleOffset?: readonly [number, number, number, number];
  flipY?: boolean;
}

export type InteriorVariantId = "lit1" | "lit2" | "dark";
export type InteriorTextureId = "lit1" | "lit2" | "dark";

export interface InteriorControlState {
  texture: InteriorTextureId;
  roomWidth: number;
  roomHeight: number;
  roomDepth: number;
  cubeRotation: number;
  emissiveIntensity: number;
  uvScaleX: number;
  uvScaleY: number;
  uvOffsetX: number;
  uvOffsetY: number;
  flipY: boolean;
}

export interface WeatherMaterialProfile {
  wearStrength: number;
  wetnessStrength: number;
  baselineWear: number;
  proceduralWear: number;
  wearRoughnessBoost: number;
  wearColorStrength: number;
  wearDesaturation: number;
  wearContrast: number;
  puddleStrength: number;
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
