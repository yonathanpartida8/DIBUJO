// Unlimited-ish undo/redo via per-layer ImageData snapshots.
// Memory-guarded: caps total retained snapshots; oldest are dropped (so undo is
// effectively unlimited within a generous window without exhausting RAM).
export class History {
  constructor(limit = 120) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }
  // Push a restore point for a specific layer before it changes.
  push(entry) {
    // entry: { type:'layer', layerId, before, after } | { type:'stack', before, after, apply }
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }
  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }
  undo(engine) {
    const e = this.undoStack.pop();
    if (!e) return;
    this._apply(engine, e, 'before');
    this.redoStack.push(e);
  }
  redo(engine) {
    const e = this.redoStack.pop();
    if (!e) return;
    this._apply(engine, e, 'after');
    this.undoStack.push(e);
  }
  _apply(engine, e, which) {
    if (e.type === 'layer') {
      const layer = engine.stack.layers.find((l) => l.id === e.layerId);
      if (layer) { layer.restore(which === 'before' ? e.before : e.after); }
    } else if (e.type === 'custom') {
      (which === 'before' ? e.undo : e.redo)?.(engine);
    }
    engine.requestComposite();
    engine.onHistoryChange?.();
  }
  clear() { this.undoStack.length = 0; this.redoStack.length = 0; }
}
