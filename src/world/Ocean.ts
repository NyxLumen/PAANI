import * as THREE from 'three';
import { oceanVertexShader, oceanFragmentShader } from '../shaders/ocean/ocean';
import { QualityManager } from '../core/QualityManager';

export class Ocean {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  private qualityManager: QualityManager;
  private unsubscribeQuality: (() => void) | null = null;

  private impactOrigin = new THREE.Vector3(0, 0, 0);
  private impactTime = -1.0;

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.qualityManager = qualityManager;

    const subdivisions = this.qualityManager.getSettings().oceanSubdivisions;
    // Massive 1000m ocean plane so the horizon meets the sky dome seamlessly
    const geometry = new THREE.PlaneGeometry(1000, 1000, subdivisions, subdivisions);
    geometry.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: oceanVertexShader,
      fragmentShader: oceanFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uImpactOrigin: { value: this.impactOrigin },
        uImpactTime: { value: -1.0 },
        uImpactIntensity: { value: 0.0 },
      },
      wireframe: false,
      side: THREE.DoubleSide, // Render top and underside (for underwater Snell window)
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

  public triggerImpact(position: THREE.Vector3, intensity: number = 0.5) {
    this.impactOrigin.copy(position);
    this.impactTime = 0.0;
    this.material.uniforms.uImpactOrigin.value.copy(this.impactOrigin);
    this.material.uniforms.uImpactIntensity.value = intensity;
  }

  public update(time: number, cameraPos: THREE.Vector3, delta: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);

    // Reposition ocean mesh center slightly with camera XZ so it feels boundless
    this.mesh.position.x = Math.floor(cameraPos.x / 10) * 10;
    this.mesh.position.z = Math.floor(cameraPos.z / 10) * 10;

    if (this.impactTime >= 0) {
      this.impactTime += delta;
      this.material.uniforms.uImpactTime.value = this.impactTime;
      if (this.impactTime > 8.0) {
        this.impactTime = -1.0;
        this.material.uniforms.uImpactTime.value = -1.0;
      }
    }
  }

  public getWaterHeightAt(x: number, z: number, time: number): number {
    const waves = [
      { dir: new THREE.Vector2(1.0, 0.4).normalize(), amp: 0.42, wl: 28.0, speed: 1.2 },
      { dir: new THREE.Vector2(0.6, 0.8).normalize(), amp: 0.22, wl: 14.0, speed: 1.6 },
      { dir: new THREE.Vector2(-0.4, 0.9).normalize(), amp: 0.11, wl: 6.5, speed: 2.1 },
      { dir: new THREE.Vector2(0.8, -0.6).normalize(), amp: 0.04, wl: 2.8, speed: 2.8 },
    ];

    let height = 0;
    for (const w of waves) {
      const k = (2 * Math.PI) / w.wl;
      const c = Math.sqrt(9.8 / k) * w.speed;
      const f = k * (w.dir.x * x + w.dir.y * z - c * time * 0.4);
      height += w.amp * Math.sin(f);
    }
    return height;
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
