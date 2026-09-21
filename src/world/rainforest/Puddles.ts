import * as THREE from 'three';
import { QualityTier } from '../../core/QualityManager';

export const puddleVertexShader = `
uniform float uTime;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const puddleFragmentShader = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;

// Puddle Ripple Uniforms (up to 4 concurrent ripples)
uniform vec3 uPuddleRippleOrigins[4];
uniform float uPuddleRippleTimes[4];
uniform float uPuddleRippleEnergies[4];

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec3 N = normalize(vNormal);

  // Calculate analytical capillary ripple normal perturbation
  vec3 rippleNormalPerturbation = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float rTime = uPuddleRippleTimes[i];
    if (rTime > 0.0 && rTime < 4.0) {
      vec2 diff = vWorldPosition.xz - uPuddleRippleOrigins[i].xz;
      float dist = length(diff);
      
      // Wave propagation speed ~ 1.8 m/s
      float waveFront = rTime * 1.8;
      float dToFront = dist - waveFront;
      
      // High-frequency capillary ripples behind wavefront
      if (dist < waveFront + 0.5 && dist > 0.01) {
        float amp = exp(-dist * 0.8) * exp(-rTime * 0.7) * uPuddleRippleEnergies[i] * 0.22;
        float wave = sin(dToFront * 26.0 - rTime * 14.0) * amp;
        vec2 dir = normalize(diff);
        rippleNormalPerturbation.x += dir.x * wave;
        rippleNormalPerturbation.z += dir.y * wave;
      }
    }
  }

  N = normalize(N + rippleNormalPerturbation);

  // Fresnel reflectance with lifted ambient floor for outdoor skylight
  float F0 = 0.04;
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = clamp(F0 + (1.0 - F0) * pow(1.0 - NdotV, 3.5), 0.18, 0.98);

  // Reflected sky, sunbeams, and canopy colors
  vec3 R = reflect(-V, N);
  float RdotL = max(dot(R, L), 0.0);
  vec3 canopyReflect = mix(vec3(0.12, 0.32, 0.15), vec3(0.35, 0.65, 0.38), R.y * 0.5 + 0.5);
  vec3 sunReflection = vec3(1.0, 0.95, 0.8) * pow(RdotL, 48.0) * 3.5;
  // Specular glints catching the capillary wave crests
  float rippleGlint = length(rippleNormalPerturbation) * 2.8 * pow(RdotL, 16.0);
  sunReflection += vec3(1.0, 0.98, 0.88) * rippleGlint;

  vec3 reflectionColor = canopyReflect + sunReflection;

  // Rich organic rainforest pool tint: clear emerald-tea water over silt
  vec3 deepWaterColor = vec3(0.06, 0.14, 0.09);
  vec3 shallowWaterColor = vec3(0.12, 0.24, 0.15);
  
  // Radial depth gradient: edge of puddle is shallower
  float edgeDist = length(vUv - 0.5) * 2.0;
  float depthFade = smoothstep(0.95, 0.3, edgeDist);
  vec3 waterBodyColor = mix(shallowWaterColor, deepWaterColor, depthFade);

  // Organic edge falloff so puddle bleeds smoothly into the mud terrain
  float puddleAlpha = smoothstep(0.98, 0.75, edgeDist) * 0.95;

  vec3 finalColor = mix(waterBodyColor, reflectionColor, fresnel);

  gl_FragColor = vec4(finalColor, puddleAlpha * uTransitionWeight);
}
`;

export class RainforestPuddles {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;

  private rippleOrigins: THREE.Vector3[] = [];
  private rippleTimes: Float32Array = new Float32Array(4).fill(-1.0);
  private rippleEnergies: Float32Array = new Float32Array(4).fill(0.0);
  private nextRippleIndex: number = 0;

  constructor(sunDirection: THREE.Vector3) {
    for (let i = 0; i < 4; i++) {
      this.rippleOrigins.push(new THREE.Vector3(0, 0, 0));
    }

    // Organic circular puddle geometry placed right below the hero leaf
    const geo = new THREE.PlaneGeometry(7.5, 6.0, 48, 48);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: puddleVertexShader,
      fragmentShader: puddleFragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uTransitionWeight: { value: 1.0 },
        uPuddleRippleOrigins: { value: this.rippleOrigins },
        uPuddleRippleTimes: { value: this.rippleTimes },
        uPuddleRippleEnergies: { value: this.rippleEnergies },
      },
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    // Position puddle nestled directly beneath the hero leaf drip point
    this.mesh.position.set(0.85, 0.48, 4.0);
  }

  public triggerRipple(position: THREE.Vector3, energy: number = 1.0) {
    const idx = this.nextRippleIndex;
    this.rippleOrigins[idx].copy(position);
    this.rippleTimes[idx] = 0.0;
    this.rippleEnergies[idx] = energy;
    this.nextRippleIndex = (this.nextRippleIndex + 1) % 4;
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);

    // Advance ripple times
    for (let i = 0; i < 4; i++) {
      if (this.rippleTimes[i] >= 0.0) {
        this.rippleTimes[i] += delta;
        if (this.rippleTimes[i] > 4.5) {
          this.rippleTimes[i] = -1.0;
        }
      }
    }
  }

  public setTransitionWeight(weight: number) {
    this.material.uniforms.uTransitionWeight.value = weight;
    this.mesh.visible = weight > 0.001;
  }

  public setQualityTier(_tier: QualityTier) {
    // Puddle is light enough for all tiers
  }

  public destroy() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
