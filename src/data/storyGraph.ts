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
