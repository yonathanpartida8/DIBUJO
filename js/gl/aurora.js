// ============================================================
// Aurora WebGL2 — fondo vivo de la pantalla de inicio.
// Tres "blobs" pastel que respiran y reaccionan al tacto,
// renderizados con un fragment shader. Si no hay WebGL2 (o el
// usuario desactivó animaciones) se degrada a un gradiente CSS
// animado sin que la Home pierda su encanto.
// ============================================================

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;

const FRAG = `#version 300 es
precision mediump float;
uniform vec2 u_res; uniform float u_t; uniform vec2 u_touch; uniform float u_touchAmt;
out vec4 outColor;

vec3 blob(vec2 uv, vec2 c, vec3 col, float r){
  float d = length(uv - c);
  return col * smoothstep(r, 0.0, d);
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  uv.x *= u_res.x / u_res.y;
  float t = u_t * 0.18;

  // base crema cálida
  vec3 col = vec3(0.985, 0.972, 0.965);

  // blobs pastel en movimiento lento
  col += blob(uv, vec2(0.30 + 0.16*sin(t),        0.72 + 0.10*cos(t*0.8)),  vec3(0.95,0.62,0.70)*0.32, 0.62);
  col += blob(uv, vec2(0.78 + 0.14*cos(t*0.7),    0.30 + 0.12*sin(t*0.9)),  vec3(0.72,0.60,0.88)*0.30, 0.66);
  col += blob(uv, vec2(0.55 + 0.18*sin(t*0.5+2.), 0.86 + 0.08*cos(t*0.6)),  vec3(0.58,0.78,0.66)*0.26, 0.58);

  // resplandor que sigue al dedo
  vec2 tc = u_touch; tc.x *= u_res.x / u_res.y;
  col += vec3(0.98,0.80,0.85) * 0.5 * u_touchAmt * smoothstep(0.42, 0.0, length(uv - tc));

  // viñeta muy sutil
  vec2 v = gl_FragCoord.xy / u_res - 0.5;
  col -= dot(v, v) * 0.22;

  outColor = vec4(col, 1.0);
}`;

export function mountAurora(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'aurora-canvas';
  const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'low-power' });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.dataset.animations === 'off';
  if (!gl || reduced) {
    // Degradación elegante: gradiente CSS animado.
    host.classList.add('aurora-fallback');
    return { destroy() {}, touch() {} };
  }
  host.prepend(canvas);

  const compile = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
  } catch { host.classList.add('aurora-fallback'); canvas.remove(); return { destroy() {}, touch() {} }; }

  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'u_res');
  const uT = gl.getUniformLocation(prog, 'u_t');
  const uTouch = gl.getUniformLocation(prog, 'u_touch');
  const uAmt = gl.getUniformLocation(prog, 'u_touchAmt');

  let touch = { x: 0.5, y: 0.5, amt: 0 };
  let raf, running = true;
  const t0 = performance.now();

  const resize = () => {
    // Media resolución: se ve igual de suave (es un gradiente) y ahorra batería.
    const dpr = Math.min(devicePixelRatio, 2) * 0.5;
    canvas.width = Math.max(2, host.clientWidth * dpr);
    canvas.height = Math.max(2, host.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  const ro = new ResizeObserver(resize); ro.observe(host);

  const frame = (now) => {
    if (!running) return;
    touch.amt *= 0.94; // el brillo del tacto se desvanece suavemente
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uT, (now - t0) / 1000);
    gl.uniform2f(uTouch, touch.x, 1 - touch.y);
    gl.uniform1f(uAmt, touch.amt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // Pausa cuando la pestaña no está visible (batería).
  const onVis = () => { running = !document.hidden; if (running) raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', onVis);

  return {
    touch(clientX, clientY) {
      const r = host.getBoundingClientRect();
      touch.x = (clientX - r.left) / r.width;
      touch.y = (clientY - r.top) / r.height;
      touch.amt = 1;
    },
    destroy() {
      running = false; cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.remove();
    },
  };
}
