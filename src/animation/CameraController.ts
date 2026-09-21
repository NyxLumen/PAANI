import gsap from 'gsap';
import { TransitionRecipe } from '../types/story';
import { transitions } from '../data/storyGraph';
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
    chromaticAberration: 0.0012,
    transitionProgress: 0,
    transitionRecipe: 'none' as TransitionRecipe,
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
      y: 0.006,
      tilt: 0.002,
      duration: 4.5,
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
        transitionRecipe: this.values.transitionRecipe,
        choiceHoverBias: {
          x: this.values.choiceHoverBiasX,
          y: this.values.choiceHoverBiasY,
        },
      });
    });
  }

  /**
   * 1. SURFACE DIVE: OCEAN -> UNDERWATER
   * Primary: Dedicated AI transition footage (ocean_to_underwater.mp4)
   * Fallback: Procedural surface-dive shader recipe
   */
  public async executeDive(callbacks: {
    onSurfaceContact?: () => void;
    onSubmerged?: () => void;
    onComplete?: () => void;
  }): Promise<gsap.core.Timeline> {
    this.isDiving = true;
    this.values.ambientBobY = 0;
    this.values.ambientBobTilt = 0;

    const mediaMgr = this.renderer.getMediaManager();
    const config = transitions['ocean-to-underwater'];

    // Preload dedicated AI transition video
    let hasVideo = false;
    if (config?.videoSrc) {
      hasVideo = await mediaMgr.preloadTransitionVideo(config.videoSrc, config.maxWaitMs);
    }

    const revealStart = config?.revealStart ?? 0.65;
    const revealEnd = config?.revealEnd ?? 0.95;

    this.renderer.setState({
      environmentA: 'ocean',
      environmentB: 'underwater',
      transitionRecipe: 'surface-dive',
      transitionProgress: 0.0,
      revealStart,
      revealEnd,
    });
    this.values.transitionRecipe = 'surface-dive';
    this.values.transitionProgress = 0.0;

    // Warm up incoming underwater media
    mediaMgr.play('underwater');
    if (hasVideo) {
      mediaMgr.playTransition();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.isDiving = false;
        mediaMgr.clearTransition();
        this.renderer.setState({
          environmentA: 'underwater',
          environmentB: 'underwater',
          transitionRecipe: 'none',
          transitionProgress: 0.0,
        });
        this.values.transitionRecipe = 'none';
        this.values.transitionProgress = 0.0;
        this.values.distortionAmount = 0.0;
        this.values.chromaticAberration = 0.0012;
        callbacks.onComplete?.();
      },
    });

    if (hasVideo) {
      // -------------------------------------------------------------
      // DEDICATED AI FOOTAGE SEQUENCE (~4.2s)
      // Footage physically plunges through the surface with bubbles
      // WebGL adds only subtle optical enhancement and boundary easing
      // -------------------------------------------------------------
      // Subtle camera acceleration into water
      tl.to(this.values, {
        cameraZoom: 1.18,
        cameraOffsetY: -0.05,
        duration: 1.2,
        ease: 'power1.in',
      });

      // Surface contact optical cue
      tl.add(() => callbacks.onSurfaceContact?.(), 0.8);
      tl.add(() => callbacks.onSubmerged?.(), 1.8);

      // Transition progress driving AI video -> underwater reveal
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 3.8,
          ease: 'none',
        },
        0.0
      );

      // Subtle optical meniscus gleam and micro-refraction (restrained)
      tl.to(
        this.values,
        {
          distortionAmount: 0.12,
          chromaticAberration: 0.003,
          duration: 0.8,
          ease: 'sine.in',
        },
        0.4
      );
      tl.to(
        this.values,
        {
          distortionAmount: 0.0,
          chromaticAberration: 0.0012,
          duration: 1.2,
          ease: 'sine.out',
        },
        1.2
      );

      // Settle camera smoothly into underwater.mp4
      tl.to(
        this.values,
        {
          cameraZoom: 1.0,
          cameraOffsetY: 0.0,
          cameraTilt: 0.0,
          duration: 1.4,
          ease: 'power2.out',
        },
        2.6
      );
    } else {
      // -------------------------------------------------------------
      // PROCEDURAL FALLBACK RECIPE (100% shader)
      // -------------------------------------------------------------
      tl.to(
        this.values,
        {
          cameraZoom: 1.48,
          cameraOffsetY: -0.13,
          cameraTilt: -0.008,
          duration: 1.6,
          ease: 'power2.in',
        },
        0.1
      );

      tl.to(
        this.values,
        {
          distortionAmount: 0.35,
          chromaticAberration: 0.007,
          duration: 0.6,
          ease: 'power1.in',
          onComplete: () => callbacks.onSurfaceContact?.(),
        },
        1.3
      );

      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.5,
          ease: 'power2.inOut',
          onStart: () => callbacks.onSubmerged?.(),
        },
        1.5
      );

      tl.to(
        this.values,
        {
          cameraZoom: 1.0,
          cameraOffsetY: 0.0,
          cameraTilt: 0.0,
          distortionAmount: 0.0,
          chromaticAberration: 0.0012,
          duration: 1.1,
          ease: 'power3.out',
        },
        2.1
      );
    }

    return tl;
  }

  public setChoiceHover(direction: 'left' | 'down' | null): void {
    if (this.isTransitioning) return;

    if (direction === 'left') {
      // Shore hover: subtle camera pull left, slight warm coastal visual bias
      gsap.to(this.values, {
        cameraOffsetX: -0.04,
        cameraTilt: -0.006,
        choiceHoverBiasX: -1.0,
        choiceHoverBiasY: 0.0,
        cameraZoom: 1.04,
        duration: 0.8,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    } else if (direction === 'down') {
      // Descend hover: scene gently pulls downward, darker visual bias
      gsap.to(this.values, {
        cameraOffsetY: -0.045,
        cameraOffsetX: 0.0,
        cameraTilt: 0.005,
        choiceHoverBiasX: 0.0,
        choiceHoverBiasY: -1.0,
        cameraZoom: 1.05,
        duration: 0.8,
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
        cameraZoom: 1.02,
        duration: 0.7,
        ease: 'power2.out',
        overwrite: 'auto',
      });
    }
  }

  /**
   * 2. BRANCH TRANSITIONS:
   * Shore (~2.4s): Rising toward light & coastal water
   * Deep (~2.5s): Deep-descent into darkness
   */
  public executeBranchTransition(
    target: 'shore' | 'deep',
    onComplete?: () => void
  ): gsap.core.Timeline {
    this.isTransitioning = true;
    const isShore = target === 'shore';
    const transitionRecipe: TransitionRecipe = isShore ? 'surface-dive' : 'deep-descent';

    this.renderer.setState({
      environmentA: 'underwater',
      environmentB: target,
      transitionRecipe,
      transitionProgress: 0.0,
    });
    this.values.transitionRecipe = transitionRecipe;
    this.values.transitionProgress = 0.0;

    // Warm up destination video
    this.renderer.getMediaManager().play(target);

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        this.renderer.setState({
          environmentA: target,
          environmentB: target,
          transitionRecipe: 'none',
          transitionProgress: 0.0,
        });
        this.values.transitionRecipe = 'none';
        this.values.transitionProgress = 0.0;
        this.values.cameraOffsetX = 0.0;
        this.values.cameraOffsetY = 0.0;
        this.values.cameraZoom = 1.0;
        this.values.choiceHoverBiasX = 0.0;
        this.values.choiceHoverBiasY = 0.0;
        this.values.distortionAmount = 0.0;
        this.values.chromaticAberration = 0.0012;
        onComplete?.();
      },
    });

    if (isShore) {
      // Shore: Rising camera motion, gentle light bloom, coastal water reveal
      tl.to(this.values, {
        cameraOffsetY: 0.1,
        cameraOffsetX: -0.06,
        cameraZoom: 1.12,
        distortionAmount: 0.18,
        duration: 1.1,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.6,
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
          distortionAmount: 0.0,
          duration: 1.2,
          ease: 'power3.out',
        },
        '-=0.6'
      );
    } else {
      // Deep Descent: Gentle downward pull into abyss, darkness is the transition
      tl.to(this.values, {
        cameraOffsetY: -0.12,
        cameraZoom: 1.14,
        distortionAmount: 0.0,
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
          duration: 1.2,
          ease: 'power3.out',
        },
        '-=0.6'
      );
    }

    return tl;
  }

  /**
   * 3. EVAPORATION / ASCENT: SHORE -> CLOUD ASCENT
   * Primary: Dedicated AI transition footage (shore_to_sky.mp4)
   * Fallback: Procedural evaporation shader recipe
   */
  public async executeAscent(onComplete?: () => void): Promise<gsap.core.Timeline> {
    this.isTransitioning = true;
    const mediaMgr = this.renderer.getMediaManager();
    const config = transitions['shore-to-ascent'];

    let hasVideo = false;
    if (config?.videoSrc) {
      hasVideo = await mediaMgr.preloadTransitionVideo(config.videoSrc, config.maxWaitMs);
    }

    const revealStart = config?.revealStart ?? 0.60;
    const revealEnd = config?.revealEnd ?? 0.92;

    this.renderer.setState({
      environmentA: 'shore',
      environmentB: 'cloudAscent',
      transitionRecipe: 'evaporation',
      transitionProgress: 0.0,
      revealStart,
      revealEnd,
    });
    this.values.transitionRecipe = 'evaporation';
    this.values.transitionProgress = 0.0;

    mediaMgr.play('cloudAscent');
    if (hasVideo) {
      mediaMgr.playTransition();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        mediaMgr.clearTransition();
        this.renderer.setState({
          environmentA: 'cloudAscent',
          environmentB: 'cloudAscent',
          transitionRecipe: 'none',
          transitionProgress: 0.0,
        });
        this.values.transitionRecipe = 'none';
        this.values.transitionProgress = 0.0;
        this.values.cameraOffsetY = 0.0;
        this.values.cameraZoom = 1.0;
        onComplete?.();
      },
    });

    if (hasVideo) {
      // -------------------------------------------------------------
      // DEDICATED AI FOOTAGE (shore_to_sky.mp4)
      // Camera tilts upward from dunes into brilliant sun & atmospheric sky
      // -------------------------------------------------------------
      tl.to(this.values, {
        cameraOffsetY: 0.04,
        cameraZoom: 1.05,
        duration: 1.2,
        ease: 'power1.in',
      });

      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 3.8,
          ease: 'none',
        },
        0.0
      );

      // Settle camera into cloud-ascent.mp4
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          duration: 1.4,
          ease: 'power2.out',
        },
        2.4
      );
    } else {
      // Upward camera momentum through rising vapor (fallback)
      tl.to(this.values, {
        cameraOffsetY: 0.07,
        cameraZoom: 1.08,
        duration: 1.1,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.6,
          ease: 'power2.inOut',
        },
        '-=0.4'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          duration: 1.2,
          ease: 'power3.out',
        },
        '-=0.6'
      );
    }

    return tl;
  }

  /**
   * 4. ATMOSPHERIC: CLOUD ASCENT -> CLOUDS (~1.8s)
   * Soft cloud density crossfade through atmospheric haze, almost invisible
   */
  public executeClouds(onComplete?: () => void): gsap.core.Timeline {
    this.isTransitioning = true;
    this.renderer.setState({
      environmentA: 'cloudAscent',
      environmentB: 'clouds',
      transitionRecipe: 'atmospheric',
      transitionProgress: 0.0,
    });
    this.values.transitionRecipe = 'atmospheric';
    this.values.transitionProgress = 0.0;
    this.renderer.getMediaManager().play('clouds');

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        this.renderer.setState({
          environmentA: 'clouds',
          environmentB: 'clouds',
          transitionRecipe: 'none',
          transitionProgress: 0.0,
        });
        this.values.transitionRecipe = 'none';
        this.values.transitionProgress = 0.0;
        this.values.cameraOffsetY = 0.0;
        this.values.cameraZoom = 1.0;
        onComplete?.();
      },
    });

    // Soft atmospheric glide
    tl.to(this.values, {
      cameraZoom: 1.06,
      duration: 0.8,
      ease: 'sine.in',
    });
    tl.to(
      this.values,
      {
        transitionProgress: 1.0,
        duration: 1.4,
        ease: 'sine.inOut',
      },
      '-=0.3'
    );
    tl.to(
      this.values,
      {
        cameraZoom: 1.0,
        duration: 1.0,
        ease: 'sine.out',
      },
      '-=0.5'
    );

    return tl;
  }

  /**
   * 5. RAINFALL: CLOUDS -> RAIN
   * Primary: Dedicated AI transition footage (cloud_to_rain.mp4)
   * Fallback: Procedural rainfall shader recipe
   */
  public async executeRain(onComplete?: () => void): Promise<gsap.core.Timeline> {
    this.isTransitioning = true;
    const mediaMgr = this.renderer.getMediaManager();
    const config = transitions['clouds-to-rain'];

    let hasVideo = false;
    if (config?.videoSrc) {
      hasVideo = await mediaMgr.preloadTransitionVideo(config.videoSrc, config.maxWaitMs);
    }

    const revealStart = config?.revealStart ?? 0.62;
    const revealEnd = config?.revealEnd ?? 0.94;

    this.renderer.setState({
      environmentA: 'clouds',
      environmentB: 'rain',
      transitionRecipe: 'rainfall',
      transitionProgress: 0.0,
      revealStart,
      revealEnd,
    });
    this.values.transitionRecipe = 'rainfall';
    this.values.transitionProgress = 0.0;

    mediaMgr.play('rain');
    if (hasVideo) {
      mediaMgr.playTransition();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        mediaMgr.clearTransition();
        this.renderer.setState({
          environmentA: 'rain',
          environmentB: 'rain',
          transitionRecipe: 'none',
          transitionProgress: 0.0,
        });
        this.values.transitionRecipe = 'none';
        this.values.transitionProgress = 0.0;
        this.values.cameraOffsetY = 0.0;
        this.values.cameraZoom = 1.0;
        onComplete?.();
      },
    });

    if (hasVideo) {
      // -------------------------------------------------------------
      // DEDICATED AI FOOTAGE (cloud_to_rain.mp4)
      // Clouds condense into rain droplets and rainfall veil
      // -------------------------------------------------------------
      tl.to(this.values, {
        cameraOffsetY: -0.05,
        cameraZoom: 1.06,
        duration: 1.2,
        ease: 'power1.in',
      });

      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 3.8,
          ease: 'none',
        },
        0.0
      );

      // Settle camera into rain.mp4
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          duration: 1.4,
          ease: 'power2.out',
        },
        2.4
      );
    } else {
      // Downward momentum into rainfall (fallback)
      tl.to(this.values, {
        cameraOffsetY: -0.12,
        cameraZoom: 1.12,
        duration: 1.0,
        ease: 'power2.in',
      });
      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 1.5,
          ease: 'power2.inOut',
        },
        '-=0.4'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          duration: 1.1,
          ease: 'power3.out',
        },
        '-=0.5'
      );
    }

    return tl;
  }

  /**
   * 6. OCEAN RETURN: RAIN -> OCEAN (~3.0s)
   * Descending perspective, rain accelerates, ocean surface emerges below,
   * camera touches down and settles EXACTLY at canonical ocean opening framing!
   */
  /**
   * 6. OCEAN RETURN: RAIN -> OCEAN
   * Primary: Dedicated AI transition footage (rain_to_ocean.mp4)
   * Fallback: Procedural ocean-return shader recipe
   */
  public async executeRainToOcean(onComplete?: () => void): Promise<gsap.core.Timeline> {
    this.isTransitioning = true;
    const mediaMgr = this.renderer.getMediaManager();
    const config = transitions['rain-to-ocean'];

    let hasVideo = false;
    if (config?.videoSrc) {
      hasVideo = await mediaMgr.preloadTransitionVideo(config.videoSrc, config.maxWaitMs);
    }

    const revealStart = config?.revealStart ?? 0.52;
    const revealEnd = config?.revealEnd ?? 0.90;

    this.renderer.setState({
      environmentA: 'rain',
      environmentB: 'ocean',
      transitionRecipe: 'ocean-return',
      transitionProgress: 0.0,
      revealStart,
      revealEnd,
    });
    this.values.transitionRecipe = 'ocean-return';
    this.values.transitionProgress = 0.0;

    mediaMgr.play('ocean');
    if (hasVideo) {
      mediaMgr.playTransition();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        mediaMgr.clearTransition();
        this.resetToOcean();
        onComplete?.();
      },
    });

    if (hasVideo) {
      // -------------------------------------------------------------
      // DEDICATED AI FOOTAGE (rain_to_ocean.mp4)
      // Downpour accelerates toward sea surface, whitecaps splash,
      // camera touches water and settles into canonical ocean swell
      // -------------------------------------------------------------
      tl.to(this.values, {
        cameraOffsetY: -0.04,
        cameraZoom: 1.05,
        duration: 1.2,
        ease: 'power1.in',
      });

      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 3.8,
          ease: 'none',
        },
        0.0
      );

      // Settle gently to exact canonical ocean framing (zoom 1.0, offset 0.0, tilt 0.0)
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          cameraTilt: 0.0,
          duration: 1.4,
          ease: 'power2.out',
        },
        2.4
      );
    } else {
      // Descending toward ocean surface (procedural fallback)
      tl.to(this.values, {
        cameraOffsetY: -0.08,
        cameraZoom: 1.15,
        distortionAmount: 0.15,
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
        '-=0.5'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          distortionAmount: 0.0,
          duration: 1.3,
          ease: 'power3.out',
        },
        '-=0.6'
      );
    }

    return tl;
  }

  /**
   * 7. DEEP RETURN: DEEP -> OCEAN
   * Primary: Dedicated AI transition footage (deep_to_ocean.mp4)
   * Fallback: Procedural deep-return shader recipe
   */
  public async executeDeepToOcean(onComplete?: () => void): Promise<gsap.core.Timeline> {
    this.isTransitioning = true;
    const mediaMgr = this.renderer.getMediaManager();
    const config = transitions['deep-to-ocean'];

    let hasVideo = false;
    if (config?.videoSrc) {
      hasVideo = await mediaMgr.preloadTransitionVideo(config.videoSrc, config.maxWaitMs);
    }

    const revealStart = config?.revealStart ?? 0.55;
    const revealEnd = config?.revealEnd ?? 0.92;

    this.renderer.setState({
      environmentA: 'deep',
      environmentB: 'ocean',
      transitionRecipe: 'deep-return',
      transitionProgress: 0.0,
      revealStart,
      revealEnd,
    });
    this.values.transitionRecipe = 'deep-return';
    this.values.transitionProgress = 0.0;

    mediaMgr.play('ocean');
    if (hasVideo) {
      mediaMgr.playTransition();
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.isTransitioning = false;
        mediaMgr.clearTransition();
        this.resetToOcean();
        onComplete?.();
      },
    });

    if (hasVideo) {
      // -------------------------------------------------------------
      // DEDICATED AI FOOTAGE (deep_to_ocean.mp4)
      // Camera ascends from abyssal marine snow through upward bubbles
      // and sunbeams, breaking through to the canonical ocean surface
      // -------------------------------------------------------------
      tl.to(this.values, {
        cameraOffsetY: 0.04,
        cameraZoom: 1.05,
        duration: 1.2,
        ease: 'power1.in',
      });

      tl.to(
        this.values,
        {
          transitionProgress: 1.0,
          duration: 3.8,
          ease: 'none',
        },
        0.0
      );

      // Settle camera into exact canonical ocean horizon
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          cameraTilt: 0.0,
          duration: 1.4,
          ease: 'power2.out',
        },
        2.4
      );
    } else {
      // Upward surge from abyss to ocean (procedural fallback)
      tl.to(this.values, {
        cameraOffsetY: 0.08,
        cameraZoom: 1.12,
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
        '-=0.5'
      );
      tl.to(
        this.values,
        {
          cameraOffsetY: 0.0,
          cameraZoom: 1.0,
          duration: 1.3,
          ease: 'power3.out',
        },
        '-=0.6'
      );
    }

    return tl;
  }

  public resetToOcean(): void {
    this.renderer.setState({
      environmentA: 'ocean',
      environmentB: 'underwater',
      transitionProgress: 0.0,
      revealStart: 0.65,
      revealEnd: 0.95,
      transitionRecipe: 'none',
      choiceHoverBias: { x: 0, y: 0 },
      distortionAmount: 0.0,
      chromaticAberration: 0.0012,
      cameraOffset: { x: 0, y: 0 },
      cameraZoom: 1.0,
      cameraTilt: 0,
    });
    this.values.cameraOffsetX = 0;
    this.values.cameraOffsetY = 0;
    this.values.cameraZoom = 1.0;
    this.values.cameraTilt = 0;
    this.values.distortionAmount = 0;
    this.values.chromaticAberration = 0.0012;
    this.values.transitionProgress = 0;
    this.values.transitionRecipe = 'none';
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
