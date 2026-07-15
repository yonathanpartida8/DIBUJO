// Layer model — each layer owns an offscreen canvas. Supports opacity, blend
// modes, lock, visibility, reorder. The engine composites them onto the display.
import { uid } from '../core/utils.js';

export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'hue', 'saturation', 'color', 'luminosity',
];

export class Layer {
  constructor(w, h, name = 'Capa') {
    this.id = uid('layer');
    this.name = name;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    this.opacity = 1;
    this.blend = 'normal';
    this.visible = true;
    this.locked = false;
  }
  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  resize(w, h) {
    const tmp = document.createElement('canvas'); tmp.width = this.canvas.width; tmp.height = this.canvas.height;
    tmp.getContext('2d').drawImage(this.canvas, 0, 0);
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.drawImage(tmp, 0, 0);
  }
  snapshot() { return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height); }
  restore(imageData) { this.ctx.putImageData(imageData, 0, 0); }
  toDataURL() { return this.canvas.toDataURL('image/png'); }
  async loadDataURL(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { this.clear(); this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height); res(); };
      img.onerror = () => res();
      img.src = url;
    });
  }
}

export class LayerStack {
  constructor(w, h) { this.w = w; this.h = h; this.layers = []; this.activeId = null; }
  add(name, atTop = true) {
    const l = new Layer(this.w, this.h, name || `Capa ${this.layers.length + 1}`);
    if (atTop) this.layers.push(l); else this.layers.unshift(l);
    this.activeId = l.id;
    return l;
  }
  get active() { return this.layers.find((l) => l.id === this.activeId) || this.layers[this.layers.length - 1]; }
  setActive(id) { if (this.layers.some((l) => l.id === id)) this.activeId = id; }
  remove(id) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i < 0 || this.layers.length <= 1) return false;
    this.layers.splice(i, 1);
    if (this.activeId === id) this.activeId = this.layers[Math.max(0, i - 1)].id;
    return true;
  }
  move(id, dir) {
    const i = this.layers.findIndex((l) => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
  }
  duplicate(id) {
    const src = this.layers.find((l) => l.id === id);
    if (!src) return;
    const l = new Layer(this.w, this.h, src.name + ' copia');
    l.ctx.drawImage(src.canvas, 0, 0);
    l.opacity = src.opacity; l.blend = src.blend;
    const i = this.layers.findIndex((x) => x.id === id);
    this.layers.splice(i + 1, 0, l);
    this.activeId = l.id;
  }
  mergeDown(id) {
    const i = this.layers.findIndex((l) => l.id === id);
    if (i <= 0) return;
    const top = this.layers[i], below = this.layers[i - 1];
    below.ctx.save();
    below.ctx.globalAlpha = top.opacity;
    below.ctx.globalCompositeOperation = top.blend === 'normal' ? 'source-over' : top.blend;
    below.ctx.drawImage(top.canvas, 0, 0);
    below.ctx.restore();
    this.layers.splice(i, 1);
    this.activeId = below.id;
  }
  // Composite all visible layers into a target 2D context.
  compositeTo(ctx) {
    ctx.clearRect(0, 0, this.w, this.h);
    for (const l of this.layers) {
      if (!l.visible || l.opacity <= 0) continue;
      ctx.globalAlpha = l.opacity;
      ctx.globalCompositeOperation = l.blend === 'normal' ? 'source-over' : l.blend;
      ctx.drawImage(l.canvas, 0, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  serialize() {
    return { w: this.w, h: this.h, activeId: this.activeId, layers: this.layers.map((l) => ({ id: l.id, name: l.name, opacity: l.opacity, blend: l.blend, visible: l.visible, locked: l.locked, data: l.toDataURL() })) };
  }
  static async deserialize(data) {
    const stack = new LayerStack(data.w, data.h);
    for (const ld of data.layers) {
      const l = new Layer(data.w, data.h, ld.name);
      l.id = ld.id; l.opacity = ld.opacity; l.blend = ld.blend; l.visible = ld.visible; l.locked = ld.locked;
      if (ld.data) await l.loadDataURL(ld.data);
      stack.layers.push(l);
    }
    stack.activeId = data.activeId || stack.layers[stack.layers.length - 1]?.id;
    return stack;
  }
}
