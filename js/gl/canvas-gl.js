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

  _entry(id) {
    const gl = this.gl;
    let e = this._tex.get(id);
    if (!e) {
      e = { tex: gl.createTexture(), rev: null, w: 0, h: 0 };
      this._tex.set(id, e);
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return e;
  }
  // Sube SOLO el rectángulo tocado por el trazo. Subir la capa completa cada
  // frame (8 MB) era lo que hacía tirones y parpadeos en el móvil.
  _subUpload(e, src, rect) {
    const gl = this.gl;
    const x = Math.max(0, Math.floor(rect.x0)), y = Math.max(0, Math.floor(rect.y0));
    const w = Math.min(src.width - x, Math.ceil(rect.x1 - x)), h = Math.min(src.height - y, Math.ceil(rect.y1 - y));
    if (w <= 0 || h <= 0) return true;
    // Zona demasiado grande: no vale la pena, subimos todo de una vez.
    if (w * h > src.width * src.height * 0.5) return false;
    if (!this._scratch) this._scratch = document.createElement('canvas');
    const sc = this._scratch;
    // Tamaño EXACTO: se sube el lienzo como elemento (no bytes) para que valga
    // UNPACK_PREMULTIPLY_ALPHA y el color coincida con la subida completa.
    if (sc.width !== w || sc.height !== h) { sc.width = w; sc.height = h; }
    const sx = sc.getContext('2d');
    sx.clearRect(0, 0, w, h);
    sx.drawImage(src, x, y, w, h, 0, 0, w, h);
    gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, sc);
    return true;
  }

  // Sube solo la zona modificada de la capa activa; el resto solo cuando
  // cambia structRev. Devuelve false si algún blend no está soportado → 2D.
  render(layers, activeId, structRev, frame, activeRect) {
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
      const e = this._entry(l.id);
      const sizeChanged = e.w !== l.canvas.width || e.h !== l.canvas.height;
      let done = false;
      if (!sizeChanged && e.rev === structRev && l.id === activeId && activeRect) {
        done = this._subUpload(e, l.canvas, activeRect);       // solo la zona pintada
      }
      if (!done && (sizeChanged || e.rev !== structRev || l.id === activeId)) {
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, l.canvas);
        e.rev = structRev; e.w = l.canvas.width; e.h = l.canvas.height;
      }
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
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
