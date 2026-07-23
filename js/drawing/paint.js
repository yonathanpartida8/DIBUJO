// Shared stroke painter — used by BOTH live drawing and playback so a recorded
// stroke reproduces pixel-for-pixel. Strokes render into a per-stroke buffer at
// per-dab flow, then composite onto the layer at the stroke opacity + blend mode
// (this gives uniform opacity, no dark overlap seams within one stroke).
import { BRUSHES, makeRng } from './brushes.js';
import { dist, lerp } from '../core/utils.js';

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Regla profesional: recorta el contexto a un semiplano. Ningún pincel puede
// pintar del otro lado de la línea — actúa como una barrera física real.
// ruler: { px, py, angle (rad), side (+1|-1) }
export function applyRulerClip(ctx, ruler, w, h) {
  const L = Math.max(w, h) * 3;
  const dx = Math.cos(ruler.angle), dy = Math.sin(ruler.angle);
  const nx = -dy * ruler.side, ny = dx * ruler.side; // normal hacia el lado permitido
  const p = new Path2D();
  p.moveTo(ruler.px - dx * L, ruler.py - dy * L);
  p.lineTo(ruler.px + dx * L, ruler.py + dy * L);
  p.lineTo(ruler.px + dx * L + nx * L, ruler.py + dy * L + ny * L);
  p.lineTo(ruler.px - dx * L + nx * L, ruler.py - dy * L + ny * L);
  p.closePath();
  ctx.clip(p);
}

export class StrokePainter {
  // op: { tool, color, size, opacity, flow, hardness, blend, seed }
  constructor(op, w, h) {
    this.op = op;
    this.w = w; this.h = h;
    this.brush = BRUSHES[op.tool] || BRUSHES.pen;
    this.erase = !!this.brush.erase;
    // "direct": pinta sobre la capa sin buffer (borrador y difuminador); el
    // motor NO debe restaurar el snapshot cada frame para estos.
    this.direct = this.erase || !!this.brush.smudge;
    if (this.brush.smudge) { this.reset(); return; } // el difuminador no usa buffer
    if (!this.erase) {
      this.buffer = makeCanvas(w, h);
      this.bctx = this.buffer.getContext('2d');
      if (op.ruler) applyRulerClip(this.bctx, op.ruler, w, h); // barrera física de la regla
    }
    this.reset();
  }
  reset() {
    this.rng = makeRng(this.op.seed >>> 0);
    this.carry = 0;
    this.last = null;
    this.angle = 0;
    if (this.bctx) this.bctx.clearRect(0, 0, this.w, this.h);
  }
  _radius(p) {
    const base = (this.op.size || 4) / 2;
    // Influencia de la presión (algunas puntas — marcador, plumilla — son planas).
    if (this.brush.noPressure || this.op.pressure === false) return Math.max(0.4, base);
    const pr = 0.32 + 0.68 * (p ?? 1);
    return Math.max(0.4, base * pr);
  }
  _stampAt(ctx, x, y, p) {
    const r = this._radius(p);
    const o = this.op.flow ?? 1;
    this.brush.dab(ctx, x, y, r, this.op.color, o, this.op.hardness ?? 0.85, this.angle, this.rng, p);
  }
  // Stamp the point plus all symmetry mirror images (kept identical in playback).
  _stampSet(ctx, x, y, p) {
    this._stampAt(ctx, x, y, p);
    const sym = this.op.sym;
    if (!sym || sym.mode === 'none') return;
    const ax = sym.ax ?? this.w / 2, ay = sym.ay ?? this.h / 2;
    if (sym.mode === 'h' || sym.mode === 'hv') this._stampAt(ctx, 2 * ax - x, y, p);
    if (sym.mode === 'v' || sym.mode === 'hv') this._stampAt(ctx, x, 2 * ay - y, p);
    if (sym.mode === 'hv') this._stampAt(ctx, 2 * ax - x, 2 * ay - y, p);
    if (sym.mode === 'radial') {
      const n = Math.max(2, sym.count || 6);
      const dx = x - ax, dy = y - ay, base = Math.atan2(dy, dx), rad = Math.hypot(dx, dy);
      for (let i = 1; i < n; i++) {
        const a = base + (i * 2 * Math.PI) / n;
        this._stampAt(ctx, ax + Math.cos(a) * rad, ay + Math.sin(a) * rad, p);
      }
    }
  }
  // Segmento de LÍNEA CONTINUA (pluma, bolígrafo, borrador…): nada de
  // círculos encadenados — trazo suave con extremos y uniones redondeados.
  _lineSegment(ctx, a, b, hex, alpha) {
    const w = this._radius((a.p + b.p) / 2) * 2;
    ctx.save();
    ctx.strokeStyle = hex; ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(0.6, w);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.restore();
  }
  _lineSet(ctx, a, b, hex, alpha) {
    this._lineSegment(ctx, a, b, hex, alpha);
    const sym = this.op.sym;
    if (!sym || sym.mode === 'none') return;
    const ax = sym.ax ?? this.w / 2, ay = sym.ay ?? this.h / 2;
    const mir = (fx, fy) => this._lineSegment(ctx, { x: fx(a.x, a.y), y: fy(a.x, a.y), p: a.p }, { x: fx(b.x, b.y), y: fy(b.x, b.y), p: b.p }, hex, alpha);
    if (sym.mode === 'h' || sym.mode === 'hv') mir((x) => 2 * ax - x, (_, y) => y);
    if (sym.mode === 'v' || sym.mode === 'hv') mir((x) => x, (_, y) => 2 * ay - y);
    if (sym.mode === 'hv') mir((x) => 2 * ax - x, (_, y) => 2 * ay - y);
    if (sym.mode === 'radial') {
      const n = Math.max(2, sym.count || 6);
      for (let i = 1; i < n; i++) {
        const th = (i * 2 * Math.PI) / n, c = Math.cos(th), s = Math.sin(th);
        const rot = (px, py) => ({ x: ax + (px - ax) * c - (py - ay) * s, y: ay + (px - ax) * s + (py - ay) * c });
        const ra = rot(a.x, a.y), rb = rot(b.x, b.y);
        this._lineSegment(ctx, { ...ra, p: a.p }, { ...rb, p: b.p }, hex, alpha);
      }
    }
  }

  // Difuminador REAL: arrastra los píxeles ya pintados de la capa en la
  // dirección del trazo (como pasar el dedo sobre pastel fresco).
  _smudgeStep(layerCtx, from, to) {
    const r = this._radius(to.p) * 1.2;
    const dx = to.x - from.x, dy = to.y - from.y;
    layerCtx.save();
    layerCtx.beginPath(); layerCtx.arc(to.x, to.y, r, 0, 7); layerCtx.clip();
    layerCtx.globalAlpha = 0.42;
    layerCtx.drawImage(layerCtx.canvas, dx * 0.55, dy * 0.55);
    layerCtx.restore();
  }

  // Add a point; draws dabs from previous point along the segment into buffer/layer.
  addPoint(pt, layerCtx) {
    // Difuminador: opera directo sobre la capa, sin buffer ni color.
    if (this.brush.smudge) {
      if (this.last) this._smudgeStep(layerCtx, this.last, pt);
      this.last = pt;
      return;
    }
    // Pinceles de línea continua.
    if (this.brush.smooth) {
      const ctx = this.erase ? layerCtx : this.bctx;
      if (this.erase) { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; }
      if (this.last) this._lineSet(ctx, this.last, pt, this.op.color, this.erase ? (this.op.opacity ?? 1) : 1);
      else this._lineSet(ctx, pt, { ...pt, x: pt.x + 0.01 }, this.op.color, this.erase ? (this.op.opacity ?? 1) : 1);
      if (this.erase) ctx.restore();
      this.last = pt;
      return;
    }
    const target = this.erase ? layerCtx : this.bctx;
    if (this.erase) {
      layerCtx.save(); layerCtx.globalCompositeOperation = 'destination-out'; layerCtx.globalAlpha = this.op.opacity ?? 1;
      if (this.op.ruler) applyRulerClip(layerCtx, this.op.ruler, this.w, this.h); // la regla también frena al borrador
    }
    if (!this.last) {
      this._stampSet(target, pt.x, pt.y, pt.p);
      this.last = pt;
      if (this.erase) layerCtx.restore();
      return;
    }
    const d = dist(this.last.x, this.last.y, pt.x, pt.y);
    this.angle = Math.atan2(pt.y - this.last.y, pt.x - this.last.x);
    const rAvg = this._radius((this.last.p + pt.p) / 2);
    const spacing = Math.max(0.6, (this.brush.spacing || 0.1) * rAvg * 2);
    let travelled = this.carry;
    while (travelled <= d) {
      const t = d === 0 ? 0 : travelled / d;
      const x = lerp(this.last.x, pt.x, t), y = lerp(this.last.y, pt.y, t), p = lerp(this.last.p, pt.p, t);
      this._stampSet(target, x, y, p);
      travelled += spacing;
    }
    this.carry = travelled - d;
    this.last = pt;
    if (this.erase) layerCtx.restore();
  }
  // Composite the finished (or in-progress) stroke buffer onto the layer.
  compositeTo(layerCtx) {
    if (this.erase || this.brush.smudge || !this.buffer) return; // aplicado directo
    layerCtx.save();
    layerCtx.globalAlpha = this.op.opacity ?? 1;
    layerCtx.globalCompositeOperation = (this.brush.blend || this.op.blend || 'normal') === 'normal' ? 'source-over' : (this.brush.blend || this.op.blend);
    layerCtx.drawImage(this.buffer, 0, 0);
    layerCtx.restore();
  }
}

// Fully render a recorded stroke op onto a layer (used by playback & thumbnails).
// `count` limits how many points to draw (for progressive playback); omit = all.
export function renderStrokeOp(layerCtx, op, w, h, count) {
  const painter = new StrokePainter(op, w, h);
  const n = count == null ? op.pts.length : Math.min(count, op.pts.length);
  for (let i = 0; i < n; i++) {
    const [x, y, p] = op.pts[i];
    painter.addPoint({ x, y, p }, layerCtx);
  }
  painter.compositeTo(layerCtx);
}
