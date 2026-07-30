// Drawing engine — canvas stage, layers, tools, input, paper, transform, save.
import { el, clamp, uid, throttle } from '../core/utils.js';
import { LayerStack } from './layers.js';
import { History } from './history.js';
import { StrokePainter } from './paint.js';
import { floodFill, pickColor } from './floodfill.js';
import { BRUSHES } from './brushes.js';
import { bus } from '../core/bus.js';
import { store } from '../core/store.js';

export const PAPER_TEXTURES = {
  none: 'Liso', recycled: 'Reciclado', watercolor: 'Acuarela', notebook: 'Libreta',
  parchment: 'Pergamino', canvas: 'Lienzo', wood: 'Madera', cardboard: 'Cartulina', dots: 'Puntos',
};

export class Engine {
  constructor() {
    this.docW = 1080; this.docH = 1440;
    this.stack = null;
    this.history = new History(30);
    this.recorder = null; // set by studio
    this.tool = 'pen';
    this.color = '#5a4e58';
    this.brushSize = 6;
    this.opacity = 1;
    this.flow = 1;
    this.hardness = 0.85;
    this.smoothing = 0.3;      // 0..1 position smoothing
    this.stabilizer = 0.45;    // 0..1 lag-based stabiliser
    this.pressureEnabled = true;
    this.symmetry = { mode: 'none', count: 6 };
    this.ruler = null;          // { px, py, angle } — barrera física (RulerTool)
    this.pencilMode = false;    // "Simular Pincel Virtual": trazo desde la punta del lápiz
    this.pencilOffset = { x: 10, y: -78 }; // desplazamiento en px de pantalla
    this.paper = { color: '#ffffff', texture: 'none', transparent: false, grid: false, guides: false, infinite: false };
    this.media = [];           // {id,type,src,x,y,w,h,rot,opacity,...}
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this._pointers = new Map();
    this._painter = null;
    this._compositePending = false;
    this._shapeStart = null;
    this.onHistoryChange = null;
    this.onChange = null;      // dirty callback
    this.recentColors = ['#5a4e58', '#ef92a6', '#a98fd4', '#b8e0d2', '#ffd7bd', '#bcd8f2'];
    this._quality = store.get().settings.quality;
    // Renderizado WebGL2 (opcional). Se activa si el navegador lo soporta y el
    // ajuste está encendido; si falla en cualquier frame, cae a 2D sin cortes.
    this.useGL = store.get().settings.webgl2 !== false;
    this._glRev = 0;   // versión estructural (capas no activas)
    this._glFrame = 0; // contador de frames (capa activa)
  }

  // ---------- Mount ----------
  mount(stageEl) {
    this.stage = stageEl;
    this.frame = el('div', { class: 'st-canvas-frame' });
    this.paperCanvas = el('canvas', { class: 'paper', width: this.docW, height: this.docH });
    this.display = el('canvas', { width: this.docW, height: this.docH });
    this.glCanvas = el('canvas', { class: 'gl-cv', width: this.docW, height: this.docH });
    this.overlay = el('canvas', { class: 'overlay-cv', width: this.docW, height: this.docH });
    this.mediaLayer = el('div', { class: 'media-layer' });
    this.frame.append(this.paperCanvas, this.display, this.glCanvas, this.overlay, this.mediaLayer);
    stageEl.append(this.frame);
    this.pctx = this.paperCanvas.getContext('2d');
    this.dctx = this.display.getContext('2d');
    this.octx = this.overlay.getContext('2d');
    this._initGL();
    this._fit();
    this._bindInput();
    window.addEventListener('resize', () => this._fit());
    bus.on('settings:webgl2', (v) => this.setUseGL(v));
    this.renderPaper();
  }
  _fit() {
    const pad = 16;
    const availW = this.stage.clientWidth - pad * 2;
    const availH = this.stage.clientHeight - pad * 2;
    this.baseScale = Math.min(availW / this.docW, availH / this.docH);
    this._applyTransform();
  }
  _applyTransform() {
    const s = this.baseScale * this.zoom;
    const w = this.docW * s, h = this.docH * s;
    this.frame.style.width = this.docW + 'px';
    this.frame.style.height = this.docH + 'px';
    this.frame.style.transformOrigin = 'top left';
    const cx = (this.stage.clientWidth - w) / 2 + this.panX;
    const cy = (this.stage.clientHeight - h) / 2 + this.panY;
    this.frame.style.transform = `translate(${cx}px, ${cy}px) scale(${s})`;
    // Factor inverso: las asas y barras de los objetos viven dentro del frame
    // escalado; con esto se contra-escalan y SIEMPRE se ven a tamaño real de
    // pantalla, grandes y tocables, sin importar el zoom del lienzo.
    this.frame.style.setProperty('--inv', String(1 / s));
    bus.emit('engine:zoom', this.zoom);
  }

  // ---------- New / Load ----------
  newDoc({ w = 1080, h = 1440 } = {}) {
    this.docW = w; this.docH = h;
    this.stack = new LayerStack(w, h);
    this.stack.add('Fondo');
    this.history.clear();
    this.media = [];
    if (this.paperCanvas) { this.paperCanvas.width = this.display.width = this.overlay.width = w; this.paperCanvas.height = this.display.height = this.overlay.height = h; }
    this._fit(); this.renderPaper(); this.requestComposite();
    this.renderMedia();
  }
  async loadDoc(doc) {
    this.docW = doc.w; this.docH = doc.h;
    this.stack = await LayerStack.deserialize(doc.stack);
    this.paper = { ...this.paper, ...(doc.paper || {}) };
    this.media = doc.media || [];
    this.history.clear();
    if (this.paperCanvas) { this.paperCanvas.width = this.display.width = this.overlay.width = doc.w; this.paperCanvas.height = this.display.height = this.overlay.height = doc.h; }
    this._fit(); this.renderPaper(); this.requestComposite(); this.renderMedia();
  }

  // ---------- Paper ----------
  renderPaper() {
    const c = this.pctx, w = this.docW, h = this.docH;
    c.clearRect(0, 0, w, h);
    if (this.paper.transparent) { /* leave checker showing */ }
    else { c.fillStyle = this.paper.color; c.fillRect(0, 0, w, h); }
    this._drawTexture(c, w, h);
    if (this.paper.grid) this._drawGrid(c, w, h);
  }
  _drawTexture(c, w, h) {
    const tex = this.paper.texture;
    if (tex === 'none' || this.paper.transparent) return;
    c.save();
    if (tex === 'notebook') {
      c.strokeStyle = 'rgba(120,150,210,0.22)'; c.lineWidth = 1.5;
      for (let y = 80; y < h; y += 56) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.strokeStyle = 'rgba(230,120,140,0.3)'; c.beginPath(); c.moveTo(70, 0); c.lineTo(70, h); c.stroke();
    } else if (tex === 'dots') {
      c.fillStyle = 'rgba(120,110,140,0.18)';
      for (let y = 40; y < h; y += 48) for (let x = 40; x < w; x += 48) { c.beginPath(); c.arc(x, y, 2, 0, 7); c.fill(); }
    } else if (tex === 'wood') {
      for (let i = 0; i < h; i += 6) { c.fillStyle = `rgba(150,110,70,${0.03 + Math.random() * 0.04})`; c.fillRect(0, i, w, 3); }
    } else {
      // procedural grain for recycled/watercolor/parchment/canvas/cardboard
      const density = tex === 'canvas' ? 0.06 : 0.04;
      const tint = { recycled: '150,140,110', watercolor: '120,140,170', parchment: '190,160,110', canvas: '120,110,100', cardboard: '170,130,90' }[tex] || '150,140,120';
      const n = Math.floor(w * h * density / 60);
      for (let i = 0; i < n; i++) {
        c.fillStyle = `rgba(${tint},${Math.random() * 0.06})`;
        c.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
      }
      if (tex === 'canvas') {
        c.strokeStyle = 'rgba(120,110,100,0.05)';
        for (let x = 0; x < w; x += 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
        for (let y = 0; y < h; y += 4) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      }
    }
    c.restore();
  }
  _drawGrid(c, w, h) {
    c.save(); c.strokeStyle = 'rgba(120,110,140,0.16)'; c.lineWidth = 1;
    const step = 48;
    for (let x = step; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (let y = step; y < h; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.restore();
  }
  setPaper(patch) { this.paper = { ...this.paper, ...patch }; this.renderPaper(); this.renderGuides(); this.markDirty(); }

  // Guías de composición (no destructivas, no se exportan): cruz central + tercios.
  renderGuides() {
    const c = this.octx; if (!c) return;
    c.clearRect(0, 0, this.docW, this.docH);
    if (!this.paper.guides) return;
    c.save();
    c.setLineDash([12, 10]); c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(232,137,158,0.4)';
    const w = this.docW, h = this.docH;
    for (const x of [w / 3, w / 2, (2 * w) / 3]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
    for (const y of [h / 3, h / 2, (2 * h) / 3]) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.restore();
  }

  // ---------- WebGL2 (opcional) ----------
  _initGL() {
    if (!this.useGL) { this._showGL(false); return; }
    import('../gl/canvas-gl.js').then(({ GLCompositor }) => {
      const comp = new GLCompositor(this.glCanvas);
      if (comp.ok) { this.glComp = comp; this.requestComposite(); }
      else { this.useGL = false; this._showGL(false); }
    }).catch(() => { this.useGL = false; this._showGL(false); });
  }
  _showGL(on) {
    if (!this.glCanvas) return;
    if (this._glShown === on) return;   // evita tocar el DOM cada frame (parpadeos)
    this._glShown = on;
    this.glCanvas.style.display = on ? '' : 'none';
    this.display.style.display = on ? 'none' : '';
  }
  setUseGL(on) {
    this.useGL = !!on;
    if (on && !this.glComp) { this._initGL(); }
    else if (!on) { this._showGL(false); this.requestComposite(); }
    else this.requestComposite();
  }

  // ---------- Composite ----------
  requestComposite() {
    if (this._compositePending) return;
    this._compositePending = true;
    requestAnimationFrame(() => {
      this._compositePending = false;
      if (this.useGL && this.glComp && this.glComp.ok && this.stack) {
        // Fuera de un trazo activo, cualquier capa pudo cambiar (deshacer,
        // relleno, capas, carga) → refresca todas las texturas. Durante el
        // trazo solo cambia la capa activa (se sube cada frame por sí sola).
        if (!this._drawing) this._glRev++;
        this.glComp.resize(this.docW, this.docH);
        // Zona tocada por el trazo en curso → subida parcial a la GPU.
        const rect = (this._drawing && this._painter) ? this._painter.dirty : null;
        const ok = this.glComp.render(this.stack.layers, this.stack.activeId, this._glRev, ++this._glFrame, rect);
        if (ok) { this._painter?.clearDirty(); this._showGL(true); return; }
      }
      this._showGL(false);
      this.stack.compositeTo(this.dctx);
    });
  }
  markDirty() { this.onChange?.(); }

  // ---------- Input ----------
  clientToDoc(clientX, clientY) {
    // Modo lápiz virtual: el trazo sale desde la punta del lápiz, no del dedo.
    if (this.pencilMode) { clientX += this.pencilOffset.x; clientY += this.pencilOffset.y; }
    // Referencia geométrica SIEMPRE visible (el display 2D puede estar oculto en
    // modo WebGL2; un elemento display:none devuelve un rect en cero → NaN).
    const rect = this.paperCanvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / rect.width * this.docW, 0, this.docW),
      y: clamp((clientY - rect.top) / rect.height * this.docH, 0, this.docH),
    };
  }
  _bindInput() {
    const s = this.stage;
    s.style.touchAction = 'none';
    s.addEventListener('pointerdown', (e) => {
      // Captura del puntero: el trazo no se corta aunque el dedo roce el borde
      // de la pantalla o salga momentáneamente del área del lienzo.
      try { s.setPointerCapture(e.pointerId); } catch {}
      this._onDown(e);
    });
    s.addEventListener('pointermove', (e) => this._onMove(e));
    s.addEventListener('pointerup', (e) => this._onUp(e));
    s.addEventListener('pointercancel', (e) => this._onUp(e));
    // NOTA: sin 'pointerleave' — con pointer capture provocaba cortes falsos.
  }
  _pressure(e) {
    if (!this.pressureEnabled) return 1;
    if (e.pointerType === 'pen' && e.pressure > 0) return e.pressure;
    if (e.pointerType === 'touch' && e.pressure > 0 && e.pressure !== 0.5) return e.pressure;
    return 1;
  }
  _onDown(e) {
    if (this._playbackLock) return;
    // Rechazo de palma: si un lápiz óptico ya está trazando, los toques
    // accidentales de la palma o de otro dedo se ignoran por completo.
    if (e.pointerType === 'touch' && this._drawing && this._penStroke) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // ---- Lápiz virtual: lógica multitáctil dedicada y estable ----
    //   1 dedo  → SOLO mueve el lápiz (jamás dibuja).
    //   2 dedos → comienza a dibujar desde la punta del lápiz.
    //   3 dedos → zoom/desplazamiento del lienzo.
    if (this.pencilMode) {
      if (this._pointers.size === 1) {
        this._drawPointerId = e.pointerId; // el primer dedo guía la punta
        bus.emit('engine:pointer', { x: e.clientX, y: e.clientY, down: false });
        return; // sin trazo con un solo dedo
      }
      if (this._pointers.size === 2 && !this._drawing) {
        // El segundo dedo activa la tinta: el trazo nace donde está la punta.
        const guide = this._pointers.get(this._drawPointerId) || [...this._pointers.values()][0];
        this._beginStroke(guide.x, guide.y, 1);
        bus.emit('engine:pointer', { x: guide.x, y: guide.y, down: true });
        return;
      }
      if (this._pointers.size >= 3) { this._endStrokeAbort(); this._gesture = this._startGesture(); return; }
      return;
    }

    if (this._pointers.size >= 2) { this._endStrokeAbort(); this._gesture = this._startGesture(); return; }
    if (this.tool === 'pan') return;
    this._drawPointerId = e.pointerId;
    const layer = this.stack.active;
    if (layer.locked || !layer.visible) return;
    e.preventDefault();
    const pt = this.clientToDoc(e.clientX, e.clientY);
    pt.p = this._pressure(e);
    // Non-brush tools
    if (this.tool === 'bucket') return this._doFill(pt);
    if (this.tool === 'eyedropper') return this._doPick(pt);
    if (['line', 'rect', 'ellipse', 'triangle', 'star', 'polygon', 'heart'].includes(this.tool)) { this._shapeStart = pt; return; }
    this._penStroke = e.pointerType === 'pen';
    this._beginStroke(e.clientX, e.clientY, this._pressure(e));
    bus.emit('engine:pointer', { x: e.clientX, y: e.clientY, down: true });
  }

  // Inicia un trazo en unas coordenadas de pantalla. Reutilizado por el dibujo
  // normal (1 dedo) y por el lápiz virtual (2 dedos).
  _beginStroke(clientX, clientY, pressure) {
    const layer = this.stack.active;
    if (layer.locked || !layer.visible) return false;
    const pt = this.clientToDoc(clientX, clientY);
    pt.p = pressure;
    // Regla inteligente: el trazo se apoya en el borde de la regla al tocarlo.
    if (this.ruler) {
      const dirX = Math.cos(this.ruler.angle), dirY = Math.sin(this.ruler.angle);
      const nX = -dirY, nY = dirX;
      const d0 = (pt.x - this.ruler.px) * nX + (pt.y - this.ruler.py) * nY;
      this._rulerGuard = { px: this.ruler.px, py: this.ruler.py, dirX, dirY, nX, nY, side: d0 >= 0 ? 1 : -1 };
      Object.assign(pt, this._guardRuler(pt));
    } else this._rulerGuard = null;
    // Hoja infinita: grosor coherente en pantalla aun con muchísimo zoom.
    const effSize = this.paper.infinite ? Math.max(0.5, this.brushSize / this.zoom) : this.brushSize;
    this._beforeSnapshot = layer.snapshot();
    // Copia en LIENZO del estado previo. Restaurar cada frame con drawImage es
    // muchísimo más rápido que putImageData de 8 MB (era la causa principal de
    // los parpadeos y del tirón al dibujar).
    if (!this._beforeCv || this._beforeCv.width !== this.docW || this._beforeCv.height !== this.docH) {
      this._beforeCv = document.createElement('canvas');
      this._beforeCv.width = this.docW; this._beforeCv.height = this.docH;
      this._beforeCtx = this._beforeCv.getContext('2d');
    }
    this._beforeCtx.clearRect(0, 0, this.docW, this.docH);
    this._beforeCtx.drawImage(layer.canvas, 0, 0);
    this._smoothPt = { x: pt.x, y: pt.y, p: pt.p };
    const seed = (Math.random() * 2 ** 31) | 0;
    this._op = {
      op: 'stroke', tool: this.tool, color: this.color, size: effSize, opacity: this.opacity,
      flow: this.flow, hardness: this.hardness, blend: this.stack.active.blend, seed,
      pressure: this.pressureEnabled, layerId: layer.id,
      sym: this.symmetry.mode === 'none' ? null : { mode: this.symmetry.mode, count: this.symmetry.count, ax: this.docW / 2, ay: this.docH / 2 },
    };
    this._painter = new StrokePainter(this._op, this.docW, this.docH);
    this._painter.addPoint(this._smoothPt, layer.ctx);
    if (!this._painter.direct) this._painter.compositeTo(layer.ctx);
    this.requestComposite();
    this.recorder?.beginStroke(this._op);
    this.recorder?.addPoint(this._smoothPt.x, this._smoothPt.y, this._smoothPt.p);
    this._drawing = true;
    import('../core/sounds.js').then((m) => m.startScratch(this.tool));
    return true;
  }

  // Extiende el trazo activo hacia unas coordenadas de pantalla (con suavizado).
  _paintStep(clientX, clientY, pressure) {
    const raw = this.clientToDoc(clientX, clientY);
    // Suavizado ADAPTATIVO (estilo one-euro): mucho filtrado cuando el trazo
    // va lento (quita el temblor) y poco cuando va rápido (quita el retraso).
    const dx = raw.x - this._smoothPt.x, dy = raw.y - this._smoothPt.y;
    const speed = Math.hypot(dx, dy);
    const baseK = 1 - (this.stabilizer * 0.7 + this.smoothing * 0.25);
    const adapt = Math.min(1, speed / 14);
    const k = baseK + (1 - baseK) * adapt;
    this._smoothPt = {
      x: this._smoothPt.x + dx * k,
      y: this._smoothPt.y + dy * k,
      p: pressure,
    };
    const drawPt = this._rulerGuard ? this._guardRuler(this._smoothPt) : this._smoothPt;
    this._painter.addPoint(drawPt, this.stack.active.ctx);
    this.recorder?.addPoint(drawPt.x, drawPt.y, drawPt.p);
  }
  // Restauración rápida del estado previo del trazo (drawImage, no putImageData).
  _restoreBefore(layer) {
    if (this._beforeCv) { layer.ctx.clearRect(0, 0, this.docW, this.docH); layer.ctx.drawImage(this._beforeCv, 0, 0); }
    else if (this._beforeSnapshot) layer.restore(this._beforeSnapshot);
  }
  _flushPaintFrame() {
    const layer = this.stack.active;
    if (!this._painter.direct) { this._restoreBefore(layer); this._painter.compositeTo(layer.ctx); }
    this.requestComposite();
  }

  _onMove(e) {
    if (e.pointerType === 'touch' && this._drawing && this._penStroke) return; // palma ignorada
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Lápiz virtual: mueve la punta con el primer dedo; dibuja solo con 2;
    // zoom solo con 3. Nada de conflictos entre mover / dibujar / hacer zoom.
    if (this.pencilMode) {
      if (this._gesture && this._pointers.size >= 3) return this._updateGesture();
      const guide = this._pointers.get(this._drawPointerId) || [...this._pointers.values()][0];
      if (!guide) return;
      bus.emit('engine:pointer', { x: guide.x, y: guide.y, down: this._drawing });
      if (this._drawing && this._painter) { this._paintStep(guide.x, guide.y, 1); this._flushPaintFrame(); }
      return;
    }

    if (this._gesture && this._pointers.size >= 2) return this._updateGesture();
    if (this._shapeStart) return this._previewShape(this.clientToDoc(e.clientX, e.clientY));
    if (!this._drawing || !this._painter) return;
    e.preventDefault();
    // Eventos coalescidos para máxima suavidad a 90/120/144/165 Hz.
    const events = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const ev of events) this._paintStep(ev.clientX, ev.clientY, this._pressure(ev));
    this._flushPaintFrame();
    bus.emit('engine:pointer', { x: e.clientX, y: e.clientY, down: true });
  }
  _onUp(e) {
    if (e.pointerType === 'touch' && this._drawing && this._penStroke && !this._pointers.has(e.pointerId)) return; // palma ignorada
    this._pointers.delete(e.pointerId);
    const gestureFloor = this.pencilMode ? 3 : 2;
    if (this._pointers.size < gestureFloor) this._gesture = null;
    // Lápiz virtual: al levantar un dedo baja de 2 → deja de dibujar limpio.
    if (this.pencilMode && this._drawing && this._pointers.size < 2) { this._commitStroke(e); return; }
    if (this._shapeStart) { this._commitShape(this.clientToDoc(e.clientX, e.clientY)); this._shapeStart = null; return; }
    if (!this._drawing) return;
    this._commitStroke(e);
  }
  _commitStroke(e) {
    this._drawing = false;
    this._penStroke = false;
    const layer = this.stack.active;
    if (this._painter && !this._painter.direct) { this._restoreBefore(layer); this._painter.compositeTo(layer.ctx); }
    this.history.push({ type: 'layer', layerId: layer.id, before: this._beforeSnapshot, after: layer.snapshot() });
    this.recorder?.endStroke();
    if (this._op) bus.emit('engine:strokeDone', this._op);
    this._painter = null; this._beforeSnapshot = null; this._op = null;
    this.onHistoryChange?.(); this.requestComposite(); this.markDirty();
    this._pushRecent(this.color);
    bus.emit('engine:pointer', { x: e.clientX, y: e.clientY, down: false });
    import('../core/sounds.js').then((m) => m.stopScratch());
  }
  // Regla como pared deslizante: si el punto intenta cruzar el borde, se
  // apoya sobre la línea y avanza solo en su dirección; si el dedo se
  // aleja del borde, el trazo vuelve a ser libre.
  _guardRuler(pt) {
    const rl = this._rulerGuard; if (!rl) return pt;
    const d = ((pt.x - rl.px) * rl.nX + (pt.y - rl.py) * rl.nY) * rl.side;
    if (d >= 0) return pt; // aún no toca la regla → libre
    const t = (pt.x - rl.px) * rl.dirX + (pt.y - rl.py) * rl.dirY;
    return { x: rl.px + rl.dirX * t, y: rl.py + rl.dirY * t, p: pt.p };
  }
  // Aborta un trazo sin dejar rastro: ni píxeles, ni historial, ni tiempo
  // grabado (se usa cuando el segundo dedo convierte el toque en gesto).
  _endStrokeAbort() {
    if (this._drawing && this._painter) {
      const layer = this.stack.active;
      this._restoreBefore(layer);
      this.recorder?.cancelStroke();
      this._drawing = false; this._penStroke = false; this._painter = null; this._op = null; this._rulerGuard = null;
      import('../core/sounds.js').then((m) => m.stopScratch());
      this.requestComposite();
    }
  }

  // ---------- Gestos (pellizco = zoom + pan SOLO del lienzo) ----------
  // El zoom se ancla al punto medio del pellizco: el punto del dibujo que
  // está bajo los dedos permanece bajo los dedos. La interfaz no se escala.
  _startGesture() {
    const pts = [...this._pointers.values()];
    const rect = this.stage.getBoundingClientRect();
    const c0 = this._mid(pts);
    const s0 = this.baseScale * this.zoom;
    const ox = (this.stage.clientWidth - this.docW * s0) / 2 + this.panX;
    const oy = (this.stage.clientHeight - this.docH * s0) / 2 + this.panY;
    return {
      d0: Math.max(8, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
      z0: this.zoom,
      rect,
      // punto del documento bajo el centro del pellizco
      anchor: { x: (c0.x - rect.left - ox) / s0, y: (c0.y - rect.top - oy) / s0 },
    };
  }
  _mid(pts) { return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }; }
  _updateGesture() {
    const pts = [...this._pointers.values()];
    if (pts.length < 2 || !this._gesture) return;
    const g = this._gesture;
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const c = this._mid(pts);
    const zMax = this.paper.infinite ? 64 : 8, zMin = this.paper.infinite ? 0.05 : 0.2;
    this.zoom = clamp(g.z0 * (d / g.d0), zMin, zMax);
    const s = this.baseScale * this.zoom;
    this.panX = (c.x - g.rect.left) - g.anchor.x * s - (this.stage.clientWidth - this.docW * s) / 2;
    this.panY = (c.y - g.rect.top) - g.anchor.y * s - (this.stage.clientHeight - this.docH * s) / 2;
    this._applyTransform();
  }
  setZoom(z) { const zMax = this.paper.infinite ? 64 : 8, zMin = this.paper.infinite ? 0.05 : 0.2; this.zoom = clamp(z, zMin, zMax); this._applyTransform(); }
  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; this._applyTransform(); }

  // ---------- Fill / Pick ----------
  _doFill(pt) {
    const layer = this.stack.active;
    const before = layer.snapshot();
    const comp = document.createElement('canvas'); comp.width = this.docW; comp.height = this.docH;
    this.stack.compositeTo(comp.getContext('2d'));
    const sample = comp.getContext('2d').getImageData(0, 0, this.docW, this.docH);
    floodFill({ targetCtx: layer.ctx, sampleImageData: sample, x: pt.x, y: pt.y, hex: this.color, tolerance: this.fillTolerance ?? 40, alpha: this.opacity, w: this.docW, h: this.docH, expand: 1 });
    this.history.push({ type: 'layer', layerId: layer.id, before, after: layer.snapshot() });
    this.recorder?.logAction({ op: 'fill', layerId: layer.id, x: Math.round(pt.x), y: Math.round(pt.y), color: this.color, tolerance: this.fillTolerance ?? 40, opacity: this.opacity });
    this.onHistoryChange?.(); this.requestComposite(); this.markDirty(); this._pushRecent(this.color);
    import('../core/sounds.js').then((m) => m.playFx('fill'));
  }
  _doPick(pt) {
    const comp = document.createElement('canvas'); comp.width = this.docW; comp.height = this.docH;
    this.stack.compositeTo(comp.getContext('2d'));
    const data = comp.getContext('2d').getImageData(0, 0, this.docW, this.docH);
    const hex = pickColor(data, pt.x, pt.y, this.docW);
    if (hex) { this.setColor(hex); bus.emit('engine:picked', hex); }
  }

  // ---------- Shapes / Lines ----------
  _shapePoints(a, b) {
    const pts = [];
    const push = (x, y) => pts.push([x, y, 1]);
    const seg = (x0, y0, x1, y1) => { const n = Math.max(2, Math.hypot(x1 - x0, y1 - y0) / 3); for (let i = 0; i <= n; i++) push(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); };
    if (this.tool === 'line') seg(a.x, a.y, b.x, b.y);
    else if (this.tool === 'rect') { seg(a.x, a.y, b.x, a.y); seg(b.x, a.y, b.x, b.y); seg(b.x, b.y, a.x, b.y); seg(a.x, b.y, a.x, a.y); }
    else if (this.tool === 'ellipse') { const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2, n = Math.max(24, (rx + ry)); for (let i = 0; i <= n; i++) { const t = i / n * 6.283; push(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry); } }
    else if (this.tool === 'triangle') { const cx = (a.x + b.x) / 2; seg(cx, a.y, b.x, b.y); seg(b.x, b.y, a.x, b.y); seg(a.x, b.y, cx, a.y); }
    else if (this.tool === 'heart') {
      // Corazón paramétrico ajustado al recuadro arrastrado.
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      const sx = Math.abs(b.x - a.x) / 34, sy = Math.abs(b.y - a.y) / 30;
      const n = 90; let prev = null;
      for (let i = 0; i <= n; i++) {
        const t2 = (i / n) * Math.PI * 2;
        const hx = cx + 16 * Math.pow(Math.sin(t2), 3) * sx;
        const hy = cy - (13 * Math.cos(t2) - 5 * Math.cos(2 * t2) - 2 * Math.cos(3 * t2) - Math.cos(4 * t2)) * sy;
        if (prev) seg(prev.x, prev.y, hx, hy); prev = { x: hx, y: hy };
      }
    }
    else if (this.tool === 'star' || this.tool === 'polygon') {
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, R = Math.hypot(b.x - a.x, b.y - a.y) / 2;
      const spikes = this.tool === 'star' ? 5 : 6; const step = Math.PI / spikes;
      const first = []; let prev = null;
      for (let i = 0; i <= spikes * 2; i++) { const r = this.tool === 'star' ? (i % 2 ? R * 0.45 : R) : R; const ang = -Math.PI / 2 + i * (this.tool === 'star' ? step : (2 * Math.PI / spikes)); const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r; if (prev) seg(prev.x, prev.y, x, y); prev = { x, y }; if (this.tool === 'polygon' && i >= spikes) break; }
    }
    return pts;
  }
  _previewShape(b) {
    const pts = this._shapePoints(this._shapeStart, b);
    this.octx.clearRect(0, 0, this.docW, this.docH);
    this.renderGuides();
    this.octx.save(); this.octx.strokeStyle = this.color; this.octx.lineWidth = this.brushSize; this.octx.lineJoin = 'round'; this.octx.lineCap = 'round'; this.octx.globalAlpha = this.opacity;
    this.octx.beginPath(); pts.forEach(([x, y], i) => i ? this.octx.lineTo(x, y) : this.octx.moveTo(x, y)); this.octx.stroke(); this.octx.restore();
  }
  _commitShape(b) {
    this.octx.clearRect(0, 0, this.docW, this.docH);
    this.renderGuides();
    const pts = this._shapePoints(this._shapeStart, b);
    if (pts.length < 2) return;
    const layer = this.stack.active; const before = layer.snapshot();
    const op = { op: 'stroke', tool: this.tool === 'pixel' ? 'pixel' : (BRUSHES[this.tool] ? this.tool : 'pen'), color: this.color, size: this.brushSize, opacity: this.opacity, flow: this.flow, hardness: this.hardness, blend: layer.blend, seed: (Math.random() * 2 ** 31) | 0, pressure: false, layerId: layer.id, sym: this.symmetry.mode === 'none' ? null : { mode: this.symmetry.mode, count: this.symmetry.count, ax: this.docW / 2, ay: this.docH / 2 }, pts };
    const painter = new StrokePainter(op, this.docW, this.docH);
    for (const [x, y, p] of pts) painter.addPoint({ x, y, p }, layer.ctx);
    painter.compositeTo(layer.ctx);
    this.history.push({ type: 'layer', layerId: layer.id, before, after: layer.snapshot() });
    if (this.recorder) { this.recorder.beginStroke(op); for (const [x, y, p] of pts) this.recorder.addPoint(x, y, p); this.recorder._cur.pts = pts.map(([x, y, p]) => [x, y, p, 4]); this.recorder.endStroke(); }
    this.onHistoryChange?.(); this.requestComposite(); this.markDirty();
    import('../core/sounds.js').then((m) => m.playFx('shape'));
  }

  // ---------- Tool/color setters ----------
  setTool(t) { this.tool = t; const b = BRUSHES[t]; if (b) { this.brushSize = b.size; this.opacity = b.opacity; } bus.emit('engine:tool', t); }
  setColor(c) { this.color = c; bus.emit('engine:color', c); }
  _pushRecent(c) { this.recentColors = [c, ...this.recentColors.filter((x) => x !== c)].slice(0, 12); bus.emit('engine:recent', this.recentColors); }

  // ---------- History ----------
  undo() { this.history.undo(this); this.markDirty(); }
  redo() { this.history.redo(this); this.markDirty(); }

  // ---------- Media ----------
  addMedia(m) { m.id = m.id || uid('media'); this.media.push(m); this.renderMedia(); this.markDirty(); bus.emit('engine:media', this.media); return m; }
  removeMedia(id) { this.media = this.media.filter((m) => m.id !== id); this.renderMedia(); this.markDirty(); }
  renderMedia() { bus.emit('engine:mediaRender', this.media); }

  // ---------- Export / Save ----------
  flatten({ includeMedia = true, transparentPaper = null } = {}) {
    const c = document.createElement('canvas'); c.width = this.docW; c.height = this.docH;
    const ctx = c.getContext('2d');
    const transp = transparentPaper == null ? this.paper.transparent : transparentPaper;
    if (!transp) ctx.drawImage(this.paperCanvas, 0, 0);
    this.stack.compositeTo(ctx);
    if (includeMedia) {
      for (const m of this.media) {
        ctx.save(); ctx.globalAlpha = m.opacity ?? 1;
        ctx.translate(m.x + m.w / 2, m.y + m.h / 2); ctx.rotate((m.rot || 0) * Math.PI / 180);
        if (m.flipH || m.flipV) ctx.scale(m.flipH ? -1 : 1, m.flipV ? -1 : 1); // volteo del objeto
        if (m.type === 'text' || m.type === 'emoji') {
          ctx.fillStyle = m.color || '#000';
          ctx.font = `${m.bold ? '800 ' : ''}${m.fontSize || 40}px ${m.font || 'Nunito, sans-serif'}`;
          ctx.textAlign = m.align || 'center'; ctx.textBaseline = 'middle';
          const lines = String(m.text).split('\n');
          const lh = (m.fontSize || 40) * 1.25;
          const ax = m.align === 'left' ? -m.w / 2 + 8 : m.align === 'right' ? m.w / 2 - 8 : 0;
          lines.forEach((ln, i) => ctx.fillText(ln, ax, (i - (lines.length - 1) / 2) * lh));
        }
        else if (m._img) { ctx.drawImage(m._img, -m.w / 2, -m.h / 2, m.w, m.h); }
        ctx.restore();
      }
    }
    return c;
  }
  thumbnail(size = 400) {
    const make = (includeMedia) => {
      const src = this.flatten({ includeMedia });
      const c = document.createElement('canvas');
      const ratio = this.docH / this.docW; c.width = size; c.height = Math.round(size * ratio);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    };
    // Un GIF externo sin CORS "contamina" el lienzo y toDataURL lanza error;
    // en ese caso se genera la miniatura sin los objetos para no romper el
    // guardado (el dibujo nunca se pierde por un GIF).
    try { return make(true); } catch { try { return make(false); } catch { return ''; } }
  }
  serialize() {
    return { w: this.docW, h: this.docH, paper: this.paper, stack: this.stack.serialize(), media: this.media.map((m) => { const { _img, ...rest } = m; return rest; }) };
  }
}
