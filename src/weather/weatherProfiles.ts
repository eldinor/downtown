import type { WeatherMaterialProfile } from "../core/contracts";

const dry: WeatherMaterialProfile = {
  wearStrength: 0,
  wetnessStrength: 0,
  baselineWear: 0,
  proceduralWear: 0,
  wearRoughnessBoost: 0,
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
      wetRoughness: 0.2,
      wetDarkening: 0.92,
    };
  }

  if (materialName.includes("Asphalt")) {
    return {
      ...dry,
      wetnessStrength: 1,
      wetRoughness: 0.08,
      wetDarkening: 0.7,
    };
  }

  if (materialName.includes("MetalConcrete")) {
    return {
      wearStrength: 0.45,
      wetnessStrength: 0.78,
      baselineWear: 0,
      proceduralWear: 0.08,
      wearRoughnessBoost: 0.12,
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
      baselineWear: 0,
      proceduralWear: 0.06,
      wearRoughnessBoost: 0.18,
      wetRoughness: 0.16,
      wetDarkening: 0.8,
      damageNormalStrength: 0.006,
    };
  }

  return null;
}
