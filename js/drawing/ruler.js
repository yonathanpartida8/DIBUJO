// ============================================================
// Regla profesional — se comporta como una regla física:
// se mueve, gira, bloquea y redimensiona; muestra medidas (cm)
// y grados. Los pinceles NO pintan del otro lado (el recorte
// de semiplano vive en paint.js → applyRulerClip).
// ============================================================
import { el, clamp } from '../core/utils.js';

const PX_PER_CM = 118; // aproximación visual (lienzo 1080px ≈ 9 cm)

export class RulerTool {
  constructor(engine) {
    this.engine = engine;
    this.state = { x: engine.docW / 2, y: engine.docH / 2, angle: 0, len: engine.docW * 0.8, locked: false };
    this.active = false;
    this.node = null;
  }

  toggle() { this.active ? this.hide() : this.show(); return this.active; }

  show() {
    this.active = true;
    if (!this.node) this._build();
    this.node.hidden = false;
    this._sync();
    this.engine.ruler = this._engineState();
  }
  hide() {
    this.active = false;
    if (this.node) this.node.hidden = true;
    this.engine.ruler = null;
  }

  _engineState() {
    return { px: this.state.x, py: this.state.y, angle: this.state.angle * Math.PI / 180 };
  }

  _build() {
    const n = el('div', { class: 'ruler' });
    this.ticks = el('canvas', { class: 'ruler-ticks' });
    this.deg = el('div', { class: 'ruler-deg', text: '0°' });
    this.lockBtn = el('button', { class: 'ruler-btn ruler-lock', text: '🔓' });
    this.rotHandle = el('div', { class: 'ruler-handle ruler-rot', text: '↻' });
    this.sizeHandle = el('div', { class: 'ruler-handle ruler-size', text: '⇔' });
    n.append(this.ticks, this.deg, this.lockBtn, this.rotHandle, this.sizeHandle);
    this.engine.mediaLayer.append(n);
    this.node = n;

    // Mover (cuerpo) — bloqueado si locked.
    n.addEventListener('pointerdown', (e) => {
      if (e.target !== n && e.target !== this.ticks && e.target !== this.deg) return;
      e.stopPropagation();
      if (this.state.locked) return;
      const s = this._scale();
      const sx = e.clientX, sy = e.clientY, ox = this.state.x, oy = this.state.y;
      const move = (ev) => { this.state.x = ox + (ev.clientX - sx) / s; this.state.y = oy + (ev.clientY - sy) / s; this._sync(); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    // Girar.
    this.rotHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.state.locked) return;
      const rect = this.engine.display.getBoundingClientRect();
      const s = this._scale();
      const cx = rect.left + this.state.x * s, cy = rect.top + this.state.y * s;
      const move = (ev) => {
        let a = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
        if (ev.shiftKey) a = Math.round(a / 15) * 15;
        this.state.angle = Math.round(a * 10) / 10;
        this._sync();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    // Redimensionar.
    this.sizeHandle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (this.state.locked) return;
      const s = this._scale();
      const sx = e.clientX, len0 = this.state.len;
      const move = (ev) => { this.state.len = clamp(len0 + (ev.clientX - sx) / s * 2, 200, this.engine.docW * 2); this._sync(); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    // Bloquear.
    this.lockBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.lockBtn.addEventListener('click', (e) => { e.stopPropagation(); this.state.locked = !this.state.locked; this.lockBtn.textContent = this.state.locked ? '🔒' : '🔓'; this.node.classList.toggle('locked', this.state.locked); });
  }

  _scale() { return this.engine.baseScale * this.engine.zoom; }

  _sync() {
    const { x, y, angle, len } = this.state;
    const H = 92; // alto de la regla en px de documento
    Object.assign(this.node.style, {
      width: len + 'px', height: H + 'px',
      left: x + 'px', top: y + 'px',
      transform: `translate(-50%, 0) rotate(${angle}deg)`,
      transformOrigin: '50% 0%',
    });
    this.deg.textContent = `${((angle % 360) + 360) % 360}°`;
    // Marcas de medida (cm y mm).
    const c = this.ticks; c.width = len; c.height = H;
    const g = c.getContext('2d');
    g.clearRect(0, 0, len, H);
    g.fillStyle = 'rgba(90,78,88,0.65)'; g.font = '20px Nunito, sans-serif';
    for (let px = 0; px <= len; px += PX_PER_CM / 10) {
      const isCm = Math.round(px / (PX_PER_CM / 10)) % 10 === 0;
      const isHalf = Math.round(px / (PX_PER_CM / 10)) % 5 === 0;
      g.fillRect(px, 0, isCm ? 2.4 : 1.2, isCm ? 26 : isHalf ? 18 : 10);
      if (isCm) g.fillText(String(Math.round(px / PX_PER_CM)), px + 5, 42);
    }
    this.engine.ruler = this._engineState();
  }
}
