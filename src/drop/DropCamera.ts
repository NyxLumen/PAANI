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
  private posVelocity = new THREE.Vector3();
  private lookVelocity = new THREE.Vector3();

  // Opening framing: low above water (ocean ~60%, sky ~40%)
  private openingCamPos = new THREE.Vector3(0, 0.72, 4.6);
  private openingLookAt = new THREE.Vector3(0, 0.22, -18.0);

  // Cinematic follow offsets relative to drop
  private airOffset = new THREE.Vector3(0.32, 0.28, 1.75);
  private underwaterOffset = new THREE.Vector3(0.28, 0.42, 1.75);

  // Rainforest framing targets
  private canopyCamPos = new THREE.Vector3(-3.5, 12.0, 14.0);
  private canopyLookAt = new THREE.Vector3(2.0, 16.0, -2.0);

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
    if (this.mode === 'RAINFOREST_CANOPY' && mode === 'RAINFOREST_LEAF') {
      // Intentional cinematic film cut from high canopy establishing shot to intimate macro leaf lens
      this.instance.position.set(0.95, 4.30, 6.20);
      this.currentLookTarget.set(0.0, 3.85, 3.75);
      this.instance.lookAt(this.currentLookTarget);
      this.posVelocity.set(0, 0, 0);
      this.lookVelocity.set(0, 0, 0);
    }
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
    this.posVelocity.set(0, 0, 0);
    this.lookVelocity.set(0, 0, 0);
    this.instance.position.copy(this.openingCamPos);
    this.currentLookTarget.copy(this.openingLookAt);
    this.desiredLookTarget.copy(this.openingLookAt);
    this.instance.fov = 42.0;
    this.instance.updateProjectionMatrix();
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
      // Cinematic 3/4 macro tracking looking down the hero leaf's spine as the droplet slides towards camera
      const anchorCam = new THREE.Vector3(0.95, 4.30, 6.20);
      const dynamicCam = dropPosition.clone().add(new THREE.Vector3(0.65, 0.45, 1.35));
      this.targetPosition.lerpVectors(anchorCam, dynamicCam, 0.45);
      const anchorLook = new THREE.Vector3(0.0, 3.85, 3.75);
      this.desiredLookTarget.lerpVectors(anchorLook, dropPosition, 0.65);
    } else if (this.mode === 'RAINFOREST_PUDDLE') {
      // Low angle cinematic framing of the puddle surface, reflections, and concentric ripples
      const rippleEpicenter = dropPosition.clone();
      const puddleCam = rippleEpicenter.clone().add(new THREE.Vector3(0.65, 0.55, 1.45));
      this.targetPosition.copy(puddleCam);
      this.desiredLookTarget.copy(rippleEpicenter);
    } else {
      // 'FOLLOW' or 'UNDERWATER'
      const offset = this.isUnderwater ? this.underwaterOffset : this.airOffset;
      this.targetPosition.copy(dropPosition).add(offset);
      this.desiredLookTarget.copy(dropPosition);
    }

    // 3. Subtle organic handheld breathing / micro-sway
    const swayAmp = this.mode === 'RAINFOREST_LEAF' ? 0.005 : 0.012;
    const swayX = (Math.sin(time * 0.42) * 0.6 + Math.cos(time * 0.85) * 0.4) * swayAmp;
    const swayY = (Math.cos(time * 0.38) * 0.6 + Math.sin(time * 0.73) * 0.4) * swayAmp;
    const swayZ = Math.sin(time * 0.31) * (swayAmp * 0.5);
    const targetWithSway = this.targetPosition.clone().add(new THREE.Vector3(swayX, swayY, swayZ));

    // 4. Critically damped spring follow
    const smoothTime = this.mode === 'OPENING' ? 0.45 : 0.22;
    const lookSmoothTime = 0.18;

    this.smoothDampVector(this.instance.position, targetWithSway, this.posVelocity, smoothTime, delta);
    this.smoothDampVector(this.currentLookTarget, this.desiredLookTarget, this.lookVelocity, lookSmoothTime, delta);
    this.instance.lookAt(this.currentLookTarget);

    // 5. Dynamic FOV adjustments
    let targetFov = 42.0;
    if (this.mode === 'OPENING') targetFov = 44.0;
    else if (this.mode === 'RAINFOREST_LEAF') targetFov = 35.0; // Macro telephoto intimacy
    else if (this.mode === 'RAINFOREST_CANOPY') targetFov = 46.0; // Grand wide canopy
    else if (this.mode === 'RAINFOREST_PUDDLE') targetFov = 38.0;
    else if (this.isUnderwater) targetFov = 40.0;
    else if (dropPosition.y > 4.0) targetFov = 45.0; // Speed rush in fall

    const fovLerp = 1.0 - Math.exp(-3.5 * delta);
    if (Math.abs(this.instance.fov - targetFov) > 0.01) {
      this.instance.fov += (targetFov - this.instance.fov) * fovLerp;
      this.instance.updateProjectionMatrix();
    }

    // 6. Physical surface crossing detection
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

  /**
   * Critically damped vector smoothing (SmoothDamp)
   */
  private smoothDampVector(
    current: THREE.Vector3,
    target: THREE.Vector3,
    velocity: THREE.Vector3,
    smoothTime: number,
    delta: number
  ) {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2.0 / smoothTime;
    const x = omega * delta;
    const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);

    const changeX = current.x - target.x;
    const changeY = current.y - target.y;
    const changeZ = current.z - target.z;

    const tempX = (velocity.x + omega * changeX) * delta;
    const tempY = (velocity.y + omega * changeY) * delta;
    const tempZ = (velocity.z + omega * changeZ) * delta;

    velocity.x = (velocity.x - omega * tempX) * exp;
    velocity.y = (velocity.y - omega * tempY) * exp;
    velocity.z = (velocity.z - omega * tempZ) * exp;

    current.x = target.x + (changeX + tempX) * exp;
    current.y = target.y + (changeY + tempY) * exp;
    current.z = target.z + (changeZ + tempZ) * exp;
  }
}
