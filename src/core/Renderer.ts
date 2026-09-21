import * as THREE from 'three';
import { QualityManager } from './QualityManager';

export class Renderer {
  public instance: THREE.WebGLRenderer;
  private canvas: HTMLCanvasElement;
  private qualityManager: QualityManager;
  private resizeObserver: ResizeObserver | null = null;
  private unsubscribeQuality: (() => void) | null = null;

  public width: number = window.innerWidth;
  public height: number = window.innerHeight;

  constructor(canvas: HTMLCanvasElement, qualityManager: QualityManager) {
    this.canvas = canvas;
    this.qualityManager = qualityManager;

    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.05;
    this.instance.outputColorSpace = THREE.SRGBColorSpace;

    this.updateSize();
    this.setupResize();

    this.unsubscribeQuality = this.qualityManager.subscribe((settings) => {
      const dpr = Math.min(window.devicePixelRatio || 1, settings.pixelRatio);
      this.instance.setPixelRatio(dpr);
    });
  }

  private updateSize() {
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
    this.width = rect && rect.width > 0 ? rect.width : window.innerWidth;
    this.height = rect && rect.height > 0 ? rect.height : window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, this.qualityManager.getSettings().pixelRatio);
    this.instance.setPixelRatio(dpr);
    this.instance.setSize(this.width, this.height, false);
  }

  private setupResize() {
    const parent = this.canvas.parentElement || document.body;
    this.resizeObserver = new ResizeObserver(() => {
      this.updateSize();
    });
    this.resizeObserver.observe(parent);

    window.addEventListener('resize', this.handleWindowResize);
  }

  private handleWindowResize = () => {
    this.updateSize();
  };

  public render(scene: THREE.Scene, camera: THREE.Camera) {
    this.instance.render(scene, camera);
  }

  public getStats() {
    return {
      drawCalls: this.instance.info.render.calls,
      triangles: this.instance.info.render.triangles,
      points: this.instance.info.render.points,
      lines: this.instance.info.render.lines,
      geometries: this.instance.info.memory.geometries,
      textures: this.instance.info.memory.textures,
    };
  }

  public destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.handleWindowResize);
    if (this.unsubscribeQuality) {
      this.unsubscribeQuality();
      this.unsubscribeQuality = null;
    }
    this.instance.dispose();
  }
}
