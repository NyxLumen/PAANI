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

  // 1. Natural surface tension capillary vibrations
  float vibration = sin(pos.y * 14.0 + uTime * 7.0) * cos(pos.x * 12.0 + uTime * 6.0) * 0.012;
  pos += norm * vibration;

  // 2. Volume-Preserving Aerodynamic Teardrop (FALLING)
  // Conserves volume: if stretched vertically by sy, horizontal scale must be 1 / sqrt(sy)
  if (uDeformState > 0.5 && uDeformState < 2.5) {
    float fallSpeed = clamp(-uVelocity.y * 0.22, 0.0, 1.2);
    float sy = 1.0 + fallSpeed * 0.55;
    float sxz = 1.0 / sqrt(sy);

    if (pos.y > 0.0) {
      // Elongate top tip
      pos.y *= sy;
      pos.xz *= (sxz - fallSpeed * 0.12 * (pos.y + 0.3));
    } else {
      // Slight flattening on leading face due to air stagnation pressure
      pos.y *= (1.0 - fallSpeed * 0.14);
      pos.xz *= (sxz + fallSpeed * 0.1);
    }
    
    // High-speed air pressure skin ripples
    float skinRipple = sin(pos.y * 28.0 - uTime * 20.0) * 0.007 * fallSpeed;
    pos += norm * skinRipple;
  }

  // 3. Volume-Preserving Contact Squash & Wave Alignment (CONTACT / IMPACT)
  if (uImpactSquash > 0.0) {
    float squashFactor = clamp(uImpactSquash * 0.65, 0.0, 0.75);
    float sy = 1.0 - squashFactor;
    float sxz = 1.0 / sqrt(max(sy, 0.2));

    pos.y *= sy;
    pos.xz *= sxz;

    // Contact capillary waves radiating up the drop skin
    float contactRipples = sin(length(pos.xz) * 32.0 - uTime * 28.0) * 0.025 * uImpactSquash;
    pos += norm * contactRipples;
  }

  // 4. Fluid Surface Merging: top dome dissolves smoothly into expanding capillary ripples
  if (uMergeProgress > 0.0) {
    float r = length(pos.xz);
    float mergeRipples = sin(r * 24.0 - uMergeProgress * 14.0) * 0.012 * (1.0 - uMergeProgress);
    pos.y += mergeRipples;
    // Flatten downward into ocean plane
    pos.y -= uMergeProgress * 0.14;
  }

  // 5. Underwater fluid turbulence
  if (uDeformState > 2.5) {
    float wobble1 = sin(pos.y * 9.0 + uTime * 8.0) * 0.03;
    float wobble2 = cos(pos.z * 11.0 + uTime * 9.0) * 0.03;
    pos += norm * (wobble1 + wobble2);
  }

  vThickness = clamp(1.0 - length(pos.xz) / 0.35, 0.15, 1.0);

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * norm);

  // Merge mask: 0 below water surface (dissolved boundary), 1 above
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

vec3 computeSky(vec3 rayDir, vec3 sunDir) {
  float cosTheta = dot(rayDir, sunDir);
  float height = clamp(rayDir.y, 0.0, 1.0);

  vec3 zenithColor = vec3(0.08, 0.24, 0.52);
  vec3 horizonColor = vec3(0.62, 0.78, 0.92);
  vec3 sunWarmth = vec3(1.0, 0.86, 0.62);

  float hGrad = pow(1.0 - height, 3.2);
  vec3 sky = mix(zenithColor, horizonColor, hGrad);

  float horizonRim = exp(-max(rayDir.y, 0.0) * 10.0);
  sky += sunWarmth * horizonRim * 0.3;

  float mie = pow(max(cosTheta, 0.0), 36.0) * 0.9;
  float sunDisc = smoothstep(0.9992, 0.9999, cosTheta) * 16.0;

  return sky + sunWarmth * (mie + sunDisc);
}

vec3 computeOceanEnv(vec3 rayDir) {
  vec3 deepOcean = vec3(0.04, 0.16, 0.32);
  vec3 horizonSea = vec3(0.12, 0.38, 0.55);
  float t = clamp(-rayDir.y * 1.5, 0.0, 1.0);
  return mix(horizonSea, deepOcean, t);
}

vec3 sampleEnvironment(vec3 rayDir, vec3 sunDir, float submerged) {
  float envBlend = smoothstep(-0.25, 0.25, rayDir.y);
  vec3 airEnv = mix(computeOceanEnv(rayDir), computeSky(rayDir, sunDir), envBlend);
  vec3 waterEnv = mix(vec3(0.015, 0.08, 0.16), vec3(0.12, 0.45, 0.68), clamp(rayDir.y * 0.5 + 0.5, 0.0, 1.0));
  return mix(airEnv, waterEnv, submerged);
}

void main() {
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(uSunDirection);

  float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);

  // 1. Water Fresnel
  float R0 = 0.0204;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - NdotV, 4.5);

  // 2. Reflection
  vec3 reflectRay = reflect(-viewDir, normal);
  vec3 reflectedRadiance = sampleEnvironment(reflectRay, sunDir, uSubmerged);

  // 3. Chromatic Refraction
  vec3 refractR = refract(-viewDir, normal, 1.0 / 1.331);
  vec3 refractG = refract(-viewDir, normal, 1.0 / 1.333);
  vec3 refractB = refract(-viewDir, normal, 1.0 / 1.338);

  if (length(refractR) < 0.01) refractR = reflectRay;
  if (length(refractG) < 0.01) refractG = reflectRay;
  if (length(refractB) < 0.01) refractB = reflectRay;

  vec3 sampleRayR = vec3(refractR.x, -refractR.y * 0.6 + 0.25, refractR.z);
  vec3 sampleRayG = vec3(refractG.x, -refractG.y * 0.6 + 0.25, refractG.z);
  vec3 sampleRayB = vec3(refractB.x, -refractB.y * 0.6 + 0.25, refractB.z);

  float colR = sampleEnvironment(sampleRayR, sunDir, uSubmerged).r;
  float colG = sampleEnvironment(sampleRayG, sunDir, uSubmerged).g;
  float colB = sampleEnvironment(sampleRayB, sunDir, uSubmerged).b;
  vec3 refractedColor = vec3(colR, colG, colB);

  // 4. Liquid Core Transmission
  vec3 liquidCoreTint = vec3(0.75, 0.94, 1.0);
  vec3 transmission = mix(refractedColor, liquidCoreTint, 0.18 * vThickness);

  // 5. Internal Caustic Focusing & Ring
  float internalCausticGlow = pow(max(dot(refractG, sunDir), 0.0), 6.0) * 1.8;
  vec3 causticColor = vec3(1.0, 0.96, 0.88) * internalCausticGlow;

  float causticRing = smoothstep(0.15, 0.45, NdotV) * smoothstep(0.75, 0.45, NdotV);
  vec3 internalRing = vec3(0.5, 0.85, 1.0) * causticRing * 0.45;

  // 6. Direct Directional Sun Highlights
  vec3 halfVector = normalize(sunDir + viewDir);
  float NdotH = max(dot(normal, halfVector), 0.0);
  
  float sunSpecularPrimary = pow(NdotH, 360.0) * 18.0;
  float sunSpecularSecondary = pow(NdotH, 45.0) * 0.9;
  vec3 primaryGlint = (sunSpecularPrimary + sunSpecularSecondary) * vec3(1.0, 0.96, 0.88);

  float backNdotH = max(dot(-normal, halfVector), 0.0);
  float secondaryBackGlint = pow(backNdotH, 180.0) * 3.5;
  vec3 backGlint = secondaryBackGlint * vec3(0.85, 0.95, 1.0);

  // 7. Silvery Grazing Fresnel Rim
  float rimSheen = pow(1.0 - NdotV, 3.8);
  vec3 rimHighlight = vec3(0.88, 0.95, 1.0) * rimSheen * 0.9;

  // 8. Air Composite
  vec3 airSpecular = primaryGlint * (fresnel + 0.35) + backGlint + rimHighlight;
  vec3 dropColorAir = mix(transmission + causticColor + internalRing, reflectedRadiance, fresnel) + airSpecular;

  // -------------------------------------------------------------
  // 9. FLUID SURFACE MERGING (5.7):
  // As the droplet penetrates the surface, the submerged portion index-matches
  // with the ocean water, eliminating optical boundary contrast.
  // -------------------------------------------------------------
  if (uMergeProgress > 0.0) {
    vec3 oceanBodyColor = vec3(0.02, 0.16, 0.28);
    dropColorAir = mix(oceanBodyColor, dropColorAir, vMergeMask);
  }

  // 10. Underwater State: Silvery Cavitation Sheen & Translucent Water Refraction
  float tirFactor = pow(1.0 - NdotV, 2.5);
  vec3 underwaterSilverySheen = vec3(0.75, 0.94, 1.0) * (tirFactor * 1.8 + 0.3);
  vec3 underwaterTransmission = refractedColor * vec3(0.45, 0.88, 1.0) + vec3(0.08, 0.42, 0.62) * (vThickness * 0.6 + 0.2);
  
  vec3 dropColorUnderwater = mix(underwaterTransmission, underwaterSilverySheen, tirFactor * 0.75);
  dropColorUnderwater += primaryGlint * 0.6 + rimHighlight * 0.8;

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
