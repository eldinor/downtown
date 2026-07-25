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

float weatherOrganicNoise(vec2 uv) {
  mat2 detailRotation = mat2(
    0.956, -0.292,
    0.292, 0.956
  );
  float primary = texture2D(weatherDripSampler, uv).r;
  float detail = texture2D(
    weatherDripSampler,
    detailRotation * uv * 1.73 + vec2(0.31, 0.67)
  ).r;
  float breakup = texture2D(
    weatherDripSampler,
    vec2(uv.y, -uv.x) * 0.47 + vec2(0.79, 0.16)
  ).r;
  return primary * 0.58 + detail * 0.29 + breakup * 0.13;
}

float weatherTriplanarNoise(vec3 position, vec3 normal) {
  vec3 weights = pow(abs(normalize(normal)), vec3(4.0));
  weights /= max(weights.x + weights.y + weights.z, 0.00001);
  vec3 scaledPosition = position * 0.065;
  float xProjection = weatherOrganicNoise(scaledPosition.zy);
  float yProjection = weatherOrganicNoise(
    vec2(scaledPosition.z, -scaledPosition.x)
  );
  float zProjection = weatherOrganicNoise(scaledPosition.xy);
  return dot(
    vec3(xProjection, yProjection, zProjection),
    weights
  );
}

float weatherPuddlePattern(vec3 position) {
  mat2 puddleRotationA = mat2(
    0.866, -0.5,
    0.5, 0.866
  );
  mat2 puddleRotationB = mat2(
    0.707, 0.707,
    -0.707, 0.707
  );
  vec2 worldUv = position.xz;
  float broadShapeA = texture2D(
    weatherDripSampler,
    puddleRotationA * worldUv * 0.034 + vec2(0.13, 0.41)
  ).r;
  float broadShapeB = texture2D(
    weatherDripSampler,
    puddleRotationB * worldUv * 0.057 + vec2(0.67, 0.09)
  ).r;
  float edgeDetail = texture2D(
    weatherDripSampler,
    puddleRotationA * worldUv * 0.13 + vec2(0.37, 0.19)
  ).r;
  return smoothstep(
    0.48,
    0.7,
    broadShapeA * 0.5 +
    broadShapeB * 0.34 +
    edgeDetail * 0.16
  );
}

mat3 weatherCotangentFrame(vec3 normal, vec3 position, vec2 uv) {
  vec3 safeNormal = normalize(normal);
  vec3 dp1 = dFdx(position);
  vec3 dp2 = dFdy(position);
  vec2 duv1 = dFdx(uv);
  vec2 duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, safeNormal);
  vec3 dp1perp = cross(safeNormal, dp1);
  vec3 tangent = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
  float frameLengthSquared = max(
    dot(tangent, tangent),
    dot(bitangent, bitangent)
  );

  vec3 fallbackAxis = abs(safeNormal.y) < 0.999
    ? vec3(0.0, 1.0, 0.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 fallbackTangent = normalize(cross(fallbackAxis, safeNormal));
  vec3 fallbackBitangent = cross(safeNormal, fallbackTangent);

  float validFrame = step(1e-8, frameLengthSquared);
  float inverseFrameLength = inversesqrt(max(frameLengthSquared, 1e-8));
  tangent = mix(fallbackTangent, tangent * inverseFrameLength, validFrame);
  bitangent = mix(
    fallbackBitangent,
    bitangent * inverseFrameLength,
    validFrame
  );

  return mat3(tangent, bitangent, safeNormal);
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
      material.getScene().resetCachedMaterial();
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
        { name: "weatherWearColorStrength", size: 1, type: "float" },
        { name: "weatherWearDesaturation", size: 1, type: "float" },
        { name: "weatherWearContrast", size: 1, type: "float" },
        { name: "weatherPuddleStrength", size: 1, type: "float" },
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
      "weatherWearColorStrength",
      this.profile.wearColorStrength,
    );
    uniformBuffer.updateFloat(
      "weatherWearDesaturation",
      this.profile.wearDesaturation,
    );
    uniformBuffer.updateFloat(
      "weatherWearContrast",
      this.profile.wearContrast,
    );
    uniformBuffer.updateFloat(
      "weatherPuddleStrength",
      this.profile.puddleStrength,
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
          float weatherNoise = weatherTriplanarNoise(vPositionW, normalW);
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
          float upwardSurface = pow(
            clamp(geometricNormalW.y, 0.0, 1.0),
            8.0
          );
          float puddleMask =
            weatherPuddlePattern(vPositionW) *
            upwardSurface *
            weatherWetness *
            weatherPuddleStrength;
          vec3 weatherMasks = vec3(wearMask, wetMask, puddleMask);

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
          normalW = normalize(mix(
            normalW,
            vec3(0.0, 1.0, 0.0),
            weatherMasks.z * 0.42
          ));
        `,
        "!float roughness=reflectivityOut\\.roughness;": `
          float roughness = clamp(
            reflectivityOut.roughness + weatherMasks.x * weatherWearRoughnessBoost,
            0.04,
            1.0
          );
          roughness = mix(roughness, weatherWetRoughness, weatherMasks.y);
          roughness = mix(roughness, 0.025, weatherMasks.z);
        `,
        CUSTOM_FRAGMENT_BEFORE_FRAGCOLOR: `
          if (weatherDebugMode > 0.5 && weatherDebugMode < 1.5) {
            finalColor = vec4(vec3(weatherMasks.x), 1.0);
          } else if (weatherDebugMode > 1.5) {
            finalColor = vec4(
              weatherMasks.z,
              weatherMasks.y,
              0.12,
              1.0
            );
          } else {
            float finalWearLuma = dot(
              finalColor.rgb,
              vec3(0.2126, 0.7152, 0.0722)
            );
            float wearPattern = smoothstep(0.18, 0.82, weatherNoise);
            float darkWearTone = mix(1.0, 0.48, weatherWearContrast);
            float lightWearTone = mix(1.0, 1.26, weatherWearContrast);
            float wearTone = mix(
              darkWearTone,
              lightWearTone,
              wearPattern
            );
            float wearVisualStrength =
              smoothstep(0.01, 0.32, weatherMasks.x) *
              weatherWearColorStrength;
            vec3 finalWornColor = mix(
              finalColor.rgb,
              vec3(finalWearLuma),
              weatherWearDesaturation
            );
            finalWornColor *= wearTone;
            finalColor.rgb = mix(
              finalColor.rgb,
              finalWornColor,
              wearVisualStrength
            );
            finalColor.rgb *= mix(
              1.0,
              weatherWetDarkening,
              weatherMasks.y
            );
            finalColor.rgb *= mix(1.0, 0.72, weatherMasks.z);
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
