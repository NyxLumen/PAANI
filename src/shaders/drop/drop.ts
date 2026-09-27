export const dropVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vThickness;
varying float vMergeMask;

uniform float uTime;
uniform float uDeformState; // 0: Idle, 1: Falling, 2: Impact/Contact, 3: Underwater
uniform vec3 uVelocity;
uniform float uImpactSquash;
uniform vec3 uSurfaceNormal;
uniform float uMergeProgress; // 0.0 (unmerged) -> 1.0 (fully merged)
uniform float uWaterHeight;

void main() {
  vUv = uv;
  vec3 pos = position;
  vec3 norm = normal;

  // 1. Physical Rayleigh Surface Tension Natural Oscillation Modes
  // Liquid droplets oscillate primarily via l=2 (prolate/oblate) and l=3 (pear-shaped) spherical harmonics
  float cosTheta = norm.y;
  float P2 = 0.5 * (3.0 * cosTheta * cosTheta - 1.0);
  float P3 = 0.5 * (5.0 * cosTheta * cosTheta * cosTheta - 3.0 * cosTheta);

  float oscFreq2 = 8.5;
  float oscFreq3 = 13.8;
  float oscAmp2 = 0.016;
  float oscAmp3 = 0.008;

  // Modulate oscillation intensity with velocity/movement
  float speed = length(uVelocity);
  float dynamicAmp = clamp(speed * 0.08 + 0.35, 0.3, 1.6);
  float rayleighWobble = (sin(uTime * oscFreq2) * P2 * oscAmp2 + cos(uTime * oscFreq3) * P3 * oscAmp3) * dynamicAmp;
  pos += norm * rayleighWobble;

  // 2. Incompressible Volume-Preserving Aerodynamic Teardrop (FALLING)
  // Strictly preserves volume V = 4/3 * pi * rx * ry * rz:
  // If vertical dimension stretches by sy, horizontal radius MUST scale by 1.0 / sqrt(sy)
  if (uDeformState > 0.5 && uDeformState < 2.5) {
    float fallSpeed = clamp(-uVelocity.y * 0.22, 0.0, 1.35);
    float sy = 1.0 + fallSpeed * 0.62;
    float sxz = 1.0 / sqrt(max(sy, 0.1));

    if (pos.y > 0.0) {
      // Tapered aerodynamic tail
      pos.y *= sy;
      float taper = 1.0 - clamp(pos.y * 0.45, 0.0, 0.7);
      pos.xz *= sxz * taper;
    } else {
      // Dynamic stagnation pressure flattening on leading hemisphere
      float stagPressure = 1.0 - fallSpeed * 0.18;
      pos.y *= stagPressure;
      pos.xz *= (sxz + fallSpeed * 0.12);
    }
    
    // High-speed air shear capillary skin ripple
    float skinRipple = sin(pos.y * 32.0 - uTime * 24.0) * 0.008 * fallSpeed;
    pos += norm * skinRipple;
  }

  // 3. Volume-Preserving Contact Squash & Meniscus Adhesion
  if (uImpactSquash > 0.0) {
    float squashFactor = clamp(uImpactSquash * 0.70, 0.0, 0.78);
    float sy = 1.0 - squashFactor;
    float sxz = 1.0 / sqrt(max(sy, 0.18));

    // Align with surface normal
    pos.y *= sy;
    pos.xz *= sxz;

    // Contact capillary waves radiating up the droplet skin
    float contactRipples = sin(length(pos.xz) * 36.0 - uTime * 30.0) * 0.028 * uImpactSquash;
    pos += norm * contactRipples;

    // Meniscus footing: boundary widens slightly at base to adhere to surface
    if (pos.y < -0.1) {
      float footing = exp(-pow((pos.y + 0.3) / 0.15, 2.0)) * 0.08 * uImpactSquash;
      pos.xz *= (1.0 + footing);
    }
  }

  // 4. Fluid Surface Merging: top dome dissolves smoothly into expanding capillary ripples
  if (uMergeProgress > 0.0) {
    float r = length(pos.xz);
    float mergeRipples = sin(r * 26.0 - uMergeProgress * 15.0) * 0.015 * (1.0 - uMergeProgress);
    pos.y += mergeRipples;
    pos.y -= uMergeProgress * 0.16;
  }

  // 5. Underwater fluid turbulence
  if (uDeformState > 2.5) {
    float wobble1 = sin(pos.y * 10.0 + uTime * 8.5) * 0.035;
    float wobble2 = cos(pos.z * 12.0 + uTime * 9.5) * 0.035;
    pos += norm * (wobble1 + wobble2);
  }

  // Optical volume thickness through droplet
  vThickness = clamp(1.0 - length(pos.xz) / 0.36, 0.12, 1.0);

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * norm);

  vMergeMask = smoothstep(uWaterHeight - 0.08, uWaterHeight + 0.08, vWorldPosition.y);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const dropFragmentShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vThickness;
varying float vMergeMask;

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uSubmerged;
uniform float uMergeProgress;
uniform float uRainforestWeight;

vec3 computeSky(vec3 rayDir, vec3 sunDir) {
  float cosTheta = dot(rayDir, sunDir);
  float height = clamp(rayDir.y, 0.0, 1.0);

  vec3 zenithColor = vec3(0.06, 0.20, 0.48);
  vec3 horizonColor = vec3(0.58, 0.76, 0.90);
  vec3 sunWarmth = vec3(1.0, 0.88, 0.65);

  float hGrad = pow(1.0 - height, 3.2);
  vec3 sky = mix(zenithColor, horizonColor, hGrad);

  float horizonRim = exp(-max(rayDir.y, 0.0) * 10.0);
  sky += sunWarmth * horizonRim * 0.32;

  float mie = pow(max(cosTheta, 0.0), 38.0) * 1.1;
  float sunDisc = smoothstep(0.9995, 0.9999, cosTheta) * 3.5;

  return sky + sunWarmth * (mie + sunDisc);
}

vec3 computeOceanEnv(vec3 rayDir) {
  vec3 deepOcean = vec3(0.03, 0.14, 0.28);
  vec3 horizonSea = vec3(0.10, 0.34, 0.50);
  float t = clamp(-rayDir.y * 1.5, 0.0, 1.0);
  return mix(horizonSea, deepOcean, t);
}

vec3 computeRainforestEnv(vec3 rayDir, vec3 sunDir) {
  vec3 leafClose = vec3(0.22, 0.58, 0.20);
  vec3 canopyMid = vec3(0.12, 0.38, 0.16);
  vec3 skyGleam = vec3(0.75, 0.90, 0.82);
  float t = clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 env = mix(leafClose, canopyMid, t);
  if (rayDir.y > 0.4) {
    env = mix(env, skyGleam, (rayDir.y - 0.4) / 0.6);
  }
  return env;
}

vec3 sampleEnvironment(vec3 rayDir, vec3 sunDir, float submerged) {
  float envBlend = smoothstep(-0.25, 0.25, rayDir.y);
  vec3 oceanAirEnv = mix(computeOceanEnv(rayDir), computeSky(rayDir, sunDir), envBlend);
  vec3 rainforestEnv = computeRainforestEnv(rayDir, sunDir);
  vec3 airEnv = mix(oceanAirEnv, rainforestEnv, uRainforestWeight);
  vec3 waterEnv = mix(vec3(0.012, 0.07, 0.15), vec3(0.10, 0.42, 0.64), clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(airEnv, waterEnv, submerged);
}

void main() {
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(uSunDirection);

  float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);

  // 1. Physical Water Schlick Fresnel (n = 1.3333, R0 = 0.0204)
  float R0 = 0.0204;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - NdotV, 5.0);

  // 2. Reflection of Surrounding Atmosphere
  vec3 reflectRay = reflect(-viewDir, normal);
  vec3 reflectedRadiance = sampleEnvironment(reflectRay, sunDir, uSubmerged);

  // -------------------------------------------------------------
  // 3. Chromatic Refraction with Physical Liquid Dispersion
  // Red, Green, and Blue rays refract at distinct wavelength angles
  // (Cauchy dispersion: n_red = 1.331, n_green = 1.333, n_blue = 1.338)
  // -------------------------------------------------------------
  vec3 refractR = refract(-viewDir, normal, 1.0 / 1.331);
  vec3 refractG = refract(-viewDir, normal, 1.0 / 1.333);
  vec3 refractB = refract(-viewDir, normal, 1.0 / 1.338);

  if (length(refractR) < 0.01) refractR = reflectRay;
  if (length(refractG) < 0.01) refractG = reflectRay;
  if (length(refractB) < 0.01) refractB = reflectRay;

  // Inverted optical inversion inside spherical droplet lens
  vec3 sampleRayR = vec3(refractR.x, -refractR.y * 0.65 + 0.22, refractR.z);
  vec3 sampleRayG = vec3(refractG.x, -refractG.y * 0.65 + 0.22, refractG.z);
  vec3 sampleRayB = vec3(refractB.x, -refractB.y * 0.65 + 0.22, refractB.z);

  float colR = sampleEnvironment(sampleRayR, sunDir, uSubmerged).r;
  float colG = sampleEnvironment(sampleRayG, sunDir, uSubmerged).g;
  float colB = sampleEnvironment(sampleRayB, sunDir, uSubmerged).b;
  vec3 refractedColor = vec3(colR, colG, colB);

  // -------------------------------------------------------------
  // 4. Liquid Core Transmission with Beer-Lambert Extinction
  // Pure water absorbs slightly more red over volume depth
  // -------------------------------------------------------------
  vec3 extinction = mix(vec3(0.12, 0.02, 0.005), vec3(0.04, 0.015, 0.005), uRainforestWeight);
  vec3 transmissionFilter = exp(-extinction * (vThickness * 3.0));
  vec3 transmission = refractedColor * transmissionFilter;

  // -------------------------------------------------------------
  // 5. Internal Caustic Focusing: Light rays entering droplet converge
  // onto the rear internal surface, creating a radiant focal cone
  // -------------------------------------------------------------
  float internalCausticGlow = pow(max(dot(refractG, sunDir), 0.0), 7.0) * 2.4;
  vec3 causticColor = vec3(1.0, 0.97, 0.88) * internalCausticGlow;

  // Caustic annular rim where total internal reflection begins inside droplet
  float causticRing = smoothstep(0.14, 0.42, NdotV) * smoothstep(0.78, 0.42, NdotV);
  vec3 ringColor = mix(vec3(0.45, 0.85, 1.0), vec3(0.75, 1.0, 0.45), uRainforestWeight);
  vec3 internalRing = ringColor * causticRing * 0.45;

  // -------------------------------------------------------------
  // 6. Dual-Lobe Directional Sun Specular Highlights
  // Razor-sharp primary highlight + soft secondary internal back-glint
  // -------------------------------------------------------------
  vec3 halfVector = normalize(sunDir + viewDir);
  float NdotH = max(dot(normal, halfVector), 0.0);
  
  float sunSpecularPrimary = pow(NdotH, 420.0) * 18.0;
  float sunSpecularSecondary = pow(NdotH, 50.0) * 1.0;
  vec3 primaryGlint = (sunSpecularPrimary + sunSpecularSecondary) * vec3(1.0, 0.97, 0.90);

  // Glint reflecting off the back internal wall of droplet
  float backNdotH = max(dot(-normal, halfVector), 0.0);
  float secondaryBackGlint = pow(backNdotH, 200.0) * 3.5;
  vec3 backGlint = secondaryBackGlint * vec3(0.85, 0.95, 1.0);

  // 7. Silvery Grazing Fresnel Rim with Micro-Sheen
  float rimSheen = pow(1.0 - NdotV, 3.8);
  vec3 rimColor = mix(vec3(0.90, 0.96, 1.0), vec3(0.95, 1.0, 0.92), uRainforestWeight);
  vec3 rimHighlight = rimColor * rimSheen * 0.65;

  // 8. Air Composite
  vec3 airSpecular = primaryGlint * (fresnel + 0.35) + backGlint + rimHighlight;
  vec3 dropColorAir = mix(transmission + causticColor + internalRing, reflectedRadiance, fresnel) + airSpecular;

  // 9. Surface Merging: Submerged boundary index-matches ocean/puddle water
  if (uMergeProgress > 0.0) {
    vec3 oceanBody = vec3(0.015, 0.14, 0.25);
    vec3 puddleBody = vec3(0.05, 0.12, 0.07);
    vec3 mergeBody = mix(oceanBody, puddleBody, uRainforestWeight);
    dropColorAir = mix(mergeBody, dropColorAir, vMergeMask);
  }

  // 10. Underwater State: Silvery Cavitation Sheen & Translucent Water Refraction
  float tirFactor = pow(1.0 - NdotV, 2.5);
  vec3 underwaterSilverySheen = vec3(0.75, 0.94, 1.0) * (tirFactor * 2.0 + 0.3);
  vec3 underwaterTransmission = refractedColor * vec3(0.42, 0.88, 1.0) + vec3(0.06, 0.40, 0.60) * (vThickness * 0.6 + 0.2);
  
  vec3 dropColorUnderwater = mix(underwaterTransmission, underwaterSilverySheen, tirFactor * 0.75);
  dropColorUnderwater += primaryGlint * 0.7 + rimHighlight * 0.85;

  vec3 finalColor = mix(dropColorAir, dropColorUnderwater, uSubmerged);

  float alphaAir = mix(0.55, 0.98, fresnel + rimSheen * 0.5);
  if (uMergeProgress > 0.0) {
    alphaAir = mix(alphaAir * 0.15, alphaAir, vMergeMask);
    alphaAir = mix(alphaAir, 0.0, uMergeProgress * (1.0 - vMergeMask));
  }

  float alphaUnderwater = mix(0.65, 0.99, tirFactor + 0.2);
  float finalAlpha = clamp(mix(alphaAir, alphaUnderwater, uSubmerged), 0.0, 1.0);

  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;
