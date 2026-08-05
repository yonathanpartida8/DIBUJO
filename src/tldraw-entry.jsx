// ============================================================
// Puente tldraw ↔ Dibujo.
//
// La app es vanilla JS sin build en tiempo de ejecución; tldraw es React.
// Este archivo se empaqueta UNA vez (npm run build:vendor) en
// vendor/tldraw.bundle.js y expone una API sencilla, sin React, para que
// el resto de la aplicación siga siendo JS plano.
// ============================================================
import { createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Tldraw, DefaultColorStyle, DefaultSizeStyle, DefaultToolbar,
  DrawToolbarItem, EraserToolbarItem, SelectToolbarItem, TextToolbarItem,
  HeartToolbarItem, EllipseToolbarItem, RectangleToolbarItem, StarToolbarItem,
  ArrowToolbarItem, LineToolbarItem, NoteToolbarItem, HandToolbarItem,
  TriangleToolbarItem, CloudToolbarItem,
} from 'tldraw';
import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import tldrawCss from 'tldraw/tldraw.css';
import { customIconUrls } from './tl-icons.js';

// La hoja de estilos viaja DENTRO del bundle: si dependiera de un archivo
// aparte, una caché vieja podía dejar el editor montado pero invisible.
function injectCss() {
  if (document.getElementById('tldraw-inline-css')) return;
  const st = document.createElement('style');
  st.id = 'tldraw-inline-css';
  st.textContent = tldrawCss;
  document.head.appendChild(st);
}

// Orden propio: primero lo que de verdad se usa al dibujar juntos. Los
// huecos visibles de la barra son pocos en un móvil, así que los ocupan el
// lápiz, la goma y el selector antes que nada. El resto cae en "Más".
const ToolbarContent = () => createElement(
  Fragment, null,
  createElement(DrawToolbarItem),
  createElement(EraserToolbarItem),
  createElement(SelectToolbarItem),
  createElement(TextToolbarItem),
  createElement(HeartToolbarItem),
  createElement(NoteToolbarItem),
  createElement(ArrowToolbarItem),
  createElement(LineToolbarItem),
  createElement(EllipseToolbarItem),
  createElement(RectangleToolbarItem),
  createElement(TriangleToolbarItem),
  createElement(StarToolbarItem),
  createElement(CloudToolbarItem),
  createElement(HandToolbarItem),
);

// La barra de tldraw calcula cuántas herramientas caben interpolando entre
// (minSizePx → minItems) y (maxSizePx → maxItems). Con los valores por
// defecto pedía más botones de los que entran en un móvil de 393 px y el
// botón de estilos se salía de la pantalla. Estos números dejan siempre
// aire a los lados.
const Toolbar = (props) => createElement(
  DefaultToolbar,
  { ...props, minItems: 4, minSizePx: 320, maxItems: 9, maxSizePx: 560 },
  createElement(ToolbarContent),
);

// Rutas locales de fuentes/iconos: se resuelven contra vendor/assets/ para
// que la app funcione sin conexión y desde file://.
function localAssetUrls(baseHref) {
  const base = (baseHref || '').replace(/\/$/, '');
  const at = (p) => `${base}/${p}`;
  const urls = getAssetUrlsByMetaUrl();
  const remap = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) {
      if (typeof v !== 'string') { out[k] = v; continue; }
      out[k] = base ? at(v.replace(/^.*?(fonts|icons|embed-icons|translations)\//, '$1/')) : v;
    }
    return out;
  };
  return {
    fonts: remap(urls.fonts),
    // Los iconos propios de Dibujo (trazo grueso y redondeado) sustituyen a
    // los del SDK; el resto sigue viniendo de vendor/assets.
    icons: { ...remap(urls.icons), ...customIconUrls() },
    embedIcons: remap(urls.embedIcons),
    translations: remap(urls.translations),
  };
}

export function mount(container, opts = {}) {
  injectCss();
  const root = createRoot(container);
  let editor = null;
  const ready = new Promise((resolve) => {
    const onMount = (ed) => {
      editor = ed;
      // El proveedor interno de traducciones lee la preferencia del usuario,
      // no la prop `locale`: hay que fijarla aquí para que la interfaz del
      // editor salga en español igual que el resto de la app.
      try { ed.user.updateUserPreferences({ locale: opts.locale || 'es' }); } catch {}
      // Entrar a "Dibujar" ya con el lápiz en la mano (no con el selector).
      try { ed.setCurrentTool(opts.initialTool || 'draw'); } catch {}
      try { opts.onMount?.(ed); } catch (e) { console.warn('tldraw onMount', e); }
      resolve(ed);
    };
    root.render(createElement(Tldraw, {
      // Sin persistencia propia: el documento lo guarda la app en IndexedDB.
      onMount,
      assetUrls: localAssetUrls(opts.assetsBase),
      // Toda la interfaz del editor en español, como el resto de la app.
      locale: opts.locale || 'es',
      inferDarkMode: !!opts.dark,
      options: { maxPages: 1 },
      // La selección de herramientas se hace en ToolbarContent, no filtrando
      // `overrides.tools`: ese filtro también borraba las variantes de forma
      // (corazón, círculo, estrella…) y dejaba huecos vacíos en la barra.
      components: { Toolbar, ...(opts.components || {}) },
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
