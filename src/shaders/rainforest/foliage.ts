export const foliageVertexShader = `
uniform float uTime;
uniform float uTransitionWeight;
uniform float uWindStrength;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vTranslucency;

void main() {
  vUv = uv;

  // Handle both standard Mesh and InstancedMesh
  #ifdef USE_INSTANCING
    vec4 localPos = instanceMatrix * vec4(position, 1.0);
    vec3 localNormal = mat3(instanceMatrix) * normal;
  #else
    vec4 localPos = vec4(position, 1.0);
    vec3 localNormal = normal;
  #endif

  vec4 worldPos = modelMatrix * localPos;
  vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);

  // Multi-frequency procedural wind sway
  // Height and UV-based deflection: leaf tips (uv.y -> 1.0) move more than base
  float swayWeight = uv.y * uv.y;
  float swayTime = uTime * 1.6;
  
  // Primary gentle branch sway
  float stemSway = sin(swayTime + worldPos.x * 0.35 + worldPos.z * 0.25) * 0.06;
  // Secondary rapid leaf-tip flutter
  float leafFlutter = cos(swayTime * 2.8 + worldPos.x * 1.5 + worldPos.y * 2.0) * 0.035;

  vec3 windOffset = vec3(
    (stemSway + leafFlutter) * swayWeight * uWindStrength,
    -abs(stemSway * 0.3) * swayWeight * uWindStrength, // leaves droop slightly when pushed
    (stemSway * 0.6 + leafFlutter * 0.8) * swayWeight * uWindStrength
  );

  worldPos.xyz += windOffset;
  vWorldPosition = worldPos.xyz;
  vNormal = worldNormal;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const foliageFragmentShader = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;
uniform float uWetness;
uniform vec3 uLeafColorBase;
uniform vec3 uLeafColorTranslucent;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;

// Procedural cellular/leaf vein noise
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Two-sided surface lighting
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) {
    N = -N;
  }

  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(L + V);

  // Leaf structure: Central vein spine and lateral ribs
  float spineDist = abs(vUv.x - 0.5) * 2.0; // 0.0 at spine, 1.0 at edge
  float ribPattern = sin((vUv.y - abs(vUv.x - 0.5) * 0.35) * 36.0);
  float veinFactor = smoothstep(0.85, 0.95, ribPattern) * (1.0 - spineDist * 0.5);
  float isSpine = 1.0 - smoothstep(0.0, 0.08, spineDist);

  // Leaf Albedo variation
  vec3 baseColor = uLeafColorBase;
  vec3 veinColor = mix(baseColor, vec3(0.35, 0.55, 0.12), 0.65);
  vec3 edgeColor = baseColor * 0.85;

  vec3 albedo = mix(baseColor, edgeColor, pow(spineDist, 1.8));
  albedo = mix(albedo, veinColor, max(isSpine * 0.6, veinFactor * 0.35));

  // 1. Direct Sun Lighting with Soft Foliage Wrap
  float NdotL = dot(N, L);
  float wrapDiff = max((NdotL + 0.35) / 1.35, 0.0);
  vec3 sunLight = vec3(1.0, 0.96, 0.88) * 1.9 * wrapDiff;

  // 2. Subsurface Scattering (Backlit emerald radiance)
  // When looking towards the sun through the leaf, light glows brightly
  float backSun = max(dot(-L, V), 0.0);
  float subsurfaceIntensity = pow(backSun, 2.6) * 1.4;
  // Subsurface light is warmer and saturated lime-emerald
  vec3 sssColor = uLeafColorTranslucent * subsurfaceIntensity * (1.0 - isSpine * 0.5);

  // 3. Ambient bounce (canopy occlusion & sky tint)
  vec3 canopyAmbient = vec3(0.06, 0.15, 0.08) * (0.4 + 0.6 * max(N.y, 0.0));
  vec3 skyFill = vec3(0.05, 0.08, 0.10) * max(N.y, 0.0);

  // 4. Physical Wetness Specular Highlight
  // Tropical leaves after rain have a gleaming mirror-like water film
  float roughness = mix(0.45, 0.08, uWetness);
  float NdotH = max(dot(N, H), 0.0);
  float specPower = mix(16.0, 160.0, 1.0 - roughness);
  float specular = pow(NdotH, specPower) * mix(0.2, 1.2, uWetness);

  // 5. Rain Sheen Fresnel
  float NdotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - NdotV, 4.0) * mix(0.08, 0.65, uWetness);

  vec3 diffuseTotal = albedo * (sunLight + canopyAmbient + skyFill);
  vec3 finalColor = diffuseTotal + sssColor + (specular + fresnel) * vec3(1.0, 0.98, 0.92);

  // Atmospheric jungle mist
  float dist = length(uCameraPosition - vWorldPosition);
  float mistFactor = 1.0 - exp(-dist * 0.007);
  vec3 mistColor = vec3(0.18, 0.28, 0.24);
  finalColor = mix(finalColor, mistColor, clamp(mistFactor, 0.0, 0.8));

  gl_FragColor = vec4(finalColor, uTransitionWeight);
}
`;
