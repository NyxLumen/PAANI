export const oceanVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vCrest;
varying float vDepth;
varying float vJacobian;

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

// 8-wave Gerstner spectrum: 2 large swells, 2 cross swells, 2 wind chops, 2 capillary wavelets
#define NUM_WAVES 8

Wave waves[NUM_WAVES] = Wave[NUM_WAVES](
  Wave(normalize(vec2(1.0, 0.35)),  0.48, 34.0, 1.15, 0.80),  // Deep oceanic swell
  Wave(normalize(vec2(0.55, 0.85)), 0.30, 22.0, 1.45, 0.72),  // Secondary cross swell
  Wave(normalize(vec2(-0.45, 0.9)), 0.18, 12.0, 2.05, 0.65),  // Primary wind chop
  Wave(normalize(vec2(0.85, -0.52)),0.11,  6.5, 2.65, 0.58),  // Cross chop
  Wave(normalize(vec2(-0.7, -0.7)), 0.06,  3.8, 3.10, 0.50),  // Small wavelets
  Wave(normalize(vec2(0.2, 0.98)),  0.035, 2.2, 3.60, 0.45),  // Capillary band 1
  Wave(normalize(vec2(-0.9, 0.3)),  0.020, 1.3, 4.20, 0.38),  // Capillary band 2
  Wave(normalize(vec2(0.3, -0.95)), 0.012, 0.8, 4.80, 0.32)   // High-frequency capillary
);

void main() {
  vec3 p = position;
  vec3 displaced = p;
  
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crestAccum = 0.0;

  // Jacobian curvature accumulators: dDx_dx, dDx_dz, dDz_dx, dDz_dz
  float jxx = 0.0;
  float jxy = 0.0;
  float jyy = 0.0;

  // 1. Gerstner Waves
  for (int i = 0; i < NUM_WAVES; i++) {
    float k = 6.2831853 / waves[i].wavelength;
    float c = sqrt(9.81 / k) * waves[i].speed;
    vec2 d = waves[i].direction;
    float a = waves[i].amplitude;
    float q = waves[i].steepness / (k * a * float(NUM_WAVES));

    // Shoreline wave refraction towards coast
    float shoreRefract = clamp(1.0 - (p.z + 10.0) * 0.015, 0.4, 1.0);
    vec2 effDir = normalize(mix(vec2(0.0, -1.0), d, shoreRefract));

    float f = k * (dot(effDir, p.xz) - c * uTime * 0.38);

    float sinF = sin(f);
    float cosF = cos(f);

    displaced.x += q * a * effDir.x * cosF;
    displaced.z += q * a * effDir.y * cosF;
    displaced.y += a * sinF;

    crestAccum += sinF * (a / 0.48);

    float qka_sin = q * (k * a) * sinF;
    float ka_cos  = (k * a) * cosF;

    tangent += vec3(
      -effDir.x * effDir.x * qka_sin,
      effDir.x * ka_cos,
      -effDir.x * effDir.y * qka_sin
    );

    binormal += vec3(
      -effDir.x * effDir.y * qka_sin,
      effDir.y * ka_cos,
      -effDir.y * effDir.y * qka_sin
    );

    // Accumulate Jacobian displacement gradient
    jxx += effDir.x * effDir.x * qka_sin;
    jxy += effDir.x * effDir.y * qka_sin;
    jyy += effDir.y * effDir.y * qka_sin;
  }

  // Jacobian determinant J = (1 - jxx)(1 - jyy) - (jxy)^2
  // When J < 0.45, wave crest is compressing into physical foam
  vJacobian = clamp((1.0 - jxx) * (1.0 - jyy) - (jxy * jxy), 0.0, 1.5);

  // 2. Analytical Multi-Band Impact Ripples
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

        float distEff = dist - align * (rTime * 0.4);

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

        float spatialDamping = 1.0 / (1.0 + dist * 0.5 + dist * dist * 0.08);
        float timeDamping = exp(-rTime * 0.62);
        float energy = uRippleEnergies[r];

        float totalRipple = (ripple1 + ripple2) * spatialDamping * timeDamping * energy * 0.55;
        displaced.y += totalRipple;

        float dR_dDist = (cos(distEff * 6.5 - rTime * 13.0) * 6.5 * env1 +
                          cos(distEff * 16.0 - rTime * 22.0) * 16.0 * env2 * 0.45) *
                          spatialDamping * timeDamping * energy * 0.55;
        tangent.y += rDir.x * dR_dDist;
        binormal.y += rDir.y * dR_dDist;
      }
    }
  }

  // 3. Meniscus Contact Bulge
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
varying float vJacobian;

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

  vec3 zenithColor = vec3(0.06, 0.18, 0.44);
  vec3 horizonColor = vec3(0.54, 0.72, 0.86);
  vec3 sunWarmth = vec3(1.0, 0.85, 0.60);

  float hGrad = pow(1.0 - height, 3.2);
  vec3 sky = mix(zenithColor, horizonColor, hGrad);

  float horizonRim = exp(-max(rayDir.y, 0.0) * 10.0);
  sky += sunWarmth * horizonRim * 0.28;

  float mie = pow(max(cosTheta, 0.0), 36.0) * 0.95;
  float sunDisc = smoothstep(0.9994, 0.9999, cosTheta) * 3.5;

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

// Multi-octave procedural capillary noise
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.55), sin(0.55), -sin(0.55), cos(0.55));
  for (int i = 0; i < 3; ++i) {
    v += a * noise(p);
    p = rot * p * 2.15 + vec2(43.12);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 sunDir = normalize(uSunDirection);

  // Multi-frequency micro-surface capillary perturbation
  vec2 uvMicro1 = vWorldPosition.xz * 2.2 + vec2(uTime * 0.32, uTime * 0.22);
  vec2 uvMicro2 = vWorldPosition.xz * 5.4 - vec2(uTime * 0.45, uTime * 0.38);
  float n1 = noise(uvMicro1);
  float n2 = noise(uvMicro2);
  float nCap = fbm(vWorldPosition.xz * 1.4 + vec2(uTime * 0.15));

  vec3 microNormal = vec3(
    (n1 - 0.5) * 0.14 + (n2 - 0.5) * 0.08,
    1.0,
    (n1 - 0.5) * 0.12 - (n2 - 0.5) * 0.09
  );

  bool isUnderside = !gl_FrontFacing;
  vec3 baseNormal = isUnderside ? -vNormal : vNormal;
  vec3 normal = normalize(baseNormal + microNormal * 0.38 * (isUnderside ? -1.0 : 1.0));

  float NdotV = max(dot(normal, viewDir), 0.0);

  // -------------------------------------------------------------
  // 1. UNDERWATER VIEW (Looking up at the surface from below)
  // -------------------------------------------------------------
  if (isUnderside) {
    // Critical angle for water-to-air total internal reflection (TIR)
    float cosCritical = 0.661;
    float tir = smoothstep(cosCritical, cosCritical + 0.12, NdotV);

    vec3 refractRay = refract(-viewDir, normal, 1.333 / 1.0);
    vec3 skyLight = computeSky(refractRay, sunDir);
    float sunTransmission = pow(max(dot(viewDir, sunDir), 0.0), 32.0) * 1.8;
    skyLight += vec3(1.0, 0.96, 0.82) * sunTransmission;

    vec3 deepWaterMirror = vec3(0.012, 0.07, 0.15);
    vec3 undersideColor = mix(deepWaterMirror, skyLight, tir);

    // Subtle caustic underwater illumination
    float causticWave = noise(vWorldPosition.xz * 0.85 + vec2(uTime * 0.4)) * 0.35;
    undersideColor += vec3(0.08, 0.38, 0.48) * causticWave;

    float dist = length(vWorldPosition - uCameraPosition);
    float underFog = 1.0 - exp(-dist * 0.015);
    vec3 deepAbyss = vec3(0.003, 0.015, 0.038);
    undersideColor = mix(undersideColor, deepAbyss, clamp(underFog, 0.0, 1.0));

    gl_FragColor = vec4(undersideColor, 0.98);
    return;
  }

  // -------------------------------------------------------------
  // 2. ABOVE-WATER VIEW
  // -------------------------------------------------------------
  // Physical Schlick Fresnel with n=1.3333 water index (R0 = 0.0204)
  float R0 = 0.0204;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - NdotV, 5.0);

  // Reflection of sky atmosphere
  vec3 reflectDir = reflect(-viewDir, normal);
  reflectDir.y = max(reflectDir.y, 0.001);
  vec3 skyReflection = computeSky(reflectDir, sunDir);

  // Directional Sun Specular Glints (Dual-lobe for razor glint + broad sun path)
  vec3 halfVector = normalize(sunDir + viewDir);
  float NdotH = max(dot(normal, halfVector), 0.0);
  float razorSpec = pow(NdotH, 320.0) * 8.5;
  float broadSpec = pow(NdotH, 22.0) * 0.55;
  vec3 sunSpecular = (razorSpec + broadSpec) * vec3(1.0, 0.94, 0.78);

  // -------------------------------------------------------------
  // Physical Beer-Lambert Volume Optical Extinction:
  // Water strongly absorbs red light, weakly absorbs blue/green
  // -------------------------------------------------------------
  float opticalDepth = max(0.2, (1.2 - vDepth * 0.8));
  vec3 extinctionCoeff = vec3(0.38, 0.07, 0.025);
  vec3 waterTransmission = exp(-extinctionCoeff * opticalDepth * 2.2);

  // Deep ocean sapphire base illuminated by ambient skylight
  vec3 deepOceanBase = vec3(0.006, 0.032, 0.085);
  vec3 shallowTurquoise = vec3(0.03, 0.22, 0.32);
  vec3 waterBody = mix(deepOceanBase, shallowTurquoise, clamp((vDepth + 0.6) * 0.8, 0.0, 1.0)) * (waterTransmission * 2.2 + 0.3);

  // Subsurface forward scattering through wave crests
  float sssPhase = pow(clamp(dot(viewDir, -sunDir), 0.0, 1.0), 3.2);
  float wavePeakSSS = clamp(vDepth * 1.8 + 0.2, 0.0, 1.0);
  vec3 sssColor = vec3(0.05, 0.42, 0.38) * sssPhase * wavePeakSSS * 1.2;
  waterBody += sssColor;

  // Composite water body with Fresnel reflection
  vec3 surfaceColor = mix(waterBody, skyReflection, fresnel);
  surfaceColor += sunSpecular * (fresnel + 0.15);

  // -------------------------------------------------------------
  // Physical Wave-Crest Breaking Foam (Jacobian Determinant)
  // -------------------------------------------------------------
  float crestFoam = smoothstep(0.48, 0.18, vJacobian) * (0.6 + 0.4 * nCap);

  // Dynamic Localized Impact Foam from Droplet Landings
  float impactFoamAccum = 0.0;
  for (int f = 0; f < MAX_FOAM_SPOTS; f++) {
    float fTime = uFoamTimes[f];
    if (fTime > 0.0 && fTime < 5.5) {
      vec3 fOrigin = uFoamOrigins[f];
      float dist = length(vWorldPosition.xz - fOrigin.xz);
      float ringRadius = 0.32 + fTime * 0.58;
      float ringThickness = 0.26 + fTime * 0.16;

      float ringDist = abs(dist - ringRadius);
      float foamLace = noise(vWorldPosition.xz * 8.5 - vec2(uTime * 0.4)) * 0.5 + 0.5;
      float ringMask = exp(-pow(ringDist / ringThickness, 2.0));
      float decay = exp(-fTime * 0.85);

      impactFoamAccum += ringMask * foamLace * decay * uFoamEnergies[f] * 1.35;
    }
  }

  float totalFoam = clamp(crestFoam * 0.55 + impactFoamAccum, 0.0, 0.94);
  vec3 foamColor = vec3(0.92, 0.97, 1.0);
  surfaceColor = mix(surfaceColor, foamColor, totalFoam);

  // Atmospheric distance aerial perspective
  float dist = length(vWorldPosition - uCameraPosition);
  float fogFactor = 1.0 - exp(-dist * 0.0022);
  vec3 horizonHaze = vec3(0.54, 0.72, 0.86);
  vec3 finalColor = mix(surfaceColor, horizonHaze, clamp(fogFactor, 0.0, 0.88));

  gl_FragColor = vec4(finalColor, 1.0);
}
`;
