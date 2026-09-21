import * as THREE from 'three';
import { QualityTier } from '../core/QualityManager';

export interface Environment {
  name: string;
  group: THREE.Group;
  init(): void;
  update(time: number, delta: number, cameraPos: THREE.Vector3): void;
  setQualityTier(tier: QualityTier): void;
  setTransitionWeight(weight: number): void;
  getTransitionWeight(): number;
  destroy(): void;
}
