import * as THREE from 'three';
import { ImpactEvent } from './ImpactEvent';
import { RippleSystem } from './RippleSystem';
import { SplashSystem } from './SplashSystem';
import { FoamSystem } from './FoamSystem';
import { BubbleSystem } from './BubbleSystem';
import { QualityManager } from '../core/QualityManager';

export interface InteractionTelemetry {
  lastImpactPoint: THREE.Vector3;
  lastSurfaceNormal: THREE.Vector3;
  lastImpactEnergy: number;
  lastImpactSpeed: number;
  activeRipples: number;
  activeMicroDroplets: number;
  activeMesoLobes: number;
  activeBubbles: number;
}

export class WaterInteraction {
  public ripples: RippleSystem;
  public splash: SplashSystem;
  public foam: FoamSystem;
  public bubbles: BubbleSystem;

  public group: THREE.Group;

  // Interaction telemetry
  private lastImpactPoint = new THREE.Vector3();
  private lastSurfaceNormal = new THREE.Vector3(0, 1, 0);
  private lastImpactEnergy = 0.0;
  private lastImpactSpeed = 0.0;

  constructor(sunDirection: THREE.Vector3, qualityManager: QualityManager) {
    this.group = new THREE.Group();

    this.ripples = new RippleSystem();
    this.splash = new SplashSystem(sunDirection, qualityManager);
    this.foam = new FoamSystem();
    this.bubbles = new BubbleSystem(sunDirection, qualityManager);

    this.group.add(this.splash.group);
    this.group.add(this.bubbles.group);
  }

  /**
   * Dispatches an impact event to all subscribed interaction systems.
   * Ensures a unified, causally-connected reaction across surface, splash, foam, and bubbles.
   */
  public dispatchImpact(event: ImpactEvent) {
    this.lastImpactPoint.copy(event.worldPosition);
    this.lastSurfaceNormal.copy(event.surfaceNormal);
    this.lastImpactEnergy = event.impactEnergy;
    this.lastImpactSpeed = event.normalSpeed;

    // 1. Surface dynamic ripples
    this.ripples.onImpact(event);

    // 2. Multi-scale splash (crown, meso lobes, micro droplets)
    this.splash.trigger(event);

    // 3. Transient localized foam lacing
    this.foam.onImpact(event);

    // 4. Underwater buoyant micro-bubbles
    this.bubbles.trigger(event);
  }

  public emitTrailingBubble(pos: THREE.Vector3, vel?: THREE.Vector3) {
    this.bubbles.emitTrailing(pos, vel);
  }

  public update(delta: number, time: number, cameraPos?: THREE.Vector3) {
    this.ripples.update(delta);
    this.splash.update(delta, cameraPos);
    this.foam.update(delta);
    this.bubbles.update(delta, time, cameraPos);
  }

  public getTelemetry(): InteractionTelemetry {
    return {
      lastImpactPoint: this.lastImpactPoint,
      lastSurfaceNormal: this.lastSurfaceNormal,
      lastImpactEnergy: this.lastImpactEnergy,
      lastImpactSpeed: this.lastImpactSpeed,
      activeRipples: this.ripples.getActiveCount(),
      activeMicroDroplets: this.splash.getActiveMicroCount(),
      activeMesoLobes: this.splash.getActiveMesoCount(),
      activeBubbles: this.bubbles.getActiveCount(),
    };
  }

  public reset() {
    this.ripples.reset();
    this.splash.reset();
    this.foam.reset();
    this.bubbles.reset();
    this.lastImpactEnergy = 0.0;
    this.lastImpactSpeed = 0.0;
  }

  public destroy() {
    this.splash.destroy();
    this.bubbles.destroy();
  }
}
