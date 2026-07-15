// Stroke recorder — captures the vector process (NOT a screen recording).
// Key rule: the timeline clock only advances while actually drawing. Idle gaps
// between strokes are not counted, and a long hold mid-stroke is capped, so the
// recorded "active time" reflects real effort.
export class Recorder {
  constructor() { this.reset(); }
  reset() {
    this.ops = [];
    this.activeMs = 0;       // accumulated active drawing time
    this.colors = new Set();
    this.tools = new Set();
    this.strokeCount = 0;
    this._cur = null;
    this._lastT = 0;
  }
  load(rec) {
    this.ops = rec?.ops ? structuredClone(rec.ops) : [];
    this.activeMs = rec?.activeMs || 0;
    this.colors = new Set(rec?.colors || []);
    this.tools = new Set(rec?.tools || []);
    this.strokeCount = rec?.strokeCount || this.ops.filter((o) => o.op === 'stroke').length;
  }
  get isEmpty() { return this.ops.length === 0; }

  beginStroke(meta) {
    this._cur = { op: 'stroke', at: this.activeMs, ...meta, pts: [] };
    this._lastT = performance.now();
    this.tools.add(meta.tool);
    this.colors.add(meta.color);
  }
  addPoint(x, y, p) {
    if (!this._cur) return;
    const now = performance.now();
    let dt = now - this._lastT;
    // cap per-point dt so pauses (holding still) don't inflate active time
    dt = Math.min(dt, 180);
    this.activeMs += dt;
    this._lastT = now;
    this._cur.pts.push([Math.round(x * 100) / 100, Math.round(y * 100) / 100, Math.round((p ?? 1) * 100) / 100, Math.round(dt)]);
  }
  endStroke() {
    if (!this._cur) return;
    if (this._cur.pts.length > 0) {
      this._cur.dur = this._cur.pts.reduce((s, pt) => s + pt[3], 0);
      this.ops.push(this._cur);
      this.strokeCount++;
    }
    this._cur = null;
  }
  // Non-stroke actions (still part of the process timeline).
  logAction(op) { this.ops.push({ at: this.activeMs, ...op }); if (op.color) this.colors.add(op.color); }

  totalDuration() {
    // sum of stroke durations = active drawing time
    return this.ops.reduce((s, o) => s + (o.op === 'stroke' ? (o.dur || 0) : 0), 0) || this.activeMs;
  }
  serialize() {
    return { ops: this.ops, activeMs: this.activeMs, colors: [...this.colors], tools: [...this.tools], strokeCount: this.strokeCount };
  }
  stats() {
    const strokes = this.ops.filter((o) => o.op === 'stroke');
    return {
      activeMs: this.totalDuration(),
      strokes: strokes.length,
      colors: [...this.colors],
      tools: [...this.tools],
      points: strokes.reduce((s, o) => s + o.pts.length, 0),
    };
  }
}
