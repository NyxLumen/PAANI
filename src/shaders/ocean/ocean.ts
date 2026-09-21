export const oceanVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vCrest;
varying float vDepth;

uniform float uTime;
uniform vec3 uImpactOrigin;
uniform float uImpactTime;
uniform float uImpactIntensity;

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

  // Dynamic Impact Ripple
  if (uImpactTime > 0.0 && uImpactTime < 8.0) {
    float dist = length(p.xz - uImpactOrigin.xz);
    float rippleSpeed = 4.2;
    float waveFront = uImpactTime * rippleSpeed;
    float dWave = dist - waveFront;
    
    float ringWidth = 1.2 + uImpactTime * 0.6;
    float envelope = exp(-pow(dWave / ringWidth, 2.0)) * exp(-uImpactTime * 0.7);
    float spatialDamping = 1.0 / (1.0 + dist * 0.4);
    
    float ripple = sin(dist * 7.0 - uImpactTime * 14.0) * envelope * uImpactIntensity * spatialDamping;
    displaced.y += ripple;

    if (dist > 0.01) {
      vec2 rDir = normalize(p.xz - uImpactOrigin.xz);
      float dRipple_dDist = (cos(dist * 7.0 - uImpactTime * 14.0) * 7.0) * envelope * uImpactIntensity * spatialDamping;
      tangent.y += rDir.x * dRipple_dDist;
      binormal.y += rDir.y * dRipple_dDist;
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
  // 1. UNDERWATER VIEW (Looking up at the water surface from below)
  // -------------------------------------------------------------
  if (isUnderside) {
    // Snell's Window & Total Internal Reflection (TIR)
    // Critical angle: arcsin(1.0 / 1.333) = 48.6 deg. cos(48.6) = 0.66
    float cosCritical = 0.66;
    float tir = smoothstep(cosCritical, cosCritical + 0.15, NdotV);

    // Light entering from the sky compressed into Snell's window
    vec3 refractRay = refract(-viewDir, normal, 1.333 / 1.0);
    vec3 skyLight = computeSky(refractRay, sunDir);
    // Add sun rays penetrating down through the surface
    float sunTransmission = pow(max(dot(viewDir, sunDir), 0.0), 32.0) * 12.0;
    skyLight += vec3(1.0, 0.95, 0.8) * sunTransmission;

    // Mirrored reflection of the deep water outside Snell's window
    vec3 deepWaterMirror = vec3(0.015, 0.08, 0.16);

    vec3 undersideColor = mix(deepWaterMirror, skyLight, tir);

    // Subtle caustic wave pattern on the underside
    float causticWave = noise(vWorldPosition.xz * 0.8 + vec2(uTime * 0.4)) * 0.3;
    undersideColor += vec3(0.1, 0.35, 0.45) * causticWave;

    // Depth fog for underwater view: fade smoothly into the oceanic abyss at distance
    float dist = length(vWorldPosition - uCameraPosition);
    float underFog = 1.0 - exp(-dist * 0.012);
    vec3 deepAbyss = vec3(0.004, 0.018, 0.045);
    undersideColor = mix(undersideColor, deepAbyss, clamp(underFog, 0.0, 1.0));

    gl_FragColor = vec4(undersideColor, 0.98);
    return;
  }

  // -------------------------------------------------------------
  // 2. ABOVE-WATER VIEW (Standard Ocean Surface)
  // -------------------------------------------------------------
  float R0 = 0.0204; // Water index of refraction n = 1.333
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

  // Subsurface Water Body Color (Beer-Lambert depth absorption)
  vec3 deepOceanColor = vec3(0.008, 0.045, 0.11);
  vec3 shallowWaterColor = vec3(0.02, 0.16, 0.25);
  vec3 waterBody = mix(deepOceanColor, shallowWaterColor, clamp((vDepth + 0.5) * 0.7, 0.0, 1.0));

  // Subsurface scattering
  float sss = pow(clamp(dot(viewDir, -sunDir), 0.0, 1.0), 3.0) * clamp(vDepth * 1.5, 0.0, 1.0);
  waterBody += vec3(0.04, 0.35, 0.32) * sss * 0.8;

  // Composite water body with surface Fresnel reflection
  vec3 surfaceColor = mix(waterBody, skyReflection, fresnel);
  surfaceColor += sunSpecular * fresnel;

  // Subtle wave crest foam
  float crestFoam = smoothstep(0.45, 0.75, vCrest * 0.3 + n2 * 0.2);
  vec3 foamColor = vec3(0.85, 0.94, 0.98);
  surfaceColor = mix(surfaceColor, foamColor, crestFoam * 0.45);

  // Atmospheric distance fog / horizon haze fade
  float dist = length(vWorldPosition - uCameraPosition);
  float fogFactor = 1.0 - exp(-dist * 0.0025);
  vec3 horizonHaze = vec3(0.58, 0.74, 0.88);
  vec3 finalColor = mix(surfaceColor, horizonHaze, clamp(fogFactor, 0.0, 0.85));

  gl_FragColor = vec4(finalColor, 1.0);
}
`;
