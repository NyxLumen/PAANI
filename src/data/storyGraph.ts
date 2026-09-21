import { EnvironmentId, EnvironmentAsset, SceneConfig, SceneId } from '../types/story';

export const environments: Record<EnvironmentId, EnvironmentAsset> = {
  ocean: {
    video: '/environments/ocean.mp4',
    image: '/environments/ocean.webp',
  },
  underwater: {
    video: '/environments/underwater.mp4',
    image: '/environments/underwater.webp',
  },
  shore: {
    video: '/environments/shore.mp4',
    image: '/environments/shore.webp',
  },
  deep: {
    video: '/environments/deep.mp4',
    image: '/environments/deep.webp',
  },
  cloudAscent: {
    video: '/environments/cloud-ascent.mp4',
    image: '/environments/cloud-ascent.webp',
  },
  clouds: {
    video: '/environments/clouds.mp4',
    image: '/environments/clouds.webp',
  },
  rain: {
    video: '/environments/rain.mp4',
    image: '/environments/rain.webp',
  },
};

export const scenes: Record<SceneId, SceneConfig> = {
  ocean: {
    id: 'ocean',
    environment: 'ocean',
  },
  underwater: {
    id: 'underwater',
    environment: 'underwater',
    narrative: {
      text: 'You are one drop among billions.',
      holdDuration: 3.2,
    },
  },
  choice: {
    id: 'choice',
    environment: 'underwater',
    choices: [
      {
        id: 'shore',
        label: 'FOLLOW THE SHORE',
        direction: 'left',
        targetScene: 'shore',
      },
      {
        id: 'deep',
        label: 'DESCEND',
        direction: 'down',
        targetScene: 'deep',
      },
    ],
  },
  shore: {
    id: 'shore',
    environment: 'shore',
  },
  deep: {
    id: 'deep',
    environment: 'deep',
  },
  cloudAscent: {
    id: 'cloudAscent',
    environment: 'cloudAscent',
  },
  clouds: {
    id: 'clouds',
    environment: 'clouds',
  },
  rain: {
    id: 'rain',
    environment: 'rain',
  },
};

export const transitions: Record<string, import('../types/story').TransitionConfig> = {
  'ocean-to-underwater': {
    id: 'ocean-to-underwater',
    fromScene: 'ocean',
    toScene: 'underwater',
    videoSrc: '/environments/ocean_to_underwater.mp4',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.65,
    revealEnd: 0.95,
    maxWaitMs: 1500,
  },
  'shore-to-ascent': {
    id: 'shore-to-ascent',
    fromScene: 'shore',
    toScene: 'cloudAscent',
    videoSrc: '/environments/shore_to_sky.mp4',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.60,
    revealEnd: 0.92,
    maxWaitMs: 1500,
  },
  'clouds-to-rain': {
    id: 'clouds-to-rain',
    fromScene: 'clouds',
    toScene: 'rain',
    videoSrc: '/environments/cloud_to_rain.mp4',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.62,
    revealEnd: 0.94,
    maxWaitMs: 1500,
  },
  'rain-to-ocean': {
    id: 'rain-to-ocean',
    fromScene: 'rain',
    toScene: 'ocean',
    videoSrc: '/environments/rain_to_ocean.mp4',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.52,
    revealEnd: 0.90,
    maxWaitMs: 1500,
  },
  'deep-to-ocean': {
    id: 'deep-to-ocean',
    fromScene: 'deep',
    toScene: 'ocean',
    videoSrc: '/environments/deep_to_ocean.mp4',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.55,
    revealEnd: 0.92,
    maxWaitMs: 1500,
  },
  'underwater-to-deep': {
    id: 'underwater-to-deep',
    fromScene: 'underwater',
    toScene: 'deep',
    fallbackRecipe: 'crossBlur',
    revealStart: 0.35,
    revealEnd: 0.75,
    maxWaitMs: 1500,
  },
};
