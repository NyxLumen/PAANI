import * as THREE from 'three';
import { ImpactEvent } from './ImpactEvent';
import { QualityManager } from '../core/QualityManager';

interface Bubble {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  baseRadius: number;
  life: number;
  maxLife: number;
  wobblePhase: number;
  wobbleSpeed: number;
  active: boolean;
}

export class BubbleSystem {
  public group: THREE.Group;
  private qualityManager: QualityManager;
  private mesh: THREE.InstancedMesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.SphereGeometry;
  private bubbles: Bubble[] = [];
  private readonly maxBubbles = 64;
  private dummy = new THREE.Object3D();

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.group = new THREE.Group();
    this.qualityManager = qualityManager;

    this.geometry = new THREE.SphereGeometry(0.026, 12, 10);

    // Physically-inspired underwater air-in-water bubble shader (TIR Fresnel)
    this.material = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        uniform vec3 uSunDirection;
        uniform vec3 uCameraPosition;

        void main() {
          vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
          vec3 normal = normalize(vNormal);
          vec3 sunDir = normalize(uSunDirection);

          // Air bubble in water: n_water (1.333) -> n_air (1.0)
          // Strong Total Internal Reflection & silvery grazing rim
          float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);
          float tirFresnel = 0.15 + 0.85 * pow(1.0 - NdotV, 3.2);

          // Sun glint on bubble membrane
          vec3 halfVec = normalize(sunDir + viewDir);
          float spec = pow(max(dot(normal, halfVec), 0.0), 128.0) * 3.0;

          // Luminous liquid turquoise refraction
          vec3 innerWater = vec3(0.18, 0.58, 0.78);
          vec3 silveryRim = vec3(0.92, 0.98, 1.0);

          vec3 finalColor = mix(innerWater, silveryRim, tirFresnel) + spec * vec3(1.0, 0.96, 0.88);
          float alpha = clamp(tirFresnel * 0.75 + 0.3, 0.25, 0.95);

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      uniforms: {
        uSunDirection: { value: sunDirection },
        uCameraPosition: { value: new THREE.Vector3(0, 0, 2) },
      },
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxBubbles);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);

    // Initialize object pool
    for (let i = 0; i < this.maxBubbles; i++) {
      this.bubbles.push({
        position: new THREE.Vector3(0, -999, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        baseRadius: 1.0,
        life: 0,
        maxLife: 1.0,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 4.0 + Math.random() * 6.0,
        active: false,
      });

      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public trigger(event: ImpactEvent) {
    const tier = this.qualityManager.getTier();
    const spawnBudget = tier === 'HIGH' ? 44 : tier === 'MEDIUM' ? 24 : 12;

    let spawned = 0;
    for (let i = 0; i < this.maxBubbles && spawned < spawnBudget; i++) {
      const b = this.bubbles[i];
      if (!b.active) {
        // Spawn around the contact point just beneath the ocean surface
        const spreadAngle = Math.random() * Math.PI * 2;
        const spreadRadius = Math.random() * 0.18;

        b.position.set(
          event.worldPosition.x + Math.cos(spreadAngle) * spreadRadius,
          event.worldPosition.y - 0.08 - Math.random() * 0.35, // Below water surface
          event.worldPosition.z + Math.sin(spreadAngle) * spreadRadius
        );

        // Initial momentum from entry
        b.velocity.set(
          (Math.random() - 0.5) * 0.15 + event.impactVelocity.x * 0.1,
          -(0.2 + Math.random() * 0.4), // Initial downward push from entry
          (Math.random() - 0.5) * 0.15 + event.impactVelocity.z * 0.1
        );

        b.baseRadius = 0.5 + Math.random() * 1.1;
        b.life = 0;
        b.maxLife = 1.6 + Math.random() * 2.2;
        b.wobblePhase = Math.random() * Math.PI * 2;
        b.wobbleSpeed = 5.0 + Math.random() * 5.0;
        b.active = true;
        spawned++;
      }
    }
  }

  public emitTrailing(pos: THREE.Vector3, vel?: THREE.Vector3) {
    for (let i = 0; i < this.maxBubbles; i++) {
      const b = this.bubbles[i];
      if (!b.active) {
        b.position.set(
          pos.x + (Math.random() - 0.5) * 0.12,
          pos.y + (Math.random() - 0.5) * 0.08,
          pos.z + (Math.random() - 0.5) * 0.12
        );
        b.velocity.set(
          (Math.random() - 0.5) * 0.08,
          0.35 + Math.random() * 0.35,
          (Math.random() - 0.5) * 0.08
        );
        if (vel) {
          b.velocity.x += vel.x * 0.1;
          b.velocity.z += vel.z * 0.1;
        }
        b.baseRadius = 0.4 + Math.random() * 0.6;
        b.life = 0;
        b.maxLife = 1.4 + Math.random() * 1.6;
        b.wobblePhase = Math.random() * Math.PI * 2;
        b.wobbleSpeed = 5.0 + Math.random() * 5.0;
        b.active = true;
        break;
      }
    }
  }

  public update(delta: number, time: number, cameraPos?: THREE.Vector3) {
    if (delta <= 0) return;

    if (cameraPos) {
      this.material.uniforms.uCameraPosition.value.copy(cameraPos);
    }

    for (let i = 0; i < this.maxBubbles; i++) {
      const b = this.bubbles[i];
      if (b.active) {
        b.life += delta;

        if (b.life >= b.maxLife) {
          b.active = false;
        } else {
          // Upward buoyancy acceleration
          b.velocity.y += 1.8 * delta;
          // Hydrodynamic terminal velocity limit
          b.velocity.y = Math.min(b.velocity.y, 0.65);
          // Water drag
          b.velocity.x *= Math.exp(-2.5 * delta);
          b.velocity.z *= Math.exp(-2.5 * delta);

          b.position.addScaledVector(b.velocity, delta);

          // Subtle sinusoidal helical wobble as bubbles rise
          const wobble = Math.sin(time * b.wobbleSpeed + b.wobblePhase) * 0.015;
          const posX = b.position.x + wobble;
          const posZ = b.position.z + Math.cos(time * b.wobbleSpeed + b.wobblePhase) * 0.015;

          // Pop when reaching or exceeding water surface (pass wave crests)
          if (b.position.y >= 0.35) {
            b.active = false;
          } else {
            const lifeProgress = b.life / b.maxLife;
            // Slight expansion as pressure drops near surface, then fade
            const scale = b.baseRadius * (1.0 + lifeProgress * 0.2) * (1.0 - Math.pow(lifeProgress, 4.0));

            this.dummy.position.set(posX, b.position.y, posZ);
            this.dummy.scale.set(scale, scale, scale);
            this.dummy.updateMatrix();
            this.mesh.setMatrixAt(i, this.dummy.matrix);
          }
        }
      }

      if (!b.active) {
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public getActiveCount(): number {
    return this.bubbles.filter((b) => b.active).length;
  }

  public reset() {
    for (const b of this.bubbles) {
      b.active = false;
    }
  }

  public destroy() {
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}
