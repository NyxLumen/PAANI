import * as THREE from 'three';
import { Clock } from './Clock';
import { QualityManager, QualityTier } from './QualityManager';
import { Renderer } from './Renderer';
import { Sky } from '../world/Sky';
import { Ocean } from '../world/Ocean';
import { Splash } from '../world/Splash';
import { Underwater } from '../world/Underwater';
import { WaterDrop } from '../drop/WaterDrop';
import { DropPhysics } from '../drop/DropPhysics';
import { DropCamera } from '../drop/DropCamera';
import { StoryDirector, StoryPhase } from '../story/StoryDirector';

export interface ExperienceCallbacks {
  onPhaseChange?: (phase: StoryPhase) => void;
  onCaptionChange?: (caption: string | null) => void;
}

export class Experience {
  public canvas: HTMLCanvasElement;
  public scene: THREE.Scene;
  public renderer: Renderer;
  public qualityManager: QualityManager;
  public clock: Clock;

  // World elements
  public sky: Sky;
  public ocean: Ocean;
  public splash: Splash;
  public underwater: Underwater;

  // Droplet and camera
  public drop: WaterDrop;
  public physics: DropPhysics;
  public camera: DropCamera;

  // Story Director
  public story: StoryDirector;

  // Lights
  public sunLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;

  private isRunning: boolean = false;
  private animId: number | null = null;
  private callbacks: ExperienceCallbacks = {};

  constructor(canvas: HTMLCanvasElement, callbacks: ExperienceCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;

    // 1. Core Systems
    this.qualityManager = new QualityManager('HIGH');
    this.clock = new Clock();
    this.scene = new THREE.Scene();
    this.renderer = new Renderer(this.canvas, this.qualityManager);

    // 2. Shared Sun Direction & Lights
    const sunDir = new THREE.Vector3(0.35, 0.45, -0.82).normalize();
    this.ambientLight = new THREE.AmbientLight(0xd4eaff, 0.65);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    this.sunLight.position.copy(sunDir).multiplyScalar(100);
    this.scene.add(this.sunLight);

    // 3. World Components
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    this.ocean = new Ocean(sunDir, this.qualityManager);
    this.scene.add(this.ocean.mesh);

    this.splash = new Splash();
    this.scene.add(this.splash.group);

    this.underwater = new Underwater(sunDir, this.qualityManager);
    this.scene.add(this.underwater.group);

    // Initial above-water atmospheric fog
    this.scene.fog = this.underwater.aboveWaterFog;

    // 4. Droplet & Camera
    this.drop = new WaterDrop(sunDir);
    this.scene.add(this.drop.mesh);
    this.scene.add(this.drop.bubbleGroup);

    const aspect = this.renderer.width / this.renderer.height;
    this.camera = new DropCamera(this.ocean, aspect);

    // 5. Physics & Story Orchestration
    this.physics = new DropPhysics(this.drop, this.ocean, {
      onImpact: (pos) => this.story.handleImpact(pos),
      onSubmerged: () => this.story.handleSubmerged(),
    });

    this.story = new StoryDirector(this.camera, this.physics, this.splash, {
      onPhaseChange: (phase) => {
        if (this.callbacks.onPhaseChange) this.callbacks.onPhaseChange(phase);
      },
      onCaptionChange: (caption) => {
        if (this.callbacks.onCaptionChange) this.callbacks.onCaptionChange(caption);
      },
    });

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    if (this.renderer) {
      const aspect = this.renderer.width / this.renderer.height;
      this.camera.setAspect(aspect);
    }
  };

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animId !== null) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  public startStory() {
    this.story.start();
  }

  public resetStory() {
    this.story.reset();
  }

  public setQualityTier(tier: QualityTier) {
    this.qualityManager.setTier(tier);
  }

  public getStats() {
    const renderStats = this.renderer.getStats();
    return {
      fps: this.qualityManager.fps,
      frameTimeMs: this.qualityManager.frameTimeMs.toFixed(1),
      tier: this.qualityManager.getTier(),
      dpr: this.renderer.instance.getPixelRatio(),
      drawCalls: renderStats.drawCalls,
      triangles: renderStats.triangles,
      dropY: this.drop.getPosition().y.toFixed(2),
      isUnderwater: this.camera.isUnderwater,
    };
  }

  private loop = () => {
    if (!this.isRunning) return;

    const frameStart = performance.now();
    const delta = this.clock.tick();
    const time = this.clock.getElapsed();

    // 1. Update Physics & Story
    this.physics.update(delta, time);
    this.story.update(delta);

    // 2. Update Droplet Optics
    this.drop.update(time, this.camera.instance.position, delta);

    // 3. Update Camera Follow
    this.camera.update(delta, time, this.drop.getPosition(), this.physics.state);

    // 4. Update Ocean & World Systems
    this.ocean.update(time, this.camera.instance.position, delta);
    this.sky.update(time);
    this.splash.update(delta);
    this.underwater.update(time, delta, this.camera.isUnderwater, this.camera.instance.position);

    // 5. Dynamic Fog Transition (Atmosphere vs Underwater)
    if (this.camera.isUnderwater) {
      this.scene.fog = this.underwater.underwaterFog;
      this.ambientLight.color.setHex(0x0a4060);
      this.ambientLight.intensity = 0.9;
    } else {
      this.scene.fog = this.underwater.aboveWaterFog;
      this.ambientLight.color.setHex(0xd4eaff);
      this.ambientLight.intensity = 0.65;
    }

    // 6. Render Frame
    this.renderer.render(this.scene, this.camera.instance);

    // 7. Measure & Report Performance
    const frameDuration = performance.now() - frameStart;
    this.qualityManager.reportFrameTime(frameDuration);

    this.animId = requestAnimationFrame(this.loop);
  };

  public destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);

    this.sky.destroy();
    this.ocean.destroy();
    this.splash.destroy();
    this.underwater.destroy();
    this.drop.destroy();
    this.renderer.destroy();
    this.clock.destroy();
  }
}
