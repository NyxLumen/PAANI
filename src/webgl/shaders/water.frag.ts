export const waterFragmentShader = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;

// Media textures
uniform sampler2D u_tex_a;
uniform sampler2D u_tex_b;
uniform float u_ratio_a;
uniform float u_ratio_b;

// Transition
uniform float u_transition_progress; // 0.0 to 1.0
uniform int u_transition_type;       // 0 = dive, 1 = shore, 2 = deep

// Camera & Cinematography (GSAP controlled)
uniform vec2 u_camera_offset;
uniform float u_camera_zoom;
uniform float u_camera_tilt;
uniform float u_distortion_amount;
uniform float u_chromatic_aberration;

// Interaction
uniform vec2 u_mouse;
uniform vec2 u_mouse_velocity;
uniform float u_cursor_ripple_intensity;
uniform vec2 u_choice_hover_bias; // x: left/right [-1, 1], y: down/up [-1, 1]

// Environment type
uniform int u_environment_mode; // 0 = ocean, 1 = underwater, 2 = shore, 3 = deep

// --- Noise & Utility Functions ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
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

// Aspect ratio cover UV projection (preserves framing without stretching)
vec2 getCoverUV(vec2 uv, vec2 canvasRes, float mediaAspect) {
  float canvasAspect = canvasRes.x / canvasRes.y;
  vec2 st = uv - 0.5;
  if (canvasAspect > mediaAspect) {
    // Canvas is wider than media: expand vertically
    st.y *= mediaAspect / canvasAspect;
  } else {
    // Canvas is taller than media: expand horizontally
    st.x *= canvasAspect / mediaAspect;
  }
  return st + 0.5;
}

// Rotate 2D point
vec2 rotate(vec2 p, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vec2 screenUV = v_uv;
  
  // 1. Camera transform (scale around screen center, offset, tilt)
  vec2 camUV = (screenUV - 0.5) / max(0.1, u_camera_zoom);
  camUV = rotate(camUV, u_camera_tilt);
  camUV += 0.5 + u_camera_offset;
  
  // 2. Cursor ripple displacement (subtle and physical)
  vec2 mouseDelta = screenUV - u_mouse;
  float mouseDist = length(mouseDelta * vec2(u_resolution.x / u_resolution.y, 1.0));
  float rippleWave = sin(mouseDist * 28.0 - u_time * 5.0);
  float rippleAtten = exp(-mouseDist * 9.0) * u_cursor_ripple_intensity;
  vec2 rippleOffset = normalize(mouseDelta + 0.0001) * rippleWave * rippleAtten * 0.022;

  // 3. Environment-specific fluid wave displacement
  vec2 waveDisplacement = vec2(0.0);
  
  if (u_environment_mode == 0) {
    // Ocean surface:
    // Horizon is roughly at camUV.y = 0.58 (upper-middle: 40% sky, 60% ocean)
    // Water is below 0.58 in screen coords (y=0 is bottom, y=1 is top in standard GL)
    float horizonY = 0.58;
    float waterDepthFactor = smoothstep(horizonY + 0.08, horizonY - 0.25, camUV.y);
    
    // Multi-octave wave displacement
    float w1 = sin(camUV.x * 12.0 + u_time * 1.6 + camUV.y * 8.0) * 0.004;
    float w2 = cos(camUV.x * 22.0 - u_time * 2.2 + camUV.y * 14.0) * 0.0025;
    float wNoise = fbm(camUV * 6.0 + vec2(u_time * 0.1, u_time * 0.05)) * 0.008;
    
    // Greater displacement in the foreground (lower Y)
    waveDisplacement = vec2(w1 + wNoise, w2 + w1) * waterDepthFactor;
    
    // Sky subtle atmospheric drift
    float skyFactor = smoothstep(horizonY - 0.05, horizonY + 0.2, camUV.y);
    waveDisplacement += vec2(sin(u_time * 0.2 + camUV.y) * 0.0015, 0.0) * skyFactor;
  } else if (u_environment_mode == 1 || u_environment_mode == 3) {
    // Underwater / Deep:
    // Subsurface refraction and gentle caustic liquid currents
    float c1 = sin(camUV.x * 8.0 + u_time * 1.2 + camUV.y * 6.0);
    float c2 = cos(camUV.y * 10.0 - u_time * 1.4 + camUV.x * 7.0);
    waveDisplacement = vec2(c1, c2) * 0.005;
  } else if (u_environment_mode == 2) {
    // Shore: gentle coastal wash
    float s1 = sin(camUV.x * 10.0 + u_time * 1.8 + camUV.y * 5.0) * 0.006;
    float s2 = cos(camUV.y * 8.0 - u_time * 1.5) * 0.004;
    waveDisplacement = vec2(s1, s2);
  }

  // 4. Dive Transition Distortion (accelerating optical refraction & turbulence)
  vec2 diveDistort = vec2(0.0);
  if (u_transition_progress > 0.0) {
    float prog = u_transition_progress;
    // Peak distortion occurs around prog = 0.5 (surface breakthrough)
    float peakDistort = sin(prog * 3.1415926) * u_distortion_amount;
    float swirlAngle = fbm(camUV * 8.0 + u_time * 3.0) * 6.28;
    diveDistort = vec2(cos(swirlAngle), sin(swirlAngle)) * peakDistort * 0.06;
  }

  // Combined UV distortion
  vec2 distortedUV = camUV + waveDisplacement + rippleOffset + diveDistort;

  // Aspect-ratio cover mapping for textures A and B
  vec2 uvA = getCoverUV(distortedUV, u_resolution, u_ratio_a);
  vec2 uvB = getCoverUV(distortedUV, u_resolution, u_ratio_b);

  // 5. Chromatic Aberration Sampling
  float ca = u_chromatic_aberration * (1.0 + length(screenUV - 0.5) * 1.2);
  vec2 caOffset = vec2(ca * 0.012, ca * 0.006);

  vec4 colA;
  colA.r = texture2D(u_tex_a, uvA - caOffset).r;
  colA.g = texture2D(u_tex_a, uvA).g;
  colA.b = texture2D(u_tex_a, uvA + caOffset).b;
  colA.a = 1.0;

  vec4 colB;
  colB.r = texture2D(u_tex_b, uvB - caOffset).r;
  colB.g = texture2D(u_tex_b, uvB).g;
  colB.b = texture2D(u_tex_b, uvB + caOffset).b;
  colB.a = 1.0;

  // 6. Transition Mask Synthesis (Physical passing through liquid)
  vec4 finalColor = colA;
  
  if (u_transition_progress > 0.0) {
    float p = u_transition_progress;
    float mask = 0.0;
    
    if (u_transition_type == 0) {
      // Ocean -> Underwater Dive:
      // Surface membrane pierces downward with liquid turbulence mask
      float noiseMask = fbm(distortedUV * 5.0 + vec2(0.0, u_time * 2.0));
      float verticalThreshold = 1.0 - p * 1.3 + noiseMask * 0.25;
      mask = smoothstep(verticalThreshold - 0.15, verticalThreshold + 0.15, distortedUV.y);
      // As p approaches 1, ensure full takeover
      mask = max(mask, smoothstep(0.7, 1.0, p));
    } else if (u_transition_type == 1) {
      // Shore: Lateral sweep from left to right with coastal wash
      float noiseMask = fbm(distortedUV * 4.0 + u_time);
      float horizontalThreshold = p * 1.3 - noiseMask * 0.2;
      mask = smoothstep(distortedUV.x - 0.2, distortedUV.x + 0.2, horizontalThreshold);
      mask = max(mask, smoothstep(0.8, 1.0, p));
    } else {
      // Deep: Descent downward into the abyss
      float noiseMask = fbm(distortedUV * 3.5 - vec2(0.0, u_time * 1.5));
      float downThreshold = (1.0 - p * 1.25) + noiseMask * 0.2;
      mask = smoothstep(downThreshold + 0.2, downThreshold - 0.2, distortedUV.y);
      mask = max(mask, smoothstep(0.8, 1.0, p));
    }
    
    // Liquid flash / dispersion at the boundary line
    float boundary = smoothstep(0.0, 0.5, mask) * smoothstep(1.0, 0.5, mask);
    vec3 flashColor = vec3(0.4, 0.75, 0.95) * boundary * sin(p * 3.14159) * 0.45;
    
    finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(flashColor, 0.0);
  }

  // 7. Underwater Suspended Particles (Marine Snow & Micro-bubbles)
  if (u_environment_mode == 1 || u_environment_mode == 3 || u_transition_progress > 0.4) {
    // Multi-layer drifting particulate
    vec2 pUV1 = distortedUV * 16.0 + vec2(u_time * 0.2, -u_time * 0.5);
    float n1 = noise(pUV1);
    float part1 = smoothstep(0.88, 0.96, n1) * 0.35;
    
    vec2 pUV2 = distortedUV * 32.0 + vec2(-u_time * 0.15, -u_time * 0.8);
    float n2 = noise(pUV2);
    float part2 = smoothstep(0.92, 0.98, n2) * 0.5;
    
    // Deep scene gets higher particulate density
    float particleDensity = (u_environment_mode == 3) ? 1.4 : 0.8;
    vec3 particleColor = vec3(0.8, 0.92, 1.0) * (part1 + part2) * particleDensity;
    finalColor.rgb += particleColor;
  }

  // 8. Choice Hover Biasing (Subtle environmental reaction)
  // Left hover (Follow the Shore): pull warm coastal aquamarine / sunlight on left
  if (u_choice_hover_bias.x < 0.0) {
    float leftInfluence = smoothstep(0.8, 0.0, screenUV.x) * abs(u_choice_hover_bias.x);
    vec3 shoreTint = vec3(0.08, 0.18, 0.14); // subtle warm turquoise
    finalColor.rgb += shoreTint * leftInfluence * 0.4;
    finalColor.rgb *= (1.0 + leftInfluence * 0.12); // subtle brighten
  }
  
  // Down hover (Descend): pull deep oceanic indigo vignette & darker depth
  if (u_choice_hover_bias.y < 0.0) {
    float downInfluence = smoothstep(0.3, 1.0, 1.0 - screenUV.y) * abs(u_choice_hover_bias.y);
    vec3 deepTint = vec3(-0.12, -0.08, 0.02); // dark oceanic indigo
    finalColor.rgb += deepTint * downInfluence * 0.6;
  }

  // 9. Film Tone: Cinematic Vignette & Micro-grain
  float vig = length((screenUV - 0.5) * vec2(1.0, 0.85));
  float vignette = smoothstep(1.0, 0.45, vig);
  finalColor.rgb *= mix(0.78, 1.0, vignette);

  // Subtle analog film grain to tie physical and digital layers
  float grain = (hash(screenUV * 1400.0 + fract(u_time * 17.0)) - 0.5) * 0.025;
  finalColor.rgb += grain;

  gl_FragColor = vec4(finalColor.rgb, 1.0);
}
`;
