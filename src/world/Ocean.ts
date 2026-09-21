import * as THREE from 'three';
import { oceanVertexShader, oceanFragmentShader } from '../shaders/ocean/ocean';
import { QualityManager } from '../core/QualityManager';
import { RippleSystem } from '../water/RippleSystem';
import { FoamSystem } from './../water/FoamSystem';

export interface WaterSurfaceSample {
  height: number;
  normal: THREE.Vector3;
  velocity: THREE.Vector3;
}

export class Ocean {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  private qualityManager: QualityManager;
  private unsubscribeQuality: (() => void) | null = null;

  // Meniscus bulge
  private meniscusOrigin = new THREE.Vector3(0, 0, 0);

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.qualityManager = qualityManager;

    const subdivisions = this.qualityManager.getSettings().oceanSubdivisions;
    const geometry = new THREE.PlaneGeometry(1000, 1000, subdivisions, subdivisions);
    geometry.rotateX(-Math.PI / 2);

    // Prepare initial uniform arrays
    const rippleOrigins: THREE.Vector3[] = [];
    const rippleVelocities: THREE.Vector3[] = [];
    const foamOrigins: THREE.Vector3[] = [];

    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      rippleOrigins.push(new THREE.Vector3(0, -999, 0));
      rippleVelocities.push(new THREE.Vector3(0, 0, 0));
    }
    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      foamOrigins.push(new THREE.Vector3(0, -999, 0));
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },

        // Ripple uniforms
        uRippleOrigins: { value: rippleOrigins },
        uRippleTimes: { value: new Float32Array(RippleSystem.MAX_RIPPLES).fill(-1.0) },
        uRippleEnergies: { value: new Float32Array(RippleSystem.MAX_RIPPLES).fill(0.0) },
        uRippleVelocities: { value: rippleVelocities },

        // Meniscus contact bulge
        uMeniscusOrigin: { value: this.meniscusOrigin },
        uMeniscusWeight: { value: 0.0 },

        // Foam uniforms
        uFoamOrigins: { value: foamOrigins },
        uFoamTimes: { value: new Float32Array(FoamSystem.MAX_FOAM_SPOTS).fill(-1.0) },
        uFoamEnergies: { value: new Float32Array(FoamSystem.MAX_FOAM_SPOTS).fill(0.0) },
      },
      wireframe: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);

    this.unsubscribeQuality = this.qualityManager.subscribe((settings) => {
      this.updateResolution(settings.oceanSubdivisions);
    });
  }

  private updateResolution(subdivisions: number) {
    const oldGeom = this.mesh.geometry;
    const newGeom = new THREE.PlaneGeometry(1000, 1000, subdivisions, subdivisions);
    newGeom.rotateX(-Math.PI / 2);
    this.mesh.geometry = newGeom;
    oldGeom.dispose();
  }

  public setMeniscusBulge(origin: THREE.Vector3, weight: number) {
    this.meniscusOrigin.copy(origin);
    this.material.uniforms.uMeniscusOrigin.value.copy(origin);
    this.material.uniforms.uMeniscusWeight.value = weight;
  }

  public syncInteraction(ripples: RippleSystem, foam: FoamSystem) {
    // Sync ripple arrays
    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      (this.material.uniforms.uRippleOrigins.value[i] as THREE.Vector3).copy(ripples.uniformOrigins[i]);
      this.material.uniforms.uRippleTimes.value[i] = ripples.uniformTimes[i];
      this.material.uniforms.uRippleEnergies.value[i] = ripples.uniformEnergies[i];
      (this.material.uniforms.uRippleVelocities.value[i] as THREE.Vector3).copy(ripples.uniformVelocities[i]);
    }

    // Sync foam arrays
    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      (this.material.uniforms.uFoamOrigins.value[i] as THREE.Vector3).copy(foam.uniformOrigins[i]);
      this.material.uniforms.uFoamTimes.value[i] = foam.uniformTimes[i];
      this.material.uniforms.uFoamEnergies.value[i] = foam.uniformEnergies[i];
    }
  }

  public update(time: number, cameraPos: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);

    this.mesh.position.x = Math.floor(cameraPos.x / 10) * 10;
    this.mesh.position.z = Math.floor(cameraPos.z / 10) * 10;
  }

  /**
   * Evaluates the exact dynamic wave height, analytical 3D normal, and wave surface velocity.
   * Mirrors the GLSL Gerstner wave formulation for CPU/physics parity.
   */
  public getWaterSurfaceAt(x: number, z: number, time: number): WaterSurfaceSample {
    const waves = [
      { dir: new THREE.Vector2(1.0, 0.4).normalize(), amp: 0.42, wl: 28.0, speed: 1.2, steepness: 0.75 },
      { dir: new THREE.Vector2(0.6, 0.8).normalize(), amp: 0.22, wl: 14.0, speed: 1.6, steepness: 0.65 },
      { dir: new THREE.Vector2(-0.4, 0.9).normalize(), amp: 0.11, wl: 6.5, speed: 2.1, steepness: 0.55 },
      { dir: new THREE.Vector2(0.8, -0.6).normalize(), amp: 0.04, wl: 2.8, speed: 2.8, steepness: 0.45 },
    ];

    let height = 0;
    const tangent = new THREE.Vector3(1, 0, 0);
    const binormal = new THREE.Vector3(0, 0, 1);
    const waveVel = new THREE.Vector3(0, 0, 0);

    for (const w of waves) {
      const k = (2 * Math.PI) / w.wl;
      const c = Math.sqrt(9.8 / k) * w.speed;
      const f = k * (w.dir.x * x + w.dir.y * z - c * time * 0.4);
      const a = w.amp;
      const q = w.steepness / (k * a * waves.length);

      const sinF = Math.sin(f);
      const cosF = Math.cos(f);

      height += a * sinF;

      tangent.x -= q * w.dir.x * w.dir.x * (k * a) * sinF;
      tangent.y += w.dir.x * (k * a) * cosF;
      tangent.z -= q * w.dir.x * w.dir.y * (k * a) * sinF;

      binormal.x -= q * w.dir.x * w.dir.y * (k * a) * sinF;
      binormal.y += w.dir.y * (k * a) * cosF;
      binormal.z -= q * w.dir.y * w.dir.y * (k * a) * sinF;

      // Surface orbital velocity
      waveVel.x += c * q * a * w.dir.x * sinF;
      waveVel.y += c * a * cosF;
      waveVel.z += c * q * a * w.dir.y * sinF;
    }

    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return { height, normal, velocity: waveVel };
  }

  public getWaterHeightAt(x: number, z: number, time: number): number {
    return this.getWaterSurfaceAt(x, z, time).height;
  }

  public destroy() {
    if (this.unsubscribeQuality) {
      this.unsubscribeQuality();
      this.unsubscribeQuality = null;
    }
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
