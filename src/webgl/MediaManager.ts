import { EnvironmentAsset, EnvironmentId } from '../types/story';

export interface MediaSlot {
  id: EnvironmentId;
  type: 'video' | 'image' | 'pending';
  videoElement: HTMLVideoElement | null;
  imageElement: HTMLImageElement | null;
  texture: WebGLTexture;
  aspectRatio: number;
  isReady: boolean;
  needsUpload: boolean;
}

export class MediaManager {
  private gl: WebGLRenderingContext;
  private slots: Map<EnvironmentId, MediaSlot> = new Map();
  private default1x1Texture: WebGLTexture;

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
      new Uint8Array([10, 24, 40, 255])
    );
    this.default1x1Texture = tex;
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
      new Uint8Array([12, 28, 48, 255])
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
    video.crossOrigin = 'anonymous';

    const fallbackToImage = () => {
      if (videoResolved) return;
      videoResolved = true;

      // Clean up video attempts
      video.pause();
      video.removeAttribute('src');
      video.load();

      // Load Image
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
        console.warn(`[PĀNI Media] Image fallback also failed for: ${asset.image}`);
      };
      img.src = asset.image;
    };

    // Video success handlers
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
        // Autoplay policy might catch, still try to render
      });
    };

    video.addEventListener('canplay', onVideoReady, { once: true });
    video.addEventListener('error', fallbackToImage, { once: true });

    // In case video stalls or does not exist, trigger fallback after 1.5s timeout
    const timeoutId = window.setTimeout(() => {
      if (!videoResolved && video.readyState < 2) {
        fallbackToImage();
      }
    }, 1500);

    const clearTimer = () => window.clearTimeout(timeoutId);
    video.addEventListener('canplay', clearTimer, { once: true });
    video.addEventListener('error', clearTimer, { once: true });

    // Watch for later playback failure
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
    gl.generateMipmap?.(gl.TEXTURE_2D);
  }

  public updateFrame(id: EnvironmentId): void {
    const slot = this.slots.get(id);
    if (!slot || !slot.isReady) return;

    if (slot.type === 'video' && slot.videoElement && slot.videoElement.readyState >= 2) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, slot.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        slot.videoElement
      );
    }
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

  public destroy(): void {
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
