import gsap from 'gsap';
import { WebGLRenderer } from '../webgl/Renderer';

export class CameraController {
  private renderer: WebGLRenderer;
  private isDiving: boolean = false;
  private isTransitioning: boolean = false;
  private ambientTween: gsap.core.Tween | null = null;

  // Base camera values
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

  // Gentle organic ocean swell at water level
  private startAmbientOceanBob(): void {
    const bobObj = { y: 0, tilt: 0 };
    this.ambientTween = gsap.to(bobObj, {
      y: 0.012,
      tilt: 0.005,
      duration: 3.8,
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
        // Swap textures so environmentA becomes underwater
        this.renderer.setState({
          environmentA: 'underwater',
          environmentB: 'underwater',
          transitionProgress: 0.0,
        });
        this.values.transitionProgress = 0.0;
        callbacks.onComplete?.();
      },
    });

    this.values.transitionType = 0; // Dive mask
    this.renderer.setState({
      environmentA: 'ocean',
      environmentB: 'underwater',
      transitionType: 0,
    });

    // 1. Camera accelerates toward the horizon & water surface
    tl.to(this.values, {
      cameraZoom: 1.45,
      cameraOffsetY: -0.14,
      cameraTilt: -0.015,
      duration: 1.6,
      ease: 'power2.in',
    });

    // 2. Optical distortion and chromatic aberration ramp up on approach
    tl.to(
      this.values,
      {
        distortionAmount: 0.85,
        chromaticAberration: 0.038,
        duration: 0.9,
        ease: 'power1.in',
        onComplete: () => callbacks.onSurfaceContact?.(),
      },
      '-=0.8'
    );

    // 3. Piercing the surface: transition mask sweeps through
    tl.to(
      this.values,
      {
        transitionProgress: 1.0,
        duration: 1.6,
        ease: 'power2.inOut',
        onStart: () => callbacks.onSubmerged?.(),
      },
      '-=0.3'
    );

    // 4. Settling underwater: camera decelerates, distortion relaxes
    tl.to(
      this.values,
      {
        cameraZoom: 1.04,
        cameraOffsetY: 0.0,
        cameraTilt: 0.0,
        distortionAmount: 0.04,
        chromaticAberration: 0.003,
        duration: 1.5,
        ease: 'power3.out',
      },
      '-=0.8'
    );

    return tl;
  }

  public setChoiceHover(direction: 'left' | 'down' | null): void {
    if (this.isTransitioning) return;

    if (direction === 'left') {
      // Shore hover: pull left, slight counter-clockwise tilt, turquoise warm bias
      gsap.to(this.values, {
        cameraOffsetX: -0.05,
        cameraTilt: -0.01,
        choiceHoverBiasX: -1.0,
        choiceHoverBiasY: 0.0,
        cameraZoom: 1.07,
        duration: 0.9,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else if (direction === 'down') {
      // Descend hover: pull down, dark abyss bias
      gsap.to(this.values, {
        cameraOffsetY: -0.06,
        cameraOffsetX: 0.0,
        cameraTilt: 0.008,
        choiceHoverBiasX: 0.0,
        choiceHoverBiasY: -1.0,
        cameraZoom: 1.08,
        duration: 0.9,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else {
      // Reset to neutral
      gsap.to(this.values, {
        cameraOffsetX: 0.0,
        cameraOffsetY: 0.0,
        cameraTilt: 0.0,
        choiceHoverBiasX: 0.0,
        choiceHoverBiasY: 0.0,
        cameraZoom: 1.04,
        duration: 0.8,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
  }

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
        onComplete?.();
      },
    });

    if (isShore) {
      // Shore: sweep leftward with warm sunlight
      tl.to(this.values, {
        cameraOffsetX: -0.15,
        cameraZoom: 1.2,
        distortionAmount: 0.4,
        chromaticAberration: 0.018,
        duration: 1.2,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.8,
          ease: 'power2.inOut',
        },
        '-=0.6'
      );
      tl.to(
        this.values,
        {
          cameraOffsetX: 0.0,
          cameraZoom: 1.0,
          distortionAmount: 0.02,
          chromaticAberration: 0.002,
          duration: 1.4,
          ease: 'power3.out',
        },
        '-=0.8'
      );
    } else {
      // Deep: sink downward into the darkness
      tl.to(this.values, {
        cameraOffsetY: -0.18,
        cameraZoom: 1.25,
        distortionAmount: 0.5,
        chromaticAberration: 0.022,
        duration: 1.2,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.8,
          ease: 'power2.inOut',
        },
        '-=0.6'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          distortionAmount: 0.03,
          chromaticAberration: 0.002,
          duration: 1.4,
          ease: 'power3.out',
        },
        '-=0.8'
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
  }

  public destroy(): void {
    if (this.ambientTween) {
      this.ambientTween.kill();
    }
  }
}
