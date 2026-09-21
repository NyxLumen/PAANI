import * as THREE from 'three';
import { terrainVertexShader, terrainFragmentShader } from '../../shaders/rainforest/terrain';
import { QualityTier } from '../../core/QualityManager';

export class RainforestTerrain {
  public mesh: THREE.Mesh;
  public material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;

  constructor(sunDirection: THREE.Vector3) {
    // 240m x 240m terrain with 120x120 resolution for smooth organic curvature within triangle budget
    this.geometry = new THREE.PlaneGeometry(240, 240, 120, 120);
    this.geometry.rotateX(-Math.PI / 2);

    // Procedural height generation
    const posAttr = this.geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      vertex.fromBufferAttribute(posAttr, i);
      const h = RainforestTerrain.sampleHeight(vertex.x, vertex.z);
      posAttr.setY(i, h);
    }

    this.geometry.computeVertexNormals();

    this.material = new THREE.ShaderMaterial({
      vertexShader: terrainVertexShader,
      fragmentShader: terrainFragmentShader,
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3() },
        uTransitionWeight: { value: 1.0 },
        uWetness: { value: 0.85 },
      },
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
  }

  /**
   * Procedural mathematical height function:
   * Combines coastal shoreline slope, macro terrain swells, riverbed/depression valley,
   * organic surface mounds, and towering perimeter mountain amphitheater ridges.
   */
  public static sampleHeight(x: number, z: number): number {
    // 1. Coastal shoreline slope (South / negative Z slopes into ocean surf)
    const coastSlope = Math.min(0.0, (z + 2.0) * 0.16);

    // 2. Macro topography (hills and contours)
    const macroHills = Math.sin(x * 0.022) * Math.cos(z * 0.018) * 5.5
                     + Math.sin(x * 0.045 + 1.2) * Math.cos(z * 0.038) * 2.8;

    // 3. Natural basin / depression where rainwater pools into puddles
    // Distance from center clearing (x=0, z=5)
    const dx = x * 0.04;
    const dz = (z - 5.0) * 0.04;
    const basin = -Math.exp(-(dx * dx + dz * dz)) * 3.8;

    // 4. Meso mounds and root hummocks
    const meso = Math.sin(x * 0.12 + z * 0.08) * 0.65
               + Math.cos(x * 0.09 - z * 0.14) * 0.45;

    // 5. Micro roughness
    const micro = Math.sin(x * 0.4) * Math.cos(z * 0.4) * 0.12;

    // 6. Perimeter jungle mountain amphitheater (rises up to 26m at perimeter to block flat horizon)
    const r = Math.sqrt(x * x + z * z);
    const perimeterRidge = Math.pow(Math.max(0.0, (r - 40.0) / 60.0), 1.7) * 26.0;

    // Base ground level offset
    const totalHeight = 3.2 + coastSlope + macroHills + basin + meso + micro + perimeterRidge;
    // Allow coastline to submerge to -2.0m into the sea
    return totalHeight;
  }

  public getHeightAt(x: number, z: number): number {
    return RainforestTerrain.sampleHeight(x, z);
  }

  public getNormalAt(x: number, z: number): THREE.Vector3 {
    const eps = 0.15;
    const hL = RainforestTerrain.sampleHeight(x - eps, z);
    const hR = RainforestTerrain.sampleHeight(x + eps, z);
    const hD = RainforestTerrain.sampleHeight(x, z - eps);
    const hU = RainforestTerrain.sampleHeight(x, z + eps);

    const normal = new THREE.Vector3(hL - hR, 2.0 * eps, hD - hU).normalize();
    return normal;
  }

  public update(time: number, cameraPos: THREE.Vector3) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPos);
  }

  public setTransitionWeight(weight: number) {
    this.material.uniforms.uTransitionWeight.value = weight;
    this.mesh.visible = weight > 0.001;
  }

  public setQualityTier(tier: QualityTier) {
    // In low tier, wetness and specular complexity can be trimmed
    if (tier === 'LOW') {
      this.material.uniforms.uWetness.value = 0.5;
    } else {
      this.material.uniforms.uWetness.value = 0.85;
    }
  }

  public destroy() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
