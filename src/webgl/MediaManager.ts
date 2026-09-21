import { EnvironmentAsset, EnvironmentId } from '../types/story';
import { AudioManager } from '../audio/AudioManager';

export interface MediaSlot {
  id: EnvironmentId;
  type: 'video' | 'image' | 'pending';
  videoElement: HTMLVideoElement | null;
  imageElement: HTMLImageElement | null;
  texture: WebGLTexture;
  aspectRatio: number;
  isReady: boolean;
  needsUpload: boolean;
  lastVideoTime: number;
}

export class MediaManager {
  private gl: WebGLRenderingContext;
  private slots: Map<EnvironmentId, MediaSlot> = new Map();
  private default1x1Texture: WebGLTexture;
  private loopVeilMap: Map<EnvironmentId, number> = new Map();

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    
    // Create a 1x1 default dark ocean blue fallback texture
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([8, 20, 36, 255])
    );
    this.default1x1Texture = tex;

    // Bind unlock for video autoplay across browsers
    this.bindUnlockGesture();
  }

  private bindUnlockGesture(): void {
    const unlock = () => {
      for (const slot of this.slots.values()) {
        if (slot.videoElement && slot.videoElement.paused) {
          slot.videoElement.play().catch(() => {});
        }
      }
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  public register(id: EnvironmentId, asset: EnvironmentAsset): void {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Initial 1x1 placeholder pixel
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([8, 20, 36, 255])
    );

    const slot: MediaSlot = {
      id,
      type: 'pending',
      videoElement: null,
      imageElement: null,
      texture,
      aspectRatio: 16 / 9,
      isReady: false,
      needsUpload: false,
      lastVideoTime: -1,
    };

    this.slots.set(id, slot);
    this.loadMedia(slot, asset);
  }

  private loadMedia(slot: MediaSlot, asset: EnvironmentAsset): void {
    let videoResolved = false;

    // Step 1: Attempt Video
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    const fallbackToImage = () => {
      if (videoResolved) return;
      videoResolved = true;

      // Clean up video attempts
      video.pause();
      video.removeAttribute('src');
      video.load();

      // Load Image fallback
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        slot.type = 'image';
        slot.imageElement = img;
        slot.aspectRatio = img.naturalWidth / img.naturalHeight || (16 / 9);
        slot.isReady = true;
        this.uploadImageToTexture(slot);
      };
      img.onerror = () => {
        console.warn(`[PĀNI Media] Image fallback failed for: ${asset.image}`);
      };
      img.src = asset.image;
    };

    // Video success handler
    const onVideoReady = () => {
      if (videoResolved) return;
      videoResolved = true;

      slot.type = 'video';
      slot.videoElement = video;
      slot.aspectRatio = (video.videoWidth && video.videoHeight)
        ? (video.videoWidth / video.videoHeight)
        : (16 / 9);
      slot.isReady = true;

      video.play().catch(() => {
        // Autoplay may wait for user gesture; handled by bindUnlockGesture
      });
    };

    video.addEventListener('canplay', onVideoReady, { once: true });
    video.addEventListener('loadeddata', onVideoReady, { once: true });
    video.addEventListener('error', fallbackToImage, { once: true });

    // Fallback if video takes too long or fails to load
    const timeoutId = window.setTimeout(() => {
      if (!videoResolved && video.readyState < 2) {
        fallbackToImage();
      }
    }, 2500);

    const clearTimer = () => window.clearTimeout(timeoutId);
    video.addEventListener('canplay', clearTimer, { once: true });
    video.addEventListener('error', clearTimer, { once: true });

    // Handle later playback errors gracefully
    video.addEventListener('error', () => {
      if (slot.type === 'video') {
        fallbackToImage();
      }
    });

    video.src = asset.video;
    video.load();
  }

  private uploadImageToTexture(slot: MediaSlot): void {
    if (!slot.imageElement) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, slot.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      slot.imageElement
    );
  }

  public updateFrame(id: EnvironmentId): void {
    const slot = this.slots.get(id);
    if (!slot || !slot.isReady) return;

    if (slot.type === 'video' && slot.videoElement && slot.videoElement.readyState >= 2) {
      const vid = slot.videoElement;
      // Ensure video is playing
      if (vid.paused) {
        vid.play().catch(() => {});
      }

      // Loop-bridging calculation (seamless softening around wrap point)
      if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 1.0) {
        const d = vid.duration;
        const t = vid.currentTime;
        let veil = 0.0;
        const preWindow = 0.45;  // 450ms before end: begin softening
        const postWindow = 0.35; // 350ms after restart: restore sharpness

        if (t >= d - preWindow) {
          const frac = (t - (d - preWindow)) / preWindow;
          veil = Math.sin(frac * Math.PI * 0.5);
        } else if (t <= postWindow) {
          const frac = t / postWindow;
          veil = 1.0 - Math.sin(frac * Math.PI * 0.5);
        }
        veil = Math.max(0.0, Math.min(1.0, veil));
        this.loopVeilMap.set(id, veil);

        // Smooth loop audio to eliminate clicks or pops
        AudioManager.getInstance().smoothLoopAudio(vid, veil);
      }

      // Avoid redundant texture uploads when frame hasn't advanced
      if (vid.currentTime === slot.lastVideoTime) return;
      slot.lastVideoTime = vid.currentTime;

      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        vid
      );
    }
  }

  public getLoopVeil(id: EnvironmentId): number {
    return this.loopVeilMap.get(id) ?? 0.0;
  }

  public getVideoElement(id: EnvironmentId): HTMLVideoElement | null {
    return this.slots.get(id)?.videoElement ?? null;
  }

  public play(id: EnvironmentId): void {
    const slot = this.slots.get(id);
    if (slot?.videoElement && slot.videoElement.paused) {
      slot.videoElement.play().catch(() => {});
    }
    AudioManager.getInstance().crossfadeToScene(id, slot?.videoElement ?? null);
  }

  public getSlot(id: EnvironmentId): MediaSlot | undefined {
    return this.slots.get(id);
  }

  public getTexture(id: EnvironmentId): WebGLTexture {
    return this.slots.get(id)?.texture ?? this.default1x1Texture;
  }

  public getAspectRatio(id: EnvironmentId): number {
    return this.slots.get(id)?.aspectRatio ?? (16 / 9);
  }

  // --- Transition Video Management ---
  private transitionSlot: {
    videoElement: HTMLVideoElement | null;
    texture: WebGLTexture;
    aspectRatio: number;
    isReady: boolean;
    lastVideoTime: number;
  } | null = null;

  public async preloadTransitionVideo(src: string, maxWaitMs: number = 1500): Promise<boolean> {
    // Teardown any existing transition video
    this.clearTransition();

    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([8, 20, 36, 255])
    );

    const video = document.createElement('video');
    video.muted = true;
    video.loop = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    this.transitionSlot = {
      videoElement: video,
      texture: tex,
      aspectRatio: 16 / 9,
      isReady: false,
      lastVideoTime: -1,
    };

    return new Promise<boolean>((resolve) => {
      let resolved = false;
      const onDone = (success: boolean) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
        if (success && this.transitionSlot) {
          this.transitionSlot.isReady = true;
          this.transitionSlot.aspectRatio =
            video.videoWidth && video.videoHeight
              ? video.videoWidth / video.videoHeight
              : 16 / 9;
          resolve(true);
        } else {
          this.clearTransition();
          resolve(false);
        }
      };

      const handleCanPlay = () => onDone(true);
      const handleError = () => onDone(false);

      const timer = setTimeout(() => {
        if (video.readyState >= 2) {
          onDone(true);
        } else {
          console.warn(`[PĀNI Transition] Timeout preloading ${src}, falling back.`);
          onDone(false);
        }
      }, maxWaitMs);

      video.addEventListener('canplay', handleCanPlay, { once: true });
      video.addEventListener('error', handleError, { once: true });
      video.src = src;
      video.load();
    });
  }

  public playTransition(): void {
    if (this.transitionSlot?.videoElement) {
      this.transitionSlot.videoElement.currentTime = 0;
      this.transitionSlot.videoElement.play().catch(() => {});
      AudioManager.getInstance().playTransitionAudio(this.transitionSlot.videoElement);
    }
  }

  public hasActiveTransition(): boolean {
    return !!(this.transitionSlot && this.transitionSlot.isReady);
  }

  public getTransitionTexture(): WebGLTexture {
    return this.transitionSlot?.texture ?? this.default1x1Texture;
  }

  public getTransitionAspectRatio(): number {
    return this.transitionSlot?.aspectRatio ?? (16 / 9);
  }

  public updateTransitionFrame(): void {
    const slot = this.transitionSlot;
    if (!slot || !slot.isReady || !slot.videoElement) return;
    const vid = slot.videoElement;

    if (vid.readyState >= 2) {
      if (vid.currentTime === slot.lastVideoTime) return;
      slot.lastVideoTime = vid.currentTime;

      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        vid
      );
    }
  }

  public clearTransition(): void {
    if (this.transitionSlot) {
      if (this.transitionSlot.videoElement) {
        this.transitionSlot.videoElement.pause();
        this.transitionSlot.videoElement.removeAttribute('src');
        this.transitionSlot.videoElement.load();
        this.transitionSlot.videoElement = null;
      }
      const texToDelete = this.transitionSlot.texture;
      this.transitionSlot = null;
      // Delay GL texture deletion by one tick to ensure in-flight render calls never bind a deleted texture
      setTimeout(() => {
        this.gl.deleteTexture(texToDelete);
      }, 50);
    }
  }

  public destroy(): void {
    this.clearTransition();
    for (const slot of this.slots.values()) {
      if (slot.videoElement) {
        slot.videoElement.pause();
        slot.videoElement.removeAttribute('src');
        slot.videoElement.load();
      }
      this.gl.deleteTexture(slot.texture);
    }
    this.gl.deleteTexture(this.default1x1Texture);
    this.slots.clear();
  }
}
