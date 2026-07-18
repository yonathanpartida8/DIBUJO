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
  // Add a point; draws dabs from previous point along the segment into buffer/layer.
  addPoint(pt, layerCtx) {
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
    if (this.erase) return; // already applied directly
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
