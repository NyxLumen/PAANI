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
