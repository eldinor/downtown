import {
  HDRCubeTexture,
  ShaderMaterial,
  Vector3,
  Vector4,
  type Scene,
} from "@babylonjs/core";
import type { FakeInteriorOptions } from "../core/contracts";

const vertexSource = `
precision highp float;

attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;

uniform mat4 world;
uniform mat4 worldViewProjection;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;

void main(void) {
  vec4 worldPosition = world * vec4(position, 1.0);
  vPositionW = worldPosition.xyz;
  vNormalW = normalize(mat3(world) * normal);
  vUV = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

const fragmentSource = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;

uniform vec3 cameraPosition;
uniform vec4 uvScaleOffset;
uniform float roomDepth;
uniform float roomWidth;
uniform float roomHeight;
uniform float cubeRotation;
uniform float cubeFlipY;
uniform float emissiveIntensity;
uniform float cityRandomEnabled;
uniform float cityRandomTime;
uniform samplerCube interiorCube;

float roomHash(vec3 cell) {
  return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

vec3 nonZeroRay(vec3 ray) {
  return vec3(
    ray.x >= 0.0 ? max(ray.x, 0.00001) : min(ray.x, -0.00001),
    ray.y >= 0.0 ? max(ray.y, 0.00001) : min(ray.y, -0.00001),
    ray.z >= 0.0 ? max(ray.z, 0.00001) : min(ray.z, -0.00001)
  );
}

void main(void) {
  vec2 roomUV = clamp(vUV * uvScaleOffset.xy + uvScaleOffset.zw, 0.001, 0.999);

  vec3 dpdx = dFdx(vPositionW);
  vec3 dpdy = dFdy(vPositionW);
  vec2 duvdx = dFdx(vUV);
  vec2 duvdy = dFdy(vUV);

  vec3 normalW = normalize(vNormalW);
  vec3 rawTangent = dpdx * duvdy.y - dpdy * duvdx.y;
  vec3 rawBitangent = -dpdx * duvdy.x + dpdy * duvdx.x;

  vec3 tangentCandidate =
    rawTangent - normalW * dot(normalW, rawTangent);
  float tangentLengthSquared = dot(tangentCandidate, tangentCandidate);
  vec3 fallbackAxis = abs(normalW.y) < 0.999
    ? vec3(0.0, 1.0, 0.0)
    : vec3(1.0, 0.0, 0.0);
  vec3 fallbackTangent = normalize(cross(fallbackAxis, normalW));
  vec3 tangent = mix(
    fallbackTangent,
    tangentCandidate * inversesqrt(max(tangentLengthSquared, 1e-8)),
    step(1e-8, tangentLengthSquared)
  );
  float handedness =
    dot(cross(normalW, tangent), rawBitangent) < 0.0 ? -1.0 : 1.0;
  vec3 bitangent = normalize(cross(normalW, tangent)) * handedness;

  vec3 worldRay = normalize(vPositionW - cameraPosition);
  vec3 roomRay = normalize(vec3(
    dot(worldRay, tangent),
    dot(worldRay, bitangent),
    abs(dot(worldRay, -normalW))
  ));

  vec3 rayOrigin = vec3(roomUV * 2.0 - 1.0, -0.999);
  vec3 shapedRay = nonZeroRay(vec3(
    roomRay.x / max(roomWidth, 0.001),
    roomRay.y / max(roomHeight, 0.001),
    roomRay.z / max(roomDepth, 0.001)
  ));

  vec3 t0 = (-vec3(1.0) - rayOrigin) / shapedRay;
  vec3 t1 = ( vec3(1.0) - rayOrigin) / shapedRay;
  vec3 tFar = max(t0, t1);
  float hitDistance = min(tFar.x, min(tFar.y, tFar.z));
  vec3 roomHit = rayOrigin + shapedRay * hitDistance;

  vec3 sampleDirection = normalize(roomHit);
  sampleDirection.y *= cubeFlipY;
  float c = cos(cubeRotation);
  float s = sin(cubeRotation);
  sampleDirection.xz = mat2(c, -s, s, c) * sampleDirection.xz;

  vec3 interiorLinear = textureCube(interiorCube, sampleDirection).rgb;
  vec2 borderDistance = min(roomUV, 1.0 - roomUV);
  float frameAO = smoothstep(0.0, 0.055, min(borderDistance.x, borderDistance.y));
  float depthFade = exp(-0.09 * hitDistance);
  vec3 color = interiorLinear * emissiveIntensity;
  color *= mix(0.55, 1.0, frameAO);
  color *= mix(0.78, 1.0, depthFade);
  vec3 roomCell = floor(vPositionW / vec3(2.0, 3.0, 2.0));
  float roomPeriod = mix(
    4.5,
    13.0,
    roomHash(roomCell + vec3(19.7, 3.1, 8.3))
  );
  float roomOffset =
    roomHash(roomCell + vec3(5.2, 17.4, 2.6)) * roomPeriod;
  float roomClock = (cityRandomTime + roomOffset) / roomPeriod;
  float roomStep = floor(roomClock);
  float roomProgress = fract(roomClock);
  float previousLit = step(
    0.42,
    roomHash(roomCell + vec3((roomStep - 1.0) * 7.0, (roomStep - 1.0) * 3.0, (roomStep - 1.0) * 11.0))
  );
  float nextLit = step(
    0.42,
    roomHash(roomCell + vec3(roomStep * 7.0, roomStep * 3.0, roomStep * 11.0))
  );
  float transitionLength = mix(
    0.035,
    0.11,
    roomHash(roomCell + vec3(11.8, 4.6, 23.9))
  );
  float roomLit = mix(
    previousLit,
    nextLit,
    smoothstep(0.0, transitionLength, roomProgress)
  );
  color *= mix(1.0, mix(0.035, 1.0, roomLit), cityRandomEnabled);

  gl_FragColor = vec4(color, 1.0);
}
`;

export class FakeInteriorMaterial {
  texture: HDRCubeTexture;
  readonly material: ShaderMaterial;
  private roomTextureUrl: string;

  constructor(scene: Scene, options: FakeInteriorOptions) {
    this.texture = new HDRCubeTexture(
      options.roomTextureUrl,
      scene,
      256,
      false,
      false,
      false,
      false,
    );
    this.roomTextureUrl = options.roomTextureUrl;

    this.material = new ShaderMaterial(
      options.name,
      scene,
      {
        vertexSource,
        fragmentSource,
        spectorName: options.name,
      },
      {
        attributes: ["position", "normal", "uv"],
        uniforms: [
          "world",
          "worldViewProjection",
          "cameraPosition",
          "uvScaleOffset",
          "roomDepth",
          "roomWidth",
          "roomHeight",
          "cubeRotation",
          "cubeFlipY",
          "emissiveIntensity",
          "cityRandomEnabled",
          "cityRandomTime",
        ],
        samplers: ["interiorCube"],
      },
    );

    this.material.setTexture("interiorCube", this.texture);
    this.material.setVector4(
      "uvScaleOffset",
      new Vector4(...(options.uvScaleOffset ?? [1.435474, 1, -0.217737, 0])),
    );
    this.material.setFloat("roomDepth", options.roomDepth);
    this.material.setFloat("roomWidth", options.roomWidth ?? 1);
    this.material.setFloat("roomHeight", options.roomHeight ?? 1);
    this.material.setFloat("cubeRotation", options.cubeRotation ?? 0);
    this.material.setFloat("cubeFlipY", options.flipY === false ? 1 : -1);
    this.material.setFloat(
      "emissiveIntensity",
      options.emissiveIntensity ?? 1,
    );
    this.material.setFloat("cityRandomEnabled", 0);
    this.material.setFloat("cityRandomTime", 0);
    this.material.backFaceCulling = false;

    this.material.onBindObservable.add(() => {
      const cameraPosition =
        scene.activeCamera?.globalPosition ?? Vector3.ZeroReadOnly;
      this.material.setVector3("cameraPosition", cameraPosition);
    });
  }

  setIntensity(value: number): void {
    this.material.setFloat("emissiveIntensity", value);
  }

  setCityRandom(enabled: boolean, time: number): void {
    this.material.setFloat("cityRandomEnabled", enabled ? 1 : 0);
    this.material.setFloat("cityRandomTime", time);
  }

  setRoomTexture(url: string): void {
    if (url === this.roomTextureUrl) {
      return;
    }
    const previousTexture = this.texture;
    this.texture = new HDRCubeTexture(
      url,
      this.material.getScene(),
      256,
      false,
      false,
      false,
      false,
    );
    this.roomTextureUrl = url;
    this.material.setTexture("interiorCube", this.texture);
    previousTexture.dispose();
  }

  setRoomDimensions(width: number, height: number, depth: number): void {
    this.material.setFloat("roomWidth", width);
    this.material.setFloat("roomHeight", height);
    this.material.setFloat("roomDepth", depth);
  }

  setCubeRotation(value: number): void {
    this.material.setFloat("cubeRotation", value);
  }

  setUvScaleOffset(
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
  ): void {
    this.material.setVector4(
      "uvScaleOffset",
      new Vector4(scaleX, scaleY, offsetX, offsetY),
    );
  }

  setFlipY(enabled: boolean): void {
    this.material.setFloat("cubeFlipY", enabled ? -1 : 1);
  }

  dispose(): void {
    this.material.dispose();
    this.texture.dispose();
  }
}
