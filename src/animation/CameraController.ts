import gsap from 'gsap';
import { WebGLRenderer } from '../webgl/Renderer';

export class CameraController {
  private renderer: WebGLRenderer;
  private isDiving: boolean = false;
  private isTransitioning: boolean = false;
  private ambientTween: gsap.core.Tween | null = null;

  // Camera state values
  public values = {
    cameraOffsetX: 0,
    cameraOffsetY: 0,
    cameraZoom: 1.0,
    cameraTilt: 0,
    distortionAmount: 0,
    chromaticAberration: 0.002,
    transitionProgress: 0,
    transitionType: 0,
    choiceHoverBiasX: 0,
    choiceHoverBiasY: 0,
    ambientBobY: 0,
    ambientBobTilt: 0,
  };

  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    this.startAmbientOceanBob();
    this.bindTicker();
  }

  // Gentle low-frequency organic camera swell at water level
  private startAmbientOceanBob(): void {
    const bobObj = { y: 0, tilt: 0 };
    this.ambientTween = gsap.to(bobObj, {
      y: 0.008,
      tilt: 0.003,
      duration: 4.2,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
      onUpdate: () => {
        if (!this.isDiving && !this.isTransitioning) {
          this.values.ambientBobY = bobObj.y;
          this.values.ambientBobTilt = bobObj.tilt;
        }
      },
    });
  }

  private bindTicker(): void {
    gsap.ticker.add(() => {
      this.renderer.setState({
        cameraOffset: {
          x: this.values.cameraOffsetX,
          y: this.values.cameraOffsetY + this.values.ambientBobY,
        },
        cameraZoom: this.values.cameraZoom,
        cameraTilt: this.values.cameraTilt + this.values.ambientBobTilt,
        distortionAmount: this.values.distortionAmount,
        chromaticAberration: this.values.chromaticAberration,
        transitionProgress: this.values.transitionProgress,
        transitionType: this.values.transitionType,
        choiceHoverBias: {
          x: this.values.choiceHoverBiasX,
          y: this.values.choiceHoverBiasY,
        },
      });
    });
  }

  /**
   * START -> DIVE TIMELINE:
   * 0.0s: START begins disappearing (handled in OpeningUI)
   * 0.0–0.8s: PĀNI recedes and fades
   * 0.2–1.8s: Camera accelerates toward the horizon
   * 1.0–2.0s: Ocean scale increases and water fills more of the viewport
   * 1.5–2.2s: Strong but controlled surface distortion begins
   * 2.0–2.5s: Peak refraction / chromatic distortion
   * 2.2s+: Reveal underwater.mp4 via liquid break-through transition mask
   */
  public executeDive(callbacks: {
    onSurfaceContact?: () => void;
    onSubmerged?: () => void;
    onComplete?: () => void;
  }): gsap.core.Timeline {
    this.isDiving = true;
    this.values.ambientBobY = 0;
    this.values.ambientBobTilt = 0;

    const tl = gsap.timeline({
      onComplete: () => {
        this.isDiving = false;
        this.renderer.setState({
          environmentA: 'underwater',
          environmentB: 'underwater',
          transitionProgress: 0.0,
        });
        this.values.transitionProgress = 0.0;
        this.values.distortionAmount = 0.0;
        this.values.chromaticAberration = 0.002;
        callbacks.onComplete?.();
      },
    });

    this.values.transitionType = 0; // Dive mask
    this.renderer.setState({
      environmentA: 'ocean',
      environmentB: 'underwater',
      transitionType: 0,
      transitionProgress: 0.0,
    });

    // Ensure underwater video is warmed up and playing
    this.renderer.getMediaManager().play('underwater');

    // 0.2–1.8s: Camera accelerates toward the horizon
    // 1.0–2.0s: Ocean scale increases, camera plunges downward toward water surface
    tl.to(
      this.values,
      {
        cameraZoom: 1.58,
        cameraOffsetY: -0.15,
        cameraTilt: -0.012,
        duration: 1.8,
        ease: 'power2.in',
      },
      0.2
    );

    // 1.5–2.2s: Strong but controlled surface distortion
    tl.to(
      this.values,
      {
        distortionAmount: 0.72,
        duration: 0.7,
        ease: 'power1.in',
      },
      1.5
    );

    // 2.0–2.5s: Peak refraction / chromatic distortion
    tl.to(
      this.values,
      {
        chromaticAberration: 0.034,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => callbacks.onSurfaceContact?.(),
      },
      2.0
    );

    // 2.2s+: Reveal underwater.mp4 via liquid transition mask
    tl.to(
      this.values,
      {
        transitionProgress: 1.0,
        duration: 1.5,
        ease: 'power2.inOut',
        onStart: () => callbacks.onSubmerged?.(),
      },
      2.2
    );

    // 2.6–3.8s: Camera settles underwater, distortion relaxes, natural light takes over
    tl.to(
      this.values,
      {
        cameraZoom: 1.04,
        cameraOffsetY: 0.0,
        cameraTilt: 0.0,
        distortionAmount: 0.02,
        chromaticAberration: 0.002,
        duration: 1.3,
        ease: 'power3.out',
      },
      2.6
    );

    return tl;
  }

  public setChoiceHover(direction: 'left' | 'down' | null): void {
    if (this.isTransitioning) return;

    if (direction === 'left') {
      // Shore hover: subtle camera pull left, slight warm coastal visual bias
      gsap.to(this.values, {
        cameraOffsetX: -0.045,
        cameraTilt: -0.008,
        choiceHoverBiasX: -1.0,
        choiceHoverBiasY: 0.0,
        cameraZoom: 1.05,
        duration: 0.8,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else if (direction === 'down') {
      // Descend hover: scene gently pulls downward, darker/deeper visual bias
      gsap.to(this.values, {
        cameraOffsetY: -0.05,
        cameraOffsetX: 0.0,
        cameraTilt: 0.006,
        choiceHoverBiasX: 0.0,
        choiceHoverBiasY: -1.0,
        cameraZoom: 1.06,
        duration: 0.8,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else {
      // Return to neutral
      gsap.to(this.values, {
        cameraOffsetX: 0.0,
        cameraOffsetY: 0.0,
        cameraTilt: 0.0,
        choiceHoverBiasX: 0.0,
        choiceHoverBiasY: 0.0,
        cameraZoom: 1.03,
        duration: 0.7,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
  }

  /**
   * BRANCH TRANSITIONS:
   * Shore: UNDERWATER → rising toward light → surface → coastal water → SHORE (seawater travelling across wet sand)
   * Deep: UNDERWATER → camera accelerates downward → brightness decreases → particles increase → blue shifts toward near-black → DEEP
   */
  public executeBranchTransition(
    target: 'shore' | 'deep',
    onComplete?: () => void
  ): gsap.core.Timeline {
    this.isTransitioning = true;
    const isShore = target === 'shore';
    const transitionType = isShore ? 1 : 2;

    this.renderer.setState({
      environmentA: 'underwater',
      environmentB: target,
      transitionType,
      transitionProgress: 0.0,
    });
    this.values.transitionType = transitionType;
    this.values.transitionProgress = 0.0;

    // Warm up destination video
    this.renderer.getMediaManager().play(target);

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        this.renderer.setState({
          environmentA: target,
          environmentB: target,
          transitionProgress: 0.0,
        });
        this.values.transitionProgress = 0.0;
        this.values.cameraOffsetX = 0.0;
        this.values.cameraOffsetY = 0.0;
        this.values.cameraZoom = 1.0;
        this.values.choiceHoverBiasX = 0.0;
        this.values.choiceHoverBiasY = 0.0;
        this.values.distortionAmount = 0.0;
        this.values.chromaticAberration = 0.002;
        onComplete?.();
      },
    });

    if (isShore) {
      // Shore: rising toward light and coastal water
      tl.to(this.values, {
        cameraOffsetY: 0.12, // rise towards surface
        cameraOffsetX: -0.08,
        cameraZoom: 1.18,
        distortionAmount: 0.35,
        chromaticAberration: 0.015,
        duration: 1.1,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.7,
          ease: 'power2.inOut',
        },
        '-=0.5'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraOffsetX: 0.0,
          cameraZoom: 1.0,
          distortionAmount: 0.01,
          chromaticAberration: 0.002,
          duration: 1.3,
          ease: 'power3.out',
        },
        '-=0.7'
      );
    } else {
      // Deep: accelerate downward into darkness
      tl.to(this.values, {
        cameraOffsetY: -0.16, // sink downwards
        cameraZoom: 1.2,
        distortionAmount: 0.4,
        chromaticAberration: 0.018,
        duration: 1.1,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.7,
          ease: 'power2.inOut',
        },
        '-=0.5'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          distortionAmount: 0.01,
          chromaticAberration: 0.002,
          duration: 1.3,
          ease: 'power3.out',
        },
        '-=0.7'
      );
    }

    return tl;
  }

  public resetToOcean(): void {
    this.renderer.setState({
      environmentA: 'ocean',
      environmentB: 'underwater',
      transitionProgress: 0.0,
      transitionType: 0,
      choiceHoverBias: { x: 0, y: 0 },
    });
    this.values.cameraOffsetX = 0;
    this.values.cameraOffsetY = 0;
    this.values.cameraZoom = 1.0;
    this.values.cameraTilt = 0;
    this.values.distortionAmount = 0;
    this.values.chromaticAberration = 0.002;
    this.values.transitionProgress = 0;
    this.values.choiceHoverBiasX = 0;
    this.values.choiceHoverBiasY = 0;

    this.renderer.getMediaManager().play('ocean');
  }

  public destroy(): void {
    if (this.ambientTween) {
      this.ambientTween.kill();
    }
  }
}
