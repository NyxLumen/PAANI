export class Clock {
  private startTime: number;
  private lastTime: number;
  private elapsed: number = 0;
  private delta: number = 0;
  private isPaused: boolean = false;

  constructor() {
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      this.isPaused = true;
    } else {
      this.isPaused = false;
      this.lastTime = performance.now();
    }
  };

  public tick(): number {
    const now = performance.now();
    if (this.isPaused) {
      this.lastTime = now;
      this.delta = 0;
      return 0;
    }

    // Delta in seconds, clamped to max 0.05s (20 FPS minimum step) to prevent physics jumps
    const rawDelta = (now - this.lastTime) / 1000;
    this.delta = Math.min(rawDelta, 0.05);
    this.elapsed += this.delta;
    this.lastTime = now;

    return this.delta;
  }

  public getDelta(): number {
    return this.delta;
  }

  public getElapsed(): number {
    return this.elapsed;
  }

  public destroy() {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }
}
