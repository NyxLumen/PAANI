import * as THREE from 'three';
import { Ocean } from '../world/Ocean';
import { WaterDrop } from './WaterDrop';

export type DropState = 'IDLE' | 'FALLING' | 'IMPACTING' | 'UNDERWATER';

export interface DropPhysicsCallbacks {
  onImpact?: (position: THREE.Vector3) => void;
  onSubmerged?: () => void;
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
  private readonly gravity = 7.5; // Scaled for cinematic weight
  private readonly airDrag = 0.12;
  private readonly waterDrag = 2.8;
  private readonly waterSinkGravity = 3.2;

  // Impact timing
  private impactTimer = 0;
  private readonly impactDuration = 0.32;
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
    this.drop.setPosition(this.position);
    this.drop.setVelocity(this.velocity);
    this.drop.setDeformState(0);
    this.drop.setImpactSquash(0);
    this.drop.setSubmerged(0);
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

    const waterHeight = this.ocean.getWaterHeightAt(this.position.x, this.position.z, time);

    switch (this.state) {
      case 'IDLE': {
        // Delicate levitation breath
        const breath = Math.sin(time * 2.2) * 0.05;
        this.position.y = this.initialPosition.y + breath;
        this.velocity.set(0, 0, 0);
        this.drop.setPosition(this.position);
        this.drop.setVelocity(this.velocity);
        this.drop.setDeformState(0);
        this.drop.setImpactSquash(0);
        this.drop.setSubmerged(0);
        break;
      }

      case 'FALLING': {
        const v = this.velocity.y;
        const dragAcc = this.airDrag * v * Math.abs(v);
        const accY = -this.gravity + dragAcc;

        this.velocity.y += accY * delta;
        this.position.y += this.velocity.y * delta;

        // Gentle aerodynamic drift
        this.position.x = Math.sin(time * 3.0) * 0.02;
        this.position.z = Math.cos(time * 2.5) * 0.02;

        this.drop.setPosition(this.position);
        this.drop.setVelocity(this.velocity);
        this.drop.setDeformState(1);

        // Check ocean surface impact
        if (this.position.y <= waterHeight + this.drop.radius * 0.3) {
          this.state = 'IMPACTING';
          this.impactTimer = 0;
          this.position.y = waterHeight;

          this.ocean.triggerImpact(this.position, 0.6);
          if (this.callbacks.onImpact) {
            this.callbacks.onImpact(this.position.clone());
          }
        }
        break;
      }

      case 'IMPACTING': {
        this.impactTimer += delta;
        const progress = Math.min(this.impactTimer / this.impactDuration, 1.0);

        // Squash curve: elastic bounce
        const squash = Math.sin(progress * Math.PI) * 0.9;
        this.drop.setImpactSquash(squash);
        this.drop.setDeformState(2);

        // Pierce the surface
        this.velocity.y *= Math.exp(-this.waterDrag * delta);
        this.position.y += this.velocity.y * delta * 0.25;
        this.drop.setPosition(this.position);

        if (progress >= 1.0) {
          this.state = 'UNDERWATER';
          this.drop.setImpactSquash(0);
          this.drop.setDeformState(3);
          this.drop.setSubmerged(1.0);
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
        this.velocity.y = Math.max(this.velocity.y, -1.2); // Sinking speed limit

        this.position.y += this.velocity.y * delta;

        // Helical underwater drift
        this.position.x += Math.sin(time * 1.5) * 0.06 * delta;
        this.position.z += Math.cos(time * 1.2) * 0.06 * delta;

        // Emit micro-bubbles from the descending droplet
        this.bubbleTimer += delta;
        if (this.bubbleTimer > 0.08) {
          this.bubbleTimer = 0;
          this.drop.emitBubble(this.position);
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
