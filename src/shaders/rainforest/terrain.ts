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
  float microDetail = fbm(vWorldPosition.xz * 2.4);
  float macroDetail = fbm(vWorldPosition.xz * 0.28);
  float litterNoise = smoothstep(0.68, 0.92, fbm(vWorldPosition.xz * 4.5));

  // Organic leaf litter flecks scattered on the forest floor
  float isLeafLitter = litterNoise * smoothstep(0.4, 0.0, vSlope);
  vec3 litterColor = vec3(0.22, 0.11, 0.06) * (0.8 + 0.4 * microDetail);

  // Material Palettes:
  // 1. Wet Mud / Silt (Low elevation & flat basin areas)
  vec3 mudColor = vec3(0.11, 0.075, 0.048) * (0.85 + 0.35 * microDetail);
  
  // 2. Lush Moss Loam (Medium slopes, rich forest carpet)
  vec3 mossDeep = vec3(0.06, 0.22, 0.08);
  vec3 mossBright = vec3(0.16, 0.38, 0.12);
  vec3 mossColor = mix(mossDeep, mossBright, microDetail);

  // 3. Wet Basalt / Rainforest Rock (Steep slopes, crags)
  vec3 rockDark = vec3(0.065, 0.075, 0.080);
  vec3 rockLichen = vec3(0.105, 0.145, 0.105);
  vec3 rockColor = mix(rockDark, rockLichen, macroDetail);

  // 4. Coastal Tidal Sand & Wet River Stones (Sea boundary)
  vec3 sandColor = vec3(0.24, 0.20, 0.15) * (0.85 + 0.3 * microDetail);

  // Blending weights based on slope and height
  float rockFactor = smoothstep(0.32, 0.62, vSlope);
  float mudFactor = smoothstep(2.2, 0.2, vElevation) * (1.0 - rockFactor);
  float mossFactor = clamp(1.0 - rockFactor - mudFactor * 0.65, 0.0, 1.0);

  vec3 baseAlbedo = mudColor * mudFactor + mossColor * mossFactor + rockColor * rockFactor;
  baseAlbedo = mix(baseAlbedo, litterColor, isLeafLitter * 0.65);

  // Shoreline tidal sand transition towards the coastal surf (negative Z & low elevation)
  float shoreFactor = smoothstep(1.8, 0.0, vElevation) * smoothstep(8.0, -8.0, vWorldPosition.z);
  baseAlbedo = mix(baseAlbedo, sandColor, shoreFactor * (1.0 - rockFactor * 0.6));

  // Micro-surface normal perturbation for organic soil/rock texture
  float nDerivX = (fbm(vWorldPosition.xz * 2.4 + vec2(0.05, 0.0)) - microDetail) * 0.8;
  float nDerivZ = (fbm(vWorldPosition.xz * 2.4 + vec2(0.0, 0.05)) - microDetail) * 0.8;
  N = normalize(N + vec3(nDerivX, 0.0, nDerivZ) * (1.0 - rockFactor * 0.4));

  // Wetness modulation: Low areas, shore, and mud have higher wet sheen
  float localWetness = clamp(uWetness + (1.0 - smoothstep(0.0, 2.5, vElevation)) * 0.45 + shoreFactor * 0.35, 0.0, 1.0);
  baseAlbedo *= mix(1.0, 0.70, localWetness); // Wet surfaces are naturally darker/saturated

  // Standing puddle water reflection in deep depressions
  float puddleBasin = smoothstep(1.1, 0.3, vElevation) * (1.0 - smoothstep(0.0, 0.15, vSlope));

  // Lighting calculations:
  float wrapDiff = max((dot(N, L) + 0.52) / 1.52, 0.0);
  
  // Canopy ambient bounce (tinted emerald green from leaves above)
  vec3 canopyBounce = vec3(0.12, 0.28, 0.14) * max(N.y, 0.2);
  vec3 skyAmbient = vec3(0.12, 0.18, 0.24) * max(N.y, 0.0);
  vec3 sunColor = vec3(1.0, 0.96, 0.85) * 1.85;

  // Specular sheen for wet mud, tidal sand, damp stones, and standing water film
  float roughness = mix(0.85, 0.08, max(localWetness * (1.0 - mossFactor * 0.5), puddleBasin * 0.95));
  float NdotH = max(dot(N, H), 0.0);
  float specPower = mix(8.0, 180.0, 1.0 - roughness);
  float spec = pow(NdotH, specPower) * mix(0.1, 1.25, localWetness);

  // Fresnel on wet soil / puddle film
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0) * mix(0.04, 0.75, localWetness);

  // Reflected canopy sky in standing puddle film
  vec3 skyReflectColor = mix(vec3(0.08, 0.22, 0.14), vec3(0.55, 0.74, 0.88), clamp(N.y, 0.0, 1.0));
  baseAlbedo = mix(baseAlbedo, skyReflectColor, puddleBasin * 0.55 * fresnel);

  vec3 finalColor = baseAlbedo * (wrapDiff * sunColor + canopyBounce + skyAmbient);
  finalColor += spec * sunColor + fresnel * skyReflectColor;

  // Mist and humidity distance fade
  float dist = length(uCameraPosition - vWorldPosition);
  float mistDensity = 0.012;
  float mistFactor = 1.0 - exp(-dist * mistDensity);
  vec3 mistColor = vec3(0.11, 0.21, 0.16); // Deep humid rainforest teal-green haze
  finalColor = mix(finalColor, mistColor, clamp(mistFactor, 0.0, 0.92));

  // Biome transition blending
  gl_FragColor = vec4(finalColor, uTransitionWeight);
}
`;
