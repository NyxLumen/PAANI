import * as THREE from 'three';
import { ImpactEvent } from './ImpactEvent';

export interface FoamSpot {
  origin: THREE.Vector3;
  time: number;
  energy: number;
  active: boolean;
}

export class FoamSystem {
  public static readonly MAX_FOAM_SPOTS = 4;
  private spots: FoamSpot[] = [];

  // Uniform arrays for shader upload
  public uniformOrigins: THREE.Vector3[] = [];
  public uniformTimes: Float32Array = new Float32Array(FoamSystem.MAX_FOAM_SPOTS);
  public uniformEnergies: Float32Array = new Float32Array(FoamSystem.MAX_FOAM_SPOTS);

  constructor() {
    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      this.spots.push({
        origin: new THREE.Vector3(0, -999, 0),
        time: -1.0,
        energy: 0.0,
        active: false,
      });

      this.uniformOrigins.push(new THREE.Vector3(0, -999, 0));
      this.uniformTimes[i] = -1.0;
      this.uniformEnergies[i] = 0.0;
    }
  }

  public onImpact(event: ImpactEvent) {
    // Only generate localized foam if impact energy is substantial
    if (event.impactEnergy < 0.25) return;

    let targetIndex = -1;
    let oldestTime = -1;

    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      if (!this.spots[i].active) {
        targetIndex = i;
        break;
      }
      if (this.spots[i].time > oldestTime) {
        oldestTime = this.spots[i].time;
        targetIndex = i;
      }
    }

    if (targetIndex >= 0) {
      const spot = this.spots[targetIndex];
      spot.origin.copy(event.worldPosition);
      spot.time = 0.0;
      spot.energy = event.impactEnergy;
      spot.active = true;

      this.syncSpotToUniform(targetIndex);
    }
  }

  public update(delta: number) {
    if (delta <= 0) return;

    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      const spot = this.spots[i];
      if (spot.active) {
        spot.time += delta;
        // Foam dissolves gradually over ~5.5 seconds
        if (spot.time > 5.5) {
          spot.active = false;
          spot.time = -1.0;
        }
        this.syncSpotToUniform(i);
      }
    }
  }

  private syncSpotToUniform(index: number) {
    const spot = this.spots[index];
    this.uniformOrigins[index].copy(spot.origin);
    this.uniformTimes[index] = spot.time;
    this.uniformEnergies[index] = spot.energy;
  }

  public reset() {
    for (let i = 0; i < FoamSystem.MAX_FOAM_SPOTS; i++) {
      this.spots[i].active = false;
      this.spots[i].time = -1.0;
      this.syncSpotToUniform(i);
    }
  }
}
