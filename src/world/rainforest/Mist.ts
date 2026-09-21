import * as THREE from 'three';
import { QualityTier } from '../../core/QualityManager';

const godRayVertexShader = `
uniform float uTime;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const godRayFragmentShader = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;
uniform float uIntensity;

varying vec3 vWorldPosition;
varying vec2 vUv;

// 2D Noise for ray dust/density breakup
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.23, 73.45))) * 23847.123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);

  // Forward Mie scattering boost when looking towards light shafts
  float VdotL = max(dot(V, -L), 0.0);
  float miePhase = pow(VdotL, 4.0) * 1.5 + 0.5;

  // Longitudinal ray attenuation: bright near top canopy, softly dissipates toward forest floor
  // uv.y = 0 at top, 1 at bottom
  float lengthFade = smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.4, vUv.y);

  // Radial soft edge: beam softens smoothly toward lateral edges
  float radialEdge = sin(vUv.x * 3.14159265);
  radialEdge = pow(radialEdge, 1.8);

  // Dynamic dappled shadow animation (leaves rustling above)
  float rayNoise = noise(vec2(vUv.x * 4.0 + uTime * 0.12, vUv.y * 2.5 - uTime * 0.18));

  // Golden sunbeam color with subtle warm humidity glow
  vec3 beamColor = vec3(1.0, 0.94, 0.78);

  float alpha = lengthFade * radialEdge * (0.65 + 0.35 * rayNoise) * miePhase * uIntensity;

  gl_FragColor = vec4(beamColor, alpha * uTransitionWeight);
}
`;

const mistSheetVertexShader = `
uniform float uTime;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  // Gentle billow
  worldPos.y += sin(uTime * 0.4 + worldPos.x * 0.2) * 0.12;
  vWorldPosition = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const mistSheetFragmentShader = `
uniform float uTime;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;

varying vec3 vWorldPosition;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // Soft elliptical edge fade
  vec2 centered = (vUv - 0.5) * 2.0;
  float radialFade = 1.0 - smoothstep(0.4, 1.0, length(centered));

  // Drifting mist vapor
  vec2 driftUv = vWorldPosition.xz * 0.08 + vec2(uTime * 0.02, uTime * 0.015);
  float vaporDensity = noise(driftUv) * 0.6 + noise(driftUv * 2.2 - vec2(uTime * 0.03)) * 0.4;

  vec3 mistColor = vec3(0.24, 0.35, 0.30); // Humid rainforest ambient tone
  float alpha = radialFade * vaporDensity * 0.28 * uTransitionWeight;

  gl_FragColor = vec4(mistColor, alpha);
}
`;

export class RainforestMist {
  public group: THREE.Group;
  private godRayMaterial: THREE.ShaderMaterial;
  private mistMaterial: THREE.ShaderMaterial;
  private godRays: THREE.Mesh[] = [];

  constructor(sunDirection: THREE.Vector3) {
    this.group = new THREE.Group();

    // 1. God Ray Shader Material
    this.godRayMaterial = new THREE.ShaderMaterial({
      vertexShader: godRayVertexShader,
      fragmentShader: godRayFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uTransitionWeight: { value: 1.0 },
        uIntensity: { value: 0.16 },
      },
    });

    // 2. Build Volumetric Sunbeam Shafts (Cross Quads)
    this.buildGodRays(sunDirection);

    // 3. Low Forest Floor Mist Sheets
    this.mistMaterial = new THREE.ShaderMaterial({
      vertexShader: mistSheetVertexShader,
      fragmentShader: mistSheetFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCameraPosition: { value: new THREE.Vector3() },
        uTransitionWeight: { value: 1.0 },
      },
    });

    this.buildMistSheets();
  }

  private buildGodRays(sunDirection: THREE.Vector3) {
    const rayConfigs = [
      { origin: new THREE.Vector3(0, 20, 2), width: 3.5, height: 22 },
      { origin: new THREE.Vector3(-5, 21, -3), width: 3.0, height: 23 },
      { origin: new THREE.Vector3(6, 19, 8), width: 4.0, height: 21 },
      { origin: new THREE.Vector3(-3, 18, 13), width: 2.8, height: 20 },
    ];

    // Sun light travels along -sunDirection
    const rayDir = sunDirection.clone().negate().normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(up, rayDir);

    rayConfigs.forEach((cfg) => {
      const geo = new THREE.PlaneGeometry(cfg.width, cfg.height, 8, 16);
      geo.translate(0, -cfg.height / 2, 0);

      // 3 intersecting planes at 0, 60, and 120 degrees around ray axis for full 3D volumetric appearance
      for (let r = 0; r < 3; r++) {
        const mesh = new THREE.Mesh(geo, this.godRayMaterial);
        mesh.position.copy(cfg.origin);
        const rotQuat = new THREE.Quaternion().setFromAxisAngle(rayDir, (r * Math.PI) / 3);
        mesh.quaternion.multiplyQuaternions(rotQuat, baseQuat);
        this.godRays.push(mesh);
        this.group.add(mesh);
      }
    });
  }

  private buildMistSheets() {
    const mistConfigs = [
      { pos: new THREE.Vector3(0, 0.8, 4), size: 18 },
      { pos: new THREE.Vector3(-8, 1.2, -2), size: 22 },
      { pos: new THREE.Vector3(7, 1.0, 10), size: 20 },
      { pos: new THREE.Vector3(-4, 1.4, 16), size: 24 },
    ];

    mistConfigs.forEach((cfg) => {
      const geo = new THREE.PlaneGeometry(cfg.size, cfg.size, 16, 16);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.mistMaterial);
      mesh.position.copy(cfg.pos);
      this.group.add(mesh);
    });
  }

  public update(time: number, cameraPos: THREE.Vector3) {
    this.godRayMaterial.uniforms.uTime.value = time;
    this.godRayMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
    this.mistMaterial.uniforms.uTime.value = time;
    this.mistMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
  }

  public setTransitionWeight(weight: number) {
    this.godRayMaterial.uniforms.uTransitionWeight.value = weight;
    this.mistMaterial.uniforms.uTransitionWeight.value = weight;
    this.group.visible = weight > 0.001;
  }

  public setQualityTier(tier: QualityTier) {
    if (tier === 'LOW') {
      this.godRayMaterial.uniforms.uIntensity.value = 0.2;
    } else {
      this.godRayMaterial.uniforms.uIntensity.value = 0.42;
    }
  }

  public destroy() {
    this.godRayMaterial.dispose();
    this.mistMaterial.dispose();
    this.godRays.forEach((r) => r.geometry.dispose());
  }
}
