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

// Environment mode
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
  for (int i = 0; i < 3; ++i) {
    v += a * noise(p);
    p = rot * p * 2.0 + vec2(50.0);
    a *= 0.5;
  }
  return v;
}

// Aspect ratio cover UV projection with gentle framing to minimize corner watermark
// without aggressively cropping the horizon or composition
vec2 getCoverUV(vec2 uv, vec2 canvasRes, float mediaAspect) {
  float canvasAspect = canvasRes.x / canvasRes.y;
  vec2 st = uv - 0.5;
  
  // Subtle 1.04x scale softly pushes the corner watermark outside view
  st *= 0.96;

  if (canvasAspect > mediaAspect) {
    // Canvas is wider than media: expand vertically
    st.y *= mediaAspect / canvasAspect;
  } else {
    // Canvas is taller than media: expand horizontally
    st.x *= canvasAspect / mediaAspect;
  }
  return st + 0.5;
}

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
  
  // 2. Cursor ripple displacement (subtle, physical, organic fluid reaction)
  vec2 mouseDelta = screenUV - u_mouse;
  float mouseDist = length(mouseDelta * vec2(u_resolution.x / u_resolution.y, 1.0));
  float rippleWave = sin(mouseDist * 30.0 - u_time * 4.5);
  float rippleAtten = exp(-mouseDist * 10.0) * u_cursor_ripple_intensity;
  vec2 rippleOffset = normalize(mouseDelta + 0.0001) * rippleWave * rippleAtten * 0.012;

  // 3. Environment Micro-Displacement
  // NOTE: Because AI footage already provides realistic fluid motion,
  // we use only micro-refractive optical depth to avoid synthetic look
  vec2 opticalDisplacement = vec2(0.0);
  
  if (u_environment_mode == 0) {
    // Ocean: subtle foreground micro-refraction only
    float waterDepthFactor = smoothstep(0.65, 0.2, camUV.y);
    float microSwell = sin(camUV.x * 16.0 + u_time * 0.8 + camUV.y * 6.0) * 0.0008;
    opticalDisplacement = vec2(microSwell, microSwell * 0.5) * waterDepthFactor;
  } else if (u_environment_mode == 1 || u_environment_mode == 3) {
    // Underwater / Deep: gentle water column refractive shimmer
    float c1 = sin(camUV.x * 6.0 + u_time * 0.6) * 0.0012;
    float c2 = cos(camUV.y * 8.0 - u_time * 0.7) * 0.0012;
    opticalDisplacement = vec2(c1, c2);
  } else if (u_environment_mode == 2) {
    // Shore: gentle coastal wash refraction
    float s1 = sin(camUV.x * 8.0 + u_time * 0.9) * 0.0015;
    opticalDisplacement = vec2(s1, s1 * 0.6);
  }

  // 4. Dive / Scene Transition Distortion (Controlled physical pass)
  vec2 transitionDistort = vec2(0.0);
  if (u_transition_progress > 0.0) {
    float p = u_transition_progress;
    // Controlled peak at surface penetration
    float peakDistort = sin(p * 3.1415926) * u_distortion_amount;
    float swirlAngle = fbm(camUV * 6.0 + u_time * 2.0) * 6.28;
    transitionDistort = vec2(cos(swirlAngle), sin(swirlAngle)) * peakDistort * 0.045;
  }

  // Combined UV coordinate
  vec2 distortedUV = camUV + opticalDisplacement + rippleOffset + transitionDistort;

  // Aspect-ratio cover mapping for textures A and B
  vec2 uvA = getCoverUV(distortedUV, u_resolution, u_ratio_a);
  vec2 uvB = getCoverUV(distortedUV, u_resolution, u_ratio_b);

  // 5. Chromatic Aberration Sampling (Peaks during surface piercing)
  float ca = u_chromatic_aberration * (1.0 + length(screenUV - 0.5) * 1.1);
  vec2 caOffset = vec2(ca * 0.01, ca * 0.005);

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

  // 6. Transition Mask Synthesizer
  vec4 finalColor = colA;
  
  if (u_transition_progress > 0.0) {
    float p = u_transition_progress;
    float mask = 0.0;
    
    if (u_transition_type == 0) {
      // Ocean -> Underwater Dive:
      // Surface membrane pierces downward with liquid turbulence mask
      float noiseMask = fbm(distortedUV * 4.5 + vec2(0.0, u_time * 1.5));
      float verticalThreshold = 1.0 - p * 1.3 + noiseMask * 0.22;
      mask = smoothstep(verticalThreshold - 0.14, verticalThreshold + 0.14, distortedUV.y);
      mask = max(mask, smoothstep(0.72, 1.0, p));
    } else if (u_transition_type == 1) {
      // Shore: Rising toward light & surface coastal water
      float noiseMask = fbm(distortedUV * 3.5 + u_time * 0.8);
      float riseThreshold = (1.0 - p * 1.25) + noiseMask * 0.18;
      mask = smoothstep(distortedUV.y - 0.15, distortedUV.y + 0.15, 1.0 - riseThreshold);
      mask = max(mask, smoothstep(0.75, 1.0, p));
    } else {
      // Deep: Descent downward into the darkness
      float noiseMask = fbm(distortedUV * 3.0 - vec2(0.0, u_time * 1.0));
      float downThreshold = (1.0 - p * 1.25) + noiseMask * 0.18;
      mask = smoothstep(downThreshold + 0.15, downThreshold - 0.15, distortedUV.y);
      mask = max(mask, smoothstep(0.75, 1.0, p));
    }
    
    // Controlled liquid refraction flash along break line
    float boundary = smoothstep(0.0, 0.45, mask) * smoothstep(1.0, 0.55, mask);
    vec3 flashColor = vec3(0.5, 0.82, 0.98) * boundary * sin(p * 3.14159) * 0.35;
    
    finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(flashColor, 0.0);
  }

  // 7. Subtle Underwater Suspended Particles (Marine snow / micro-bubbles)
  if (u_environment_mode == 1 || u_environment_mode == 3 || u_transition_progress > 0.5) {
    vec2 pUV1 = distortedUV * 20.0 + vec2(u_time * 0.1, -u_time * 0.35);
    float n1 = noise(pUV1);
    float part1 = smoothstep(0.91, 0.97, n1) * 0.22;
    
    vec2 pUV2 = distortedUV * 36.0 + vec2(-u_time * 0.08, -u_time * 0.55);
    float n2 = noise(pUV2);
    float part2 = smoothstep(0.93, 0.985, n2) * 0.32;
    
    float particleDensity = (u_environment_mode == 3) ? 1.2 : 0.6;
    vec3 particleColor = vec3(0.85, 0.94, 1.0) * (part1 + part2) * particleDensity;
    finalColor.rgb += particleColor;
  }

  // 8. Choice Hover Biasing (Subtle environmental reaction)
  if (u_choice_hover_bias.x < 0.0) {
    // Left hover (Follow the Shore): subtle warm coastal light bleed on the left
    float leftInfluence = smoothstep(0.75, 0.0, screenUV.x) * abs(u_choice_hover_bias.x);
    vec3 shoreTint = vec3(0.05, 0.12, 0.1);
    finalColor.rgb += shoreTint * leftInfluence * 0.3;
    finalColor.rgb *= (1.0 + leftInfluence * 0.08);
  }
  
  if (u_choice_hover_bias.y < 0.0) {
    // Down hover (Descend): gentle deepening twilight vignette downwards
    float downInfluence = smoothstep(0.4, 1.0, 1.0 - screenUV.y) * abs(u_choice_hover_bias.y);
    vec3 deepTint = vec3(-0.08, -0.06, 0.01);
    finalColor.rgb += deepTint * downInfluence * 0.5;
  }

  // Destination atmosphere contrast
  if (u_environment_mode == 2) {
    // SHORE: brighter, warmer, open coastal sunlight
    finalColor.rgb = mix(finalColor.rgb, finalColor.rgb * vec3(1.06, 1.04, 0.96) + vec3(0.02, 0.02, 0.006), 0.55);
  } else if (u_environment_mode == 3) {
    // DEEP: darker, slower, denser, deeper blue / near-black
    finalColor.rgb = pow(finalColor.rgb, vec3(1.12)) * vec3(0.9, 0.94, 1.02);
  }

  // 9. Film Tone: Cinematic Vignette & Micro-grain
  float vig = length((screenUV - 0.5) * vec2(1.0, 0.88));
  float vignette = smoothstep(1.05, 0.5, vig);
  finalColor.rgb *= mix(0.85, 1.0, vignette);

  // Subtle analog film grain unifying video plates with digital canvas
  float grain = (hash(screenUV * 1200.0 + fract(u_time * 19.0)) - 0.5) * 0.018;
  finalColor.rgb += grain;

  gl_FragColor = vec4(finalColor.rgb, 1.0);
}
`;
