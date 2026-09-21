export type SceneId = 'ocean' | 'underwater' | 'choice' | 'shore' | 'deep';

export type EnvironmentId = 'ocean' | 'underwater' | 'shore' | 'deep';

export interface EnvironmentAsset {
  video: string;
  image: string;
  aspectRatio?: number; // e.g. 16/9
}

export interface SceneChoice {
  id: 'shore' | 'deep';
  label: string;
  direction: 'left' | 'down';
  targetScene: SceneId;
}

export interface SceneConfig {
  id: SceneId;
  environment: EnvironmentId;
  narrative?: {
    text: string;
    holdDuration: number; // in seconds
  };
  choices?: SceneChoice[];
}
