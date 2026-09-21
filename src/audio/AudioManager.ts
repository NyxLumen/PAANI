import gsap from 'gsap';
import { EnvironmentId } from '../types/story';

export class AudioManager {
  private static instance: AudioManager | null = null;

  private isUnlocked: boolean = false;
  private activeVideo: HTMLVideoElement | null = null;
  private outgoingVideo: HTMLVideoElement | null = null;
  private activeTransitionVideo: HTMLVideoElement | null = null;

  // Calibrated ambient sound levels per environment (avoiding loud raw blasts)
  private readonly volumeLevels: Record<string, number> = {
    ocean: 0.38,
    underwater: 0.32,
    shore: 0.40,
    deep: 0.28,
    cloudAscent: 0.32,
    clouds: 0.30,
    rain: 0.42,
    default: 0.35,
  };

  private currentSceneId: string = 'ocean';

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  /**
   * Called on the user's first interactive gesture (e.g. START click).
   * Unlocks browser audio restrictions and smoothly fades in ambient sound.
   */
  public unlock(activeVideoElement?: HTMLVideoElement | null): void {
    if (this.isUnlocked) return;
    this.isUnlocked = true;

    if (activeVideoElement) {
      this.activeVideo = activeVideoElement;
    }

    if (this.activeVideo) {
      this.activeVideo.muted = false;
      this.activeVideo.volume = 0;
      const targetVol = this.getTargetVolume(this.currentSceneId);
      gsap.to(this.activeVideo, {
        volume: targetVol,
        duration: 1.2,
        ease: 'power2.out',
      });
    }
  }

  public getUnlocked(): boolean {
    return this.isUnlocked;
  }

  public getTargetVolume(sceneId: string): number {
    return this.volumeLevels[sceneId] ?? this.volumeLevels.default;
  }

  /**
   * Smoothly crossfades audio from current scene to incoming scene.
   */
  public crossfadeToScene(
    sceneId: EnvironmentId,
    newVideo: HTMLVideoElement | null,
    durationMs: number = 1000
  ): void {
    this.currentSceneId = sceneId;
    const targetVol = this.getTargetVolume(sceneId);
    const duration = durationMs / 1000;

    const oldVideo = this.activeTransitionVideo || this.activeVideo;
    this.outgoingVideo = oldVideo;
    this.activeTransitionVideo = null;
    this.activeVideo = newVideo;

    // Fade out previous audio
    if (oldVideo && oldVideo !== newVideo) {
      gsap.killTweensOf(oldVideo);
      gsap.to(oldVideo, {
        volume: 0,
        duration: duration * 0.9,
        ease: 'power2.in',
        onComplete: () => {
          if (this.outgoingVideo === oldVideo) {
            this.outgoingVideo = null;
          }
        },
      });
    }

    // Fade in incoming audio
    if (newVideo) {
      gsap.killTweensOf(newVideo);
      if (this.isUnlocked) {
        newVideo.muted = false;
        newVideo.volume = 0;
        gsap.to(newVideo, {
          volume: targetVol,
          duration: duration,
          ease: 'power2.out',
        });
      } else {
        newVideo.muted = true;
        newVideo.volume = 0;
      }
    }
  }

  /**
   * Crossfades audio into dedicated transition footage.
   */
  public playTransitionAudio(
    transitionVideo: HTMLVideoElement | null,
    durationMs: number = 800
  ): void {
    const duration = durationMs / 1000;
    const oldVideo = this.activeVideo;
    this.outgoingVideo = oldVideo;
    this.activeTransitionVideo = transitionVideo;

    // Fade down current environment
    if (oldVideo && oldVideo !== transitionVideo) {
      gsap.killTweensOf(oldVideo);
      gsap.to(oldVideo, {
        volume: 0,
        duration: duration,
        ease: 'power2.in',
      });
    }

    // Fade in transition video audio
    if (transitionVideo) {
      gsap.killTweensOf(transitionVideo);
      if (this.isUnlocked) {
        transitionVideo.muted = false;
        transitionVideo.volume = 0;
        gsap.to(transitionVideo, {
          volume: this.volumeLevels.default,
          duration: duration * 0.8,
          ease: 'power2.out',
        });
      } else {
        transitionVideo.muted = true;
      }
    }
  }

  /**
   * Loop seam audio smoothing: softens volume momentarily at the wrap point
   * to eliminate audible pops, clicks, or clicks from the media stream restarting.
   */
  public smoothLoopAudio(video: HTMLVideoElement, veil: number): void {
    if (!this.isUnlocked || video.muted) return;
    const baseVol = this.getTargetVolume(this.currentSceneId);
    // Slight dip at loop peak (reduces volume by at most 25% during the 300ms seam)
    const softenedVol = baseVol * (1.0 - veil * 0.25);
    video.volume = Math.max(0, Math.min(1, softenedVol));
  }

  public registerVideoElement(video: HTMLVideoElement): void {
    if (this.isUnlocked) {
      video.muted = false;
    } else {
      video.muted = true;
    }
  }
}
