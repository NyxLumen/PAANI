export type SceneId =
  | 'ocean'
  | 'underwater'
  | 'choice'
  | 'shore'
  | 'deep'
  | 'cloudAscent'
  | 'clouds'
  | 'rain';

export type EnvironmentId =
  | 'ocean'
  | 'underwater'
  | 'shore'
  | 'deep'
  | 'cloudAscent'
  | 'clouds'
  | 'rain';

export type TransitionRecipe =
  | 'none'
  | 'crossBlur'
  | 'surface-dive'
  | 'evaporation'
  | 'atmospheric'
  | 'rainfall'
  | 'ocean-return'
  | 'deep-descent'
  | 'deep-return';

export interface EnvironmentAsset {
  video: string;
  image: string;
  aspectRatio?: number;
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
    holdDuration: number;
  };
  choices?: SceneChoice[];
}

export type TransitionId =
  | 'ocean-to-underwater'
  | 'shore-to-ascent'
  | 'clouds-to-rain'
  | 'rain-to-ocean'
  | 'deep-to-ocean'
  | 'underwater-to-deep';

export interface TransitionConfig {
  id: TransitionId;
  fromScene: SceneId;
  toScene: SceneId;
  videoSrc?: string;
  fallbackRecipe: TransitionRecipe;
  revealStart: number; // normalized progress (0.0 - 1.0) when destination begins appearing
  revealEnd: number;   // normalized progress (0.0 - 1.0) when destination reaches 100%
  maxWaitMs: number;
}
