export const quadVertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  // Flip Y for standard WebGL texture coordinates
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
