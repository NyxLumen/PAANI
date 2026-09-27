export const barkVertexShader = `
uniform float uTime;
uniform float uTransitionWeight;
uniform float uWindStrength;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vLocalHeight;

void main() {
  vUv = uv;
  vLocalHeight = position.y;

  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);

  // Subtle wind sway for upper trunk and branches (base anchored firmly to terrain)
  float heightRatio = clamp((worldPos.y - 3.0) / 26.0, 0.0, 1.0);
  float swayWeight = pow(heightRatio, 1.8);
  float swayTime = uTime * 1.1;

  float swayX = sin(swayTime + worldPos.x * 0.12 + worldPos.z * 0.15) * 0.035 * swayWeight * uWindStrength;
  float swayZ = cos(swayTime * 0.85 + worldPos.x * 0.15 + worldPos.z * 0.12) * 0.028 * swayWeight * uWindStrength;

  worldPos.x += swayX;
  worldPos.z += swayZ;

  vWorldPosition = worldPos.xyz;
  vNormal = worldNormal;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const barkFragmentShader = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;
uniform float uWetness;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vLocalHeight;

// Hash and 2D value noise
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// 4-octave FBM with rotational lacunarity
float fbm2D(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise2D(p);
    p = rot * p * 2.05 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) {
    N = -N;
  }

  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(L + V);

  // -------------------------------------------------------------
  // 1. Procedural Longitudinal Bark Structure
  // -------------------------------------------------------------
  // Coordinates stretched along vertical growth axis to avoid blobby noise
  float U = vUv.x * 26.0;
  float Y = vWorldPosition.y * 0.42;

  // Longitudinal fissures and ridges following tree growth direction
  float coarseNoise = fbm2D(vec2(U * 0.3, Y * 0.75));
  float furrowPattern = sin(U * 3.14159265 + coarseNoise * 3.8);
  float plateFactor = smoothstep(-0.35, 0.40, furrowPattern); // 1.0 on bark plate, 0.0 in fissure

  // Secondary longitudinal cracks inside each bark plate
  float crackNoise = fbm2D(vec2(U * 1.4, Y * 3.2));
  float plateCracks = smoothstep(0.38, 0.68, crackNoise);
  plateFactor = clamp(plateFactor * (0.80 + 0.35 * plateCracks), 0.0, 1.0);

  // Fine micro bark grain
  float microGrain = noise2D(vec2(U * 3.5, Y * 9.0));

  // Macro-scale color variance along tree height and circumference
  float macroVar = fbm2D(vec2(vWorldPosition.x * 0.05 + 2.5, vWorldPosition.z * 0.05 + vWorldPosition.y * 0.025));

  // -------------------------------------------------------------
  // 2. Bark Color Palette (Warm Dark Brown, Never Pure Black)
  // -------------------------------------------------------------
  vec3 colDeepFissure = vec3(0.095, 0.065, 0.045); // Deep warm umber in crevices
  vec3 colBarkShade   = vec3(0.18, 0.13, 0.095);   // Dark warm brown
  vec3 colBarkPlate   = vec3(0.28, 0.20, 0.145);   // Weathered warm brown bark ridge
  vec3 colBarkGrey    = vec3(0.22, 0.19, 0.165);   // Aged brown-grey

  vec3 baseBark = mix(colBarkPlate, colBarkGrey, macroVar * 0.45);
  vec3 barkAlbedo = mix(colDeepFissure, baseBark, plateFactor);
  barkAlbedo *= (0.88 + 0.25 * microGrain);

  // -------------------------------------------------------------
  // 3. Procedural Moss Layer (Crevices, Upward Surfaces, Base)
  // -------------------------------------------------------------
  float upFacing = smoothstep(0.15, 0.85, N.y);
  float baseDamp = smoothstep(6.5, 0.5, vWorldPosition.y) * 0.35;
  float creviceProtection = (1.0 - plateFactor) * 0.30;
  float moistDir = max(dot(N.xz, normalize(vec2(0.35, 0.9))), 0.0) * 0.20;

  float mossNoise = fbm2D(vWorldPosition.xz * 1.6 + vec2(vWorldPosition.y * 0.28, vWorldPosition.x * 0.18));
  float mossRaw = mossNoise * 1.05 + upFacing * 0.55 + baseDamp + creviceProtection + moistDir;
  float mossMask = smoothstep(0.70, 1.15, mossRaw);
  mossMask = clamp(mossMask * 0.72, 0.0, 0.78); // Secondary accent layer, never engulfs the tree

  vec3 mossDeep = vec3(0.11, 0.22, 0.08);
  vec3 mossSage = vec3(0.20, 0.32, 0.14);
  vec3 mossColor = mix(mossDeep, mossSage, mossNoise);

  vec3 finalAlbedo = mix(barkAlbedo, mossColor, mossMask);

  // -------------------------------------------------------------
  // 4. Subtle Surface Normal Perturbation
  // -------------------------------------------------------------
  float furrowDeriv = cos(U * 3.14159265 + coarseNoise * 3.8) * 0.20 * (1.0 - mossMask * 0.65);
  vec3 perturbedN = normalize(N + vec3(furrowDeriv * (1.0 - abs(N.y) * 0.7), 0.0, furrowDeriv * (1.0 - abs(N.y) * 0.7)));

  // -------------------------------------------------------------
  // 5. Lighting Model & Minimum Radiance Floor
  // -------------------------------------------------------------
  // Direct sun with soft wrap
  float NdotL = dot(perturbedN, L);
  float wrapDiff = max((NdotL + 0.45) / 1.45, 0.0);
  vec3 sunDirect = vec3(1.0, 0.96, 0.88) * 2.2 * wrapDiff;

  // Overhead canopy ambient bounce (rich chlorophyllic green)
  vec3 canopyAmbient = vec3(0.18, 0.32, 0.16) * (0.35 + 0.65 * max(perturbedN.y * 0.5 + 0.5, 0.0));

  // Forest floor earthen ambient bounce
  vec3 groundAmbient = vec3(0.14, 0.10, 0.07) * max(-perturbedN.y * 0.5 + 0.5, 0.0);

  // Sky fill
  vec3 skyFill = vec3(0.10, 0.15, 0.22) * max(perturbedN.y * 0.5 + 0.5, 0.0);

  // Minimum radiance floor: ensures bark remains readable in deep canopy shadows without glowing
  vec3 minRadianceFloor = vec3(0.052, 0.042, 0.034) * (0.80 + 0.35 * plateFactor);

  vec3 totalLight = sunDirect + canopyAmbient + groundAmbient + skyFill + minRadianceFloor;
  vec3 diffuseTotal = finalAlbedo * totalLight;

  // -------------------------------------------------------------
  // 6. Restrained Wet Specular & Rain Film Sheen
  // -------------------------------------------------------------
  // Water channels into furrows
  float localWetness = uWetness * mix(0.65, 1.0, (1.0 - plateFactor) * 0.70);
  float roughness = mix(0.86, 0.44, localWetness * (1.0 - plateFactor * 0.45));
  roughness = mix(roughness, 0.94, mossMask * 0.85); // Moss is velvety and absorbs glare

  float NdotH = max(dot(perturbedN, H), 0.0);
  float specPower = mix(12.0, 85.0, 1.0 - roughness);
  float specIntensity = pow(NdotH, specPower) * mix(0.08, 0.55, localWetness) * (1.0 - mossMask * 0.75);
  vec3 specColor = vec3(1.0, 0.98, 0.90) * specIntensity;

  float NdotV = max(dot(perturbedN, V), 0.0);
  float wetFresnel = pow(1.0 - NdotV, 4.5) * mix(0.03, 0.25, localWetness) * (1.0 - mossMask * 0.75);
  vec3 reflectSky = mix(canopyAmbient, vec3(0.28, 0.40, 0.32), clamp(perturbedN.y, 0.0, 1.0));
  vec3 specularTotal = specColor + wetFresnel * reflectSky;

  // -------------------------------------------------------------
  // 7. Atmospheric Canopy Mist
  // -------------------------------------------------------------
  float dist = length(uCameraPosition - vWorldPosition);
  float mistFactor = 1.0 - exp(-dist * 0.0075);
  vec3 mistColor = vec3(0.16, 0.28, 0.22);
  vec3 finalColor = diffuseTotal + specularTotal;
  finalColor = mix(finalColor, mistColor, clamp(mistFactor, 0.0, 0.82));

  gl_FragColor = vec4(finalColor, uTransitionWeight);
}
`;
