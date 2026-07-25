import {
  MaterialPluginBase,
  ShaderLanguage,
  Texture,
  UniformBuffer,
  VertexBuffer,
  type AbstractMesh,
  type Material,
} from "@babylonjs/core";
import type { Nullable } from "@babylonjs/core/types";
import type { WeatherMaterialProfile } from "../core/contracts";
import type { WeatherController } from "../core/WeatherController";

const vertexDefinitions = `
attribute vec4 color;
varying vec4 vWeatherMaskColor;
#ifdef UV2
varying vec2 vWeatherUv2;
#endif
`;

const fragmentDefinitions = `
varying vec4 vWeatherMaskColor;
#ifdef UV2
varying vec2 vWeatherUv2;
#endif
uniform sampler2D weatherDripSampler;
uniform sampler2D weatherDamageNormalSampler;

mat3 weatherCotangentFrame(vec3 normal, vec3 position, vec2 uv) {
  vec3 dp1 = dFdx(position);
  vec3 dp2 = dFdy(position);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, normal);
  vec3 dp1perp = cross(normal, dp1);
  vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(tangent, tangent), dot(bitangent, bitangent)));
  return mat3(tangent * invmax, bitangent * invmax, normal);
}
`;

export class SurfaceWeatheringPlugin extends MaterialPluginBase {
  private readonly unsubscribe: () => void;

  constructor(
    material: Material,
    private readonly controller: WeatherController,
    private readonly profile: WeatherMaterialProfile,
    private readonly dripTexture: Texture,
    private readonly damageNormalTexture: Texture,
  ) {
    super(material, "SurfaceWeathering", 180, undefined, true, true);
    this.unsubscribe = controller.subscribe(() => {
      material.markAsDirty(1);
    });
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override getAttributes(attributes: string[]): void {
    if (!attributes.includes(VertexBuffer.ColorKind)) {
      attributes.push(VertexBuffer.ColorKind);
    }
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("weatherDripSampler", "weatherDamageNormalSampler");
  }

  override getUniforms() {
    return {
      ubo: [
        { name: "weatherWetness", size: 1, type: "float" },
        { name: "weatherWear", size: 1, type: "float" },
        { name: "weatherWearStrength", size: 1, type: "float" },
        { name: "weatherWetnessStrength", size: 1, type: "float" },
        { name: "weatherBaselineWear", size: 1, type: "float" },
        { name: "weatherProceduralWear", size: 1, type: "float" },
        { name: "weatherWearRoughnessBoost", size: 1, type: "float" },
        { name: "weatherWetRoughness", size: 1, type: "float" },
        { name: "weatherWetDarkening", size: 1, type: "float" },
        { name: "weatherDamageNormalStrength", size: 1, type: "float" },
        { name: "weatherDebugMode", size: 1, type: "float" },
      ],
    };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const debugMode =
      this.controller.debugMode === "wear"
        ? 1
        : this.controller.debugMode === "wetness"
          ? 2
          : 0;

    uniformBuffer.updateFloat("weatherWetness", this.controller.wetness);
    uniformBuffer.updateFloat("weatherWear", this.controller.wear);
    uniformBuffer.updateFloat("weatherWearStrength", this.profile.wearStrength);
    uniformBuffer.updateFloat(
      "weatherWetnessStrength",
      this.profile.wetnessStrength,
    );
    uniformBuffer.updateFloat("weatherBaselineWear", this.profile.baselineWear);
    uniformBuffer.updateFloat(
      "weatherProceduralWear",
      this.profile.proceduralWear,
    );
    uniformBuffer.updateFloat(
      "weatherWearRoughnessBoost",
      this.profile.wearRoughnessBoost,
    );
    uniformBuffer.updateFloat(
      "weatherWetRoughness",
      this.profile.wetRoughness,
    );
    uniformBuffer.updateFloat(
      "weatherWetDarkening",
      this.profile.wetDarkening,
    );
    uniformBuffer.updateFloat(
      "weatherDamageNormalStrength",
      this.profile.damageNormalStrength,
    );
    uniformBuffer.updateFloat("weatherDebugMode", debugMode);
    uniformBuffer.bindTexture(
      "weatherDripSampler",
      this.dripTexture.getInternalTexture(),
    );
    uniformBuffer.bindTexture(
      "weatherDamageNormalSampler",
      this.damageNormalTexture.getInternalTexture(),
    );
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage?: ShaderLanguage,
  ): Nullable<Record<string, string>> {
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return null;
    }

    if (shaderType === "vertex") {
      return {
        CUSTOM_VERTEX_DEFINITIONS: vertexDefinitions,
        CUSTOM_VERTEX_MAIN_BEGIN: `
          vWeatherMaskColor = color;
          #ifdef UV2
            vWeatherUv2 = uv2;
          #endif
        `,
      };
    }

    if (shaderType === "fragment") {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: fragmentDefinitions,
        CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
          vec2 weatherUv = vec2(vPositionW.x + vPositionW.z, vPositionW.y) * 0.065;
          float weatherNoise = texture2D(weatherDripSampler, weatherUv).r;
          float authoredWear = clamp(1.0 - vWeatherMaskColor.r, 0.0, 1.0);
          float authoredWetness = clamp(1.0 - vWeatherMaskColor.g, 0.0, 1.0);
          float proceduralWear = mix(0.35, 1.0, weatherNoise) * weatherProceduralWear;
          float wearMask = clamp(
            weatherBaselineWear + authoredWear * weatherWearStrength + proceduralWear,
            0.0,
            1.0
          ) * weatherWear;
          float wetCoverage = mix(1.0, authoredWetness, step(0.001, authoredWetness));
          float wetMask = clamp(
            wetCoverage * weatherWetnessStrength * weatherWetness,
            0.0,
            1.0
          );
          vec2 weatherMasks = vec2(wearMask, wetMask);

          float weatherLuma = dot(surfaceAlbedo, vec3(0.2126, 0.7152, 0.0722));
          vec3 wornAlbedo = mix(surfaceAlbedo, vec3(weatherLuma), 0.22);
          wornAlbedo = mix(wornAlbedo, wornAlbedo * 1.08, wearMask);
          surfaceAlbedo = mix(surfaceAlbedo, wornAlbedo, wearMask);
          surfaceAlbedo *= mix(1.0, weatherWetDarkening, wetMask);

          #ifdef UV2
            vec3 damageNormal = texture2D(weatherDamageNormalSampler, vWeatherUv2).xyz * 2.0 - 1.0;
            mat3 weatherTbn = weatherCotangentFrame(normalW, vPositionW, vWeatherUv2);
            vec3 damagedNormalW = normalize(weatherTbn * damageNormal);
            normalW = normalize(mix(
              normalW,
              damagedNormalW,
              wearMask * weatherDamageNormalStrength
            ));
          #endif
        `,
        "!float roughness=reflectivityOut\\.roughness;": `
          float roughness = clamp(
            reflectivityOut.roughness + weatherMasks.x * weatherWearRoughnessBoost,
            0.04,
            1.0
          );
          roughness = mix(roughness, weatherWetRoughness, weatherMasks.y);
        `,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          if (weatherDebugMode > 0.5 && weatherDebugMode < 1.5) {
            finalColor = vec4(vec3(weatherMasks.x), 1.0);
          } else if (weatherDebugMode > 1.5) {
            finalColor = vec4(0.05, weatherMasks.y, 1.0, 1.0);
          }
        `,
      };
    }

    return null;
  }

  override dispose(forceDisposeTextures?: boolean): void {
    this.unsubscribe();
    super.dispose(forceDisposeTextures);
  }
}

export function ensureWeatherColor(mesh: AbstractMesh): void {
  const vertexCount = mesh.getTotalVertices();
  if (vertexCount === 0 || mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) {
    return;
  }

  const colors = new Float32Array(vertexCount * 4);
  colors.fill(1);
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
}
