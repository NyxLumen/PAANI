import * as THREE from 'three';
import { WaterDrop } from '../../drop/WaterDrop';
import { RainforestPuddles } from './Puddles';
import { RainforestVegetation } from './Vegetation';

export type LeafInteractionState =
  | 'IDLE'
  | 'DESCENT_TO_LEAF'
  | 'LEAF_IMPACT_SQUASH'
  | 'SLIDING_ON_LEAF'
  | 'TIP_ACCUMULATION'
  | 'DRIP_FALL'
  | 'PUDDLE_IMPACT'
  | 'RESTING_IN_PUDDLE';

export class RainforestInteraction {
  public state: LeafInteractionState = 'IDLE';
  private timer: number = 0;
  private drop: WaterDrop;
  private puddles: RainforestPuddles;
  public vegetation: RainforestVegetation;

  // Key trajectory points in world space
  private descentStart = new THREE.Vector3(0.0, 6.5, 3.4);
  private leafLanding = new THREE.Vector3(0.02, 2.65, 3.65);
  private leafTip = new THREE.Vector3(0.24, 1.55, 5.15);
  private puddleSurface = new THREE.Vector3(0.24, 0.49, 5.15);

  private currentPos = new THREE.Vector3();
  private currentVel = new THREE.Vector3();

  constructor(drop: WaterDrop, puddles: RainforestPuddles, vegetation: RainforestVegetation) {
    this.drop = drop;
    this.puddles = puddles;
    this.vegetation = vegetation;
    this.currentPos.copy(this.descentStart);
  }

  public start() {
    this.leafLanding = this.vegetation.getHeroLeafSpinePoint(0.08, 0.35);
    this.leafTip = this.vegetation.getHeroLeafSpinePoint(0.98, 0.35);
    this.descentStart = this.leafLanding.clone().add(new THREE.Vector3(0.0, 3.8, -0.3));
    this.puddleSurface = new THREE.Vector3(this.leafTip.x, 0.49, this.leafTip.z);

    this.state = 'DESCENT_TO_LEAF';
    this.timer = 0;
    this.currentPos.copy(this.descentStart);
    this.drop.mesh.visible = true;
    this.drop.setPosition(this.currentPos);
    this.drop.setImpactSquash(0.0);
    this.drop.setMergeProgress(0.0);
    this.drop.setSurfaceNormal(this.vegetation.getHeroLeafSpineNormal(0.08));
  }

  public reset() {
    this.state = 'IDLE';
    this.timer = 0;
    this.currentPos.copy(this.descentStart);
    this.drop.mesh.visible = true;
    this.drop.setImpactSquash(0.0);
    this.drop.setMergeProgress(0.0);
  }

  public update(delta: number): { position: THREE.Vector3; state: LeafInteractionState } {
    if (this.state === 'IDLE') {
      return { position: this.currentPos, state: this.state };
    }

    this.timer += delta;

    switch (this.state) {
      case 'DESCENT_TO_LEAF': {
        // Drop falls from canopy toward the broadleaf
        const duration = 2.4;
        const t = Math.min(this.timer / duration, 1.0);
        // Gravitational acceleration curve
        const easeIn = t * t;
        this.currentPos.lerpVectors(this.descentStart, this.leafLanding, easeIn);
        this.currentVel.set(0, -3.5 * t, 0.4 * t);
        this.drop.setVelocity(this.currentVel);
        this.drop.setDeformState(1); // falling teardrop

        if (t >= 1.0) {
          this.state = 'LEAF_IMPACT_SQUASH';
          this.timer = 0;
        }
        break;
      }

      case 'LEAF_IMPACT_SQUASH': {
        // Droplet squashes upon striking the waxy hydrophobic leaf cuticle
        const squashDuration = 0.35;
        const t = this.timer / squashDuration;
        const squash = Math.sin(t * Math.PI) * 0.45;
        this.drop.setImpactSquash(squash);
        this.currentPos.copy(this.leafLanding);
        this.drop.setSurfaceNormal(this.vegetation.getHeroLeafSpineNormal(0.08));

        if (t >= 1.0) {
          this.state = 'SLIDING_ON_LEAF';
          this.timer = 0;
          this.drop.setImpactSquash(0.08); // residual surface tension flattening
        }
        break;
      }

      case 'SLIDING_ON_LEAF': {
        // Droplet glides smoothly down the curved spine of the hero leaf
        const slideDuration = 3.6;
        const t = Math.min(this.timer / slideDuration, 1.0);
        // Ease along downward slope with realistic acceleration
        const s = t * t * (3.0 - 2.0 * t);

        // Precise spine point on hero leaf with safe contact normal offset
        const progress = 0.08 + s * 0.90;
        const spinePos = this.vegetation.getHeroLeafSpinePoint(progress, 0.35);
        this.currentPos.copy(spinePos);

        // Set surface normal to leaf normal for physical contact alignment
        const leafNormal = this.vegetation.getHeroLeafSpineNormal(progress);
        this.drop.setSurfaceNormal(leafNormal);

        // Slight wobbling roll deformation as it glides along leaf cuticle
        const rollWobble = Math.sin(this.timer * 8.0) * 0.04;
        this.drop.setImpactSquash(0.06 + rollWobble);
        this.drop.setDeformState(0);

        if (t >= 1.0) {
          this.state = 'TIP_ACCUMULATION';
          this.timer = 0;
        }
        break;
      }

      case 'TIP_ACCUMULATION': {
        // Droplet clings to the tapered leaf tip, stretching under gravity
        const hangDuration = 1.2;
        const t = Math.min(this.timer / hangDuration, 1.0);
        // Vertical elongation at tip
        const stretch = t * 0.22;
        this.currentPos.copy(this.leafTip).add(new THREE.Vector3(0, -stretch * 0.4, stretch * 0.1));
        this.drop.setImpactSquash(-stretch); // elongated teardrop

        if (t >= 1.0) {
          this.state = 'DRIP_FALL';
          this.timer = 0;
        }
        break;
      }

      case 'DRIP_FALL': {
        // Droplet breaks free and falls into the puddle below
        const fallDuration = 0.65;
        const t = Math.min(this.timer / fallDuration, 1.0);
        const freeFallT = t * t; // quadratic gravity

        this.currentPos.lerpVectors(this.leafTip, this.puddleSurface, freeFallT);
        this.currentVel.set(0, -9.8 * t, 0);
        this.drop.setVelocity(this.currentVel);
        this.drop.setDeformState(1);

        if (t >= 1.0) {
          this.state = 'PUDDLE_IMPACT';
          this.timer = 0;
          // Trigger capillary ripples on the puddle surface
          this.puddles.triggerRipple(this.puddleSurface, 1.2);
        }
        break;
      }

      case 'PUDDLE_IMPACT': {
        // Droplet impacts puddle, creates concentric ripples and merges
        const mergeDuration = 0.8;
        const t = Math.min(this.timer / mergeDuration, 1.0);
        this.currentPos.copy(this.puddleSurface);
        this.drop.setImpactSquash(Math.sin(t * Math.PI) * 0.6);
        this.drop.setMergeProgress(t);

        if (t >= 1.0) {
          this.state = 'RESTING_IN_PUDDLE';
          this.drop.mesh.visible = false;
        }
        break;
      }

      case 'RESTING_IN_PUDDLE': {
        this.currentPos.copy(this.puddleSurface);
        break;
      }
    }

    this.drop.setPosition(this.currentPos);
    return { position: this.currentPos, state: this.state };
  }
}
