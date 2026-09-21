import * as THREE from 'three';
import { ImpactEvent } from './ImpactEvent';

export interface RippleSlot {
  origin: THREE.Vector3;
  time: number;
  energy: number;
  velocity: THREE.Vector3;
  active: boolean;
}

export class RippleSystem {
  public static readonly MAX_RIPPLES = 4;
  private slots: RippleSlot[] = [];

  // Uniform arrays for shader upload
  public uniformOrigins: THREE.Vector3[] = [];
  public uniformTimes: Float32Array = new Float32Array(RippleSystem.MAX_RIPPLES);
  public uniformEnergies: Float32Array = new Float32Array(RippleSystem.MAX_RIPPLES);
  public uniformVelocities: THREE.Vector3[] = [];

  constructor() {
    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      this.slots.push({
        origin: new THREE.Vector3(0, -999, 0),
        time: -1.0,
        energy: 0.0,
        velocity: new THREE.Vector3(0, 0, 0),
        active: false,
      });

      this.uniformOrigins.push(new THREE.Vector3(0, -999, 0));
      this.uniformTimes[i] = -1.0;
      this.uniformEnergies[i] = 0.0;
      this.uniformVelocities.push(new THREE.Vector3(0, 0, 0));
    }
  }

  public onImpact(event: ImpactEvent) {
    // Find oldest or inactive slot
    let targetIndex = -1;
    let oldestTime = -1;

    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      if (!this.slots[i].active) {
        targetIndex = i;
        break;
      }
      if (this.slots[i].time > oldestTime) {
        oldestTime = this.slots[i].time;
        targetIndex = i;
      }
    }

    if (targetIndex >= 0) {
      const slot = this.slots[targetIndex];
      slot.origin.copy(event.worldPosition);
      slot.time = 0.0;
      slot.energy = event.impactEnergy;
      slot.velocity.copy(event.impactVelocity);
      slot.active = true;

      this.syncSlotToUniform(targetIndex);
    }
  }

  public update(delta: number) {
    if (delta <= 0) return;

    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      const slot = this.slots[i];
      if (slot.active) {
        slot.time += delta;
        // Ripples propagate and fade over ~9 seconds
        if (slot.time > 9.0) {
          slot.active = false;
          slot.time = -1.0;
        }
        this.syncSlotToUniform(i);
      }
    }
  }

  private syncSlotToUniform(index: number) {
    const slot = this.slots[index];
    this.uniformOrigins[index].copy(slot.origin);
    this.uniformTimes[index] = slot.time;
    this.uniformEnergies[index] = slot.energy;
    this.uniformVelocities[index].copy(slot.velocity);
  }

  public getActiveCount(): number {
    return this.slots.filter((s) => s.active).length;
  }

  public reset() {
    for (let i = 0; i < RippleSystem.MAX_RIPPLES; i++) {
      this.slots[i].active = false;
      this.slots[i].time = -1.0;
      this.syncSlotToUniform(i);
    }
  }
}
