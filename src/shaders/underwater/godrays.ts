export const godraysVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const godraysFragmentShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec2 vUv;

uniform float uTime;
uniform vec3 uSunDirection;
uniform float uIntensity;

// Animated caustic ray noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  // Shaft profile along ray: bright near surface (uv.y=1.0), fading with depth (uv.y=0.0)
  float depthFade = pow(vUv.y, 1.8);

  // Cross-shaft beam soft edge
  float beamProfile = sin(vUv.x * 3.14159265);

  // Animated shimmering light beam streaks
  float streak1 = noise(vec2(vUv.x * 6.0 + uTime * 0.15, vWorldPosition.y * 0.4));
  float streak2 = noise(vec2(vUv.x * 12.0 - uTime * 0.22, vWorldPosition.y * 0.8));
  float shafts = (streak1 * 0.6 + streak2 * 0.4);

  vec3 rayColor = vec3(0.35, 0.82, 0.95);
  float alpha = depthFade * beamProfile * shafts * 0.28 * uIntensity;

  gl_FragColor = vec4(rayColor, alpha);
}
`;
