import * as THREE from 'three';
import { Clock } from './Clock';
import { QualityManager, QualityTier } from './QualityManager';
import { Renderer } from './Renderer';
import { Sky } from '../world/Sky';
import { Ocean } from '../world/Ocean';
import { Underwater } from '../world/Underwater';
import { WaterInteraction } from '../water/WaterInteraction';
import { WaterDrop } from '../drop/WaterDrop';
import { DropPhysics } from '../drop/DropPhysics';
import { DropCamera } from '../drop/DropCamera';
import { StoryDirector, StoryPhase } from '../story/StoryDirector';
import { EnvironmentManager } from '../environment/EnvironmentManager';
import { OceanEnvironment } from '../environment/OceanEnvironment';
import { Rainforest } from '../world/rainforest/Rainforest';

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

  // Environment Subsystem
  public envManager: EnvironmentManager;
  public oceanEnv: OceanEnvironment;
  public rainforest: Rainforest;

  // World elements
  public sky: Sky;
  public ocean: Ocean;
  public underwater: Underwater;
  public interaction: WaterInteraction;

  // Droplet and camera
  public drop: WaterDrop;
  public physics: DropPhysics;
  public camera: DropCamera;

  // Story Director
  public story: StoryDirector;

  // Lights & Fog
  public sunLight: THREE.DirectionalLight;
  public ambientLight: THREE.AmbientLight;
  public rainforestFog: THREE.FogExp2;

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

    // 3. Sky
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    // 4. Droplet (Instantiated before environments so Rainforest can reference it)
    this.drop = new WaterDrop(sunDir);
    this.scene.add(this.drop.mesh);
    this.scene.add(this.drop.bubbleGroup);

    // 5. World Environments & Management
    this.ocean = new Ocean(sunDir, this.qualityManager);
    this.underwater = new Underwater(sunDir, this.qualityManager);
    this.interaction = new WaterInteraction(sunDir, this.qualityManager);

    this.oceanEnv = new OceanEnvironment(
      sunDir,
      this.qualityManager,
      this.ocean,
      this.underwater,
      this.interaction
    );

    this.rainforest = new Rainforest(sunDir, this.drop);

    this.envManager = new EnvironmentManager();
    this.envManager.register(this.oceanEnv);
    this.envManager.register(this.rainforest);
    this.scene.add(this.envManager.group);

    // 6. Fog configurations
    this.rainforestFog = new THREE.FogExp2(0x13271d, 0.016);
    this.scene.fog = this.underwater.aboveWaterFog;

    // 7. Camera & Aspect
    const aspect = this.renderer.width / this.renderer.height;
    this.camera = new DropCamera(this.ocean, aspect);

    // 8. Physics & Story Orchestration
    this.physics = new DropPhysics(this.drop, this.ocean, {
      onImpact: (event) => this.story.handleImpact(event),
      onSubmerged: () => this.story.handleSubmerged(),
      onTrailingBubble: (pos, vel) => this.interaction.emitTrailingBubble(pos, vel),
    });

    this.story = new StoryDirector(
      this.camera,
      this.physics,
      this.interaction,
      {
        onPhaseChange: (phase) => {
          if (this.callbacks.onPhaseChange) this.callbacks.onPhaseChange(phase);
        },
        onCaptionChange: (caption) => {
          if (this.callbacks.onCaptionChange) this.callbacks.onCaptionChange(caption);
        },
      },
      this.envManager,
      this.rainforest
    );

    window.addEventListener('resize', this.handleResize);
    (window as any).__PAANI_EXPERIENCE__ = this;
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

  public startRainforestJourney() {
    this.story.startRainforestJourney();
  }

  public jumpToRainforest() {
    this.story.jumpToRainforest();
  }

  public startLeafInteraction() {
    this.story.startLeafInteraction();
  }

  public setQualityTier(tier: QualityTier) {
    this.qualityManager.setTier(tier);
    this.envManager.setQualityTier(tier);
  }

  public getStats() {
    const renderStats = this.renderer.getStats();
    const telemetry = this.interaction.getTelemetry();

    return {
      fps: this.qualityManager.fps,
      frameTimeMs: this.qualityManager.frameTimeMs.toFixed(1),
      tier: this.qualityManager.getTier(),
      dpr: this.renderer.instance.getPixelRatio(),
      drawCalls: renderStats.drawCalls,
      triangles: renderStats.triangles,
      dropY: this.drop.getPosition().y.toFixed(2),
      isUnderwater: this.camera.isUnderwater,
      phase: this.story.phase,
      environment: this.rainforest.getTransitionWeight() > 0.5 ? 'Rainforest' : 'Ocean',

      // Phase 5 Interaction Telemetry
      impactEnergy: telemetry.lastImpactEnergy.toFixed(2),
      impactSpeed: telemetry.lastImpactSpeed.toFixed(1),
      surfaceNormal: `(${telemetry.lastSurfaceNormal.x.toFixed(2)}, ${telemetry.lastSurfaceNormal.y.toFixed(2)}, ${telemetry.lastSurfaceNormal.z.toFixed(2)})`,
      activeRipples: telemetry.activeRipples,
      activeMicroDroplets: telemetry.activeMicroDroplets,
      activeMesoLobes: telemetry.activeMesoLobes,
      activeBubbles: telemetry.activeBubbles,
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

    // 2. Update Environment Systems (Ocean & Rainforest)
    this.envManager.update(time, delta, this.camera.instance.position);

    // 3. Update Droplet Optics
    this.drop.update(time, this.camera.instance.position, delta);

    // 4. Update Camera Follow
    this.camera.update(delta, time, this.drop.getPosition(), this.physics.state);

    // 5. Update Sky & Underwater Atmosphere
    this.sky.update(time);
    this.underwater.update(time, delta, this.camera.isUnderwater, this.camera.instance.position);

    // 6. Dynamic Fog & Environmental Lighting Transition
    if (this.camera.isUnderwater) {
      this.scene.fog = this.underwater.underwaterFog;
      this.ambientLight.color.setHex(0x0a4060);
      this.ambientLight.intensity = 0.9;
    } else if (this.rainforest.getTransitionWeight() > 0.35) {
      this.scene.fog = this.rainforestFog;
      this.ambientLight.color.setHex(0x356044);
      this.ambientLight.intensity = 1.05;
    } else {
      this.scene.fog = this.underwater.aboveWaterFog;
      this.ambientLight.color.setHex(0xd4eaff);
      this.ambientLight.intensity = 0.65;
    }

    // 7. Render Frame
    this.renderer.render(this.scene, this.camera.instance);

    // 8. Measure Performance
    const frameDuration = performance.now() - frameStart;
    this.qualityManager.reportFrameTime(frameDuration);

    this.animId = requestAnimationFrame(this.loop);
  };

  public destroy() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);

    this.sky.destroy();
    this.envManager.destroy();
    this.drop.destroy();
    this.renderer.destroy();
    this.clock.destroy();
  }
}
