import * as THREE from 'three';
import { Environment } from './Environment';
import { QualityTier } from '../core/QualityManager';

export class EnvironmentManager {
  public group: THREE.Group;
  private environments: Map<string, Environment> = new Map();
  private activeEnvironment: Environment | null = null;
  private targetEnvironment: Environment | null = null;
  private transitionProgress: number = 1.0;
  private transitionDuration: number = 2.5;
  private transitionCallback: (() => void) | null = null;

  constructor() {
    this.group = new THREE.Group();
  }

  public register(environment: Environment) {
    this.environments.set(environment.name, environment);
    this.group.add(environment.group);
    environment.init();
    if (!this.activeEnvironment) {
      this.activeEnvironment = environment;
      environment.setTransitionWeight(1.0);
    } else {
      environment.setTransitionWeight(0.0);
    }
  }

  public get(name: string): Environment | undefined {
    return this.environments.get(name);
  }

  public transitionTo(name: string, duration: number = 3.0, onComplete?: () => void) {
    const nextEnv = this.environments.get(name);
    if (!nextEnv || nextEnv === this.activeEnvironment) return;

    this.targetEnvironment = nextEnv;
    this.transitionProgress = 0.0;
    this.transitionDuration = Math.max(duration, 0.1);
    this.transitionCallback = onComplete || null;
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    // 1. Advance transition blending if transitioning
    if (this.transitionProgress < 1.0 && this.targetEnvironment) {
      this.transitionProgress = Math.min(this.transitionProgress + delta / this.transitionDuration, 1.0);
      const smoothT = this.transitionProgress * this.transitionProgress * (3.0 - 2.0 * this.transitionProgress);

      if (this.activeEnvironment) {
        this.activeEnvironment.setTransitionWeight(1.0 - smoothT);
      }
      this.targetEnvironment.setTransitionWeight(smoothT);

      if (this.transitionProgress >= 1.0) {
        if (this.activeEnvironment) {
          this.activeEnvironment.setTransitionWeight(0.0);
        }
        this.activeEnvironment = this.targetEnvironment;
        this.activeEnvironment.setTransitionWeight(1.0);
        this.targetEnvironment = null;

        if (this.transitionCallback) {
          this.transitionCallback();
          this.transitionCallback = null;
        }
      }
    }

    // 2. Update all registered environments
    for (const env of this.environments.values()) {
      env.update(time, delta, cameraPos);
    }
  }

  public setQualityTier(tier: QualityTier) {
    for (const env of this.environments.values()) {
      env.setQualityTier(tier);
    }
  }

  public destroy() {
    for (const env of this.environments.values()) {
      env.destroy();
    }
    this.environments.clear();
  }
}
