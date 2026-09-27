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
uniform float uRainforestWeight;

// 2D Hash & Noise utilities for procedural atmospheric clouds
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm2D(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  vec2 shift = vec2(100.0);
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * noise2D(p);
    p = rot * p * 2.0 + shift;
    a *= 0.5;
  }
  return v;
}

// Physical Henyey-Greenstein Mie Phase Function
float hgPhase(float cosTheta, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(1.0 + g2 - 2.0 * g * cosTheta, 0.001), 1.5));
}

vec3 computeAtmosphere(vec3 rayDir, vec3 sunDir) {
  float cosTheta = dot(rayDir, sunDir);

  // Atmospheric colors (Rayleigh scattering)
  vec3 zenithColor = vec3(0.09, 0.28, 0.62);      // Rich tropospheric blue
  vec3 horizonColor = vec3(0.68, 0.82, 0.94);     // Diffuse Rayleigh horizon haze
  vec3 sunColor = vec3(1.0, 0.96, 0.88);          // Solar illumination
  vec3 sunsetGlow = vec3(1.0, 0.72, 0.45);        // Low solar warm scattering
  vec3 abyssColor = vec3(0.008, 0.022, 0.038);    // Deep oceanic abyss for below-horizon

  vec3 sky;

  if (rayDir.y >= 0.0) {
    float h = clamp(rayDir.y, 0.0, 1.0);
    
    // Rayleigh exponential atmospheric density decay
    float rayleighGrad = pow(1.0 - h, 2.8);
    sky = mix(zenithColor, horizonColor, rayleighGrad);

    // Warm aerosol glow along the horizon arc facing the sun
    float sunFacing = max(dot(normalize(vec3(rayDir.x, 0.0, rayDir.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
    float horizonAerosol = exp(-h * 9.0) * pow(sunFacing, 2.5);
    sky += sunsetGlow * horizonAerosol * 0.45;

    // Crisp physical solar disc
    float sunDisc = smoothstep(0.9996, 0.9999, cosTheta) * 3.5;
    // Tight forward Mie aureole
    float mieAureole = pow(max(cosTheta, 0.0), 48.0) * 0.65;
    // Soft wide atmospheric haze
    float wideHaze = pow(max(cosTheta, 0.0), 8.0) * 0.15;
    sky += sunColor * (sunDisc + mieAureole) + sunsetGlow * wideHaze;

    // --- Multi-Octave Procedural Volumetric Cloud Deck ---
    if (rayDir.y > 0.035) {
      float cloudHeight = 1.0;
      float cloudDist = cloudHeight / (rayDir.y + 0.02);
      vec2 cloudUv = (rayDir.xz * cloudDist) * 0.18 + vec2(uTime * 0.004, uTime * 0.002);

      // Cloud density from 4-octave FBM
      float rawFbm = fbm2D(cloudUv * 2.2);
      float cloudDensity = smoothstep(0.42, 0.78, rawFbm);

      if (cloudDensity > 0.001) {
        float horizonFade = smoothstep(0.035, 0.22, rayDir.y);
        cloudDensity *= horizonFade;

        // Forward Mie scattering (Silver Lining) around sun
        float silverLining = pow(max(cosTheta, 0.0), 5.0) * 2.4;
        
        // Cloud shading
        vec3 cloudLit = sunColor * (1.1 + silverLining);
        vec3 cloudShadow = mix(zenithColor * 0.7, horizonColor * 0.9, 0.5);
        vec3 cloudColor = mix(cloudShadow, cloudLit, smoothstep(0.45, 0.85, rawFbm));

        // Blend clouds over atmospheric sky background
        sky = mix(sky, cloudColor, cloudDensity * 0.88);
      }
    }
  } else {
    // Below horizon: continuous smooth transition into deep abyss with zero step discontinuity
    float downGrad = clamp(-rayDir.y * 3.5, 0.0, 1.0);
    sky = mix(horizonColor, abyssColor, downGrad);
  }

  // Rainforest biome canopy ambiance dome: transforms open sky into rich emerald canopy illumination
  vec3 jungleZenith = vec3(0.12, 0.26, 0.16);
  vec3 jungleHorizon = vec3(0.06, 0.14, 0.09);
  float jungleH = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 jungleSky = mix(jungleHorizon, jungleZenith, jungleH);
  float sunShaft = pow(max(cosTheta, 0.0), 24.0) * 0.45;
  jungleSky += vec3(1.0, 0.95, 0.70) * sunShaft;
  sky = mix(sky, jungleSky, uRainforestWeight);

  return sky;
}

void main() {
  vec3 rayDir = normalize(vRayDirection);
  vec3 color = computeAtmosphere(rayDir, normalize(uSunDirection));
  gl_FragColor = vec4(color, 1.0);
}
`;
