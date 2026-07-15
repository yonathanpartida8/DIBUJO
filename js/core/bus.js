// Tiny event bus — decoupled pub/sub used across modules.
class Bus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }
  once(type, fn) {
    const off = this.on(type, (p) => { off(); fn(p); });
    return off;
  }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    this.map.get(type)?.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error(`[bus:${type}]`, e); }
    });
  }
}
export const bus = new Bus();
