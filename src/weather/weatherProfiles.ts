import type { WeatherMaterialProfile } from "../core/contracts";

const dry: WeatherMaterialProfile = {
  wearStrength: 0,
  wetnessStrength: 0,
  baselineWear: 0,
  proceduralWear: 0,
  wearRoughnessBoost: 0,
  wearColorStrength: 0,
  wearDesaturation: 0,
  wearContrast: 0,
  puddleStrength: 0,
  wetRoughness: 0.12,
  wetDarkening: 0.82,
  damageNormalStrength: 0,
};

export function getWeatherProfile(
  materialName: string,
): WeatherMaterialProfile | null {
  if (
    materialName.includes("Glass") ||
    materialName.includes("FakeInterior") ||
    materialName.includes("InteriorFloor") ||
    materialName.includes("InteriorWall")
  ) {
    return null;
  }

  if (materialName.includes("StreetDecals")) {
    return {
      ...dry,
      wetnessStrength: 0.32,
      puddleStrength: 0.2,
      wetRoughness: 0.2,
      wetDarkening: 0.92,
    };
  }

  if (materialName.includes("Asphalt")) {
    return {
      ...dry,
      wetnessStrength: 1,
      puddleStrength: 1,
      wetRoughness: 0.08,
      wetDarkening: 0.7,
    };
  }

  if (materialName.includes("MetalConcrete")) {
    return {
      wearStrength: 0.45,
      wetnessStrength: 0.78,
      baselineWear: 0.12,
      proceduralWear: 0.65,
      wearRoughnessBoost: 0.18,
      wearColorStrength: 0.95,
      wearDesaturation: 0.08,
      wearContrast: 1.15,
      puddleStrength: 0.65,
      wetRoughness: 0.1,
      wetDarkening: 0.76,
      damageNormalStrength: 0.008,
    };
  }

  if (
    materialName.includes("RedBrick") ||
    materialName.includes("Concrete") ||
    materialName.includes("Trim")
  ) {
    return {
      wearStrength: 0.65,
      wetnessStrength: 0.42,
      baselineWear: 0.1,
      proceduralWear: 0.5,
      wearRoughnessBoost: 0.24,
      wearColorStrength: 0.72,
      wearDesaturation: 0.1,
      wearContrast: 0.78,
      puddleStrength: 0.4,
      wetRoughness: 0.16,
      wetDarkening: 0.8,
      damageNormalStrength: 0.006,
    };
  }

  return null;
}
