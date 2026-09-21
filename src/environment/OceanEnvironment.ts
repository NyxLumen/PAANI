import * as THREE from 'three';
import { Environment } from './Environment';
import { Ocean } from '../world/Ocean';
import { Underwater } from '../world/Underwater';
import { WaterInteraction } from '../water/WaterInteraction';
import { QualityTier, QualityManager } from '../core/QualityManager';

export class OceanEnvironment implements Environment {
  public name: string = 'ocean';
  public group: THREE.Group;

  public ocean: Ocean;
  public underwater: Underwater;
  public interaction: WaterInteraction;

  private transitionWeight: number = 1.0;

  constructor(
    sunDirection: THREE.Vector3,
    qualityManager: QualityManager,
    ocean?: Ocean,
    underwater?: Underwater,
    interaction?: WaterInteraction
  ) {
    this.group = new THREE.Group();

    this.ocean = ocean || new Ocean(sunDirection, qualityManager);
    this.underwater = underwater || new Underwater(sunDirection, qualityManager);
    this.interaction = interaction || new WaterInteraction(sunDirection, qualityManager);

    this.group.add(this.ocean.mesh);
    this.group.add(this.underwater.group);
    this.group.add(this.interaction.group);
  }

  public init() {
    this.setTransitionWeight(1.0);
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    if (this.transitionWeight <= 0.0001) return;

    this.ocean.update(time, cameraPos);
    this.interaction.update(delta, time, cameraPos);
    this.ocean.syncInteraction(this.interaction.ripples, this.interaction.foam);
  }

  public setTransitionWeight(weight: number) {
    this.transitionWeight = weight;
    this.group.visible = weight > 0.001;
    // Fade ocean water transparency if transitioning
    if (this.ocean.material.uniforms && this.ocean.material.uniforms.uOpacity) {
      this.ocean.material.uniforms.uOpacity.value = weight;
    }
  }

  public getTransitionWeight(): number {
    return this.transitionWeight;
  }

  public setQualityTier(_tier: QualityTier) {
    // Quality tiers are already subscribed via qualityManager
  }

  public destroy() {
    this.ocean.destroy();
    this.underwater.destroy();
    this.interaction.destroy();
    this.group.clear();
  }
}
