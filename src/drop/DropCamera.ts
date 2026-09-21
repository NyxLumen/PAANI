import * as THREE from 'three';
import { Ocean } from '../world/Ocean';

export type CameraCinematicMode = 'OPENING' | 'REVEAL' | 'FOLLOW' | 'UNDERWATER';

export class DropCamera {
  public instance: THREE.PerspectiveCamera;
  public mode: CameraCinematicMode = 'OPENING';
  public isUnderwater: boolean = false;
  public surfaceCrossIntensity: number = 0.0;

  private targetPosition = new THREE.Vector3();
  private currentLookTarget = new THREE.Vector3(0, 0.25, -18.0);
  private desiredLookTarget = new THREE.Vector3(0, 0.25, -18.0);

  // Opening framing: low above water (ocean ~60%, sky ~40%)
  private openingCamPos = new THREE.Vector3(0, 0.72, 4.6);
  private openingLookAt = new THREE.Vector3(0, 0.22, -18.0);

  // Cinematic follow offsets relative to drop
  private airOffset = new THREE.Vector3(0.32, 0.28, 1.75);
  private underwaterOffset = new THREE.Vector3(0.28, 0.42, 1.75);

  private ocean: Ocean;
  private revealProgress = 0.0;
  private isTransitioningToReveal = false;

  constructor(ocean: Ocean, aspect: number) {
    this.ocean = ocean;
    this.instance = new THREE.PerspectiveCamera(42, aspect, 0.05, 2000);
    this.instance.position.copy(this.openingCamPos);
    this.currentLookTarget.copy(this.openingLookAt);
    this.desiredLookTarget.copy(this.openingLookAt);
  }

  public setAspect(aspect: number) {
    this.instance.aspect = aspect;
    this.instance.updateProjectionMatrix();
  }

  public startDropReveal() {
    this.isTransitioningToReveal = true;
    this.revealProgress = 0.0;
    this.mode = 'REVEAL';
  }

  public setMode(mode: CameraCinematicMode) {
    this.mode = mode;
  }

  public reset() {
    this.mode = 'OPENING';
    this.revealProgress = 0.0;
    this.isTransitioningToReveal = false;
    this.isUnderwater = false;
    this.surfaceCrossIntensity = 0.0;
    this.instance.position.copy(this.openingCamPos);
    this.currentLookTarget.copy(this.openingLookAt);
    this.desiredLookTarget.copy(this.openingLookAt);
    this.instance.lookAt(this.currentLookTarget);
  }

  public update(delta: number, time: number, dropPosition: THREE.Vector3, _dropState: string) {
    // 1. Reveal transition progress (takes ~2.2 seconds)
    if (this.isTransitioningToReveal && this.revealProgress < 1.0) {
      this.revealProgress = Math.min(this.revealProgress + delta * 0.52, 1.0);
      if (this.revealProgress >= 1.0) {
        this.mode = 'FOLLOW';
      }
    }

    // 2. Position and Look Target based on mode
    if (this.mode === 'OPENING') {
      const swellY = Math.sin(time * 0.8) * 0.06;
      const swellX = Math.cos(time * 0.6) * 0.04;
      this.targetPosition.set(
        this.openingCamPos.x + swellX,
        this.openingCamPos.y + swellY,
        this.openingCamPos.z
      );
      this.desiredLookTarget.copy(this.openingLookAt);
    } else if (this.mode === 'REVEAL') {
      // Smooth crane up to macro frame the water drop
      const t = this.revealProgress;
      const smoothT = t * t * (3.0 - 2.0 * t); // Smoothstep curve

      const targetRevealCam = dropPosition.clone().add(this.airOffset);
      this.targetPosition.lerpVectors(this.openingCamPos, targetRevealCam, smoothT);
      this.desiredLookTarget.lerpVectors(this.openingLookAt, dropPosition, smoothT);
    } else {
      // 'FOLLOW' or 'UNDERWATER'
      const offset = this.isUnderwater ? this.underwaterOffset : this.airOffset;
      this.targetPosition.copy(dropPosition).add(offset);
      this.desiredLookTarget.copy(dropPosition);
    }

    // 3. Damped camera follow
    const posDamping = this.mode === 'OPENING' ? 3.5 : 7.0;
    const lookDamping = 8.0;

    const lerpFactor = 1.0 - Math.exp(-posDamping * delta);
    this.instance.position.lerp(this.targetPosition, lerpFactor);

    const lookFactor = 1.0 - Math.exp(-lookDamping * delta);
    this.currentLookTarget.lerp(this.desiredLookTarget, lookFactor);
    this.instance.lookAt(this.currentLookTarget);

    // 4. Physical surface crossing detection
    const waterHeight = this.ocean.getWaterHeightAt(
      this.instance.position.x,
      this.instance.position.z,
      time
    );

    const wasUnderwater = this.isUnderwater;
    this.isUnderwater = this.instance.position.y < waterHeight;

    if (!wasUnderwater && this.isUnderwater) {
      this.surfaceCrossIntensity = 1.0;
    } else if (this.surfaceCrossIntensity > 0) {
      this.surfaceCrossIntensity = Math.max(0, this.surfaceCrossIntensity - delta * 3.0);
    }
  }
}
