export const waterFragmentShader = `
precision highp float;

varying vec2 v_uv;

uniform vec2 u_resolution;
uniform float u_time;

// Media textures
uniform sampler2D u_tex_a;
uniform sampler2D u_tex_b;
uniform sampler2D u_tex_trans;
uniform float u_ratio_a;
uniform float u_ratio_b;
uniform float u_ratio_trans;
uniform int u_has_trans_video; // 1 if dedicated AI transition video is active

// Transition Control
uniform float u_transition_progress; // 0.0 to 1.0
uniform float u_reveal_start;        // normalized time destination begins appearing
uniform float u_reveal_end;          // normalized time destination reaches 100%
// 0 = none, 1 = surface-dive, 2 = evaporation, 3 = atmospheric, 4 = rainfall, 5 = ocean-return, 6 = deep-descent
uniform int u_transition_recipe;

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

// Environment mode (0 = ocean, 1 = underwater, 2 = shore, 3 = deep, 4 = cloudAscent, 5 = clouds, 6 = rain)
uniform int u_environment_mode;

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

// Aspect ratio cover UV projection with gentle framing
vec2 getCoverUV(vec2 uv, vec2 canvasRes, float mediaAspect) {
  float canvasAspect = canvasRes.x / canvasRes.y;
  vec2 st = uv - 0.5;
  
  // Safe margin scale prevents texture clamping at edges during camera motion
  st *= 0.88;

  if (canvasAspect > mediaAspect) {
    st.y *= mediaAspect / canvasAspect;
  } else {
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
  
  // 1. Camera transform (scale around center, offset, tilt)
  vec2 camUV = (screenUV - 0.5) / max(0.1, u_camera_zoom);
  camUV = rotate(camUV, u_camera_tilt);
  camUV += 0.5 + u_camera_offset;
  
  // 2. Cursor ripple displacement (subtle, physical, organic fluid reaction)
  vec2 mouseDelta = screenUV - u_mouse;
  float mouseDist = length(mouseDelta * vec2(u_resolution.x / u_resolution.y, 1.0));
  float rippleWave = sin(mouseDist * 28.0 - u_time * 4.0);
  float rippleAtten = exp(-mouseDist * 11.0) * u_cursor_ripple_intensity;
  vec2 rippleOffset = normalize(mouseDelta + 0.0001) * rippleWave * rippleAtten * 0.009;

  // 3. Environment Micro-Displacement (Subtle optical depth, never fighting AI video)
  vec2 opticalDisplacement = vec2(0.0);
  
  if (u_environment_mode == 0) {
    // Ocean: subtle foreground micro-refraction only
    float waterDepthFactor = smoothstep(0.65, 0.25, camUV.y);
    float microSwell = sin(camUV.x * 14.0 + u_time * 0.7 + camUV.y * 5.0) * 0.0006;
    opticalDisplacement = vec2(microSwell, microSwell * 0.4) * waterDepthFactor;
  } else if (u_environment_mode == 1 || u_environment_mode == 3) {
    // Underwater / Deep: gentle water column shimmer
    float c1 = sin(camUV.x * 5.0 + u_time * 0.5) * 0.0008;
    float c2 = cos(camUV.y * 6.0 - u_time * 0.6) * 0.0008;
    opticalDisplacement = vec2(c1, c2);
  } else if (u_environment_mode == 2) {
    // Shore: gentle coastal wash refraction
    float s1 = sin(camUV.x * 6.0 + u_time * 0.8) * 0.0009;
    opticalDisplacement = vec2(s1, s1 * 0.5);
  }

  // 4. Transition-Specific Optical Refraction (Strictly restrained, no liquid melting)
  vec2 transitionDisplacement = vec2(0.0);
  float p = u_transition_progress;

  if (p > 0.0) {
    if (u_transition_recipe == 1) {
      // Surface Dive: vertical Fresnel refraction right at water surface contact
      float surfaceBand = sin(p * 3.1415926);
      float vRefract = sin(camUV.y * 18.0 - u_time * 3.0) * 0.006 * surfaceBand * u_distortion_amount;
      transitionDisplacement = vec2(0.0, vRefract);
    } else if (u_transition_recipe == 2) {
      // Evaporation: soft vertical vapor drift
      float vDrift = sin(camUV.x * 8.0 + u_time * 0.8) * 0.002 * sin(p * 3.14159);
      transitionDisplacement = vec2(vDrift, 0.0);
    }
  }

  vec2 distortedUV = camUV + opticalDisplacement + rippleOffset + transitionDisplacement;

  // Aspect-ratio cover mapping for textures A and B
  vec2 uvA = getCoverUV(distortedUV, u_resolution, u_ratio_a);
  vec2 uvB = getCoverUV(distortedUV, u_resolution, u_ratio_b);
  vec2 uvTrans = getCoverUV(distortedUV, u_resolution, u_ratio_trans);

  // 5. Restrained Chromatic Aberration (Micro-dispersion, no harsh RGB split)
  float ca = u_chromatic_aberration * (1.0 + length(screenUV - 0.5) * 0.8);
  vec2 caOffset = vec2(ca * 0.005, ca * 0.0025);

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

  vec4 colTrans = vec4(0.0);
  if (u_has_trans_video == 1) {
    colTrans.r = texture2D(u_tex_trans, uvTrans - caOffset).r;
    colTrans.g = texture2D(u_tex_trans, uvTrans).g;
    colTrans.b = texture2D(u_tex_trans, uvTrans + caOffset).b;
    colTrans.a = 1.0;
  }

  // 6. Transition-Specific Recipes & AI Video Integration
  vec4 finalColor = colA;

  if (p > 0.0) {
    if (u_has_trans_video == 1) {
      // ===================================================================
      // DEDICATED AI TRANSITION FOOTAGE (Dominant: 85-90% visual weight)
      // ===================================================================
      // Stage 1: Quick entry from Scene A into transition footage (0.0 to 0.15)
      float enterTrans = smoothstep(0.0, 0.15, p);
      vec4 sourceToTrans = mix(colA, colTrans, enterTrans);

      // Stage 2: Destination reveal window [u_reveal_start, u_reveal_end]
      float rStart = clamp(u_reveal_start, 0.1, 0.9);
      float rEnd = clamp(u_reveal_end, rStart + 0.05, 1.0);
      float revealProgress = smoothstep(rStart, rEnd, p);

      // Optical continuity enhancement per transition type
      if (u_transition_recipe == 1) {
        // Ocean -> Underwater: subtle water surface meniscus gleam at boundary
        float gleam = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 0.06;
        vec3 waterTint = vec3(0.04, 0.08, 0.12) * gleam;
        finalColor = mix(sourceToTrans, colB, revealProgress) + vec4(waterTint, 0.0);
      } else if (u_transition_recipe == 2) {
        // Shore -> Sky: soft atmospheric warm glow at sun peak
        float sunBloom = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 0.08;
        vec3 warmSky = vec3(0.12, 0.10, 0.06) * sunBloom;
        finalColor = mix(sourceToTrans, colB, revealProgress) + vec4(warmSky, 0.0);
      } else if (u_transition_recipe == 4) {
        // Clouds -> Rain: subtle exposure continuity into storm rain
        finalColor = mix(sourceToTrans, colB, revealProgress);
      } else if (u_transition_recipe == 5) {
        // Rain -> Ocean: subtle ocean spray/mist at water impact boundary
        float splashGleam = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 0.05;
        vec3 sprayTint = vec3(0.08, 0.12, 0.16) * splashGleam;
        finalColor = mix(sourceToTrans, colB, revealProgress) + vec4(sprayTint, 0.0);
      } else if (u_transition_recipe == 7) {
        // Deep -> Ocean: gentle upward light ascension / water column shimmer
        float ascendGleam = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 0.06;
        vec3 lightShaft = vec3(0.06, 0.12, 0.18) * ascendGleam * smoothstep(0.9, 0.1, distortedUV.y);
        finalColor = mix(sourceToTrans, colB, revealProgress) + vec4(lightShaft, 0.0);
      } else {
        finalColor = mix(sourceToTrans, colB, revealProgress);
      }
    } else if (u_transition_recipe == 1) {
      // ==========================================
      // RECIPE 1: SURFACE DIVE (Ocean -> Underwater fallback)
      // ==========================================
      float breakThreshold = (1.0 - p * 1.35) + sin(distortedUV.x * 7.0 + u_time * 1.5) * 0.035;
      float mask = smoothstep(breakThreshold - 0.2, breakThreshold + 0.12, distortedUV.y);
      mask = max(mask, smoothstep(0.68, 0.96, p));
      
      float meniscus = smoothstep(0.0, 0.45, mask) * smoothstep(1.0, 0.55, mask);
      vec3 waterGleam = vec3(0.35, 0.65, 0.85) * meniscus * sin(p * 3.14159) * 0.22;
      
      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(waterGleam, 0.0);

    } else if (u_transition_recipe == 2) {
      // ==========================================
      // RECIPE 2: EVAPORATION (Shore -> Cloud Ascent fallback)
      // ==========================================
      float vaporNoise = (noise(distortedUV * vec2(3.5, 1.8) + vec2(0.0, -u_time * 0.5)) - 0.5) * 0.12;
      float vaporThreshold = 1.0 - p * 1.32 + vaporNoise;
      float mask = smoothstep(vaporThreshold - 0.22, vaporThreshold + 0.22, distortedUV.y);
      mask = max(mask, smoothstep(0.7, 1.0, p));
      
      float vaporBloom = sin(p * 3.14159) * 0.18;
      vec3 warmLight = vec3(1.0, 0.96, 0.9) * vaporBloom * smoothstep(0.8, 0.1, distortedUV.y);
      
      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(warmLight, 0.0);

    } else if (u_transition_recipe == 3) {
      // ==========================================
      // RECIPE 3: ATMOSPHERIC (Cloud Ascent -> Clouds)
      // ==========================================
      float cloudShape = (noise(distortedUV * 2.2 + vec2(u_time * 0.05, 0.0)) - 0.5) * 0.18;
      float mask = smoothstep(0.25, 0.75, p + cloudShape);
      
      vec3 cloudBloom = vec3(0.03, 0.035, 0.05) * sin(p * 3.14159);
      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(cloudBloom, 0.0);

    } else if (u_transition_recipe == 4) {
      // ==========================================
      // RECIPE 4: RAINFALL (Clouds -> Rain fallback)
      // ==========================================
      vec4 darkA = colA;
      darkA.rgb *= mix(1.0, 0.88, smoothstep(0.0, 0.5, p));
      
      float rainStreakNoise = noise(vec2(distortedUV.x * 30.0, distortedUV.y * 4.0 - u_time * 8.0)) * 0.07;
      float downThreshold = (1.0 - p * 1.3) + rainStreakNoise;
      float mask = smoothstep(downThreshold + 0.18, downThreshold - 0.18, distortedUV.y);
      mask = max(mask, smoothstep(0.72, 1.0, p));
      
      finalColor = mix(darkA, colB, clamp(mask, 0.0, 1.0));

    } else if (u_transition_recipe == 5) {
      // ==========================================
      // RECIPE 5: OCEAN RETURN (Rain -> Ocean fallback)
      // ==========================================
      float oceanHorizon = 0.58;
      float descendNoise = (noise(distortedUV * 3.5 + vec2(0.0, u_time * 0.8)) - 0.5) * 0.08;
      float approachThreshold = (1.0 - p * 1.35) + descendNoise;
      float mask = smoothstep(approachThreshold + 0.18, approachThreshold - 0.18, distortedUV.y);
      mask = max(mask, smoothstep(0.72, 1.0, p));
      
      float touchDown = sin(p * 3.14159) * 0.08;
      vec3 sprayMist = vec3(0.2, 0.35, 0.5) * touchDown;
      
      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(sprayMist, 0.0);

    } else if (u_transition_recipe == 6) {
      // ==========================================
      // RECIPE 6: DEEP DESCENT (Underwater -> Deep)
      // ==========================================
      float extinction = sin(p * 3.14159) * 0.35;
      float mask = smoothstep(0.2, 0.85, p);
      vec3 deepNavy = vec3(0.03, 0.05, 0.09);
      
      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0));
      finalColor.rgb = mix(finalColor.rgb, deepNavy, extinction * smoothstep(0.3, 1.0, 1.0 - screenUV.y));

    } else if (u_transition_recipe == 7) {
      // ==========================================
      // RECIPE 7: DEEP RETURN (Deep -> Ocean fallback)
      // ==========================================
      float upwardNoise = (noise(distortedUV * 3.0 + vec2(0.0, -u_time * 0.6)) - 0.5) * 0.1;
      float mask = smoothstep(0.25, 0.85, p + upwardNoise);
      float surfaceArrival = sin(p * 3.14159) * 0.15;
      vec3 surfaceLight = vec3(0.4, 0.6, 0.8) * surfaceArrival;

      finalColor = mix(colA, colB, clamp(mask, 0.0, 1.0)) + vec4(surfaceLight, 0.0);
    }
  }

  // 7. Atmospheric Moisture & Particulate (Strictly subtle, naturally integrated)
  if (u_environment_mode == 1 || u_environment_mode == 3) {
    // Underwater / Deep: drifting marine snow
    vec2 pUV = distortedUV * 22.0 + vec2(u_time * 0.08, -u_time * 0.3);
    float nPart = noise(pUV);
    float part = smoothstep(0.92, 0.98, nPart) * ((u_environment_mode == 3) ? 0.35 : 0.2);
    finalColor.rgb += vec3(0.85, 0.94, 1.0) * part;
  } else if (u_environment_mode == 4 || u_environment_mode == 5) {
    // Cloud / Ascent soft vapor particles
    vec2 cUV = distortedUV * 16.0 + vec2(u_time * 0.04, u_time * 0.15);
    float nCloud = noise(cUV);
    float cPart = smoothstep(0.94, 0.99, nCloud) * 0.12;
    finalColor.rgb += vec3(0.96, 0.98, 1.0) * cPart;
  } else if (u_environment_mode == 6) {
    // Rain subtle falling droplets
    vec2 rUV = distortedUV * vec2(35.0, 6.0) - vec2(0.0, u_time * 12.0);
    float nRain = noise(rUV);
    float rPart = smoothstep(0.95, 0.99, nRain) * 0.16;
    finalColor.rgb += vec3(0.88, 0.93, 1.0) * rPart;
  }

  // 8. Choice Hover Biasing (Restrained environmental response)
  if (u_choice_hover_bias.x < 0.0) {
    float leftInfluence = smoothstep(0.75, 0.0, screenUV.x) * abs(u_choice_hover_bias.x);
    vec3 shoreTint = vec3(0.04, 0.1, 0.08);
    finalColor.rgb += shoreTint * leftInfluence * 0.25;
    finalColor.rgb *= (1.0 + leftInfluence * 0.06);
  }
  
  if (u_choice_hover_bias.y < 0.0) {
    float downInfluence = smoothstep(0.4, 1.0, 1.0 - screenUV.y) * abs(u_choice_hover_bias.y);
    vec3 deepTint = vec3(-0.06, -0.05, 0.01);
    finalColor.rgb += deepTint * downInfluence * 0.45;
  }

  // 9. Destination Atmosphere Calibration
  if (u_environment_mode == 2) {
    // SHORE: warm open coastal sunlight
    finalColor.rgb = mix(finalColor.rgb, finalColor.rgb * vec3(1.05, 1.03, 0.97) + vec3(0.015, 0.015, 0.005), 0.5);
  } else if (u_environment_mode == 3) {
    // DEEP: deep blue / near-black atmosphere
    finalColor.rgb = pow(finalColor.rgb, vec3(1.1)) * vec3(0.92, 0.95, 1.01);
  } else if (u_environment_mode == 5) {
    // CLOUDS: volumetric soft atmosphere
    finalColor.rgb = mix(finalColor.rgb, finalColor.rgb * vec3(1.02, 1.02, 1.04), 0.35);
  } else if (u_environment_mode == 6) {
    // RAIN: moody rainfall tone
    finalColor.rgb = pow(finalColor.rgb, vec3(1.05)) * vec3(0.97, 0.98, 1.01);
  }

  // 10. Film Tone: Cinematic Vignette & Micro-grain
  float vig = length((screenUV - 0.5) * vec2(1.0, 0.88));
  float vignette = smoothstep(1.08, 0.5, vig);
  finalColor.rgb *= mix(0.88, 1.0, vignette);

  float grain = (hash(screenUV * 1200.0 + fract(u_time * 19.0)) - 0.5) * 0.015;
  finalColor.rgb += grain;

  gl_FragColor = vec4(finalColor.rgb, 1.0);
}
`;
