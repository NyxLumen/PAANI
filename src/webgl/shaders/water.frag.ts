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
uniform int u_transition_recipe;     // 1 = crossBlur, 2 = dedicated optical

// Loop-bridging seam veil (0.0 during normal playback, subtle peak at loop point)
uniform float u_loop_veil;

// Camera & Cinematography (GSAP controlled)
uniform vec2 u_camera_offset;
uniform float u_camera_zoom;
uniform float u_camera_tilt;
uniform float u_chromatic_aberration;

// Minimal Film Grain hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// Aspect ratio cover UV projection with safe margin
vec2 getCoverUV(vec2 uv, vec2 canvasRes, float mediaAspect) {
  float canvasAspect = canvasRes.x / canvasRes.y;
  vec2 st = uv - 0.5;
  st *= 0.88; // Safe margin prevents edge clamping during subtle camera movement

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

// 5-tap photographic blur for loop seam and crossBlur dissolve
vec4 sampleBlurred(sampler2D tex, vec2 uv, vec2 texelSize, float blurRadius) {
  if (blurRadius <= 0.001) {
    return texture2D(tex, uv);
  }
  vec2 r = texelSize * blurRadius;
  vec4 col = texture2D(tex, uv) * 0.382928;
  col += texture2D(tex, uv + vec2(r.x, 0.0)) * 0.241732;
  col += texture2D(tex, uv - vec2(r.x, 0.0)) * 0.241732;
  col += texture2D(tex, uv + vec2(0.0, r.y)) * 0.066804;
  col += texture2D(tex, uv - vec2(0.0, r.y)) * 0.066804;
  return col;
}

void main() {
  vec2 screenUV = v_uv;
  vec2 texelSize = vec2(1.0 / u_resolution.x, 1.0 / u_resolution.y);

  // 1. Camera transform (scale around center, offset, tilt)
  vec2 camUV = (screenUV - 0.5) / max(0.1, u_camera_zoom);
  camUV = rotate(camUV, u_camera_tilt);
  camUV += 0.5 + u_camera_offset;

  // Aspect-ratio cover mapping for textures A, B, and dedicated transition
  vec2 uvA = getCoverUV(camUV, u_resolution, u_ratio_a);
  vec2 uvB = getCoverUV(camUV, u_resolution, u_ratio_b);
  vec2 uvTrans = getCoverUV(camUV, u_resolution, u_ratio_trans);

  // 2. Loop Seam Softening
  // During normal playback u_loop_veil = 0.0 (100% sharp raw footage).
  // At the 8s loop point, u_loop_veil peaks at ~0.8 to create a seamless photographic veil.
  float loopBlur = u_loop_veil * 2.8;

  // Sample Scene A
  vec4 colA = sampleBlurred(u_tex_a, uvA, texelSize, loopBlur);
  if (u_loop_veil > 0.0) {
    colA.rgb *= (1.0 - u_loop_veil * 0.035); // Subtle exposure dip bridging loop seam
  }

  // Sample Scene B
  vec4 colB = sampleBlurred(u_tex_b, uvB, texelSize, loopBlur);

  // 3. Chromatic Aberration (Only active if explicitly set during dedicated transition)
  vec4 colTrans = vec4(0.0);
  if (u_has_trans_video == 1) {
    if (u_chromatic_aberration > 0.0001) {
      vec2 caOffset = vec2(u_chromatic_aberration * 0.004, 0.0);
      colTrans.r = texture2D(u_tex_trans, uvTrans - caOffset).r;
      colTrans.g = texture2D(u_tex_trans, uvTrans).g;
      colTrans.b = texture2D(u_tex_trans, uvTrans + caOffset).b;
      colTrans.a = 1.0;
    } else {
      colTrans = texture2D(u_tex_trans, uvTrans);
    }
  }

  vec4 finalColor = colA;
  float p = u_transition_progress;

  if (p > 0.0) {
    if (u_has_trans_video == 1) {
      // ===================================================================
      // DEDICATED AI TRANSITION FOOTAGE (Dominant: 85-90% visual weight)
      // ===================================================================
      // Stage 1: Fast clean crossfade into dedicated transition video (0.0 to 0.14)
      float enterTrans = smoothstep(0.0, 0.14, p);
      vec4 sourceToTrans = mix(colA, colTrans, enterTrans);

      // Stage 2: Destination reveal window [u_reveal_start, u_reveal_end]
      float rStart = clamp(u_reveal_start, 0.1, 0.9);
      float rEnd = clamp(u_reveal_end, rStart + 0.05, 1.0);
      float revealProgress = smoothstep(rStart, rEnd, p);

      finalColor = mix(sourceToTrans, colB, revealProgress);

      // Very subtle optical continuity gleam at midpoint
      if (p > 0.3 && p < 0.7) {
        float peak = sin((p - 0.3) / 0.4 * 3.14159) * 0.03;
        finalColor.rgb += vec3(peak);
      }
    } else {
      // ===================================================================
      // CLEAN CINEMATIC BLUR DISSOLVE (crossBlur) FOR NON-DEDICATED PATHS
      // No liquid melting, no procedural noise wipes, no digital distortion.
      // Pure organic camera motion + photographic softening dissolve.
      // ===================================================================
      float blurA = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 4.2;
      float blurB = sin(clamp(p * 3.14159, 0.0, 3.14159)) * 3.6;

      vec4 blurColA = sampleBlurred(u_tex_a, uvA, texelSize, blurA);
      vec4 blurColB = sampleBlurred(u_tex_b, uvB, texelSize, blurB);

      // Smooth organic crossfade
      float blend = smoothstep(0.18, 0.82, p);
      finalColor = mix(blurColA, blurColB, blend);
    }
  }

  // 4. Subtle Film Micro-Grain (barely perceptible, enhances photographic depth)
  float grain = (hash(screenUV * 1500.0 + fract(u_time * 23.0)) - 0.5) * 0.005;
  finalColor.rgb += grain;

  gl_FragColor = vec4(finalColor.rgb, 1.0);
}
`;
