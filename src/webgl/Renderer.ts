import { EnvironmentId, TransitionRecipe } from '../types/story';
import { MediaManager } from './MediaManager';
import { quadVertexShader } from './shaders/quad.vert';
import { waterFragmentShader } from './shaders/water.frag';

export interface RenderState {
  environmentA: EnvironmentId;
  environmentB: EnvironmentId;
  transitionProgress: number; // 0.0 to 1.0
  revealStart: number;
  revealEnd: number;
  transitionRecipe: TransitionRecipe;
  cameraOffset: { x: number; y: number };
  cameraZoom: number;
  cameraTilt: number;
  distortionAmount: number;
  chromaticAberration: number;
  choiceHoverBias: { x: number; y: number };
}

export class WebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private mediaManager: MediaManager;
  private animFrameId: number | null = null;
  private startTime: number = performance.now();

  // Uniform locations
  private uResolutionLoc: WebGLUniformLocation | null = null;
  private uTimeLoc: WebGLUniformLocation | null = null;
  private uTexALoc: WebGLUniformLocation | null = null;
  private uTexBLoc: WebGLUniformLocation | null = null;
  private uTexTransLoc: WebGLUniformLocation | null = null;
  private uRatioALoc: WebGLUniformLocation | null = null;
  private uRatioBLoc: WebGLUniformLocation | null = null;
  private uRatioTransLoc: WebGLUniformLocation | null = null;
  private uHasTransVideoLoc: WebGLUniformLocation | null = null;
  private uTransitionProgressLoc: WebGLUniformLocation | null = null;
  private uRevealStartLoc: WebGLUniformLocation | null = null;
  private uRevealEndLoc: WebGLUniformLocation | null = null;
  private uTransitionRecipeLoc: WebGLUniformLocation | null = null;
  private uCameraOffsetLoc: WebGLUniformLocation | null = null;
  private uCameraZoomLoc: WebGLUniformLocation | null = null;
  private uCameraTiltLoc: WebGLUniformLocation | null = null;
  private uDistortionAmountLoc: WebGLUniformLocation | null = null;
  private uChromaticAberrationLoc: WebGLUniformLocation | null = null;
  private uMouseLoc: WebGLUniformLocation | null = null;
  private uMouseVelocityLoc: WebGLUniformLocation | null = null;
  private uCursorRippleIntensityLoc: WebGLUniformLocation | null = null;
  private uChoiceHoverBiasLoc: WebGLUniformLocation | null = null;
  private uEnvironmentModeLoc: WebGLUniformLocation | null = null;

  // Mouse tracking
  private mouse = { x: 0.5, y: 0.5 };
  private targetMouse = { x: 0.5, y: 0.5 };
  private mouseVelocity = { x: 0, y: 0 };
  private rippleIntensity = 0.0;
  private targetRipple = 0.0;

  // State
  private state: RenderState = {
    environmentA: 'ocean',
    environmentB: 'underwater',
    transitionProgress: 0.0,
    revealStart: 0.65,
    revealEnd: 0.95,
    transitionRecipe: 'none',
    cameraOffset: { x: 0, y: 0 },
    cameraZoom: 1.0,
    cameraTilt: 0,
    distortionAmount: 0.0,
    chromaticAberration: 0.0012,
    choiceHoverBias: { x: 0, y: 0 },
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      throw new Error('WebGL not supported');
    }
    this.gl = gl;

    this.program = this.createProgram(quadVertexShader, waterFragmentShader);
    gl.useProgram(this.program);

    this.setupQuadGeometry();
    this.cacheUniforms();

    this.mediaManager = new MediaManager(gl);
    this.bindEvents();
    this.resize();
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${err}`);
    }
    return shader;
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vs = this.createShader(gl.VERTEX_SHADER, vertSrc);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const err = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${err}`);
    }
    return prog;
  }

  private setupQuadGeometry(): void {
    const gl = this.gl;
    const vertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(this.program, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);
  }

  private cacheUniforms(): void {
    const gl = this.gl;
    const p = this.program;
    this.uResolutionLoc = gl.getUniformLocation(p, 'u_resolution');
    this.uTimeLoc = gl.getUniformLocation(p, 'u_time');
    this.uTexALoc = gl.getUniformLocation(p, 'u_tex_a');
    this.uTexBLoc = gl.getUniformLocation(p, 'u_tex_b');
    this.uTexTransLoc = gl.getUniformLocation(p, 'u_tex_trans');
    this.uRatioALoc = gl.getUniformLocation(p, 'u_ratio_a');
    this.uRatioBLoc = gl.getUniformLocation(p, 'u_ratio_b');
    this.uRatioTransLoc = gl.getUniformLocation(p, 'u_ratio_trans');
    this.uHasTransVideoLoc = gl.getUniformLocation(p, 'u_has_trans_video');
    this.uTransitionProgressLoc = gl.getUniformLocation(p, 'u_transition_progress');
    this.uRevealStartLoc = gl.getUniformLocation(p, 'u_reveal_start');
    this.uRevealEndLoc = gl.getUniformLocation(p, 'u_reveal_end');
    this.uTransitionRecipeLoc = gl.getUniformLocation(p, 'u_transition_recipe');
    this.uCameraOffsetLoc = gl.getUniformLocation(p, 'u_camera_offset');
    this.uCameraZoomLoc = gl.getUniformLocation(p, 'u_camera_zoom');
    this.uCameraTiltLoc = gl.getUniformLocation(p, 'u_camera_tilt');
    this.uDistortionAmountLoc = gl.getUniformLocation(p, 'u_distortion_amount');
    this.uChromaticAberrationLoc = gl.getUniformLocation(p, 'u_chromatic_aberration');
    this.uMouseLoc = gl.getUniformLocation(p, 'u_mouse');
    this.uMouseVelocityLoc = gl.getUniformLocation(p, 'u_mouse_velocity');
    this.uCursorRippleIntensityLoc = gl.getUniformLocation(p, 'u_cursor_ripple_intensity');
    this.uChoiceHoverBiasLoc = gl.getUniformLocation(p, 'u_choice_hover_bias');
    this.uEnvironmentModeLoc = gl.getUniformLocation(p, 'u_environment_mode');
  }

  private bindEvents(): void {
    const onMouseMove = (e: MouseEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1.0 - (e.clientY - rect.top) / rect.height;

      const vx = nx - this.targetMouse.x;
      const vy = ny - this.targetMouse.y;
      this.mouseVelocity.x = vx;
      this.mouseVelocity.y = vy;

      this.targetMouse.x = nx;
      this.targetMouse.y = ny;
      this.targetRipple = Math.min(1.0, Math.sqrt(vx * vx + vy * vy) * 30.0);
    };

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  public getMediaManager(): MediaManager {
    return this.mediaManager;
  }

  public setState(updates: Partial<RenderState>): void {
    Object.assign(this.state, updates);
  }

  public getState(): RenderState {
    return this.state;
  }

  public start(): void {
    if (this.animFrameId !== null) return;
    const render = () => {
      this.render();
      this.animFrameId = requestAnimationFrame(render);
    };
    this.animFrameId = requestAnimationFrame(render);
  }

  public stop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private render(): void {
    const gl = this.gl;
    const time = (performance.now() - this.startTime) * 0.001;

    // Smooth mouse lerping
    this.mouse.x += (this.targetMouse.x - this.mouse.x) * 0.08;
    this.mouse.y += (this.targetMouse.y - this.mouse.y) * 0.08;
    this.rippleIntensity += (this.targetRipple - this.rippleIntensity) * 0.06;
    this.targetRipple *= 0.95;

    // Update active video frames
    this.mediaManager.updateFrame(this.state.environmentA);
    if (this.state.transitionProgress > 0.0) {
      this.mediaManager.updateFrame(this.state.environmentB);
      this.mediaManager.updateTransitionFrame();
    }

    gl.useProgram(this.program);

    gl.uniform2f(this.uResolutionLoc, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uTimeLoc, time);

    // Media textures
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaManager.getTexture(this.state.environmentA));
    gl.uniform1i(this.uTexALoc, 0);
    gl.uniform1f(this.uRatioALoc, this.mediaManager.getAspectRatio(this.state.environmentA));

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaManager.getTexture(this.state.environmentB));
    gl.uniform1i(this.uTexBLoc, 1);
    gl.uniform1f(this.uRatioBLoc, this.mediaManager.getAspectRatio(this.state.environmentB));

    // Dedicated transition video texture (TEXTURE2)
    const hasTrans = this.mediaManager.hasActiveTransition() ? 1 : 0;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaManager.getTransitionTexture());
    gl.uniform1i(this.uTexTransLoc, 2);
    gl.uniform1f(this.uRatioTransLoc, this.mediaManager.getTransitionAspectRatio());
    gl.uniform1i(this.uHasTransVideoLoc, hasTrans);

    // Transition progress, reveal window & recipe
    gl.uniform1f(this.uTransitionProgressLoc, this.state.transitionProgress);
    gl.uniform1f(this.uRevealStartLoc, this.state.revealStart);
    gl.uniform1f(this.uRevealEndLoc, this.state.revealEnd);
    
    let recipeInt = 0;
    switch (this.state.transitionRecipe) {
      case 'surface-dive': recipeInt = 1; break;
      case 'evaporation': recipeInt = 2; break;
      case 'atmospheric': recipeInt = 3; break;
      case 'rainfall': recipeInt = 4; break;
      case 'ocean-return': recipeInt = 5; break;
      case 'deep-descent': recipeInt = 6; break;
      case 'deep-return': recipeInt = 7; break;
      default: recipeInt = 0;
    }
    gl.uniform1i(this.uTransitionRecipeLoc, recipeInt);

    // Camera
    gl.uniform2f(this.uCameraOffsetLoc, this.state.cameraOffset.x, this.state.cameraOffset.y);
    gl.uniform1f(this.uCameraZoomLoc, this.state.cameraZoom);
    gl.uniform1f(this.uCameraTiltLoc, this.state.cameraTilt);
    gl.uniform1f(this.uDistortionAmountLoc, this.state.distortionAmount);
    gl.uniform1f(this.uChromaticAberrationLoc, this.state.chromaticAberration);

    // Interaction
    gl.uniform2f(this.uMouseLoc, this.mouse.x, this.mouse.y);
    gl.uniform2f(this.uMouseVelocityLoc, this.mouseVelocity.x, this.mouseVelocity.y);
    gl.uniform1f(this.uCursorRippleIntensityLoc, this.rippleIntensity);
    gl.uniform2f(this.uChoiceHoverBiasLoc, this.state.choiceHoverBias.x, this.state.choiceHoverBias.y);

    // Environment mode
    let mode = 0;
    if (this.state.environmentA === 'ocean') mode = 0;
    else if (this.state.environmentA === 'underwater') mode = 1;
    else if (this.state.environmentA === 'shore') mode = 2;
    else if (this.state.environmentA === 'deep') mode = 3;
    else if (this.state.environmentA === 'cloudAscent') mode = 4;
    else if (this.state.environmentA === 'clouds') mode = 5;
    else if (this.state.environmentA === 'rain') mode = 6;
    gl.uniform1i(this.uEnvironmentModeLoc, mode);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy(): void {
    this.stop();
    this.mediaManager.destroy();
    this.gl.deleteProgram(this.program);
  }
}
