// ============================================================
// Compositor WebGL2 del lienzo (opcional, con respaldo 2D).
//
// Reemplaza el paso `stack.compositeTo(displayCtx)` por una composición en la
// GPU: cada capa se sube como textura y se mezcla con blend real
// (normal / multiply / screen) sobre un canvas transparente que el navegador
// compone encima de la hoja. La exportación sigue usando el aplanado 2D, así
// que el resultado guardado/enviado nunca depende de la GPU.
//
// Ventajas: composición acelerada, bordes limpios y coherentes, y menos
// "errores estéticos" de banda/costura en pantallas de alta densidad.
// Si el navegador no soporta WebGL2 o aparece un blend no soportado, el motor
// vuelve automáticamente al camino 2D.
// ============================================================

const SUPPORTED_BLENDS = ['normal', 'multiply', 'screen'];

export class GLCompositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return;
    this.gl = gl;
    try { this._init(); this.ok = true; } catch (e) { this.ok = false; return; }
    this._tex = new Map();      // id -> { tex, version }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; }, false);
    canvas.addEventListener('webglcontextrestored', () => { try { this._init(); this._tex = new Map(); this.ok = true; } catch { this.ok = false; } }, false);
  }

  _compile(type, src) {
    const gl = this.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  _init() {
    const gl = this.gl;
    const vs = `#version 300 es
      in vec2 pos; out vec2 uv;
      void main(){ uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5); gl_Position = vec4(pos, 0.0, 1.0); }`;
    // La textura llega con alfa premultiplicado; escalamos por la opacidad de capa.
    const fs = `#version 300 es
      precision highp float; in vec2 uv; uniform sampler2D tex; uniform float alpha; out vec4 o;
      void main(){ o = texture(tex, uv) * alpha; }`;
    const prog = gl.createProgram();
    gl.attachShader(prog, this._compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, this._compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
    this.prog = prog;
    this.uAlpha = gl.getUniformLocation(prog, 'alpha');
    this.uTex = gl.getUniformLocation(prog, 'tex');
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
  }

  static supports(layers) {
    return layers.every((l) => !l.visible || l.opacity <= 0 || SUPPORTED_BLENDS.includes(l.blend || 'normal'));
  }

  _setBlend(mode) {
    const gl = this.gl;
    if (mode === 'multiply') { gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_ALPHA, gl.ONE_MINUS_SRC_ALPHA); return true; }
    if (mode === 'screen') { gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_COLOR, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); return true; }
    if (mode === 'normal' || !mode) { gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); return true; }
    return false;
  }

  resize(w, h) {
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
  }

  _texFor(id, src, version) {
    const gl = this.gl;
    let e = this._tex.get(id);
    if (!e) {
      e = { tex: gl.createTexture(), version: null };
      this._tex.set(id, e);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if (e.version !== version) {
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      e.version = version;
    }
    return e.tex;
  }

  // Sube solo la capa activa cada frame; el resto solo cuando cambia structRev.
  // Devuelve false si algún blend no está soportado → el motor usa 2D.
  render(layers, activeId, structRev, frame) {
    const gl = this.gl;
    if (!this.ok) return false;
    if (!GLCompositor.supports(layers)) return false;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.uTex, 0);
    for (const l of layers) {
      if (!l.visible || l.opacity <= 0) continue;
      if (!this._setBlend(l.blend || 'normal')) { gl.bindVertexArray(null); return false; }
      const version = l.id === activeId ? `a${frame}` : `s${structRev}`;
      const tex = this._texFor(l.id, l.canvas, version);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1f(this.uAlpha, l.opacity == null ? 1 : l.opacity);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    // Olvida texturas de capas eliminadas.
    if (this._tex.size > layers.length + 4) {
      const ids = new Set(layers.map((l) => l.id));
      for (const id of [...this._tex.keys()]) if (!ids.has(id)) { gl.deleteTexture(this._tex.get(id).tex); this._tex.delete(id); }
    }
    return true;
  }

  dispose() {
    const gl = this.gl; if (!gl) return;
    for (const e of this._tex?.values() || []) gl.deleteTexture(e.tex);
    this._tex?.clear();
  }
}
