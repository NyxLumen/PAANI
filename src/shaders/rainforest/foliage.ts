export const foliageVertexShader = `
uniform float uTime;
uniform float uTransitionWeight;
uniform float uWindStrength;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vTranslucency;
varying float vInstanceSeed;

void main() {
  vUv = uv;

  #ifdef USE_INSTANCING
    vec4 localPos = instanceMatrix * vec4(position, 1.0);
    vec3 localNormal = mat3(instanceMatrix) * normal;
    // Derive unique pseudo-random seed per instance for natural color/sway variance
    vInstanceSeed = fract(instanceMatrix[3][0] * 12.9898 + instanceMatrix[3][2] * 78.233);
  #else
    vec4 localPos = vec4(position, 1.0);
    vec3 localNormal = normal;
    vInstanceSeed = 0.5;
  #endif

  vec4 worldPos = modelMatrix * localPos;
  vec3 worldNormal = normalize(mat3(modelMatrix) * localNormal);

  // Multi-frequency hierarchical wind sway
  // Height and UV progression: leaf tips (uv.y -> 1.0) deflect with greater amplitude
  float swayWeight = pow(uv.y, 1.7);
  float swayTime = uTime * 1.5 + vInstanceSeed * 6.28;
  
  // 1. Primary macro branch/stem sway (low frequency)
  float stemSwayX = sin(swayTime + worldPos.x * 0.25 + worldPos.z * 0.18) * 0.08;
  float stemSwayZ = cos(swayTime * 0.85 + worldPos.x * 0.18 + worldPos.z * 0.22) * 0.06;

  // 2. Secondary leaf blade flutter (medium frequency)
  float bladeFlutter = sin(swayTime * 2.8 + worldPos.y * 1.5) * 0.04;

  // 3. High-frequency edge shivering in thermal gusts
  float edgeShiver = cos(swayTime * 5.2 + (uv.x - 0.5) * 8.0) * 0.015;

  vec3 windOffset = vec3(
    (stemSwayX + bladeFlutter + edgeShiver) * swayWeight * uWindStrength,
    -abs(stemSwayX * 0.4 + bladeFlutter * 0.3) * swayWeight * uWindStrength, // gravitational dip under drag
    (stemSwayZ + bladeFlutter * 0.8 + edgeShiver) * swayWeight * uWindStrength
  );

  worldPos.xyz += windOffset;
  vWorldPosition = worldPos.xyz;
  vNormal = worldNormal;

  // Edge and tip translucency enhancement
  vTranslucency = smoothstep(0.0, 0.4, uv.y) * (1.0 - abs(uv.x - 0.5) * 0.4);

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
varying float vTranslucency;
varying float vInstanceSeed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  // Two-sided surface lighting with outward normal orientation
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) {
    N = -N;
  }

  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(L + V);

  // -------------------------------------------------------------
  // 1. Organic Leaf Anatomy: Central Costa & Lateral Vein Ribs
  // -------------------------------------------------------------
  float spineDist = abs(vUv.x - 0.5) * 2.0; // 0.0 at spine, 1.0 at blade margin
  float ribAngle = vUv.y - abs(vUv.x - 0.5) * 0.38;
  float ribPattern = sin(ribAngle * 42.0);
  float veinFactor = smoothstep(0.86, 0.96, ribPattern) * (1.0 - spineDist * 0.5);
  float isCostaSpine = 1.0 - smoothstep(0.0, 0.075, spineDist);

  // Instance color variation: younger vs older leaves, chlorophyll balance
  float hueShift = (vInstanceSeed - 0.5) * 0.14;
  vec3 baseColor = uLeafColorBase + vec3(-hueShift * 0.5, hueShift * 0.8, -hueShift * 0.3);
  vec3 veinColor = mix(baseColor, vec3(0.42, 0.62, 0.16), 0.72);
  vec3 edgeColor = baseColor * 0.82;

  // Composite leaf albedo
  vec3 albedo = mix(baseColor, edgeColor, pow(spineDist, 1.7));
  albedo = mix(albedo, veinColor, max(isCostaSpine * 0.65, veinFactor * 0.42));

  // -------------------------------------------------------------
  // 2. Direct Sun Light with Soft Diffuse Wrap
  // -------------------------------------------------------------
  float NdotL = dot(N, L);
  float wrapDiff = max((NdotL + 0.55) / 1.55, 0.0);
  vec3 sunLight = vec3(1.0, 0.96, 0.88) * 2.2 * wrapDiff;

  // -------------------------------------------------------------
  // 3. Physically-Inspired Subsurface Transmission (Backlit & Front SSS)
  // Radiant lime-emerald translucency through chloroplast layer
  // -------------------------------------------------------------
  vec3 sssVector = normalize(L + N * 0.35);
  float forwardSSS = pow(max(dot(V, -sssVector), 0.0), 2.4) * 1.6;
  float backSSS = max(dot(-N, L), 0.0) * 0.75;
  float sssIntensity = (forwardSSS + backSSS) * vTranslucency;
  vec3 sssColor = uLeafColorTranslucent * sssIntensity * (1.0 - isCostaSpine * 0.35);

  // -------------------------------------------------------------
  // 4. Canopy Ambient Lighting (Occlusion & Sky Fill)
  // -------------------------------------------------------------
  vec3 canopyAmbient = vec3(0.18, 0.42, 0.20) * (0.45 + 0.55 * max(N.y * 0.5 + 0.5, 0.0));
  vec3 skyFill = vec3(0.14, 0.22, 0.30) * max(N.y * 0.5 + 0.5, 0.0);

  // -------------------------------------------------------------
  // 5. Dual-Specular Wet Cuticle Model
  // Razor-sharp specular glint from water film + soft waxy leaf cuticle
  // -------------------------------------------------------------
  float NdotH = max(dot(N, H), 0.0);

  // Component A: Mirror-like water film
  float razorSpec = pow(NdotH, 220.0) * 2.2 * uWetness;

  // Component B: Soft waxy cuticle highlight
  float cuticleSpec = pow(NdotH, 24.0) * 0.42 * (1.0 - uWetness * 0.3);

  // Physical Fresnel reflection on rain film
  float NdotV = max(dot(N, V), 0.0);
  float filmFresnel = pow(1.0 - NdotV, 4.5) * mix(0.06, 0.72, uWetness);

  vec3 reflectSky = mix(canopyAmbient, vec3(0.35, 0.55, 0.42), clamp(N.y, 0.0, 1.0));
  vec3 specularTotal = (razorSpec + cuticleSpec) * vec3(1.0, 0.98, 0.92) + filmFresnel * reflectSky;

  // -------------------------------------------------------------
  // 6. Final Shading & Atmospheric Canopy Mist
  // -------------------------------------------------------------
  vec3 diffuseTotal = albedo * (sunLight + canopyAmbient + skyFill);
  vec3 finalColor = diffuseTotal + sssColor + specularTotal;

  // Depth-dependent humid jungle haze
  float dist = length(uCameraPosition - vWorldPosition);
  float mistFactor = 1.0 - exp(-dist * 0.0075);
  vec3 mistColor = vec3(0.16, 0.28, 0.22);
  finalColor = mix(finalColor, mistColor, clamp(mistFactor, 0.0, 0.82));

  gl_FragColor = vec4(finalColor, uTransitionWeight);
}
`;
