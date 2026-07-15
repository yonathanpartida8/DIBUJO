// Process playback — reconstructs the drawing from recorded vector strokes.
// Timeline is measured in ACTIVE drawing time (idle gaps were never recorded),
// so the scrubber reflects real effort. Supports play/pause/seek/speed.
import { StrokePainter } from './paint.js';
import { floodFill } from './floodfill.js';

export class Player {
  constructor(canvas, doc, recording) {
    this.display = canvas;
    this.dctx = canvas.getContext('2d');
    this.doc = doc;
    this.w = doc.w; this.h = doc.h;
    canvas.width = this.w; canvas.height = this.h;
    // paper background
    this.paper = document.createElement('canvas'); this.paper.width = this.w; this.paper.height = this.h;
    this._renderPaper();
    // baked completed strokes
    this.baked = document.createElement('canvas'); this.baked.width = this.w; this.baked.height = this.h;
    this.bctx = this.baked.getContext('2d');
    this._buildTimeline(recording);
    this.t = 0; this.evIdx = 0; this.painter = null; this._painterOp = null;
    this.speed = 1; this.playing = false; this._raf = null; this._lastFrame = 0;
    this.onTick = null; this.onEnd = null;
    this.render();
  }
  _renderPaper() {
    const c = this.paper.getContext('2d');
    if (!this.doc.paper?.transparent) { c.fillStyle = this.doc.paper?.color || '#fff'; c.fillRect(0, 0, this.w, this.h); }
  }
  _buildTimeline(rec) {
    this.ops = rec.ops || [];
    this.events = [];
    for (let oi = 0; oi < this.ops.length; oi++) {
      const op = this.ops[oi];
      if (op.op === 'stroke') {
        let acc = op.at;
        for (let pi = 0; pi < op.pts.length; pi++) {
          acc += op.pts[pi][3] || 0;
          this.events.push({ t: acc, oi, pi, last: pi === op.pts.length - 1 });
        }
      } else {
        this.events.push({ t: op.at, oi, action: op.op });
      }
    }
    this.events.sort((a, b) => a.t - b.t);
    this.total = this.events.length ? this.events[this.events.length - 1].t : 0;
  }
  _resetPlayback() {
    this.bctx.clearRect(0, 0, this.w, this.h);
    this.evIdx = 0; this.t = 0; this.painter = null; this._painterOp = null;
  }
  _apply(ev) {
    const op = this.ops[ev.oi];
    if (ev.action) {
      if (op.op === 'fill') {
        const sample = document.createElement('canvas'); sample.width = this.w; sample.height = this.h;
        const sctx = sample.getContext('2d'); sctx.drawImage(this.paper, 0, 0); sctx.drawImage(this.baked, 0, 0);
        floodFill({ targetCtx: this.bctx, sampleImageData: sctx.getImageData(0, 0, this.w, this.h), x: op.x, y: op.y, hex: op.color, tolerance: op.tolerance || 40, alpha: op.opacity ?? 1, w: this.w, h: this.h, expand: 1 });
      }
      return;
    }
    // stroke point
    if (this._painterOp !== op) {
      if (this.painter && !this.painter.erase) this.painter.compositeTo(this.bctx);
      this.painter = new StrokePainter(op, this.w, this.h);
      this._painterOp = op;
    }
    const [x, y, p] = op.pts[ev.pi];
    this.painter.addPoint({ x, y, p }, this.bctx);
    if (ev.last) { if (!this.painter.erase) this.painter.compositeTo(this.bctx); this.painter = null; this._painterOp = null; }
  }
  seek(targetT) {
    targetT = Math.max(0, Math.min(this.total, targetT));
    if (targetT < this.t) this._resetPlayback();
    while (this.evIdx < this.events.length && this.events[this.evIdx].t <= targetT) {
      this._apply(this.events[this.evIdx]); this.evIdx++;
    }
    this.t = targetT;
    this.render();
    this.onTick?.(this.t, this.total);
  }
  render() {
    const c = this.dctx;
    c.clearRect(0, 0, this.w, this.h);
    c.drawImage(this.paper, 0, 0);
    c.drawImage(this.baked, 0, 0);
    if (this.painter && !this.painter.erase && this.painter.buffer) {
      c.save(); c.globalAlpha = this.painter.op.opacity ?? 1;
      c.globalCompositeOperation = 'source-over';
      c.drawImage(this.painter.buffer, 0, 0); c.restore();
    }
  }
  play() {
    if (this.playing) return;
    if (this.t >= this.total) this.seek(0);
    this.playing = true; this._lastFrame = performance.now();
    const loop = (now) => {
      if (!this.playing) return;
      const dt = (now - this._lastFrame) * this.speed;
      this._lastFrame = now;
      this.seek(this.t + dt);
      if (this.t >= this.total) { this.playing = false; this.onEnd?.(); return; }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  pause() { this.playing = false; if (this._raf) cancelAnimationFrame(this._raf); }
  toggle() { this.playing ? this.pause() : this.play(); }
  setSpeed(s) { this.speed = s; }
  destroy() { this.pause(); }
}
