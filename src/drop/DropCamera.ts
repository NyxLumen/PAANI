import * as THREE from 'three';
import { Ocean } from '../world/Ocean';

export type CameraCinematicMode =
  | 'OPENING'
  | 'REVEAL'
  | 'FOLLOW'
  | 'UNDERWATER'
  | 'RAINFOREST_TRANSITION'
  | 'RAINFOREST_CANOPY'
  | 'RAINFOREST_LEAF'
  | 'RAINFOREST_PUDDLE';

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

  // Rainforest framing targets
  private canopyCamPos = new THREE.Vector3(-3.5, 12.0, 14.0);
  private canopyLookAt = new THREE.Vector3(2.0, 16.0, -2.0);

  private leafCamOffset = new THREE.Vector3(0.65, 0.45, 1.45);

  private ocean: Ocean;
  private revealProgress = 0.0;
  private isTransitioningToReveal = false;
  private transitionTimer = 0.0;

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
    this.transitionTimer = 0.0;
  }

  public reset() {
    this.mode = 'OPENING';
    this.revealProgress = 0.0;
    this.isTransitioningToReveal = false;
    this.isUnderwater = false;
    this.surfaceCrossIntensity = 0.0;
    this.transitionTimer = 0.0;
    this.instance.position.copy(this.openingCamPos);
    this.currentLookTarget.copy(this.openingLookAt);
    this.desiredLookTarget.copy(this.openingLookAt);
    this.instance.lookAt(this.currentLookTarget);
  }

  public update(delta: number, time: number, dropPosition: THREE.Vector3, _dropState: string) {
    this.transitionTimer += delta;

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
    } else if (this.mode === 'RAINFOREST_TRANSITION') {
      // Ascends from ocean water through shoreline mist towards high canopy
      const t = Math.min(this.transitionTimer / 3.5, 1.0);
      const smoothT = t * t * (3.0 - 2.0 * t);
      const startPos = new THREE.Vector3(0, 0.8, 3.0);
      this.targetPosition.lerpVectors(startPos, this.canopyCamPos, smoothT);
      const startLook = new THREE.Vector3(0, 0.5, -10.0);
      this.desiredLookTarget.lerpVectors(startLook, this.canopyLookAt, smoothT);
    } else if (this.mode === 'RAINFOREST_CANOPY') {
      // Drifting majestic view of canopy sunbeams
      const driftX = Math.sin(time * 0.3) * 0.6;
      const driftY = Math.cos(time * 0.25) * 0.4;
      this.targetPosition.set(
        this.canopyCamPos.x + driftX,
        this.canopyCamPos.y + driftY,
        this.canopyCamPos.z
      );
      this.desiredLookTarget.copy(this.canopyLookAt);
    } else if (this.mode === 'RAINFOREST_LEAF') {
      // Tight macro tracking of the hero drop on the leaf
      this.targetPosition.copy(dropPosition).add(this.leafCamOffset);
      this.desiredLookTarget.copy(dropPosition);
    } else if (this.mode === 'RAINFOREST_PUDDLE') {
      // Low angle cinematic framing of the puddle surface, reflections, and concentric ripples
      const rippleEpicenter = dropPosition.clone();
      const puddleCam = rippleEpicenter.clone().add(new THREE.Vector3(0.65, 0.65, 1.45));
      this.targetPosition.copy(puddleCam);
      this.desiredLookTarget.copy(rippleEpicenter);
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
    const isRainforestMode =
      this.mode === 'RAINFOREST_TRANSITION' ||
      this.mode === 'RAINFOREST_CANOPY' ||
      this.mode === 'RAINFOREST_LEAF' ||
      this.mode === 'RAINFOREST_PUDDLE';

    const waterHeight = this.ocean.getWaterHeightAt(
      this.instance.position.x,
      this.instance.position.z,
      time
    );

    const wasUnderwater = this.isUnderwater;
    this.isUnderwater = !isRainforestMode && (this.mode === 'UNDERWATER' || this.instance.position.y < waterHeight);

    if (!wasUnderwater && this.isUnderwater) {
      this.surfaceCrossIntensity = 1.0;
    } else if (this.surfaceCrossIntensity > 0) {
      this.surfaceCrossIntensity = Math.max(0, this.surfaceCrossIntensity - delta * 3.0);
    }
  }
}
