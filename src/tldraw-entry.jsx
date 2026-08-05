// ============================================================
// Puente tldraw ↔ Dibujo.
//
// La app es vanilla JS sin build en tiempo de ejecución; tldraw es React.
// Este archivo se empaqueta UNA vez (npm run build:vendor) en
// vendor/tldraw.bundle.js y expone una API sencilla, sin React, para que
// el resto de la aplicación siga siendo JS plano.
// ============================================================
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Tldraw, DefaultColorStyle, DefaultSizeStyle } from 'tldraw';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';

// Herramientas que dejamos visibles, en el orden en que las piensa la app.
const KEEP_TOOLS = ['select', 'hand', 'draw', 'eraser', 'text', 'note', 'arrow', 'line', 'geo', 'frame', 'laser'];

// Rutas locales de fuentes/iconos: se resuelven contra vendor/assets/ para
// que la app funcione sin conexión y desde file://.
function localAssetUrls(baseHref) {
  const base = baseHref.replace(/\/$/, '');
  const at = (p) => `${base}/${p}`;
  const urls = getAssetUrlsByMetaUrl();
  const remap = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      out[k] = typeof v === 'string' ? at(String(v).replace(/^.*?(fonts|icons|embed-icons|translations)\//, '$1/')) : v;
    }
    return out;
  };
  return {
    fonts: remap(urls.fonts),
    icons: remap(urls.icons),
    embedIcons: remap(urls.embedIcons),
    translations: remap(urls.translations),
  };
}

export function mount(container, opts = {}) {
  const root = createRoot(container);
  let editor = null;
  const ready = new Promise((resolve) => {
    const onMount = (ed) => {
      editor = ed;
      // Entrar a "Dibujar" ya con el lápiz en la mano (no con el selector).
      try { ed.setCurrentTool(opts.initialTool || 'draw'); } catch {}
      try { opts.onMount?.(ed); } catch (e) { console.warn('tldraw onMount', e); }
      resolve(ed);
    };
    root.render(createElement(Tldraw, {
      // Sin persistencia propia: el documento lo guarda la app en IndexedDB.
      onMount,
      assetUrls: opts.assetsBase ? localAssetUrls(opts.assetsBase) : undefined,
      inferDarkMode: !!opts.dark,
      options: { maxPages: 1 },
      components: opts.components || {},
      overrides: {
        tools(_editor, tools) {
          const out = {};
          for (const id of KEEP_TOOLS) if (tools[id]) out[id] = tools[id];
          return { ...out };
        },
      },
    }));
  });

  return {
    ready,
    get editor() { return editor; },
    destroy() { try { root.unmount(); } catch {} },
  };
}

// API auxiliar que usa la app (guardar, cargar, exportar, herramientas).
export const api = {
  getSnapshot: (editor) => editor.getSnapshot(),
  loadSnapshot: (editor, snap) => editor.loadSnapshot(snap),
  async toPngDataURL(editor, { scale = 1, background = true } = {}) {
    const ids = [...editor.getCurrentPageShapeIds()];
    if (!ids.length) return { url: '', width: 0, height: 0 };
    const r = await editor.toImageDataUrl(ids, { format: 'png', scale, background, padding: 24 });
    return { url: r.url || '', width: r.width || 0, height: r.height || 0 };
  },
  setTool: (editor, id) => editor.setCurrentTool(id),
  getTool: (editor) => editor.getCurrentToolId(),
  setColor: (editor, color) => editor.setStyleForNextShapes(DefaultColorStyle, color),
  setSize: (editor, size) => editor.setStyleForNextShapes(DefaultSizeStyle, size),
  undo: (editor) => editor.undo(),
  redo: (editor) => editor.redo(),
  canUndo: (editor) => editor.getCanUndo(),
  canRedo: (editor) => editor.getCanRedo(),
  clear: (editor) => editor.deleteShapes([...editor.getCurrentPageShapeIds()]),
  selectAll: (editor) => editor.selectAll(),
  zoomToFit: (editor) => editor.zoomToFit(),
  isEmpty: (editor) => editor.getCurrentPageShapeIds().size === 0,
  shapeCount: (editor) => editor.getCurrentPageShapeIds().size,
};
