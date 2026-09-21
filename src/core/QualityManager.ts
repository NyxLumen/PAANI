export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface QualitySettings {
  tier: QualityTier;
  pixelRatio: number;
  oceanSubdivisions: number;
  underwaterParticles: number;
  enableBloom: boolean;
  causticResolution: number;
}

const SETTINGS_MAP: Record<QualityTier, QualitySettings> = {
  HIGH: {
    tier: 'HIGH',
    pixelRatio: 1.5,
    oceanSubdivisions: 128,
    underwaterParticles: 1000,
    enableBloom: true,
    causticResolution: 512,
  },
  MEDIUM: {
    tier: 'MEDIUM',
    pixelRatio: 1.25,
    oceanSubdivisions: 96,
    underwaterParticles: 500,
    enableBloom: true,
    causticResolution: 256,
  },
  LOW: {
    tier: 'LOW',
    pixelRatio: 1.0,
    oceanSubdivisions: 64,
    underwaterParticles: 250,
    enableBloom: false,
    causticResolution: 128,
  },
};

export class QualityManager {
  private currentTier: QualityTier = 'HIGH';
  private frameTimes: number[] = [];
  private readonly bufferSize = 60;
  private sustainedBadFrames = 0;
  private sustainedGoodFrames = 0;
  private listeners: ((settings: QualitySettings) => void)[] = [];

  // Performance telemetry
  public fps: number = 60;
  public frameTimeMs: number = 16.6;

  constructor(initialTier: QualityTier = 'HIGH') {
    this.currentTier = initialTier;
  }

  public getSettings(): QualitySettings {
    return SETTINGS_MAP[this.currentTier];
  }

  public getTier(): QualityTier {
    return this.currentTier;
  }

  public setTier(tier: QualityTier) {
    if (this.currentTier !== tier) {
      this.currentTier = tier;
      this.notifyListeners();
    }
  }

  public subscribe(listener: (settings: QualitySettings) => void): () => void {
    this.listeners.push(listener);
    listener(this.getSettings());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners() {
    const settings = this.getSettings();
    for (const listener of this.listeners) {
      listener(settings);
    }
  }

  /**
   * Called every frame with the frame duration in milliseconds.
   * Uses hysteresis to prevent quality thrashing.
   */
  public reportFrameTime(ms: number) {
    this.frameTimes.push(ms);
    if (this.frameTimes.length > this.bufferSize) {
      this.frameTimes.shift();
    }

    const avgMs = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimeMs = avgMs;
    this.fps = avgMs > 0 ? Math.round(1000 / avgMs) : 60;

    // Hysteresis threshold checking:
    // Drop tier if average frame time > 22ms for ~2.5s (150 frames)
    if (avgMs > 22) {
      this.sustainedBadFrames++;
      this.sustainedGoodFrames = 0;
      if (this.sustainedBadFrames > 120) {
        if (this.currentTier === 'HIGH') {
          this.setTier('MEDIUM');
        } else if (this.currentTier === 'MEDIUM') {
          this.setTier('LOW');
        }
        this.sustainedBadFrames = 0;
      }
    } else if (avgMs < 15) {
      // Upgrade tier only if frame time is super clean (<15ms) for >8s (480 frames)
      this.sustainedGoodFrames++;
      this.sustainedBadFrames = 0;
      if (this.sustainedGoodFrames > 480) {
        if (this.currentTier === 'LOW') {
          this.setTier('MEDIUM');
        } else if (this.currentTier === 'MEDIUM') {
          this.setTier('HIGH');
        }
        this.sustainedGoodFrames = 0;
      }
    } else {
      this.sustainedBadFrames = Math.max(0, this.sustainedBadFrames - 1);
      this.sustainedGoodFrames = Math.max(0, this.sustainedGoodFrames - 1);
    }
  }
}
