import * as THREE from 'three';
import { QualityManager } from './QualityManager';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

const CinematicGradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrainIntensity: { value: 0.024 },
    uVignetteDarkness: { value: 0.55 },
    uVignetteOffset: { value: 1.15 },
    uAberration: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrainIntensity;
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uAberration;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 dir = uv - 0.5;
      float dist = length(dir);

      // 1. Subtle radial chromatic aberration
      float r = texture2D(tDiffuse, uv - dir * (dist * uAberration)).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv + dir * (dist * uAberration)).b;
      vec3 color = vec3(r, g, b);

      // 2. High-frequency analog film grain to eliminate digital color banding
      float grain = (hash(uv * 120.0 + fract(uTime * 17.13)) - 0.5) * uGrainIntensity;
      color += grain;

      // 3. Cinematic natural optical vignette
      float vignette = smoothstep(uVignetteOffset, uVignetteOffset - 0.45, dist);
      color = mix(color * (1.0 - uVignetteDarkness), color, vignette);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export class Renderer {
  public instance: THREE.WebGLRenderer;
  public composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private cinematicPass: ShaderPass;
  private fxaaPass: ShaderPass;

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
      antialias: false, // FXAA pass handles antialiasing in composer
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });

    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.08;
    this.instance.outputColorSpace = THREE.SRGBColorSpace;

    // Enable soft PCF shadows for tree canopy & hero leaf contact
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFShadowMap;

    // Setup EffectComposer Pipeline
    this.composer = new EffectComposer(this.instance);
    const dummyScene = new THREE.Scene();
    const dummyCamera = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(dummyScene, dummyCamera);
    this.composer.addPass(this.renderPass);

    // Unreal Bloom: high threshold so only brilliant specular highlights glint
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.width, this.height),
      0.22, // strength
      0.20, // radius
      0.90  // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Custom Cinematic Grading Pass (film grain, vignette, chromatic aberration)
    this.cinematicPass = new ShaderPass(CinematicGradingShader);
    this.composer.addPass(this.cinematicPass);

    // FXAA Antialiasing pass (final pass rendered to screen)
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    this.updateSize();
    this.setupResize();

    this.unsubscribeQuality = this.qualityManager.subscribe((settings) => {
      const dpr = Math.min(window.devicePixelRatio || 1, settings.pixelRatio);
      this.instance.setPixelRatio(dpr);
      this.composer.setPixelRatio(dpr);
      this.bloomPass.enabled = settings.enableBloom;
      this.cinematicPass.enabled = settings.enablePostProcessing;
      this.fxaaPass.enabled = settings.enablePostProcessing;
      this.instance.shadowMap.enabled = settings.shadowMapSize > 0;
    });
  }

  private updateSize() {
    const rect = this.canvas.parentElement ? this.canvas.parentElement.getBoundingClientRect() : null;
    this.width = rect && rect.width > 0 ? rect.width : window.innerWidth;
    this.height = rect && rect.height > 0 ? rect.height : window.innerHeight;

    const dpr = Math.min(window.devicePixelRatio || 1, this.qualityManager.getSettings().pixelRatio);
    this.instance.setPixelRatio(dpr);
    this.instance.setSize(this.width, this.height, false);

    this.composer.setPixelRatio(dpr);
    this.composer.setSize(this.width, this.height);

    this.bloomPass.resolution.set(this.width, this.height);
    this.fxaaPass.material.uniforms['resolution'].value.set(
      1 / (this.width * dpr),
      1 / (this.height * dpr)
    );
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
    const settings = this.qualityManager.getSettings();

    if (settings.enablePostProcessing) {
      if (this.renderPass.scene !== scene) {
        this.renderPass.scene = scene;
      }
      if (this.renderPass.camera !== camera) {
        this.renderPass.camera = camera;
      }

      this.cinematicPass.material.uniforms.uTime.value = performance.now() * 0.001;
      this.composer.render();
    } else {
      this.instance.render(scene, camera);
    }
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
    this.composer.dispose();
    this.instance.dispose();
  }
}

