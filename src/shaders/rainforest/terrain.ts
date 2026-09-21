export const terrainVertexShader = `
uniform float uTime;
uniform float uTransitionWeight;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSlope;
varying float vElevation;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  
  // Normal in world space
  vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
  vNormal = worldNormal;
  vWorldPosition = worldPos.xyz;
  
  // Slope: 1.0 = vertical cliff, 0.0 = flat ground
  vSlope = 1.0 - clamp(worldNormal.y, 0.0, 1.0);
  vElevation = worldPos.y;

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const terrainFragmentShader = `
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uCameraPosition;
uniform float uTransitionWeight;
uniform float uWetness;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vSlope;
varying float vElevation;

// 2D Hash & Value Noise for texture detail
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; ++i) {
    v += a * noise(p);
    p = rot * p * 2.0 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPosition - vWorldPosition);
  vec3 L = normalize(uSunDirection);
  vec3 H = normalize(L + V);

  // Detail noise at different scales
  float microDetail = fbm(vWorldPosition.xz * 1.8);
  float macroDetail = fbm(vWorldPosition.xz * 0.25);

  // Material Palettes:
  // 1. Wet Mud / Soil (Low elevation & flat areas)
  vec3 mudColor = vec3(0.08, 0.05, 0.035) * (0.8 + 0.4 * microDetail);
  
  // 2. Lush Moss Loam (Medium slopes, rich forest carpet)
  vec3 mossDeep = vec3(0.04, 0.16, 0.05);
  vec3 mossBright = vec3(0.12, 0.32, 0.08);
  vec3 mossColor = mix(mossDeep, mossBright, microDetail);

  // 3. Wet Basalt / Rainforest Rock (Steep slopes, crags)
  vec3 rockDark = vec3(0.05, 0.06, 0.065);
  vec3 rockLichen = vec3(0.09, 0.12, 0.09);
  vec3 rockColor = mix(rockDark, rockLichen, macroDetail);

  // 4. Coastal Tidal Sand & Wet River Stones (Sea boundary)
  vec3 sandColor = vec3(0.24, 0.20, 0.14) * (0.85 + 0.3 * microDetail);

  // Blending weights based on slope and height
  float rockFactor = smoothstep(0.35, 0.65, vSlope);
  float mudFactor = smoothstep(2.5, 0.2, vElevation) * (1.0 - rockFactor);
  float mossFactor = clamp(1.0 - rockFactor - mudFactor * 0.7, 0.0, 1.0);

  vec3 baseAlbedo = mudColor * mudFactor + mossColor * mossFactor + rockColor * rockFactor;

  // Shoreline tidal sand transition towards the coastal surf (negative Z & low elevation)
  float shoreFactor = smoothstep(1.8, 0.0, vElevation) * smoothstep(8.0, -8.0, vWorldPosition.z);
  baseAlbedo = mix(baseAlbedo, sandColor, shoreFactor * (1.0 - rockFactor * 0.6));

  // Wetness modulation: Low areas, shore, and mud have higher wet sheen
  float localWetness = clamp(uWetness + (1.0 - smoothstep(0.0, 3.0, vElevation)) * 0.4 + shoreFactor * 0.3, 0.0, 1.0);
  baseAlbedo *= mix(1.0, 0.72, localWetness); // Wet surfaces are naturally darker/saturated

  // Lighting calculations:
  // Diffuse with wrap lighting for soft jungle bounce
  float wrapDiff = max((dot(N, L) + 0.3) / 1.3, 0.0);
  
  // Canopy ambient bounce (tinted emerald green from leaves above)
  vec3 canopyBounce = vec3(0.05, 0.14, 0.08) * max(N.y, 0.2);
  vec3 skyAmbient = vec3(0.08, 0.12, 0.14) * max(N.y, 0.0);
  vec3 sunColor = vec3(1.0, 0.96, 0.85) * 1.8;

  // Specular sheen for wet mud, tidal sand, and damp stones
  float roughness = mix(0.85, 0.12, localWetness * (1.0 - mossFactor * 0.6));
  float NdotH = max(dot(N, H), 0.0);
  float specPower = mix(8.0, 120.0, 1.0 - roughness);
  float spec = pow(NdotH, specPower) * mix(0.1, 0.95, localWetness);

  // Fresnel on wet film
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0) * localWetness * 0.45;

  vec3 finalColor = baseAlbedo * (wrapDiff * sunColor + canopyBounce + skyAmbient);
  finalColor += (spec + fresnel) * sunColor;

  // Mist and humidity distance fade
  float dist = length(uCameraPosition - vWorldPosition);
  float mistDensity = 0.013;
  float mistFactor = 1.0 - exp(-dist * mistDensity);
  vec3 mistColor = vec3(0.11, 0.21, 0.16); // Deep humid rainforest teal-green haze
  finalColor = mix(finalColor, mistColor, clamp(mistFactor, 0.0, 0.92));

  // Biome transition blending
  gl_FragColor = vec4(finalColor, uTransitionWeight);
}
`;
