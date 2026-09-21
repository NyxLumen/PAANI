import * as THREE from 'three';
import { ImpactEvent } from './ImpactEvent';
import { QualityManager } from '../core/QualityManager';

interface MicroDroplet {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  active: boolean;
}

interface MesoLobe {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  active: boolean;
}

export class SplashSystem {
  public group: THREE.Group;
  private qualityManager: QualityManager;

  // 1. MACRO: Procedural Worthington Crown Mesh
  private crownMesh: THREE.Mesh;
  private crownGeometry: THREE.BufferGeometry;
  private crownMaterial: THREE.ShaderMaterial;
  private isCrownActive = false;
  private crownTimer = 0;
  private crownDuration = 0.48;
  private crownEnergy = 1.0;
  private crownOrigin = new THREE.Vector3();
  private crownNormal = new THREE.Vector3(0, 1, 0);

  // 2. MESO: Secondary Splash Lobes (Instanced)
  private mesoMesh: THREE.InstancedMesh;
  private mesoDroplets: MesoLobe[] = [];
  private readonly maxMeso = 12;

  // 3. MICRO: Ballistic Airborne Droplets (Instanced)
  private microMesh: THREE.InstancedMesh;
  private microDroplets: MicroDroplet[] = [];
  private readonly maxMicro = 96;

  private dummy = new THREE.Object3D();
  private unsubscribeQuality: (() => void) | null = null;

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.group = new THREE.Group();
    this.qualityManager = qualityManager;

    // --- 1. MACRO CROWN SETUP ---
    this.crownGeometry = this.buildCrownGeometry(32);
    this.crownMaterial = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;

        void main() {
          vUv = uv;
          vHeight = position.y;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        varying float vHeight;

        uniform vec3 uSunDirection;
        uniform vec3 uCameraPosition;
        uniform float uOpacity;

        void main() {
          vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
          vec3 normal = normalize(vNormal);
          vec3 sunDir = normalize(uSunDirection);

          // Liquid Fresnel
          float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
          float fresnel = 0.04 + 0.96 * pow(1.0 - NdotV, 3.5);

          // Delicate luminous water tint
          vec3 waterBody = vec3(0.32, 0.72, 0.90);
          vec3 skySheen = vec3(0.85, 0.96, 1.0);
          vec3 baseColor = mix(waterBody, skySheen, fresnel);

          // Specular glint
          vec3 halfVec = normalize(sunDir + viewDir);
          float NdotH = max(dot(normal, halfVec), 0.0);
          float spec = pow(NdotH, 80.0) * 1.8 + pow(NdotH, 18.0) * 0.35;
          vec3 glint = spec * vec3(1.0, 0.97, 0.9);

          vec3 finalColor = baseColor + glint;

          // Seamless base blend into water surface + thin film transparency
          float baseFade = smoothstep(0.0, 0.04, vHeight);
          float alpha = uOpacity * baseFade * mix(0.35, 0.85, fresnel);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      uniforms: {
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3(0, 0, 2) },
        uOpacity: { value: 0.0 },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.crownMesh = new THREE.Mesh(this.crownGeometry, this.crownMaterial);
    this.crownMesh.visible = false;
    this.group.add(this.crownMesh);

    // --- 2. MESO SPLASH LOBES SETUP ---
    const mesoGeom = new THREE.SphereGeometry(0.042, 12, 10);
    const mesoMat = new THREE.MeshStandardMaterial({
      color: 0xcdeeff,
      roughness: 0.1,
      metalness: 0.05,
      transparent: true,
      opacity: 0.88,
    });
    this.mesoMesh = new THREE.InstancedMesh(mesoGeom, mesoMat, this.maxMeso);
    this.mesoMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesoMesh);

    // --- 3. MICRO DROPLETS SETUP ---
    const microGeom = new THREE.SphereGeometry(0.016, 8, 8);
    const microMat = new THREE.MeshBasicMaterial({
      color: 0xe0f4ff,
      transparent: true,
      opacity: 0.8,
    });
    this.microMesh = new THREE.InstancedMesh(microGeom, microMat, this.maxMicro);
    this.microMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.microMesh);

    // Initialize pooling arrays
    for (let i = 0; i < this.maxMeso; i++) {
      this.mesoDroplets.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        life: 0,
        maxLife: 1.0,
        scale: 1.0,
        active: false,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesoMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesoMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.maxMicro; i++) {
      this.microDroplets.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        life: 0,
        maxLife: 1.0,
        scale: 1.0,
        active: false,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.microMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.microMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Procedurally generates a flaring water crown geometry with scalloped spikes
   */
  private buildCrownGeometry(segments: number): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    const normals: number[] = [];

    // Ring 0: Base circle (at water contact level)
    // Ring 1: Mid wall (waist)
    // Ring 2: Rim with alternating crown spikes
    const numRings = 3;

    for (let ring = 0; ring < numRings; ring++) {
      const v = ring / (numRings - 1);
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const angle = u * Math.PI * 2;

        let radius = 0.25;
        let height = 0.0;

        if (ring === 0) {
          radius = 0.12;
          height = 0.0;
        } else if (ring === 1) {
          radius = 0.19;
          height = 0.08;
        } else if (ring === 2) {
          // Scalloped spikes: every 4th segment peaks into a prominent droplet crown tooth
          const spikeFreq = 8.0;
          const spikeShape = Math.pow(Math.max(Math.sin(angle * spikeFreq), 0.0), 2.5);
          radius = 0.26 + spikeShape * 0.08;
          height = 0.16 + spikeShape * 0.12;
        }

        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        vertices.push(x, height, z);
        uvs.push(u, v);

        // Approximate outward normal
        const n = new THREE.Vector3(x, 0.4, z).normalize();
        normals.push(n.x, n.y, n.z);
      }
    }

    // Connect rings with quads (two triangles)
    const segCount = segments + 1;
    for (let ring = 0; ring < numRings - 1; ring++) {
      for (let i = 0; i < segments; i++) {
        const a = ring * segCount + i;
        const b = (ring + 1) * segCount + i;
        const c = (ring + 1) * segCount + (i + 1);
        const d = ring * segCount + (i + 1);

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);

    return geom;
  }

  public trigger(event: ImpactEvent) {
    const energy = Math.min(Math.max(event.impactEnergy, 0.3), 2.2);
    this.crownEnergy = energy;
    this.crownOrigin.copy(event.worldPosition);
    this.crownNormal.copy(event.surfaceNormal);

    // 1. MACRO CROWN TRIGGER
    this.isCrownActive = true;
    this.crownTimer = 0;
    this.crownDuration = 0.38 + energy * 0.12;
    this.crownMesh.position.copy(event.worldPosition).add(new THREE.Vector3(0, 0.02, 0));

    // Align crown orientation with surface wave normal
    this.crownMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), event.surfaceNormal);
    this.crownMesh.visible = true;
    this.crownMaterial.uniforms.uOpacity.value = 0.95;

    // Asymmetry vector from incoming horizontal velocity
    const forwardX = event.impactVelocity.x;
    const forwardZ = event.impactVelocity.z;

    // 2. MESO SECONDARY LOBES TRIGGER (Asymmetric droplets ejected from crown rim)
    const mesoCount = Math.min(Math.round(8 * (energy / 1.0)), this.maxMeso);
    for (let i = 0; i < mesoCount; i++) {
      const lobe = this.mesoDroplets[i];
      const angle = (i / mesoCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speedOut = (1.2 + Math.random() * 1.8) * energy;
      const speedUp = (1.8 + Math.random() * 2.2) * energy;

      lobe.position.copy(event.worldPosition).add(
        new THREE.Vector3(Math.cos(angle) * 0.22, 0.12, Math.sin(angle) * 0.22)
      );

      // Inherit asymmetric forward momentum
      lobe.velocity.set(
        Math.cos(angle) * speedOut + forwardX * 0.4,
        speedUp,
        Math.sin(angle) * speedOut + forwardZ * 0.4
      );

      lobe.life = 0;
      lobe.maxLife = 0.45 + Math.random() * 0.3;
      lobe.scale = (0.7 + Math.random() * 0.6) * Math.sqrt(energy);
      lobe.active = true;
    }

    // 3. MICRO BALLISTIC DROPLETS TRIGGER
    const tier = this.qualityManager.getTier();
    const microCount = tier === 'HIGH' ? this.maxMicro : tier === 'MEDIUM' ? 48 : 24;

    for (let i = 0; i < microCount; i++) {
      const micro = this.microDroplets[i];
      const angle = Math.random() * Math.PI * 2;
      const speedOut = (0.8 + Math.random() * 2.6) * energy;
      const speedUp = (1.6 + Math.random() * 3.4) * energy;

      micro.position.copy(event.worldPosition).add(
        new THREE.Vector3(
          Math.cos(angle) * 0.08 + (Math.random() - 0.5) * 0.04,
          0.04,
          Math.sin(angle) * 0.08 + (Math.random() - 0.5) * 0.04
        )
      );

      micro.velocity.set(
        Math.cos(angle) * speedOut + forwardX * 0.5,
        speedUp,
        Math.sin(angle) * speedOut + forwardZ * 0.5
      );

      micro.life = 0;
      micro.maxLife = 0.5 + Math.random() * 0.45;
      micro.scale = (0.4 + Math.random() * 0.9) * Math.sqrt(energy);
      micro.active = true;
    }
  }

  public update(delta: number, cameraPos?: THREE.Vector3) {
    if (delta <= 0) return;

    if (cameraPos) {
      this.crownMaterial.uniforms.uCameraPosition.value.copy(cameraPos);
    }

    // --- 1. UPDATE MACRO CROWN ---
    if (this.isCrownActive) {
      this.crownTimer += delta;
      const t = this.crownTimer / this.crownDuration;

      if (t >= 1.0) {
        this.isCrownActive = false;
        this.crownMesh.visible = false;
      } else {
        // Crown evolution: realistic radial expansion, spike elongation, and collapse into water
        const energyClamped = Math.min(Math.max(this.crownEnergy, 0.4), 1.6);
        const expand = (0.75 + Math.sin(t * Math.PI * 0.55) * 0.45) * Math.sqrt(energyClamped);
        const heightFactor = Math.sin(Math.pow(t, 0.65) * Math.PI);
        const heightScale = Math.max(0.01, heightFactor * 1.15 * Math.sqrt(energyClamped));

        this.crownMesh.scale.set(expand, heightScale, expand);
        this.crownMaterial.uniforms.uOpacity.value = Math.min(1.0, (1.0 - t * t) * 1.1);
      }
    }

    // --- 2. UPDATE MESO DROPLETS ---
    for (let i = 0; i < this.maxMeso; i++) {
      const lobe = this.mesoDroplets[i];
      if (lobe.active) {
        lobe.life += delta;
        if (lobe.life >= lobe.maxLife) {
          lobe.active = false;
        } else {
          lobe.velocity.y -= 9.81 * delta; // Gravity
          lobe.velocity.x *= Math.exp(-1.4 * delta); // Air resistance
          lobe.velocity.z *= Math.exp(-1.4 * delta);
          lobe.position.addScaledVector(lobe.velocity, delta);

          const fade = 1.0 - lobe.life / lobe.maxLife;
          const currentScale = lobe.scale * Math.pow(fade, 0.6);

          this.dummy.position.copy(lobe.position);
          this.dummy.scale.set(currentScale, currentScale, currentScale);
          this.dummy.updateMatrix();
          this.mesoMesh.setMatrixAt(i, this.dummy.matrix);
        }
      }

      if (!lobe.active) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesoMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.mesoMesh.instanceMatrix.needsUpdate = true;

    // --- 3. UPDATE MICRO DROPLETS ---
    for (let i = 0; i < this.maxMicro; i++) {
      const d = this.microDroplets[i];
      if (d.active) {
        d.life += delta;
        if (d.life >= d.maxLife) {
          d.active = false;
        } else {
          d.velocity.y -= 9.81 * delta; // Gravity
          d.velocity.x *= Math.exp(-2.2 * delta); // Stronger air drag on tiny droplets
          d.velocity.z *= Math.exp(-2.2 * delta);
          d.position.addScaledVector(d.velocity, delta);

          const fade = 1.0 - d.life / d.maxLife;
          const currentScale = d.scale * fade;

          this.dummy.position.copy(d.position);
          this.dummy.scale.set(currentScale, currentScale, currentScale);
          this.dummy.updateMatrix();
          this.microMesh.setMatrixAt(i, this.dummy.matrix);
        }
      }

      if (!d.active) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.microMesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.microMesh.instanceMatrix.needsUpdate = true;
  }

  public getActiveMicroCount(): number {
    return this.microDroplets.filter((d) => d.active).length;
  }

  public getActiveMesoCount(): number {
    return this.mesoDroplets.filter((d) => d.active).length;
  }

  public reset() {
    this.isCrownActive = false;
    this.crownMesh.visible = false;
    for (const lobe of this.mesoDroplets) lobe.active = false;
    for (const d of this.microDroplets) d.active = false;
  }

  public destroy() {
    if (this.unsubscribeQuality) {
      this.unsubscribeQuality();
      this.unsubscribeQuality = null;
    }
    this.crownGeometry.dispose();
    this.crownMaterial.dispose();
    this.mesoMesh.geometry.dispose();
    (this.mesoMesh.material as THREE.Material).dispose();
    this.microMesh.geometry.dispose();
    (this.microMesh.material as THREE.Material).dispose();
  }
}
