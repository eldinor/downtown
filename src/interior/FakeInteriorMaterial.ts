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
uniform float emissiveIntensity;
uniform samplerCube interiorCube;

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

  vec3 tangent = normalize(dpdx * duvdy.y - dpdy * duvdx.y);
  vec3 bitangent = normalize(-dpdx * duvdy.x + dpdy * duvdx.x);
  vec3 normalW = normalize(vNormalW);
  if (dot(cross(tangent, bitangent), normalW) < 0.0) {
    bitangent = -bitangent;
  }

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

  gl_FragColor = vec4(color, 1.0);
}
`;

export class FakeInteriorMaterial {
  readonly texture: HDRCubeTexture;
  readonly material: ShaderMaterial;

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
          "emissiveIntensity",
        ],
        samplers: ["interiorCube"],
      },
    );

    this.material.setTexture("interiorCube", this.texture);
    this.material.setVector4(
      "uvScaleOffset",
      new Vector4(1.435474, 1, -0.217737, 0),
    );
    this.material.setFloat("roomDepth", options.roomDepth);
    this.material.setFloat("roomWidth", options.roomWidth ?? 1);
    this.material.setFloat("roomHeight", options.roomHeight ?? 1);
    this.material.setFloat("cubeRotation", options.cubeRotation ?? 0);
    this.material.setFloat(
      "emissiveIntensity",
      options.emissiveIntensity ?? 1,
    );
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

  dispose(): void {
    this.material.dispose();
    this.texture.dispose();
  }
}
