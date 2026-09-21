import * as THREE from 'three';
import { Ocean } from '../world/Ocean';
import { WaterDrop } from './WaterDrop';
import { ImpactEvent } from '../water/ImpactEvent';

export type DropState = 'IDLE' | 'FALLING' | 'IMPACTING' | 'UNDERWATER';

export interface DropPhysicsCallbacks {
  onImpact?: (event: ImpactEvent) => void;
  onSubmerged?: () => void;
  onTrailingBubble?: (pos: THREE.Vector3, vel: THREE.Vector3) => void;
}

export class DropPhysics {
  public position: THREE.Vector3 = new THREE.Vector3(0, 3.6, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public state: DropState = 'IDLE';

  private initialPosition = new THREE.Vector3(0, 3.6, 0);
  private ocean: Ocean;
  private drop: WaterDrop;
  private callbacks: DropPhysicsCallbacks = {};

  // Cinematic physical parameters
  private readonly gravity = 7.5;
  private readonly airDrag = 0.12;
  private readonly waterDrag = 2.8;
  private readonly waterSinkGravity = 3.2;

  // Impact & merging timing
  private impactTimer = 0;
  private readonly impactDuration = 0.42;
  private lastImpactEvent: ImpactEvent | null = null;
  private bubbleTimer = 0;

  constructor(drop: WaterDrop, ocean: Ocean, callbacks: DropPhysicsCallbacks = {}) {
    this.drop = drop;
    this.ocean = ocean;
    this.callbacks = callbacks;
    this.reset();
  }

  public reset() {
    this.state = 'IDLE';
    this.position.copy(this.initialPosition);
    this.velocity.set(0, 0, 0);
    this.impactTimer = 0;
    this.bubbleTimer = 0;
    this.lastImpactEvent = null;
    this.drop.setPosition(this.position);
    this.drop.setVelocity(this.velocity);
    this.drop.setDeformState(0);
    this.drop.setImpactSquash(0);
    this.drop.setSubmerged(0);
    this.drop.setMergeProgress(0);
    this.drop.setWaterHeight(0);
    this.ocean.setMeniscusBulge(this.position, 0.0);
  }

  public startFall() {
    if (this.state === 'IDLE') {
      this.state = 'FALLING';
      this.velocity.set(0, -0.3, 0);
      this.drop.setDeformState(1);
    }
  }

  public update(delta: number, time: number) {
    if (delta <= 0) return;

    const surface = this.ocean.getWaterSurfaceAt(this.position.x, this.position.z, time);
    this.drop.setWaterHeight(surface.height);
    this.drop.setSurfaceNormal(surface.normal);

    switch (this.state) {
      case 'IDLE': {
        const breath = Math.sin(time * 2.2) * 0.05;
        this.position.y = this.initialPosition.y + breath;
        this.velocity.set(0, 0, 0);
        this.drop.setPosition(this.position);
        this.drop.setVelocity(this.velocity);
        this.drop.setDeformState(0);
        this.drop.setImpactSquash(0);
        this.drop.setSubmerged(0);
        this.drop.setMergeProgress(0);
        break;
      }

      case 'FALLING': {
        const v = this.velocity.y;
        const dragAcc = this.airDrag * v * Math.abs(v);
        const accY = -this.gravity + dragAcc;

        this.velocity.y += accY * delta;
        this.position.y += this.velocity.y * delta;

        // Aerodynamic drift
        this.position.x = Math.sin(time * 3.0) * 0.02;
        this.position.z = Math.cos(time * 2.5) * 0.02;

        this.drop.setPosition(this.position);
        this.drop.setVelocity(this.velocity);
        this.drop.setDeformState(1);

        // Check ocean surface impact against animated wave height
        if (this.position.y <= surface.height + this.drop.radius * 0.35) {
          this.state = 'IMPACTING';
          this.impactTimer = 0;
          this.position.y = surface.height + this.drop.radius * 0.15;

          // Relative velocity calculation
          const relVel = this.velocity.clone().sub(surface.velocity);
          const normalSpeed = Math.max(-relVel.dot(surface.normal), 1.0);
          const speed = relVel.length();
          const impactAngle = Math.acos(THREE.MathUtils.clamp(-relVel.clone().normalize().dot(surface.normal), 0, 1));
          
          // Normalized impact energy [0.4 to 2.0]
          const energy = THREE.MathUtils.clamp(0.5 * (speed / 4.0) * (speed / 4.0) * 1.5, 0.4, 2.0);

          const event: ImpactEvent = {
            worldPosition: new THREE.Vector3(this.position.x, surface.height, this.position.z),
            impactVelocity: this.velocity.clone(),
            surfaceNormal: surface.normal.clone(),
            impactEnergy: energy,
            normalSpeed,
            scale: this.drop.radius,
            timestamp: time,
            impactAngle,
          };
          this.lastImpactEvent = event;

          if (this.callbacks.onImpact) {
            this.callbacks.onImpact(event);
          }
        }
        break;
      }

      case 'IMPACTING': {
        this.impactTimer += delta;
        const progress = Math.min(this.impactTimer / this.impactDuration, 1.0);

        // 1. Volume-preserving contact squash curve
        const squash = Math.sin(progress * Math.PI) * 0.88;
        this.drop.setImpactSquash(squash);
        this.drop.setDeformState(2);

        // 2. Fluid surface merge progress
        this.drop.setMergeProgress(progress);

        // 3. Meniscus contact bulge on the ocean surface
        if (this.lastImpactEvent) {
          const bulgeWeight = Math.sin(progress * Math.PI) * 0.85;
          this.ocean.setMeniscusBulge(this.lastImpactEvent.worldPosition, bulgeWeight);
        }

        // Downward deceleration into surface
        this.velocity.y *= Math.exp(-this.waterDrag * delta);
        this.position.y += this.velocity.y * delta * 0.22;
        this.drop.setPosition(this.position);

        if (progress >= 1.0) {
          this.state = 'UNDERWATER';
          this.drop.setImpactSquash(0);
          this.drop.setDeformState(3);
          this.drop.setSubmerged(1.0);
          this.drop.setMergeProgress(0.0);
          if (this.lastImpactEvent) {
            this.ocean.setMeniscusBulge(this.lastImpactEvent.worldPosition, 0.0);
          }
          if (this.callbacks.onSubmerged) {
            this.callbacks.onSubmerged();
          }
        }
        break;
      }

      case 'UNDERWATER': {
        const v = this.velocity.y;
        const dragAcc = -Math.sign(v) * this.waterDrag * Math.abs(v);
        const accY = -this.waterSinkGravity + dragAcc;

        this.velocity.y += accY * delta;
        this.velocity.y = Math.max(this.velocity.y, -1.2);

        this.position.y += this.velocity.y * delta;

        this.position.x += Math.sin(time * 1.5) * 0.06 * delta;
        this.position.z += Math.cos(time * 1.2) * 0.06 * delta;

        // Trailing micro-bubble emission
        this.bubbleTimer += delta;
        if (this.bubbleTimer > 0.08) {
          this.bubbleTimer = 0;
          this.drop.emitBubble(this.position);
          if (this.callbacks.onTrailingBubble) {
            this.callbacks.onTrailingBubble(this.position, this.velocity);
          }
        }

        this.drop.setPosition(this.position);
        this.drop.setVelocity(this.velocity);
        this.drop.setDeformState(3);
        this.drop.setSubmerged(1.0);
        break;
      }
    }
  }
}
