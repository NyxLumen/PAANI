import * as THREE from 'three';
import { Environment } from '../../environment/Environment';
import { QualityTier } from '../../core/QualityManager';
import { RainforestTerrain } from './Terrain';
import { RainforestVegetation } from './Vegetation';
import { RainforestPuddles } from './Puddles';
import { RainforestMist } from './Mist';
import { RainforestInteraction } from './RainforestInteraction';
import { WaterDrop } from '../../drop/WaterDrop';

export class Rainforest implements Environment {
  public name: string = 'rainforest';
  public group: THREE.Group;

  public terrain: RainforestTerrain;
  public vegetation: RainforestVegetation;
  public puddles: RainforestPuddles;
  public mist: RainforestMist;
  public interaction: RainforestInteraction;

  private transitionWeight: number = 0.0;

  constructor(sunDirection: THREE.Vector3, drop: WaterDrop) {
    this.group = new THREE.Group();

    // 1. Terrain
    this.terrain = new RainforestTerrain(sunDirection);
    this.group.add(this.terrain.mesh);

    // 2. Vegetation (macro trees, meso broadleaves & ferns, spore motes, hero leaf)
    this.vegetation = new RainforestVegetation(sunDirection);
    this.group.add(this.vegetation.group);

    // 3. Puddles
    this.puddles = new RainforestPuddles(sunDirection);
    this.group.add(this.puddles.mesh);

    // 4. Mist & Canopy Sunbeams
    this.mist = new RainforestMist(sunDirection);
    this.group.add(this.mist.group);

    // 5. Droplet Leaf & Puddle Interaction System
    this.interaction = new RainforestInteraction(drop, this.puddles, this.vegetation);

    // Initial state: hidden until activated/transitioned
    this.setTransitionWeight(0.0);
  }

  public init() {
    // Ready for activation
  }

  public update(time: number, delta: number, cameraPos: THREE.Vector3) {
    if (this.transitionWeight <= 0.0001) return;

    this.terrain.update(time, cameraPos);
    this.vegetation.update(time, delta, cameraPos);
    this.puddles.update(time, delta, cameraPos);
    this.mist.update(time, cameraPos);
    this.interaction.update(delta);
  }

  public setTransitionWeight(weight: number) {
    this.transitionWeight = weight;
    this.terrain.setTransitionWeight(weight);
    this.vegetation.setTransitionWeight(weight);
    this.puddles.setTransitionWeight(weight);
    this.mist.setTransitionWeight(weight);
    this.group.visible = weight > 0.001;
  }

  public getTransitionWeight(): number {
    return this.transitionWeight;
  }

  public setQualityTier(tier: QualityTier) {
    this.terrain.setQualityTier(tier);
    this.vegetation.setQualityTier(tier);
    this.puddles.setQualityTier(tier);
    this.mist.setQualityTier(tier);
  }

  public destroy() {
    this.terrain.destroy();
    this.vegetation.destroy();
    this.puddles.destroy();
    this.mist.destroy();
    this.group.clear();
  }
}
