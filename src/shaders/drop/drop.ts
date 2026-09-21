export const dropVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vThickness;

uniform float uTime;
uniform float uDeformState; // 0: Idle/Reveal, 1: Falling, 2: Impact/Squash, 3: Underwater
uniform vec3 uVelocity;
uniform float uImpactSquash;

void main() {
  vUv = uv;
  vec3 pos = position;
  vec3 norm = normal;

  // 1. Natural surface tension capillary vibration
  float vibration = sin(pos.y * 14.0 + uTime * 7.0) * cos(pos.x * 12.0 + uTime * 6.0) * 0.012;
  pos += norm * vibration;

  // 2. Aerodynamic Teardrop deformation when falling
  if (uDeformState > 0.5 && uDeformState < 2.5) {
    float fallSpeed = clamp(-uVelocity.y * 0.22, 0.0, 1.2);
    
    if (pos.y > 0.0) {
      pos.y *= (1.0 + fallSpeed * 0.55);
      pos.xz *= (1.0 - fallSpeed * 0.22 * (pos.y + 0.4));
    } else {
      pos.y *= (1.0 - fallSpeed * 0.18);
      pos.xz *= (1.0 + fallSpeed * 0.16);
    }
    
    float skinRipple = sin(pos.y * 28.0 - uTime * 20.0) * 0.007 * fallSpeed;
    pos += norm * skinRipple;
  }

  // 3. Impact Squash deformation
  if (uImpactSquash > 0.0) {
    float squashY = 1.0 - uImpactSquash * 0.58;
    float expandXZ = 1.0 + uImpactSquash * 0.48;
    pos.y *= squashY;
    pos.xz *= expandXZ;

    float impactRipples = sin(length(pos.xz) * 35.0 - uTime * 30.0) * 0.025 * uImpactSquash;
    pos += norm * impactRipples;
  }

  // 4. Underwater fluid turbulence & buoyant wobble
  if (uDeformState > 2.5) {
    float wobble1 = sin(pos.y * 9.0 + uTime * 8.0) * 0.03;
    float wobble2 = cos(pos.z * 11.0 + uTime * 9.0) * 0.03;
    pos += norm * (wobble1 + wobble2);
  }

  // Optical thickness
  vThickness = clamp(1.0 - length(pos.xz) / 0.35, 0.15, 1.0);

  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  vNormal = normalize(mat3(modelMatrix) * norm);

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

uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uSubmerged;

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

vec3 sampleEnvironment(vec3 rayDir, vec3 sunDir) {
  if (rayDir.y >= -0.05) {
    return computeSky(rayDir, sunDir);
  } else {
    return computeOceanEnv(rayDir);
  }
}

void main() {
  vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
  vec3 normal = normalize(vNormal);
  vec3 sunDir = normalize(uSunDirection);

  float NdotV = clamp(dot(normal, viewDir), 0.0, 1.0);

  // 1. Physically-inspired Water Fresnel (n = 1.333)
  float R0 = 0.0204;
  float fresnel = R0 + (1.0 - R0) * pow(1.0 - NdotV, 4.5);

  // 2. Reflection Ray
  vec3 reflectRay = reflect(-viewDir, normal);
  vec3 reflectedRadiance = sampleEnvironment(reflectRay, sunDir);

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

  float colR = sampleEnvironment(sampleRayR, sunDir).r;
  float colG = sampleEnvironment(sampleRayG, sunDir).g;
  float colB = sampleEnvironment(sampleRayB, sunDir).b;
  vec3 refractedColor = vec3(colR, colG, colB);

  // 4. Internal Liquid Transmission
  vec3 liquidCoreTint = vec3(0.75, 0.94, 1.0);
  vec3 transmission = mix(refractedColor, liquidCoreTint, 0.18 * vThickness);

  // 5. Internal Caustic Focusing
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
  vec3 dropColorAir = mix(transmission + causticColor + internalRing, reflectedRadiance, fresnel);
  dropColorAir += primaryGlint * (fresnel + 0.35);
  dropColorAir += backGlint;
  dropColorAir += rimHighlight;

  // 9. Underwater State: Silvery Cavitation Sheen & Translucent Water Refraction
  float tirFactor = pow(1.0 - NdotV, 2.5);
  vec3 underwaterSilverySheen = vec3(0.75, 0.94, 1.0) * (tirFactor * 1.8 + 0.3);
  vec3 underwaterTransmission = refractedColor * vec3(0.45, 0.88, 1.0) + vec3(0.08, 0.42, 0.62) * (vThickness * 0.6 + 0.2);
  
  vec3 dropColorUnderwater = mix(underwaterTransmission, underwaterSilverySheen, tirFactor * 0.75);
  dropColorUnderwater += primaryGlint * 1.1;
  dropColorUnderwater += rimHighlight * 1.4;

  vec3 finalColor = mix(dropColorAir, dropColorUnderwater, uSubmerged);

  float alphaAir = mix(0.55, 0.98, fresnel + rimSheen * 0.5);
  float alphaUnderwater = mix(0.65, 0.99, tirFactor + 0.2);
  float finalAlpha = clamp(mix(alphaAir, alphaUnderwater, uSubmerged), 0.45, 1.0);

  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;
