export const skyVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vRayDirection;

void main() {
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vRayDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragmentShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vRayDirection;

uniform vec3 uSunDirection;
uniform float uTime;

vec3 computeAtmosphere(vec3 rayDir, vec3 sunDir) {
  float cosTheta = dot(rayDir, sunDir);

  vec3 zenithColor = vec3(0.08, 0.22, 0.48);      // Deep blue zenith
  vec3 horizonColor = vec3(0.58, 0.74, 0.88);     // Pale cyan-blue haze
  vec3 abyssColor = vec3(0.004, 0.018, 0.045);    // Deep oceanic abyss for below-horizon
  vec3 sunWarmth = vec3(1.0, 0.82, 0.55);         // Sun halo warmth

  vec3 sky;
  if (rayDir.y >= 0.0) {
    float height = clamp(rayDir.y, 0.0, 1.0);
    float hGrad = pow(1.0 - height, 3.5);
    sky = mix(zenithColor, horizonColor, hGrad);

    // Horizon golden rim
    float horizonRim = exp(-rayDir.y * 12.0);
    sky += sunWarmth * horizonRim * 0.25;

    // Sun disc and corona
    float mie = pow(max(cosTheta, 0.0), 32.0) * 0.6;
    float sunDisc = smoothstep(0.9992, 0.9998, cosTheta) * 8.0;
    sky += sunWarmth * (mie + sunDisc);
  } else {
    // Below horizon: transition swiftly to deep abyssal dark navy
    float downGrad = clamp(-rayDir.y * 4.0, 0.0, 1.0);
    sky = mix(horizonColor * 0.3, abyssColor, downGrad);
  }

  return sky;
}

void main() {
  vec3 rayDir = normalize(vRayDirection);
  vec3 color = computeAtmosphere(rayDir, normalize(uSunDirection));
  
  gl_FragColor = vec4(color, 1.0);
}
`;
