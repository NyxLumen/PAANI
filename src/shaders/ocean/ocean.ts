export const oceanVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vCrest;
varying float vDepth;

uniform float uTime;

// Multi-slot analytical ripples
#define MAX_RIPPLES 4
uniform vec3 uRippleOrigins[MAX_RIPPLES];
uniform float uRippleTimes[MAX_RIPPLES];
uniform float uRippleEnergies[MAX_RIPPLES];
uniform vec3 uRippleVelocities[MAX_RIPPLES];

// Meniscus contact bulge
uniform vec3 uMeniscusOrigin;
uniform float uMeniscusWeight;

struct Wave {
  vec2 direction;
  float amplitude;
  float wavelength;
  float speed;
  float steepness;
};

#define NUM_WAVES 4

Wave waves[NUM_WAVES] = Wave[NUM_WAVES](
  Wave(normalize(vec2(1.0, 0.4)),  0.42, 28.0, 1.2, 0.75),  // Long swell
  Wave(normalize(vec2(0.6, 0.8)),  0.22, 14.0, 1.6, 0.65),  // Cross swell
  Wave(normalize(vec2(-0.4, 0.9)), 0.11,  6.5, 2.1, 0.55),  // Wind chop
  Wave(normalize(vec2(0.8, -0.6)), 0.04,  2.8, 2.8, 0.45)   // Surface capillary
);

void main() {
  vec3 p = position;
  vec3 displaced = p;
  
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crestAccum = 0.0;

  // 1. Gerstner Waves
  for (int i = 0; i < NUM_WAVES; i++) {
    float k = 6.2831853 / waves[i].wavelength;
    float c = sqrt(9.8 / k) * waves[i].speed;
    vec2 d = waves[i].direction;
    float f = k * (dot(d, p.xz) - c * uTime * 0.4);
    float a = waves[i].amplitude;
    float q = waves[i].steepness / (k * a * float(NUM_WAVES));

    float sinF = sin(f);
    float cosF = cos(f);

    displaced.x += q * a * d.x * cosF;
    displaced.z += q * a * d.y * cosF;
    displaced.y += a * sinF;

    crestAccum += sinF;

    tangent += vec3(
      -q * d.x * d.x * (k * a) * sinF,
      d.x * (k * a) * cosF,
      -q * d.x * d.y * (k * a) * sinF
    );

    binormal += vec3(
      -q * d.x * d.y * (k * a) * sinF,
      d.y * (k * a) * cosF,
      -q * d.y * d.y * (k * a) * sinF
    );
  }

  // 2. Analytical Multi-Band Impact Ripples with Anisotropy & Frequency Dispersion
  for (int r = 0; r < MAX_RIPPLES; r++) {
    float rTime = uRippleTimes[r];
    if (rTime > 0.0 && rTime < 8.5) {
      vec3 origin = uRippleOrigins[r];
      vec2 deltaPos = p.xz - origin.xz;
      float dist = length(deltaPos);

      if (dist > 0.001) {
        vec2 rDir = deltaPos / dist;
        vec2 vDir = normalize(uRippleVelocities[r].xz + vec2(0.001, 0.0));
        float align = dot(rDir, vDir);

        // Slight anisotropic forward stretching in the direction of impact velocity
        float distEff = dist - align * (rTime * 0.4);

        // Multi-frequency dispersion:
        // Band 1: Gravity wave (longer wavelength, higher group speed)
        float waveFront1 = rTime * 4.4;
        float dWave1 = distEff - waveFront1;
        float env1 = exp(-pow(dWave1 / (1.4 + rTime * 0.7), 2.0));
        float ripple1 = sin(distEff * 6.5 - rTime * 13.0) * env1;

        // Band 2: Capillary wave (shorter wavelength, fine ripple texture)
        float waveFront2 = rTime * 3.1;
        float dWave2 = distEff - waveFront2;
        float env2 = exp(-pow(dWave2 / (1.0 + rTime * 0.5), 2.0));
        float ripple2 = sin(distEff * 16.0 - rTime * 22.0) * env2 * 0.45;

        // Damping: quadratic distance attenuation + exponential time decay
        float spatialDamping = 1.0 / (1.0 + dist * 0.5 + dist * dist * 0.08);
        float timeDamping = exp(-rTime * 0.62);
        float energy = uRippleEnergies[r];

        float totalRipple = (ripple1 + ripple2) * spatialDamping * timeDamping * energy * 0.55;
        displaced.y += totalRipple;

        // Normal perturbation from ripples
        float dR_dDist = (cos(distEff * 6.5 - rTime * 13.0) * 6.5 * env1 +
                          cos(distEff * 16.0 - rTime * 22.0) * 16.0 * env2 * 0.45) *
                          spatialDamping * timeDamping * energy * 0.55;
        tangent.y += rDir.x * dR_dDist;
        binormal.y += rDir.y * dR_dDist;
      }
    }
  }

  // 3. Meniscus Contact Bulge (Surface rises to bond with droplet upon contact)
  if (uMeniscusWeight > 0.0) {
    float mDist = length(p.xz - uMeniscusOrigin.xz);
    float bulgeRadius = 0.42;
    float bulge = exp(-pow(mDist / bulgeRadius, 2.0)) * uMeniscusWeight * 0.22;
    displaced.y += bulge;

    if (mDist > 0.001) {
      vec2 mDir = normalize(p.xz - uMeniscusOrigin.xz);
      float dBulge = -2.0 * (mDist / (bulgeRadius * bulgeRadius)) * bulge;
      tangent.y += mDir.x * dBulge;
      binormal.y += mDir.y * dBulge;
    }
  }

  vec3 normal = normalize(cross(binormal, tangent));

  vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vCrest = crestAccum;
  vDepth = displaced.y;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const oceanFragmentShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vCrest;
varying float vDepth;

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;

// Transient Localized Foam System
#define MAX_FOAM_SPOTS 4
uniform vec3 uFoamOrigins[MAX_FOAM_SPOTS];
uniform float uFoamTimes[MAX_FOAM_SPOTS];
uniform float uFoamEnergies[MAX_FOAM_SPOTS];

vec3 computeSky(vec3 rayDir, vec3 sunDir) {
  float cosTheta = dot(rayDir, sunDir);
  float height = clamp(rayDir.y, 0.0, 1.0);

  vec3 zenithColor = vec3(0.08, 0.22, 0.48);
  vec3 horizonColor = vec3(0.58, 0.74, 0.88);
  vec3 sunWarmth = vec3(1.0, 0.82, 0.55);

  float hGrad = pow(1.0 - height, 3.5);
  vec3 sky = mix(zenithColor, horizonColor, hGrad);

  float horizonRim = exp(-max(rayDir.y, 0.0) * 12.0);
  sky += sunWarmth * horizonRim * 0.25;

  float mie = pow(max(cosTheta, 0.0), 32.0) * 0.8;
  float sunDisc = smoothstep(0.999, 0.9999, cosTheta) * 12.0;

  return sky + sunWarmth * (mie + sunDisc);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  // Micro-surface normal perturbation (capillary ripples)
  vec2 uvMicro = vWorldPosition.xz * 1.8 + vec2(uTime * 0.2, uTime * 0.15);
  float n1 = noise(uvMicro);
  float n2 = noise(uvMicro * 2.3 - vec2(uTime * 0.3));
  vec3 microNormal = vec3((n1 - 0.5) * 0.12, 1.0, (n2 - 0.5) * 0.12);

  bool isUnderside = !gl_FrontFacing;
  vec3 baseNormal = isUnderside ? -vNormal : vNormal;
  vec3 normal = normalize(baseNormal + microNormal * 0.35 * (isUnderside ? -1.0 : 1.0));

  float NdotV = max(dot(normal, viewDir), 0.0);

  // -------------------------------------------------------------
  // 1. UNDERWATER VIEW (Looking up at the surface from below)
  // -------------------------------------------------------------
  if (isUnderside) {
    float cosCritical = 0.66;
    float tir = smoothstep(cosCritical, cosCritical + 0.15, NdotV);

    vec3 refractRay = refract(-viewDir, normal, 1.333 / 1.0);
    vec3 skyLight = computeSky(refractRay, sunDir);
    float sunTransmission = pow(max(dot(viewDir, sunDir), 0.0), 32.0) * 12.0;
    skyLight += vec3(1.0, 0.95, 0.8) * sunTransmission;

    vec3 deepWaterMirror = vec3(0.015, 0.08, 0.16);
    vec3 undersideColor = mix(deepWaterMirror, skyLight, tir);

    float causticWave = noise(vWorldPosition.xz * 0.8 + vec2(uTime * 0.4)) * 0.3;
    undersideColor += vec3(0.1, 0.35, 0.45) * causticWave;

    float dist = length(vWorldPosition - uCameraPosition);
    float underFog = 1.0 - exp(-dist * 0.012);
    vec3 deepAbyss = vec3(0.004, 0.018, 0.045);
    undersideColor = mix(undersideColor, deepAbyss, clamp(underFog, 0.0, 1.0));

    gl_FragColor = vec4(undersideColor, 0.98);
    return;
  }

  // -------------------------------------------------------------
  // 2. ABOVE-WATER VIEW
  // -------------------------------------------------------------
  float R0 = 0.0204;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - NdotV, 5.0);

  vec3 reflectDir = reflect(-viewDir, normal);
  reflectDir.y = max(reflectDir.y, 0.001);
  vec3 skyReflection = computeSky(reflectDir, sunDir);

  // Directional Sun Specular
  vec3 halfVector = normalize(sunDir + viewDir);
  float NdotH = max(dot(normal, halfVector), 0.0);
  float specular = pow(NdotH, 180.0) * 4.5;
  float broadSpec = pow(NdotH, 24.0) * 0.45;
  vec3 sunSpecular = (specular + broadSpec) * vec3(1.0, 0.92, 0.75);

  // Subsurface Water Body Color
  vec3 deepOceanColor = vec3(0.008, 0.045, 0.11);
  vec3 shallowWaterColor = vec3(0.02, 0.16, 0.25);
  vec3 waterBody = mix(deepOceanColor, shallowWaterColor, clamp((vDepth + 0.5) * 0.7, 0.0, 1.0));

  float sss = pow(clamp(dot(viewDir, -sunDir), 0.0, 1.0), 3.0) * clamp(vDepth * 1.5, 0.0, 1.0);
  waterBody += vec3(0.04, 0.35, 0.32) * sss * 0.8;

  vec3 surfaceColor = mix(waterBody, skyReflection, fresnel);
  surfaceColor += sunSpecular * fresnel;

  // Wave crest foam
  float crestFoam = smoothstep(0.45, 0.75, vCrest * 0.3 + n2 * 0.2);

  // Dynamic Localized Impact Foam
  float impactFoamAccum = 0.0;
  for (int f = 0; f < MAX_FOAM_SPOTS; f++) {
    float fTime = uFoamTimes[f];
    if (fTime > 0.0 && fTime < 5.5) {
      vec3 fOrigin = uFoamOrigins[f];
      float dist = length(vWorldPosition.xz - fOrigin.xz);
      float ringRadius = 0.3 + fTime * 0.55;
      float ringThickness = 0.28 + fTime * 0.18;

      // Annular foam ring that stretches along wave noise
      float ringDist = abs(dist - ringRadius);
      float foamLace = noise(vWorldPosition.xz * 8.0 - vec2(uTime * 0.4)) * 0.5 + 0.5;
      float ringMask = exp(-pow(ringDist / ringThickness, 2.0));
      float decay = exp(-fTime * 0.85);

      impactFoamAccum += ringMask * foamLace * decay * uFoamEnergies[f] * 1.2;
    }
  }

  float totalFoam = clamp(crestFoam * 0.45 + impactFoamAccum, 0.0, 0.92);
  vec3 foamColor = vec3(0.88, 0.95, 0.99);
  surfaceColor = mix(surfaceColor, foamColor, totalFoam);

  // Atmospheric distance fog
  float dist = length(vWorldPosition - uCameraPosition);
  float fogFactor = 1.0 - exp(-dist * 0.0025);
  vec3 horizonHaze = vec3(0.58, 0.74, 0.88);
  vec3 finalColor = mix(surfaceColor, horizonHaze, clamp(fogFactor, 0.0, 0.85));

  gl_FragColor = vec4(finalColor, 1.0);
}
`;
