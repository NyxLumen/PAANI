import * as THREE from 'three';
import { QualityManager } from '../core/QualityManager';
import { godraysVertexShader, godraysFragmentShader } from '../shaders/underwater/godrays';

export class Underwater {
  public group: THREE.Group;
  private qualityManager: QualityManager;
  private unsubscribeQuality: (() => void) | null = null;

  // Components
  private godRayGroup: THREE.Group;
  private godRayMaterial: THREE.ShaderMaterial;
  private marineSnow: THREE.Points;
  private marineSnowGeom: THREE.BufferGeometry;
  private marineSnowPositions: Float32Array;
  private marineSnowVelocities: Float32Array;

  // Scene fog targets
  public aboveWaterFog = new THREE.FogExp2(0x94c1e0, 0.0035);
  public underwaterFog = new THREE.FogExp2(0x021526, 0.038);

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.group = new THREE.Group();
    this.qualityManager = qualityManager;

    // 1. God Rays
    this.godRayGroup = new THREE.Group();
    this.godRayMaterial = new THREE.ShaderMaterial({
      vertexShader: godraysVertexShader,
      fragmentShader: godraysFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: sunDirection },
        uIntensity: { value: 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    // Create a series of volumetric light shafts angled with the sun
    const rayGeom = new THREE.PlaneGeometry(16, 28);
    // Align base of ray at water surface (y = 0), extending downward into negative Y
    rayGeom.translate(0, -14, 0);

    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(rayGeom, this.godRayMaterial);
      const angle = (i / 6) * Math.PI + 0.2;
      mesh.position.set(Math.cos(angle) * 3.0, 0, Math.sin(angle) * 3.0);
      mesh.rotation.y = angle;
      mesh.rotation.x = 0.15;
      this.godRayGroup.add(mesh);
    }
    this.group.add(this.godRayGroup);

    // 2. Suspended Marine Snow / Micro Particles
    const particleCount = this.qualityManager.getSettings().underwaterParticles;
    this.marineSnowGeom = new THREE.BufferGeometry();
    this.marineSnowPositions = new Float32Array(particleCount * 3);
    this.marineSnowVelocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      this.marineSnowPositions[i * 3 + 0] = (Math.random() - 0.5) * 35;
      this.marineSnowPositions[i * 3 + 1] = -Math.random() * 25; // below surface
      this.marineSnowPositions[i * 3 + 2] = (Math.random() - 0.5) * 35;

      this.marineSnowVelocities[i * 3 + 0] = (Math.random() - 0.5) * 0.05;
      this.marineSnowVelocities[i * 3 + 1] = -(0.02 + Math.random() * 0.04);
      this.marineSnowVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.05;
    }

    this.marineSnowGeom.setAttribute(
      'position',
      new THREE.BufferAttribute(this.marineSnowPositions, 3)
    );

    const snowMat = new THREE.PointsMaterial({
      color: 0xa8e6ff,
      size: 0.09,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.marineSnow = new THREE.Points(this.marineSnowGeom, snowMat);
    this.group.add(this.marineSnow);

    this.unsubscribeQuality = this.qualityManager.subscribe((settings) => {
      this.godRayMaterial.uniforms.uIntensity.value =
        settings.tier === 'LOW' ? 0.4 : settings.tier === 'MEDIUM' ? 0.75 : 1.0;
    });
  }

  public update(time: number, delta: number, isUnderwater: boolean, camPos: THREE.Vector3) {
    this.godRayMaterial.uniforms.uTime.value = time;
    this.marineSnow.visible = isUnderwater;
    this.godRayGroup.visible = isUnderwater;

    // Follow camera roughly in XZ so marine snow and god rays are always surrounding the view
    this.godRayGroup.position.x = camPos.x * 0.6;
    this.godRayGroup.position.z = camPos.z * 0.6;

    // Animate marine snow with gentle fluid drift
    const posAttr = this.marineSnowGeom.getAttribute('position') as THREE.BufferAttribute;
    const array = posAttr.array as Float32Array;
    const count = array.length / 3;

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      // Drift downward with subtle sinusoidal currents
      array[idx + 0] += Math.sin(time * 0.5 + array[idx + 1] * 0.5) * 0.008;
      array[idx + 1] -= 0.025 * delta;
      array[idx + 2] += Math.cos(time * 0.4 + array[idx + 0] * 0.5) * 0.008;

      // Wrap particles if they sink too deep
      if (array[idx + 1] < -26) {
        array[idx + 1] = -0.2;
      }
    }
    posAttr.needsUpdate = true;
  }

  public destroy() {
    if (this.unsubscribeQuality) {
      this.unsubscribeQuality();
      this.unsubscribeQuality = null;
    }
    this.godRayMaterial.dispose();
    this.marineSnowGeom.dispose();
    (this.marineSnow.material as THREE.Material).dispose();
  }
}
