// Drawing studio — the full creative workspace.
import { el, $, uid, fmtClock, fmtDuration, haptic, downloadDataURL, blobToDataURL } from '../core/utils.js';
import { Engine, PAPER_TEXTURES } from '../drawing/engine.js';
import { Recorder } from '../drawing/recorder.js';
import { BRUSHES, BRUSH_LIST, BRUSH_CATS } from '../drawing/brushes.js';
import { BLEND_MODES } from '../drawing/layers.js';
import { colorWheel, hexToRgb } from '../drawing/color.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { sync } from '../core/sync.js';
import { bus } from '../core/bus.js';
import { toast, sheet, modal, confirmDialog, promptDialog, sound } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { searchGifs, trendingGifs } from '../media/klipy.js';
import { openStatsSheet, openPlayer } from './player-ui.js';
import { RulerTool } from '../drawing/ruler.js';
import { fb } from '../core/firebase.js';

let engine, recorder, current, saveTimer, autosaveOff, ruler;
let skipSaveOnLeave = false; // "Salir sin guardar" evita que leave() re-guarde

// Icono SVG por herramienta (la UI no usa emojis).
const TOOL_ICON = {
  pencil: 'toolPencil', charcoal: 'toolCharcoal', chalk: 'toolChalk', crayon: 'toolCrayon',
  marker: 'toolMarker', pixel: 'toolPixelB',
  pen: 'toolPen', ballpoint: 'toolBall', calligraphy: 'toolCallig',
  brush: 'toolBrush', flat: 'toolFlat', watercolor: 'toolWater', smudge: 'toolSmudge',
  airbrush: 'toolSpray', splatter: 'toolSplatter',
  eraser: 'toolEraser', eraserSoft: 'toolEraserSoft', eraserPixel: 'toolPixel',
  bucket: 'toolBucket', eyedropper: 'dropper', line: 'line', shapes: 'toolShapes',
  symmetry: 'symmetry', 'ruler-tool': 'ruler', 'pencil-sim': 'toolPencilVirtual', 'more-tools': 'more',
};

// Herramientas por categoría (orden de la barra del editor).
let toolbarOff = null; // listener de sincronía de categoría activa
const TOOL_CATS = [
  ['pencil', 'Lápices', ['pencil', 'charcoal', 'chalk', 'crayon']],
  ['marker', 'Marcadores', ['marker', 'pixel']],
  ['pen', 'Plumas', ['pen', 'ballpoint', 'calligraphy']],
  ['brush', 'Pinceles', ['brush', 'flat', 'watercolor', 'smudge']],
  ['spray', 'Aerógrafos', ['airbrush', 'splatter']],
  ['erase', 'Borradores', ['eraser', 'eraserSoft', 'eraserPixel']],
  ['other', 'Otras', ['bucket', 'eyedropper', 'line', 'shapes', 'symmetry', 'ruler-tool', 'pencil-sim', 'more-tools']],
];
let activeCat = 'pencil';


export async function renderStudio(ctx) {
  engine = new Engine();
  recorder = new Recorder();
  engine.recorder = recorder;
  applyEngineDefaults();

  const root = ctx.root;
  const wrap = el('div', { class: 'studio view' });
  root.append(wrap);

  // Top bar
  const top = buildTopBar();
  const stage = el('div', { class: 'st-stage' });
  const dock = buildDock();
  wrap.append(top, stage, dock);

  engine.mount(stage);
  ruler = new RulerTool(engine);
  fb.setDrawing?.(true);

  // Modo zen: botón flotante que oculta/muestra las barras con elegancia.
  const zenBtn = el('button', { class: 'zen-fab', html: icon('fit'), 'aria-label': 'Ocultar herramientas', onclick: () => {
    const on = wrap.dataset.zen === '1';
    wrap.dataset.zen = on ? '0' : '1';
    haptic();
  } });
  stage.append(zenBtn);

  // Lápiz virtual (sprite que sigue al dedo con la punta en el trazo).
  const pencil = el('div', { class: 'virtual-pencil', hidden: true, html: '<svg viewBox="0 0 40 160" width="34" height="136"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f7b7c4"/><stop offset="1" stop-color="#ef92a6"/></linearGradient></defs><polygon points="20,0 12,26 28,26" fill="#5a4e58"/><polygon points="20,0 16,13 24,13" fill="#2f2833"/><rect x="12" y="26" width="16" height="96" rx="4" fill="url(#pg)"/><rect x="12" y="122" width="16" height="14" rx="4" fill="#cbb6e8"/><rect x="12" y="136" width="16" height="10" rx="5" fill="#a98fd4"/></svg>' });
  stage.append(pencil);
  const offPointer = bus.on('engine:pointer', (p) => {
    if (!engine.pencilMode) return;
    const r = stage.getBoundingClientRect();
    pencil.hidden = false;
    pencil.style.transform = `translate(${p.x - r.left + engine.pencilOffset.x}px, ${p.y - r.top + engine.pencilOffset.y}px) rotate(${p.down ? 24 : 18}deg)`;
    pencil.classList.toggle('drawing', p.down);
    clearTimeout(pencil._t);
    pencil._t = setTimeout(() => { pencil.hidden = true; }, 1600);
  });

  // Load or create
  const id = ctx.params.id;
  if (id) { current = await db.get('drawings', id); if (current) await loadInto(current); else newDrawing(); }
  else newDrawing();

  wireEngineEvents();
  refreshToolUI();
  refreshColorUI();

  // Autosave on change (debounced)
  autosaveOff = bus.on('studio:dirty', () => scheduleSave());

  // Collaborative strokes (draw together): broadcast + receive
  const offCollab = sync.on('stroke', (op) => applyRemoteStroke(op));
  const offBroadcast = bus.on('engine:strokeDone', (op) => { if (store.get().couple.collab) sync.send('stroke', op); });

  return {
    leave: async () => {
      clearTimeout(saveTimer);
      if (!skipSaveOnLeave) await doSave(true);
      skipSaveOnLeave = false;
      autosaveOff?.(); offCollab?.(); offBroadcast?.(); offPointer?.();
      toolbarOff?.(); toolbarOff = null;
      fb.setDrawing?.(false);
      const { stopScratch } = await import('../core/sounds.js'); stopScratch();
      // Detén TODA la música y libera el audio al salir del editor.
      const { stopAllMusic } = await import('./vinyl.js'); stopAllMusic();
    },
  };

  // ---------- builders ----------
  function buildTopBar() {
    const bar = el('div', { class: 'st-top' });
    const back = el('button', { class: 'icon-btn', html: icon('back'), onclick: onBack });
    const undo = el('button', { class: 'icon-btn', id: 'btn-undo', html: icon('undo'), onclick: () => { engine.undo(); haptic(); } });
    const redo = el('button', { class: 'icon-btn', id: 'btn-redo', html: icon('redo'), onclick: () => { engine.redo(); haptic(); } });
    const title = el('div', { class: 'title' }, [
      el('div', { class: 'n', id: 'st-title', text: t('studio.untitled') }),
      el('div', { class: 'save-state', id: 'st-save' }, [el('span', { class: 'rec-dot' }, [el('i'), 'REC ']), el('span', { id: 'st-timer', text: '0:00' })]),
    ]);
    const layers = el('button', { class: 'icon-btn', html: icon('layers'), onclick: openLayers });
    const sendBtn = el('button', { class: 'icon-btn st-send', html: icon('send'), 'aria-label': 'Enviar', onclick: openSendSheet });
    const more = el('button', { class: 'icon-btn', html: icon('more'), onclick: openMenu });
    bar.append(back, undo, redo, title, layers, sendBtn, more);
    return bar;
  }

  // Barra de herramientas por CATEGORÍAS — fila de categorías + fila con
  // las herramientas de la categoría activa; rueda cromática fija al final.
  function buildToolbar() {
    const wrap = el('div', { class: 'st-toolwrap' });
    const cats = el('div', { class: 'st-cats' });
    const row = el('div', { class: 'st-toolrow' });
    const scroll = el('div', { class: 'st-toolbar' });
    const wheelBtn = el('button', { class: 'st-wheel-btn', id: 'st-wheel-btn', 'aria-label': t('studio.color'), onclick: openColorWheel }, [el('i', { class: 'st-wheel-core', id: 'st-wheel-core' })]);
    row.append(scroll, wheelBtn);

    const OTHER_LABEL = { bucket: 'Cubeta', eyedropper: 'Gotero', line: 'Línea', shapes: 'Figuras', symmetry: 'Simetría', 'ruler-tool': 'Regla', 'pencil-sim': 'Lápiz virtual', 'more-tools': 'Más' };

    const paintTools = () => {
      scroll.innerHTML = '';
      const cat = TOOL_CATS.find(([id]) => id === activeCat) || TOOL_CATS[0];
      for (const tool of cat[2]) {
        const label = BRUSHES[tool]?.name || OTHER_LABEL[tool] || tool;
        const b = el('button', { class: 'st-tool', dataset: { tool } }, []);
        b.innerHTML = icon(TOOL_ICON[tool] || 'pen');
        b.append(el('span', { class: 'st-tool-name', text: label }));
        b.title = label; b.setAttribute('aria-label', label);
        b.onclick = () => onToolButton(tool, b);
        // Entrada breve en cascada al cambiar de categoría.
        b.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: scroll.children.length * 28, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'backwards' });
        scroll.append(b);
      }
      refreshToolUI();
    };
    for (const [id, label] of TOOL_CATS) {
      cats.append(el('button', { class: 'st-cat' + (id === activeCat ? ' active' : ''), dataset: { cat: id }, text: label, onclick: (e) => {
        activeCat = id;
        cats.querySelectorAll('.st-cat').forEach((c) => c.classList.remove('active'));
        e.target.classList.add('active');
        haptic(4);
        paintTools();
      } }));
    }
    // Si otra parte de la app selecciona una herramienta (assets, hoja "Más"),
    // la barra salta a su categoría automáticamente.
    toolbarOff?.();
    toolbarOff = bus.on('engine:tool', (tool) => {
      const cat = TOOL_CATS.find(([, , list]) => list.includes(tool));
      if (cat && cat[0] !== activeCat) {
        activeCat = cat[0];
        cats.querySelectorAll('.st-cat').forEach((c) => c.classList.toggle('active', c.dataset.cat === activeCat));
        paintTools();
      }
    });
    wrap.append(cats, row);
    paintTools();
    return wrap;
  }

  function buildDock() {
    const d = el('div', { class: 'st-dock' });
    const toolbar = buildToolbar();
    // Control de grosor COMPACTO: una barra fina con la perilla y el valor; el
    // dibujo respira y todo se ve minimalista. El deslizador vive inline pero
    // ocupa poco; tocar el número abre las opciones completas del pincel.
    const quick = el('div', { class: 'st-quick st-size-bar' });
    const swatch = el('button', { class: 'st-color-swatch', id: 'st-swatch', onclick: openColorWheel });
    const slider = el('input', { class: 'slider slim', type: 'range', min: 1, max: 200, value: engine.brushSize, id: 'st-size' });
    const setFill = () => slider.style.setProperty('--fill', ((slider.value - slider.min) / (slider.max - slider.min) * 100) + '%');
    setFill();
    slider.oninput = () => { engine.brushSize = +slider.value; updateSizeDot(); setFill(); const n = $('#st-sizenum'); if (n) n.textContent = slider.value; };
    const sizeNum = el('button', { class: 'st-sizenum', id: 'st-sizenum', text: String(engine.brushSize), onclick: openBrushOptions });
    const brushBtn = el('button', { class: 'icon-btn', html: icon('pen'), onclick: openBrushPicker });
    quick.append(swatch, el('div', { class: 'st-slider-wrap' }, [slider]), sizeNum, brushBtn);

    const palette = el('div', { class: 'st-palette', id: 'st-palette' });

    const actions = el('div', { class: 'st-quick' });
    const mk = (ic, fn, title) => el('button', { class: 'icon-btn', html: icon(ic), onclick: fn, title });
    actions.append(
      mk('paper', openPaper, t('studio.paper')),
      mk('image', openMedia, t('studio.media')),
      mk('sticker', openAssetsPanel, 'Assets'),
      mk('music', openMusic, t('studio.music')),
      mk('stats', () => openStatsSheet(recorder.stats(), current), t('studio.stats')),
      mk('save', () => doSave(true).then(() => toast(t('toast.saved'))), t('common.save')),
    );

    d.append(toolbar, quick, palette, actions);
    setTimeout(refreshPalette, 0);
    // zoom fit pill
    const pill = el('button', { class: 'icon-btn zoom-pill', html: icon('fit'), onclick: () => engine.resetView() });
    stage.append(pill);
    return d;
  }
}

// ---------- helpers ----------
function applyEngineDefaults() {
  const s = store.get().settings;
  engine.stabilizer = (s.stabilizerDefault ?? 45) / 100;
  engine.smoothing = (s.smoothingDefault ?? 30) / 100;
  const q = s.quality;
  const size = q === 'high' ? { w: 1240, h: 1654 } : q === 'med' ? { w: 1080, h: 1440 } : { w: 900, h: 1200 };
  engine._preset = size;
}
function newDrawing() {
  engine.newDoc(engine._preset || { w: 1080, h: 1440 });
  current = null;
  recorder.reset();
  $('#st-title').textContent = t('studio.untitled');
  startTimer();
  // Antes de entrar al lienzo, pedimos un título para el dibujo.
  setTimeout(async () => {
    const name = await promptDialog({ title: '¿Cómo se llamará este dibujo?', placeholder: 'Nuestro atardecer…', confirmText: 'Comenzar' });
    if (name) $('#st-title').textContent = name;
  }, 350);
}

// Atrás: si hay trabajo sin enviar, ofrecer guardarlo como borrador o descartarlo.
async function onBack() {
  if (!current && recorder.isEmpty) { go('gallery'); return; }
  if (current?.sent) { await doSave(true); go('gallery'); return; }
  const body = el('div');
  const sh = sheet('¿Salir del dibujo?', body);
  const opt = (ic, title2, sub, danger, fn) => el('button', { class: 'row tappable', style: { width: '100%', color: danger ? '#d66' : '' }, onclick: async () => { sh.close(); await fn(); } }, [el('div', { class: 'r-ic', html: icon(ic) }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title2 }), el('div', { class: 'r-sub', text: sub })])]);
  body.append(
    opt('save', 'Guardar como borrador', 'Podrás seguir editándolo después', false, async () => { await doSave(true); if (current) { current.draft = true; await db.put('drawings', current); } bus.emit('gallery:refresh'); toast('Guardado en borradores'); go('gallery'); }),
    opt('logout', 'Salir sin guardar', 'Se descartan los cambios de este dibujo', true, async () => { skipSaveOnLeave = true; if (current && !current.sent) await db.del('drawings', current.id).catch(() => {}); current = null; recorder.reset(); bus.emit('gallery:refresh'); go('gallery'); }),
    opt('back', 'Cancelar', 'Volver al lienzo', false, async () => {}),
  );
}
async function loadInto(rec) {
  await engine.loadDoc(rec.doc);
  recorder.load(rec.recording);
  $('#st-title').textContent = rec.title || t('studio.untitled');
  startTimer();
  bus.emit('engine:mediaRender', engine.media);
  loadMediaImages();
  // La música del dibujo suena automáticamente en el tocadiscos.
  if (rec.music?.autoplay && rec.music.src) {
    import('./vinyl.js').then((m) => { m.playTrack({ id: rec.id + '_music', name: rec.music.name, src: rec.music.src, kind: 'song' }); m.showMini(); });
  }
}
async function loadMediaImages() {
  for (const m of engine.media) {
    if ((m.type === 'image' || m.type === 'gif' || m.type === 'sticker') && m.src && !m._img) {
      const img = new Image(); img.src = m.src; await img.decode().catch(() => {}); m._img = img;
    }
  }
  bus.emit('engine:mediaRender', engine.media);
}

let timerInt;
function startTimer() {
  clearInterval(timerInt);
  timerInt = setInterval(() => {
    const el2 = $('#st-timer'); if (el2) el2.textContent = fmtClock(recorder.totalDuration());
  }, 500);
}

function wireEngineEvents() {
  engine.onHistoryChange = () => {
    $('#btn-undo')?.toggleAttribute('disabled', !engine.history.canUndo());
    $('#btn-redo')?.toggleAttribute('disabled', !engine.history.canRedo());
  };
  engine.onChange = () => bus.emit('studio:dirty');
  bus.on('engine:color', refreshColorUI);
  bus.on('engine:recent', refreshPalette);
  bus.on('engine:picked', (hex) => { toast('🎨 ' + hex); refreshColorUI(); });
  bus.on('engine:tool', refreshToolUI);
  bus.on('engine:mediaRender', renderMediaOverlay);
}

function onToolButton(tool, btn) {
  haptic(); // el sonido llega por el audio global de botones
  if (tool === 'shapes') return openShapes();
  if (tool === 'symmetry') return openSymmetry();
  if (tool === 'more-tools') return openMoreTools();
  if (tool === 'ruler-tool') { const on = ruler.toggle(); btn.classList.toggle('active', on); toast(on ? 'Regla activa — trazos perfectamente rectos' : 'Regla desactivada'); return; }
  if (tool === 'pencil-sim') { engine.pencilMode = !engine.pencilMode; btn.classList.toggle('active', engine.pencilMode); toast(engine.pencilMode ? 'Simular Pincel Virtual activado' : 'Pincel virtual desactivado'); return; }
  engine.setTool(tool);
  refreshToolUI();
}

function refreshToolUI() {
  $('.st-toolbar')?.querySelectorAll('.st-tool').forEach((b) => {
    // Los conmutadores (regla / lápiz virtual) conservan su propio estado.
    if (b.dataset.tool === 'ruler-tool') { b.classList.toggle('active', !!ruler?.active); return; }
    if (b.dataset.tool === 'pencil-sim') { b.classList.toggle('active', !!engine.pencilMode); return; }
    b.classList.toggle('active', b.dataset.tool === engine.tool);
  });
  const sl = $('#st-size'); if (sl) { sl.value = engine.brushSize; sl.style.setProperty('--fill', ((sl.value - sl.min) / (sl.max - sl.min) * 100) + '%'); }
  updateSizeDot();
  const core = $('#st-wheel-core'); if (core) core.style.background = engine.color;
}
function updateSizeDot() {
  const num = $('#st-sizenum'); if (num) num.textContent = Math.round(engine.brushSize);
  return _updateSizeDotLegacy();
}
function _updateSizeDotLegacy() {
  const dot = $('#st-sizedot'); if (!dot) return;
  const s = Math.max(3, Math.min(34, engine.brushSize * 0.7));
  dot.style.width = s + 'px'; dot.style.height = s + 'px'; dot.style.background = engine.color;
}
function refreshColorUI() {
  const sw = $('#st-swatch'); if (sw) sw.style.background = engine.color;
  const core = $('#st-wheel-core'); if (core) core.style.background = engine.color;
  updateSizeDot();
}
// Paleta pastel curada — la barra de colores nunca se ve vacía y mantiene el
// aire premium. Se muestran primero favoritos y recientes, luego la curada.
const QUICK_COLORS = [
  '#5a4e58', '#2a2730', '#ffffff', '#ef92a6', '#f7b7c6', '#e8935f', '#ffd7bd',
  '#f6d365', '#a98fd4', '#c9b6ec', '#8fd0bd', '#b8e0d2', '#bcd8f2', '#7db5e6', '#d64f6a',
];
function refreshPalette() {
  const p = $('#st-palette'); if (!p) return;
  p.innerHTML = '';
  // "+" abre la rueda de color completa.
  p.append(el('button', { class: 'st-swatch st-swatch-add', html: icon('add'), 'aria-label': 'Elegir color', onclick: openColorWheel }));
  const { favs, recent } = store.get().colors;
  const seen = new Set();
  const put = (c, fav) => {
    if (!c || seen.has(c)) return; seen.add(c);
    const b = el('button', { class: 'st-swatch' + (c === engine.color ? ' active' : '') + (fav ? ' fav' : ''), style: { background: c }, onclick: () => { engine.setColor(c); refreshColorUI(); refreshPalette(); } });
    // Mantener presionado un color → lo fija/quita de favoritos.
    let lp; b.addEventListener('pointerdown', () => { lp = setTimeout(() => toggleFav(c), 500); });
    b.addEventListener('pointerup', () => clearTimeout(lp));
    b.addEventListener('pointerleave', () => clearTimeout(lp));
    p.append(b);
  };
  favs.forEach((c) => put(c, true));
  [...engine.recentColors, ...recent].forEach((c) => put(c, false));
  QUICK_COLORS.forEach((c) => put(c, false));
}
function toggleFav(c) {
  const cols = store.get().colors; const favs = cols.favs || [];
  const next = favs.includes(c) ? favs.filter((x) => x !== c) : [c, ...favs].slice(0, 16);
  store.set('colors', { ...cols, favs: next }); refreshPalette();
  import('../core/sounds.js').then((m) => m.playFx('tap')).catch(() => {});
}

// ---------- Save ----------
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => doSave(false), 1400); }
// Historial de colores recientes persistente (se comparte entre sesiones).
bus.on('engine:recent', (list) => {
  const prev = store.get().colors.recent;
  const merged = [...list, ...prev].filter((c, i, a) => a.indexOf(c) === i).slice(0, 14);
  store.set('colors', { recent: merged });
});
// Garantiza que exista el registro del dibujo. doSave() sale antes de crearlo
// cuando el lienzo está vacío, así que adjuntar música/ajustes a un dibujo
// recién creado lanzaba "Cannot set properties of null".
function ensureDoc() {
  if (!current) current = { id: uid('draw'), createdAt: Date.now(), folderId: null, favorite: false, comments: [], reactions: {}, owner: 'me' };
  return current;
}
async function doSave(showState) {
  if (recorder.isEmpty && !current) return;
  const now = Date.now();
  if (!current) current = { id: uid('draw'), createdAt: now, folderId: null, favorite: false, comments: [], reactions: {}, owner: 'me' };
  current.title = $('#st-title')?.textContent || t('studio.untitled');
  current.w = engine.docW; current.h = engine.docH;
  current.updatedAt = now;
  current.thumb = engine.thumbnail(420);
  current.doc = engine.serialize();
  current.recording = recorder.serialize();
  current.stats = recorder.stats();
  await db.put('drawings', current);
  if (showState) import('../core/sounds.js').then((m) => m.playFx('save'));
  // update global stats
  const ds = store.get().drawStats;
  store.set('drawStats', { totalDrawings: Math.max(ds.totalDrawings, await db.count('drawings')), totalStrokes: ds.totalStrokes, totalActiveMs: ds.totalActiveMs });
  bus.emit('gallery:refresh');
}
function applyRemoteStroke(op) {
  // Render a partner's stroke live onto the active layer (collaborative canvas).
  try {
    const layer = engine.stack.active;
    import('../drawing/paint.js').then(({ renderStrokeOp }) => {
      renderStrokeOp(layer.ctx, op, engine.docW, engine.docH);
      engine.requestComposite();
    });
  } catch {}
}

// ============================================================
// Sheets / panels
// ============================================================
function openBrushPicker() {
  const body = el('div');
  for (const [cat, label] of Object.entries(BRUSH_CATS)) {
    const items = BRUSH_LIST.filter((b) => b.cat === cat);
    if (!items.length) continue;
    body.append(el('div', { class: 'section-title', style: { marginTop: '10px' }, text: label }));
    const grid = el('div', { class: 'grid-auto' });
    items.forEach((b) => {
      const card = el('button', { class: 'tile', style: { padding: '14px', textAlign: 'center' }, onclick: () => { engine.setTool(b.id); refreshToolUI(); s.close(); } });
      card.append(el('div', { class: 'attach-ic', style: { margin: '0 auto' }, html: icon(TOOL_ICON[b.id] || 'pen') }), el('div', { class: 'meta', html: `<div class="t">${b.name}</div>` }));
      if (b.id === engine.tool) card.style.outline = '2px solid var(--primary)';
      grid.append(card);
    });
    body.append(grid);
  }
  const s = sheet(t('studio.brush'), body);
}

function openColorWheel() {
  const wrap = el('div', { class: 'wheel-wrap' });
  const wheel = colorWheel({ size: 250, hex: engine.color, onChange: (hex) => { engine.setColor(hex); preview.style.background = hex; hexIn.value = hex; refreshColorUI(); } });
  const preview = el('div', { class: 'color-preview-big', style: { background: engine.color } });
  const hexIn = el('input', { class: 'input hex-input', value: engine.color, maxlength: 7 });
  hexIn.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hexIn.value)) { engine.setColor(hexIn.value); wheel.set(hexIn.value); preview.style.background = hexIn.value; refreshColorUI(); } };
  // Favorito: guarda/quita el color actual con una estrella.
  const favBtn = el('button', { class: 'btn btn-soft btn-sm', text: 'Guardar en favoritos', onclick: () => {
    const cs = store.get().colors;
    const favs = cs.favs.includes(engine.color) ? cs.favs.filter((c) => c !== engine.color) : [engine.color, ...cs.favs].slice(0, 12);
    store.set('colors', { favs });
    favBtn.textContent = favs.includes(engine.color) ? 'Quitar de favoritos' : 'Guardar en favoritos';
    paintRows(); refreshPalette();
  } });
  const rows2 = el('div', { style: { width: '100%' } });
  const paintRows = () => {
    rows2.innerHTML = '';
    const { favs, recent } = store.get().colors;
    const mkRow = (label, list) => {
      if (!list.length) return;
      rows2.append(el('div', { class: 'lab', style: { fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', margin: '10px 0 6px' }, text: label }));
      const r = el('div', { class: 'st-palette', style: { flexWrap: 'wrap' } });
      list.forEach((c) => r.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => { engine.setColor(c); wheel.set(c); preview.style.background = c; hexIn.value = c; refreshColorUI(); refreshPalette(); } })));
      rows2.append(r);
    };
    mkRow('Favoritos', favs);
    mkRow('Recientes', recent);
    mkRow('Pasteles', ['#e8899e', '#f2a9b8', '#fbdde6', '#c9b5e6', '#a68fd0', '#b7dccb', '#8fbca4', '#f7d4bc', '#bcd4ec', '#f6e8c6', '#5a4e58', '#ffffff']);
  };
  paintRows();
  wrap.append(wheel.node, preview, el('div', { class: 'field', style: { width: '100%' } }, [hexIn]), favBtn, rows2);
  sheet(t('studio.color'), wrap);
}

function openBrushOptions() {
  const body = el('div');
  const b = BRUSHES[engine.tool] || BRUSHES.pen;
  const mkSlider = (label, min, max, val, step, fmt, on) => {
    const valEl = el('span', { class: 'val', text: fmt(val) });
    const sl = el('input', { class: 'slider', type: 'range', min, max, step, value: val });
    sl.oninput = () => { on(+sl.value); valEl.textContent = fmt(+sl.value); };
    return el('div', { class: 'opt-group' }, [el('div', { class: 'lab' }, [el('span', { text: label }), valEl]), sl]);
  };
  body.append(
    mkSlider(t('studio.size'), 1, 300, engine.brushSize, 1, (v) => v + 'px', (v) => { engine.brushSize = v; const sl = $('#st-size'); if (sl) sl.value = v; updateSizeDot(); }),
    mkSlider(t('studio.opacity'), 5, 100, Math.round(engine.opacity * 100), 1, (v) => v + '%', (v) => engine.opacity = v / 100),
    mkSlider(t('studio.flow'), 5, 100, Math.round(engine.flow * 100), 1, (v) => v + '%', (v) => engine.flow = v / 100),
    mkSlider(t('studio.hardness'), 1, 100, Math.round(engine.hardness * 100), 1, (v) => v + '%', (v) => engine.hardness = v / 100),
    mkSlider(t('studio.smoothing'), 0, 100, Math.round(engine.smoothing * 100), 1, (v) => v + '%', (v) => engine.smoothing = v / 100),
    mkSlider(t('studio.stabilizer'), 0, 100, Math.round(engine.stabilizer * 100), 1, (v) => v + '%', (v) => engine.stabilizer = v / 100),
  );
  // pressure toggle
  const row = el('div', { class: 'row', style: { borderRadius: 'var(--r-md)', background: 'var(--surface-inset)' } }, [
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Presión (lápiz)' }), el('div', { class: 'r-sub', text: 'Usa la presión del stylus si está disponible' })]),
    switchEl(engine.pressureEnabled, (v) => engine.pressureEnabled = v),
  ]);
  body.append(row);
  sheet(b.name, body);
}

function switchEl(checked, onChange) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked;
  input.onchange = () => onChange(input.checked);
  return el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]);
}

function openShapes() {
  const body = el('div', { class: 'grid-auto' });
  const shapes = [['line', 'Línea'], ['rect', 'Rectángulo'], ['ellipse', 'Círculo'], ['triangle', 'Triángulo'], ['star', 'Estrella'], ['polygon', 'Polígono'], ['heart', 'Corazón']];
  const s = sheet(t('studio.shapes') || 'Figuras', body);
  shapes.forEach(([id, name]) => {
    const b = el('button', { class: 'tile', style: { padding: '16px', textAlign: 'center' }, onclick: () => { engine.setTool(id); refreshToolUI(); s.close(); } }, [
      el('div', { style: { fontSize: '1.6rem' }, text: { line: '╱', rect: '▭', ellipse: '◯', triangle: '△', star: '✦', polygon: '⬡', heart: '♡' }[id] }),
      el('div', { class: 'meta', html: `<div class="t">${name}</div>` }),
    ]);
    body.append(b);
  });
}

function openSymmetry() {
  const body = el('div');
  const modes = [['none', 'Ninguna', '∅'], ['h', 'Espejo horizontal', '⇋'], ['v', 'Espejo vertical', '⇅'], ['hv', 'Ambos (4x)', '✚'], ['radial', 'Radial', '❋']];
  modes.forEach(([m, label, ic]) => {
    const active = engine.symmetry.mode === m;
    const row = el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { engine.symmetry.mode = m; if (m === 'radial') showRadialCount(); refreshToolUI(); s.close(); toast(active ? '' : label); } }, [
      el('div', { class: 'r-ic', text: ic }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })]),
      active ? el('span', { class: 'pill warm', text: '✓' }) : null,
    ]);
    body.append(row);
  });
  const s = sheet(t('studio.symmetry'), body);
  function showRadialCount() { promptDialog({ title: 'Ejes radiales', value: String(engine.symmetry.count) }).then((v) => { const n = parseInt(v); if (n >= 2) engine.symmetry.count = n; }); }
}

function openMoreTools() {
  const body = el('div');
  const tools = [
    ['ruler', 'Regla / línea recta', 'ruler', () => engine.setTool('line')],
    ['transform', 'Transformar capa', 'transform', openTransform],
    ['select', 'Selección (mover)', 'select', () => { engine.setTool('select'); toast('Arrastra para seleccionar y mover'); }],
    ['compass', 'Compás (círculo)', 'toolShapes', () => engine.setTool('ellipse')],
    ['protractor', 'Transportador', 'ruler', () => toast('Usa la regla con la cuadrícula activada')],
    ['pixel', 'Pixel brush', 'toolPixel', () => engine.setTool('pixel')],
    ['calligraphy', 'Caligrafía', 'toolCallig', () => engine.setTool('calligraphy')],
    ['crayon', 'Crayón', 'toolMarker', () => engine.setTool('crayon')],
    ['chalk', 'Tiza', 'toolMarker', () => engine.setTool('chalk')],
    ['charcoal', 'Carboncillo', 'toolPencil', () => engine.setTool('charcoal')],
    ['airbrush', 'Aerógrafo', 'toolSpray', () => engine.setTool('airbrush')],
    ['watercolor', 'Acuarela', 'toolWater', () => engine.setTool('watercolor')],
    ['ballpoint', 'Bolígrafo', 'toolPen', () => engine.setTool('ballpoint')],
    ['eraserSoft', 'Borrador suave', 'toolEraser', () => engine.setTool('eraserSoft')],
    ['eraserPixel', 'Borrador píxel', 'toolPixel', () => engine.setTool('eraserPixel')],
  ];
  const grid = el('div', { class: 'grid-auto' });
  const s = sheet('Herramientas', body);
  tools.forEach(([id, name, ic, fn]) => grid.append(el('button', { class: 'tile', style: { padding: '14px', textAlign: 'center' }, onclick: () => { fn(); refreshToolUI(); s.close(); } }, [el('div', { class: 'attach-ic', style: { margin: '0 auto' }, html: icon(ic) }), el('div', { class: 'meta', html: `<div class="t">${name}</div>` })])));
  body.append(grid);
}

function openTransform() {
  const layer = engine.stack.active;
  const doOp = (fn) => { const before = layer.snapshot(); fn(); engine.history.push({ type: 'layer', layerId: layer.id, before, after: layer.snapshot() }); engine.requestComposite(); engine.markDirty(); };
  const tmpDraw = (drawFn) => { const c = document.createElement('canvas'); c.width = engine.docW; c.height = engine.docH; drawFn(c.getContext('2d')); layer.clear(); layer.ctx.drawImage(c, 0, 0); };
  const body = el('div', { class: 'grid-2' });
  const s = sheet('Transformar', body);
  const btn = (label, ic, fn) => el('button', { class: 'btn btn-ghost', html: icon(ic) + ' ' + label, onclick: () => { doOp(fn); s.close(); } });
  body.append(
    btn('Voltear H', 'flipH', () => tmpDraw((c) => { c.translate(engine.docW, 0); c.scale(-1, 1); c.drawImage(layer.canvas, 0, 0); })),
    btn('Voltear V', 'flipV', () => tmpDraw((c) => { c.translate(0, engine.docH); c.scale(1, -1); c.drawImage(layer.canvas, 0, 0); })),
    btn('Rotar 90°', 'rotate', () => rotateLayer(layer, 90)),
    btn('Rotar -90°', 'rotate', () => rotateLayer(layer, -90)),
  );
}
function rotateLayer(layer, deg) {
  const c = document.createElement('canvas'); c.width = engine.docW; c.height = engine.docH;
  const cx = engine.docW / 2, cy = engine.docH / 2; const ctx = c.getContext('2d');
  ctx.translate(cx, cy); ctx.rotate(deg * Math.PI / 180); ctx.drawImage(layer.canvas, -cx, -cy); layer.clear(); layer.ctx.drawImage(c, 0, 0);
}

function openPaper() {
  const body = el('div');
  // paper color
  body.append(el('div', { class: 'opt-group' }, [el('div', { class: 'lab', text: 'Color del papel' })]));
  const colors = ['#ffffff', '#fff7f0', '#fef6e4', '#f4f1ff', '#eef7f2', '#fdeef1', '#2a2530', '#1e1e28'];
  const pal = el('div', { class: 'st-palette', style: { flexWrap: 'wrap' } });
  colors.forEach((c) => pal.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => engine.setPaper({ color: c, transparent: false }) })));
  body.append(pal);
  // textures
  body.append(el('div', { class: 'opt-group', style: { marginTop: '14px' } }, [el('div', { class: 'lab', text: 'Textura' })]));
  const tex = el('div', { class: 'scroll-x' });
  Object.entries(PAPER_TEXTURES).forEach(([k, label]) => tex.append(el('button', { class: 'chip' + (engine.paper.texture === k ? ' active' : ''), text: label, onclick: (e) => { engine.setPaper({ texture: k }); tex.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); e.target.classList.add('active'); } })));
  body.append(tex);
  // toggles
  const mkToggle = (label, key) => el('div', { class: 'row', style: { borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', marginTop: '8px' } }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })]), switchEl(engine.paper[key], (v) => engine.setPaper({ [key]: v }))]);
  body.append(mkToggle('Fondo transparente', 'transparent'), mkToggle('Cuadrícula', 'grid'), mkToggle('Guías', 'guides'), mkToggle('Fondo infinito', 'infinite'));
  // custom bg
  body.append(el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '12px' }, html: icon('image') + ' Fondo personalizado', onclick: () => pickImageFile((src) => setCustomBg(src)) }));
  sheet(t('studio.paper'), body);
}
function setCustomBg(src) {
  const img = new Image(); img.onload = () => { engine.paper.transparent = false; engine.renderPaper(); engine.pctx.drawImage(img, 0, 0, engine.docW, engine.docH); engine.markDirty(); }; img.src = src;
}

// ---------- Layers ----------
function openLayers() {
  const body = el('div');
  const rebuild = () => {
    body.innerHTML = '';
    body.append(el('button', { class: 'btn btn-primary btn-block', html: icon('add') + ' ' + t('studio.newLayer'), onclick: () => { const before = engine.stack.serialize(); engine.stack.add(); engine.history.push({ type: 'custom', undo: () => {}, redo: () => {} }); engine.requestComposite(); rebuild(); engine.markDirty(); } }));
    const list = el('div', { style: { marginTop: '12px' } });
    [...engine.stack.layers].reverse().forEach((layer) => {
      const active = layer.id === engine.stack.activeId;
      const thumb = el('div', { class: 'lp-thumb' }); const tc = el('canvas', { width: 46, height: 62 }); thumb.append(tc); tc.getContext('2d').drawImage(layer.canvas, 0, 0, 46, 62);
      const row = el('div', { class: 'layer-row' + (active ? ' active' : ''), onclick: () => { engine.stack.setActive(layer.id); rebuild(); } });
      const acts = el('div', { class: 'lp-acts' });
      acts.append(
        el('button', { class: layer.visible ? '' : 'on', html: layer.visible ? icon('eye') : icon('eyeOff'), onclick: (e) => { e.stopPropagation(); layer.visible = !layer.visible; engine.requestComposite(); rebuild(); engine.markDirty(); } }),
        el('button', { class: layer.locked ? 'on' : '', html: layer.locked ? icon('lock') : icon('unlock'), onclick: (e) => { e.stopPropagation(); layer.locked = !layer.locked; rebuild(); } }),
      );
      row.append(thumb, el('div', { class: 'lp-main' }, [el('div', { class: 'lp-name', text: layer.name }), el('div', { class: 'lp-blend', text: `${layer.blend} · ${Math.round(layer.opacity * 100)}%` })]), acts);
      row.oncontextmenu = (e) => { e.preventDefault(); layerMenu(layer, rebuild); };
      // long-press → menu
      let lpTimer; row.addEventListener('pointerdown', () => { lpTimer = setTimeout(() => layerMenu(layer, rebuild), 500); }); row.addEventListener('pointerup', () => clearTimeout(lpTimer)); row.addEventListener('pointerleave', () => clearTimeout(lpTimer));
      list.append(row);
    });
    body.append(list);
    body.append(el('p', { style: { color: 'var(--text-3)', fontSize: '0.75rem', textAlign: 'center', marginTop: '8px' }, text: 'Mantén pulsada una capa para más opciones' }));
  };
  rebuild();
  sheet(t('studio.layers'), body);
}
function layerMenu(layer, rebuild) {
  const body = el('div');
  const opacityVal = el('span', { class: 'val', text: Math.round(layer.opacity * 100) + '%' });
  const opSl = el('input', { class: 'slider', type: 'range', min: 0, max: 100, value: Math.round(layer.opacity * 100) });
  opSl.oninput = () => { layer.opacity = +opSl.value / 100; opacityVal.textContent = opSl.value + '%'; engine.requestComposite(); engine.markDirty(); };
  const blendSel = el('select', { class: 'select' });
  BLEND_MODES.forEach((m) => blendSel.append(el('option', { value: m, text: m, selected: m === layer.blend })));
  blendSel.onchange = () => { layer.blend = blendSel.value; engine.requestComposite(); engine.markDirty(); };
  const actions = el('div', { class: 'grid-2', style: { marginTop: '12px' } });
  const s = sheet(layer.name, body);
  actions.append(
    el('button', { class: 'btn btn-ghost', html: icon('add') + ' Subir', onclick: () => { engine.stack.move(layer.id, 1); engine.requestComposite(); s.close(); openLayers(); } }),
    el('button', { class: 'btn btn-ghost', text: '↓ Bajar', onclick: () => { engine.stack.move(layer.id, -1); engine.requestComposite(); s.close(); openLayers(); } }),
    el('button', { class: 'btn btn-ghost', html: icon('dup') + ' Duplicar', onclick: () => { engine.stack.duplicate(layer.id); engine.requestComposite(); s.close(); openLayers(); engine.markDirty(); } }),
    el('button', { class: 'btn btn-ghost', text: '⬇ Combinar', onclick: () => { engine.stack.mergeDown(layer.id); engine.requestComposite(); s.close(); openLayers(); engine.markDirty(); } }),
    el('button', { class: 'btn btn-ghost', html: icon('pen') + ' Renombrar', onclick: async () => { const n = await promptDialog({ title: 'Nombre de capa', value: layer.name }); if (n) { layer.name = n; s.close(); openLayers(); } } }),
    el('button', { class: 'btn btn-soft', html: icon('trash') + ' Eliminar', onclick: () => { if (engine.stack.remove(layer.id)) { engine.requestComposite(); s.close(); openLayers(); engine.markDirty(); } } }),
  );
  body.append(
    el('div', { class: 'opt-group' }, [el('div', { class: 'lab' }, [el('span', { text: t('studio.opacity') }), opacityVal]), opSl]),
    el('div', { class: 'field' }, [el('label', { text: t('studio.blend') }), blendSel]),
    actions,
  );
}

// ---------- Media (import into canvas) ----------
function openMedia() {
  const body = el('div');
  const tabs = el('div', { class: 'segment', style: { display: 'flex', width: '100%', marginBottom: '12px' } });
  const panel = el('div');
  const s = sheet(t('studio.media'), body);
  const tabDefs = [['text', 'Añadir texto'], ['gif', 'GIFs'], ['image', 'Imagen'], ['sticker', 'Stickers']];
  tabDefs.forEach(([id, label], i) => tabs.append(el('button', { class: i === 0 ? 'active' : '', text: label, onclick: (e) => { tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); showTab(id); } })));
  body.append(tabs, panel);
  showTab('text');
  function showTab(id) {
    panel.innerHTML = '';
    if (id === 'gif') return gifTab(panel, s);
    if (id === 'image') { pickImageFile((src) => { addImageMedia(src, 'image'); s.close(); }); return; }
    if (id === 'text') return textTab(panel, s);
    if (id === 'sticker') return emojiTab(panel, s, 'sticker');
  }
}
// Buscador de GIFs: categorías rápidas, miniaturas grandes y alternativas
// (pegar enlace o subir archivo) para que añadir un GIF sea siempre fácil.
const GIF_CATS = ['bear love', 'amor', 'abrazo', 'beso', 'corazones', 'lindo', 'gatitos', 'feliz', 'buenas noches', 'te extraño'];
function gifTab(panel, s) {
  const input = el('input', { class: 'input', placeholder: t('common.search') + ' GIFs…' });
  const chips = el('div', { class: 'scroll-x gif-chips' });
  const grid = el('div', { class: 'gif-grid', style: { marginTop: '10px' } });
  const add = (url) => { addImageMedia(url, 'gif'); s.close(); toast('GIF añadido — arrástralo para colocarlo'); };

  const load = async (q) => {
    grid.innerHTML = '<div class="sk" style="height:120px;border-radius:14px"></div>'.repeat(6);
    const res = await searchGifs(q || 'bear love');
    grid.innerHTML = '';
    if (!res.length) {
      grid.append(el('div', { class: 'gif-empty' }, [
        el('div', { class: 'big-ic', html: icon('gif') }),
        el('div', { text: 'Sin resultados o sin conexión.' }),
        el('div', { style: { color: 'var(--text-3)', fontSize: '0.8rem' }, text: 'Puedes pegar un enlace o subir un GIF abajo.' }),
      ]));
      return;
    }
    res.forEach((g) => grid.append(el('button', { class: 'gif-cell', onclick: () => add(g.url) }, [
      el('img', { src: g.preview, loading: 'lazy', alt: 'GIF' }),
    ])));
  };

  GIF_CATS.forEach((c, i) => chips.append(el('button', {
    class: 'chip' + (i === 0 ? ' on' : ''), text: c,
    onclick: (e) => { chips.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); e.currentTarget.classList.add('on'); input.value = c; load(c); },
  })));

  const actions = el('div', { class: 'gif-actions' }, [
    el('button', { class: 'btn btn-ghost', html: icon('link') + ' Pegar enlace', onclick: async () => {
      const url = await promptDialog({ title: 'Enlace del GIF', placeholder: 'https://…/algo.gif' });
      if (url && /^https?:\/\//i.test(url.trim())) add(url.trim());
      else if (url) toast('Ese enlace no parece válido');
    } }),
    el('button', { class: 'btn btn-ghost', html: icon('upload') + ' Subir GIF', onclick: () => pickImageFile((src) => add(src)) }),
  ]);

  panel.append(input, chips, grid, actions);
  let tmr; input.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => load(input.value.trim()), 350); };
  load('bear love');
}
const TEXT_FONTS = [
  ['Nunito, sans-serif', 'Redonda'],
  ['Georgia, serif', 'Elegante'],
  ['"Comic Sans MS", "Segoe Print", cursive', 'Manuscrita'],
  ['"Courier New", monospace', 'Máquina'],
];
function textTab(panel, s) {
  const ta = el('textarea', { class: 'textarea', placeholder: 'Escribe algo bonito…', style: { fontSize: '1.1rem' } });
  const colorIn = el('input', { type: 'color', value: engine.color, style: { width: '48px', height: '40px', border: 'none', background: 'none' } });
  const sizeSl = el('input', { class: 'slider', type: 'range', min: 20, max: 160, value: 56 });
  let font = TEXT_FONTS[0][0];
  const fonts = el('div', { class: 'scroll-x', style: { margin: '10px 0' } });
  TEXT_FONTS.forEach(([f, label], i) => fonts.append(el('button', { class: 'chip' + (i === 0 ? ' active' : ''), text: label, style: { fontFamily: f }, onclick: (e) => { font = f; fonts.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); e.target.classList.add('active'); ta.style.fontFamily = f; } })));
  panel.append(el('div', { class: 'field' }, [ta]), fonts,
    el('div', { class: 'row', style: { background: 'var(--surface-inset)', borderRadius: 'var(--r-md)' } }, [el('span', { text: 'Color' }), colorIn, el('div', { style: { flex: 1 } }, [sizeSl])]),
    el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '12px' }, text: 'Añadir texto', onclick: () => {
      const txt = ta.value.trim(); if (!txt) return;
      const fs = +sizeSl.value;
      // Medimos el texto real para que el cuadro se ajuste sin deformarse.
      const meas = document.createElement('canvas').getContext('2d');
      meas.font = `${fs}px ${font}`;
      const lines = txt.split('\n');
      const w = Math.max(...lines.map((l) => meas.measureText(l).width)) + 24;
      const h = lines.length * fs * 1.25 + 16;
      engine.addMedia({ type: 'text', text: txt, color: colorIn.value, font, fontSize: fs, x: (engine.docW - w) / 2, y: (engine.docH - h) / 2, w, h, rot: 0, opacity: 1 });
      s.close();
    } }));
}
function emojiTab(panel, s, type) {
  const emojis = type === 'emoji'
    ? '😀😍🥰😘😊🥺😎🤩😴🤗😇🙃😜🤔😅😂🥳😳😌❤️🧡💛💚💙💜🤍🖤💗💖💕💞💓💘💌💋🌸🌺🌷🌹🌻🌼✨⭐🌟💫🔥🌈☀️🌙⛅🍓🍑🍒🍰🧁🍩🍭🎀🎁🐻🐰🐱🐶🦊🐼🐨🦄🕊️'.match(/./gu)
    : '🐻💐🌈🦋🎀🍰🌸💖🐰🌷☕🍓🧸🎈🌙⭐🐱🌻🍭🎨🖌️💌🕊️🫧🌼🍀🐨🐣🌟💫🎵🪴'.match(/./gu);
  const grid = el('div', { class: 'emoji-grid' });
  emojis.forEach((e) => grid.append(el('button', { text: e, onclick: () => { const size = type === 'emoji' ? 170 : 240; engine.addMedia({ type: type === 'emoji' ? 'text' : 'text', text: e, fontSize: size, x: engine.docW / 2 - size / 2, y: engine.docH / 2 - size / 2, w: size, h: size, rot: 0, opacity: 1 }); s.close(); } })));
  panel.append(grid);
}
// Añade una imagen/GIF al lienzo. Muchos CDN de GIF no envían cabeceras CORS:
// con crossOrigin="anonymous" la carga fallaba en silencio y el GIF "no se
// añadía". Ahora se reintenta sin CORS para que SIEMPRE se pueda insertar
// (el guardado se protege aparte, en engine.thumbnail).
function addImageMedia(src, type) {
  const place = (img, noCors) => {
    const maxW = engine.docW * 0.6;
    const scale = Math.min(1, maxW / (img.width || 200));
    const w = (img.width || 200) * scale, h = (img.height || 200) * scale;
    const m = engine.addMedia({ type, src, x: (engine.docW - w) / 2, y: (engine.docH - h) / 2, w, h, rot: 0, opacity: 1 });
    m._img = img; if (noCors) m._noCors = true;
    selectedMediaId = m.id;           // queda seleccionado: se puede mover ya
    engine.renderMedia();
  };
  const tryLoad = (useCors) => {
    const img = new Image();
    if (useCors) img.crossOrigin = 'anonymous';
    img.onload = () => place(img, !useCors);
    img.onerror = () => { if (useCors) tryLoad(false); else toast('No se pudo cargar la imagen'); };
    img.src = src;
  };
  tryLoad(true);
}
function pickImageFile(cb) {
  const inp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => { const f = inp.files[0]; if (f) { const url = await blobToDataURL(f); cb(url); } inp.remove(); };
  inp.click();
}

// ---------- Objetos en el lienzo: interfaz de edición renovada ----------
// Seleccionar un objeto muestra asas + una barra contextual con duplicar,
// opacidad, sombra, animación, editar (texto), pausar (GIF) y eliminar.
// El pellizco con dos dedos sobre el objeto escala y rota sin dibujar.
let selectedMediaId = null;
function renderMediaOverlay(media) {
  const layer = engine.mediaLayer; if (!layer) return;
  layer.innerHTML = '';
  media.forEach((m) => {
    const obj = el('div', { class: 'media-obj' + (m.id === selectedMediaId ? ' selected' : '') + (m.anim ? ' anim-' + m.anim : ''), style: { left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px', transform: `rotate(${m.rot || 0}deg)`, opacity: m.opacity ?? 1, filter: m.shadow ? 'drop-shadow(0 10px 18px rgba(60,40,60,0.35))' : '' } });
    if (m.type === 'text') obj.append(el('div', { class: 'txt', style: { fontSize: (m.fontSize || 40) + 'px', color: m.color || 'inherit', fontFamily: m.font || 'Nunito, sans-serif', fontWeight: m.bold ? 800 : 400, textAlign: m.align || 'center', letterSpacing: (m.spacing || 0) + 'px', whiteSpace: 'pre-wrap' }, text: m.text }));
    else obj.append(el('img', { src: m.paused && m._still ? m._still : (m._img ? m._img.src : m.src) }));
    if (m.id === selectedMediaId) {
      obj.append(
        el('div', { class: 'rot-stem' }),
        el('div', { class: 'handle del', html: icon('close'), title: 'Eliminar', onpointerdown: (e) => { e.stopPropagation(); engine.removeMedia(m.id); selectedMediaId = null; } }),
        el('div', { class: 'handle br', html: icon('transform'), title: 'Cambiar tamaño', onpointerdown: (e) => startResize(e, m) }),
        el('div', { class: 'handle rot', html: icon('rotate'), title: 'Rotar', onpointerdown: (e) => startRotate(e, m) }),
      );
      layer.append(objContextBar(m));
    }
    // Arrastre + pellizco de dos dedos sobre el objeto.
    const touches = new Map();
    obj.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('handle')) return;
      e.stopPropagation();
      obj.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { startPinch(m, touches); return; }
      if (selectedMediaId !== m.id) { selectedMediaId = m.id; import('../core/sounds.js').then((x) => x.playFx('select')); renderMediaOverlay(engine.media); return; }
      startDrag(e, m);
    });
    obj.addEventListener('pointermove', (e) => { if (touches.has(e.pointerId)) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) updatePinch(m, touches); } });
    const endT = (e) => { touches.delete(e.pointerId); if (touches.size < 2) pinchState = null; };
    obj.addEventListener('pointerup', endT);
    obj.addEventListener('pointercancel', endT);
    layer.append(obj);
  });
}

// Barra contextual flotante sobre el objeto seleccionado.
function objContextBar(m) {
  const inv = 1 / (engine.baseScale * engine.zoom);
  const bar = el('div', { class: 'obj-bar', style: { left: (m.x + m.w / 2) + 'px', top: Math.max(8, m.y - 92 * inv) + 'px' } });
  const btn = (ic, label, fn) => el('button', { class: 'ob-btn', html: icon(ic), title: label, 'aria-label': label, onclick: (e) => { e.stopPropagation(); fn(); } });
  bar.append(
    btn('dup', 'Duplicar', () => { const copy = { ...m, id: undefined, x: m.x + 30, y: m.y + 30 }; delete copy._img; delete copy._still; const nm = engine.addMedia(copy); if (m._img) nm._img = m._img; selectedMediaId = nm.id; renderMediaOverlay(engine.media); }),
    btn('sparkle', 'Animar', () => objAnimSheet(m)),
    btn('sun', 'Estilo', () => objStyleSheet(m)),
  );
  if (m.type === 'text') bar.append(btn('text', 'Editar texto', () => openTextEditor(m)));
  if (m.type === 'gif') bar.append(btn(m.paused ? 'playFilled' : 'pauseFilled', m.paused ? 'Reproducir' : 'Pausar', () => toggleGifPause(m)));
  bar.append(btn('trash', 'Eliminar', () => { engine.removeMedia(m.id); selectedMediaId = null; }));
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  return bar;
}
// Editor de texto completo: contenido, color, tamaño, fuente, grosor,
// alineación, opacidad y espaciado — con vista previa en vivo.
function openTextEditor(m) {
  const body = el('div', { class: 'text-editor' });
  const sh = sheet('Editar texto', body);
  const apply = () => { engine.renderMedia(); engine.markDirty(); };

  const ta = el('textarea', { class: 'textarea', value: m.text, style: { fontFamily: m.font || 'Nunito, sans-serif', fontSize: '1.05rem' } });
  ta.oninput = () => { m.text = ta.value; apply(); };
  body.append(ta);

  // Color — swatches rápidos + selector nativo, arreglado (antes no cambiaba).
  const colorRow = el('div', { class: 'te-row' });
  const colorInput = el('input', { type: 'color', class: 'te-color', value: /^#/.test(m.color || '') ? m.color : '#5a4e58' });
  colorInput.oninput = () => { m.color = colorInput.value; sync(); apply(); };
  const sw = el('div', { class: 'te-swatches' });
  ['#5a4e58', '#ffffff', '#e8899e', '#8fbca4', '#a68fd0', '#f2c14e', '#ef6f6f', '#5aa0e0'].forEach((c) =>
    sw.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => { m.color = c; colorInput.value = c; sync(); apply(); } })));
  colorRow.append(colorInput, sw);
  body.append(labeled('Color', colorRow));

  // Fuente
  const fonts = el('div', { class: 'scroll-x' });
  TEXT_FONTS.concat([['"Brush Script MT", cursive', 'Script'], ['Impact, sans-serif', 'Impacto']]).forEach(([f, label]) =>
    fonts.append(el('button', { class: 'chip' + ((m.font || TEXT_FONTS[0][0]) === f ? ' active' : ''), text: label, style: { fontFamily: f }, onclick: (e) => { m.font = f; fonts.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); e.target.classList.add('active'); ta.style.fontFamily = f; apply(); } })));
  body.append(labeled('Fuente', fonts));

  // Alineación + grosor
  const style = el('div', { class: 'te-row', style: { gap: '8px' } });
  const alignBtn = (ic, val) => el('button', { class: 'te-icon' + ((m.align || 'center') === val ? ' active' : ''), html: icon(ic), onclick: (e) => { m.align = val; style.querySelectorAll('.te-icon').forEach((b) => b.classList.remove('active')); e.currentTarget.classList.add('active'); apply(); } });
  const boldBtn = el('button', { class: 'te-icon' + (m.bold ? ' active' : ''), html: icon('bold'), onclick: (e) => { m.bold = !m.bold; e.currentTarget.classList.toggle('active', m.bold); apply(); } });
  style.append(alignBtn('alignL', 'left'), alignBtn('alignC', 'center'), alignBtn('alignR', 'right'), el('span', { style: { flex: 1 } }), boldBtn);
  body.append(labeled('Estilo', style));

  const mkSl = (label, min, max, val, step, fmt, on) => {
    const v = el('span', { class: 'val', text: fmt(val) });
    const sl = el('input', { class: 'slider', type: 'range', min, max, step, value: val });
    sl.oninput = () => { on(+sl.value); v.textContent = fmt(+sl.value); apply(); };
    return el('div', { class: 'opt-group' }, [el('div', { class: 'lab' }, [el('span', { text: label }), v]), sl]);
  };
  body.append(
    mkSl('Tamaño', 16, 200, Math.round(m.fontSize || 48), 1, (x) => x + 'px', (x) => m.fontSize = x),
    mkSl('Opacidad', 10, 100, Math.round((m.opacity ?? 1) * 100), 1, (x) => x + '%', (x) => m.opacity = x / 100),
    mkSl('Espaciado', -2, 20, m.spacing || 0, 0.5, (x) => x + 'px', (x) => m.spacing = x),
  );

  function labeled(label, node) { return el('div', { class: 'field' }, [el('label', { text: label }), node]); }
  function sync() { colorInput.value = /^#/.test(m.color) ? m.color : '#5a4e58'; }
}

function objAnimSheet(m) {
  const body = el('div');
  const sh = sheet('Animación del objeto', body);
  [['', 'Sin animación'], ['float', 'Flotar'], ['pulse', 'Latido'], ['spin', 'Girar'], ['sway', 'Mecerse']].forEach(([id, label]) => {
    body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { m.anim = id || null; engine.renderMedia(); engine.markDirty(); sh.close(); } }, [el('div', { class: 'r-ic', html: icon('sparkle') }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })]), (m.anim || '') === id ? el('span', { class: 'pill warm', text: 'Activa' }) : null]));
  });
}
function objStyleSheet(m) {
  const body = el('div');
  const sh = sheet('Estilo del objeto', body);
  const opVal = el('span', { class: 'val', text: Math.round((m.opacity ?? 1) * 100) + '%' });
  const op = el('input', { class: 'slider', type: 'range', min: 10, max: 100, value: Math.round((m.opacity ?? 1) * 100) });
  op.oninput = () => { m.opacity = +op.value / 100; opVal.textContent = op.value + '%'; engine.renderMedia(); engine.markDirty(); };
  const shadowIn = el('input', { type: 'checkbox' }); shadowIn.checked = !!m.shadow;
  shadowIn.onchange = () => { m.shadow = shadowIn.checked; engine.renderMedia(); engine.markDirty(); };
  body.append(
    el('div', { class: 'opt-group' }, [el('div', { class: 'lab' }, [el('span', { text: 'Opacidad' }), opVal]), op]),
    el('div', { class: 'row', style: { background: 'var(--surface-inset)', borderRadius: 'var(--r-md)' } }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Sombra suave' })]), el('label', { class: 'switch' }, [shadowIn, el('span', { class: 'track' })])]),
  );
}
// GIF: pausa congelando el cuadro actual en un canvas (rendimiento y calma).
function toggleGifPause(m) {
  if (!m.paused) {
    try {
      const img = engine.mediaLayer.querySelector('.media-obj.selected img');
      const c = document.createElement('canvas'); c.width = img.naturalWidth || 200; c.height = img.naturalHeight || 200;
      c.getContext('2d').drawImage(img, 0, 0);
      m._still = c.toDataURL(); m.paused = true;
    } catch { m.paused = true; }
  } else { m.paused = false; }
  renderMediaOverlay(engine.media);
}
// Pellizco de dos dedos sobre un objeto: escala + rotación naturales.
let pinchState = null;
function startPinch(m, touches) {
  const pts = [...touches.values()];
  pinchState = { d0: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), a0: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x), w0: m.w, h0: m.h, rot0: m.rot || 0, fs0: m.fontSize || 40 };
}
function updatePinch(m, touches) {
  if (!pinchState) return;
  const pts = [...touches.values()];
  const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  const a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  const k = d / pinchState.d0;
  const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
  m.w = Math.max(24, pinchState.w0 * k); m.h = Math.max(24, pinchState.h0 * k);
  if (m.type === 'text') m.fontSize = Math.max(10, pinchState.fs0 * k);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  m.rot = pinchState.rot0 + (a - pinchState.a0) * 180 / Math.PI;
  renderMediaOverlay(engine.media);
  engine.markDirty();
}
function docScale() { return engine.baseScale * engine.zoom; }
function startDrag(e, m) {
  e.stopPropagation(); const sx = e.clientX, sy = e.clientY, ox = m.x, oy = m.y, sc = docScale();
  const move = (ev) => { m.x = ox + (ev.clientX - sx) / sc; m.y = oy + (ev.clientY - sy) / sc; renderMediaOverlay(engine.media); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); engine.markDirty(); import('../core/sounds.js').then((x) => x.playFx('move')); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
function startResize(e, m) {
  e.stopPropagation(); const sx = e.clientX, sy = e.clientY, ow = m.w, oh = m.h, ratio = m.h / m.w, fs0 = m.fontSize || 40, sc = docScale();
  const move = (ev) => { const nw = Math.max(20, ow + (ev.clientX - sx) / sc); m.w = nw; m.h = nw * ratio; if (m.type === 'text') m.fontSize = fs0 * (nw / ow); renderMediaOverlay(engine.media); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); engine.markDirty(); import('../core/sounds.js').then((x) => x.playFx('transform')); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
function startRotate(e, m) {
  e.stopPropagation(); const rect = engine.mediaLayer.getBoundingClientRect(); const sc = docScale();
  const cx = rect.left + (m.x + m.w / 2) * sc, cy = rect.top + (m.y + m.h / 2) * sc;
  const move = (ev) => { m.rot = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI + 90; renderMediaOverlay(engine.media); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); engine.markDirty(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}

// ---------- Biblioteca de assets ----------
async function openAssetsPanel() {
  const { openAssets } = await import('./assets.js');
  openAssets({ onPick: async (a) => {
    if (a.kind === 'img' || a.kind === 'gif' || a.kind === 'bg' && a.src) { addImageMedia(a.src, a.kind === 'gif' ? 'gif' : 'image'); return; }
    if (a.kind === 'sticker') { engine.addMedia({ type: 'text', text: a.text, fontSize: 120, x: engine.docW / 2 - 60, y: engine.docH / 2 - 60, w: 140, h: 140, rot: 0, opacity: 1 }); return; }
    if (a.kind === 'brush') { engine.setTool(a.id); refreshToolUI(); return; }
    if (a.kind === 'texture') { engine.setPaper({ texture: a.id }); return; }
    if (a.kind === 'bg') { a.color ? engine.setPaper({ color: a.color, transparent: false }) : setCustomBg(a.src); return; }
    if (a.kind === 'song') { const { openVinyl } = await import('./vinyl.js'); openVinyl(a); return; }
    if (a.kind === 'frame') {
      // Marco decorativo: esquinas con el emoji elegido.
      const s = 110, W = engine.docW, H = engine.docH;
      [[20, 20], [W - s - 20, 20], [20, H - s - 20], [W - s - 20, H - s - 20]].forEach(([x, y]) => engine.addMedia({ type: 'text', text: a.emoji, fontSize: 96, x, y, w: s, h: s, rot: 0, opacity: 0.9 }));
      return;
    }
    if (a.kind === 'template') {
      const ok = recorder.isEmpty || confirm('¿Crear un lienzo nuevo con esta plantilla?');
      if (ok) { engine.newDoc({ w: a.w, h: a.h }); recorder.reset(); toast(a.name); }
      return;
    }
  } });
}

// ---------- Música (tocadiscos) ----------
// Apartado de música del dibujo: reproductor real (disco, play/pausa,
// progreso), volumen, repetición, sonar al abrir y canciones recientes.
function openMusic() {
  const body = el('div');
  const s = sheet(t('studio.music'), body);
  const m = current?.music;

  if (m) {
    const audio = el('audio', { src: m.src, preload: 'metadata' });
    audio.loop = m.loop !== false;
    audio.volume = m.volume ?? 0.8;

    const disc = el('div', { class: 'mus-disc' }, [el('i')]);
    const time = el('div', { class: 'mus-time', text: '0:00 / --:--' });
    const bar = el('div', { class: 'mus-bar' }, [el('i', { class: 'mus-fill' })]);
    const playBtn = el('button', { class: 'icon-btn mus-play', html: icon('playFilled'), 'aria-label': 'Reproducir' });

    const fmt = (v) => (isFinite(v) ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` : '--:--');
    const sync = () => {
      const d = audio.duration;
      bar.querySelector('.mus-fill').style.width = (d ? (audio.currentTime / d) * 100 : 0) + '%';
      time.textContent = `${fmt(audio.currentTime)} / ${fmt(d)}`;
    };
    audio.ontimeupdate = sync; audio.onloadedmetadata = sync;
    audio.onplay = () => { playBtn.innerHTML = icon('pauseFilled'); disc.classList.add('spin'); };
    audio.onpause = () => { playBtn.innerHTML = icon('playFilled'); disc.classList.remove('spin'); };
    playBtn.onclick = () => { if (audio.paused) audio.play().catch(() => toast('No se pudo reproducir')); else audio.pause(); };
    // Tocar la barra salta a ese punto.
    bar.onpointerdown = (e) => {
      const r = bar.getBoundingClientRect();
      if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration;
      sync();
    };
    s.box.addEventListener('sheetclose', () => { audio.pause(); audio.src = ''; }, { once: true });

    const vol = el('input', { class: 'slider slim', type: 'range', min: 0, max: 100, value: Math.round((m.volume ?? 0.8) * 100) });
    const setFill = () => vol.style.setProperty('--fill', vol.value + '%');
    setFill();
    vol.oninput = () => { audio.volume = +vol.value / 100; m.volume = audio.volume; setFill(); engine.markDirty(); };

    body.append(
      el('div', { class: 'mus-player' }, [
        disc,
        el('div', { class: 'mus-meta' }, [
          el('div', { class: 'mus-name', text: m.name || 'Canción' }),
          el('div', { class: 'mus-sub', text: 'La canción de este dibujo' }),
          bar, time,
        ]),
        playBtn,
      ]),
      el('div', { class: 'mus-row' }, [
        el('span', { class: 'mus-ic', html: icon('volume') }),
        vol,
      ]),
      el('div', { class: 'rows', style: { marginTop: '12px' } }, [
        switchRow('loop', 'Repetir', m.loop !== false, (v) => { m.loop = v; audio.loop = v; engine.markDirty(); }),
        switchRow('play', 'Sonar al abrir el dibujo', m.autoplay !== false, (v) => { m.autoplay = v; engine.markDirty(); }),
      ]),
      el('div', { class: 'mus-actions' }, [
        el('button', { class: 'btn btn-ghost', html: icon('music') + ' Cambiar', onclick: () => { audio.pause(); pickSong(s); } }),
        el('button', { class: 'btn btn-soft', html: icon('trash') + ' Quitar', onclick: () => { audio.pause(); current.music = null; engine.markDirty(); s.close(); setTimeout(openMusic, 280); } }),
      ]),
    );
  } else {
    body.append(el('div', { class: 'mus-empty' }, [
      el('div', { class: 'big-ic big-ic-lg', html: icon('music') }),
      el('div', { style: { fontWeight: 700 }, text: 'Este dibujo aún no tiene canción' }),
      el('div', { style: { color: 'var(--text-2)', fontSize: '0.85rem' }, text: 'Elige una y sonará cuando lo abran.' }),
    ]));
    body.append(el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '14px' }, html: icon('music') + ' Elegir canción', onclick: () => pickSong(s) }));
  }

  body.append(el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, html: icon('loop') + ' Abrir tocadiscos', onclick: async () => { const { openVinyl } = await import('./vinyl.js'); s.close(); openVinyl(); } }));
}
function pickSong(s) {
  pickAudioFile(async (src, name) => {
    ensureDoc();
    current.music = { src, name, loop: true, volume: 0.8, autoplay: true };
    engine.markDirty();
    await doSave(false);
    s.close();
    setTimeout(openMusic, 280);
  });
}
function switchRow(ic, title, checked, onChange) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked;
  input.onchange = () => onChange(input.checked);
  return el('div', { class: 'row' }, [
    el('div', { class: 'r-ic', html: icon(ic) }),
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title })]),
    el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]),
  ]);
}
function pickAudioFile(cb) {
  const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => { const f = inp.files[0]; if (f) cb(await blobToDataURL(f), f.name.replace(/\.[^.]+$/, '')); inp.remove(); };
  inp.click();
}

// ---------- Menu ----------
function openMenu() {
  const body = el('div');
  const s = sheet(current?.title || t('studio.untitled'), body);
  const item = (ic, label, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { s.close(); fn(); } }, [el('div', { class: 'r-ic', html: icon(ic) }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })])]);
  body.append(
    item('pen', t('common.rename'), async () => { const n = await promptDialog({ title: t('common.rename'), value: $('#st-title').textContent }); if (n) { $('#st-title').textContent = n; if (current) { current.title = n; } engine.markDirty(); doSave(true); } }),
    item('share', t('common.share'), shareDrawing),
    item('send', 'Enviar a mi pareja', openSendSheet),
    item('image', t('studio.export'), () => { downloadDataURL(engine.flatten().toDataURL('image/png'), (current?.title || 'dibujo') + '.png'); toast(t('toast.exported')); }),
    item('dup', t('common.duplicate'), duplicateDrawing),
    item('trash', t('studio.clear'), async () => { if (await confirmDialog({ title: t('studio.clear'), message: '¿Vaciar el lienzo actual?', danger: true })) { engine.stack.active.clear(); engine.requestComposite(); engine.markDirty(); toast(t('toast.cleared')); } }),
  );
}
async function shareDrawing() {
  await doSave(true);
  const url = engine.flatten().toDataURL('image/png');
  if (navigator.share) {
    try { const blob = await (await fetch(url)).blob(); const file = new File([blob], 'dibujo.png', { type: 'image/png' }); await navigator.share({ files: [file], title: current?.title || 'Nuestro dibujo', text: 'Mira lo que dibujé para ti 💕' }); return; } catch {}
  }
  downloadDataURL(url, 'dibujo.png'); toast('Imagen lista para compartir');
}
// Animación de envío a pantalla completa — la obra se eleva, se ilumina y se
// deshace en un enjambre de corazones/partículas hacia tu pareja. El sonido se
// carga desde Audio/UI/send-special.(wav|mp3), intercambiable sin tocar código.
function playSendAnimation(thumb) {
  return new Promise((resolve) => {
    import('../core/sounds.js').then((m) => m.playFx('sendSpecial'));
    if (navigator.vibrate) navigator.vibrate([12, 40, 18]);
    const ov = el('div', { class: 'send-cine' });
    const glow = el('div', { class: 'sc-glow' });
    const card = el('div', { class: 'sc-card' }, [thumb ? el('img', { src: thumb }) : null]);
    const ring = el('div', { class: 'sc-ring' });
    const label = el('div', { class: 'sc-label', text: 'Enviando con amor…' });
    const parts = el('div', { class: 'sc-particles' });
    const hearts = ['♥', '✦', '❤', '✧', '♡'];
    for (let i = 0; i < 28; i++) {
      const p = el('i', { text: hearts[i % hearts.length] });
      const ang = Math.random() * Math.PI * 2, dist = 120 + Math.random() * 260;
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', (Math.sin(ang) * dist - 120) + 'px');
      p.style.setProperty('--d', (0.5 + Math.random() * 0.6) + 's');
      p.style.setProperty('--delay', (0.35 + Math.random() * 0.35) + 's');
      p.style.setProperty('--sz', (10 + Math.random() * 20) + 'px');
      parts.append(p);
    }
    ov.append(glow, ring, card, parts, label);
    document.body.append(ov);
    requestAnimationFrame(() => ov.classList.add('go'));
    setTimeout(() => { label.textContent = '¡Enviado! 💞'; }, 1150);
    setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 400); }, 1900);
  });
}

// Hoja de envío: vista previa del proceso, "Editable después" y modo secreto.
async function openSendSheet() {
  await doSave(true);
  if (!current) { toast('Dibuja algo primero'); return; }
  const body = el('div');
  const sh = sheet('Enviar a mi pareja', body);
  body.append(el('img', { src: current.thumb, style: { width: '60%', margin: '0 auto 12px', display: 'block', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)' } }));
  // Visualizar: solo aparece aquí, en el momento de enviar.
  body.append(el('button', { class: 'btn btn-ghost btn-block', style: { marginBottom: '12px' }, html: icon('play') + ' Visualizar antes de enviar', onclick: () => openPlayer({ doc: engine.serialize(), recording: recorder.serialize(), title: current?.title }) }));
  let editable = false, secret = false;
  const mkTog = (title2, sub, on) => {
    const input = el('input', { type: 'checkbox' }); input.onchange = () => on(input.checked);
    return el('div', { class: 'row', style: { background: 'var(--surface-inset)', borderRadius: 'var(--r-md)', marginBottom: '8px' } }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title2 }), el('div', { class: 'r-sub', text: sub })]), el('label', { class: 'switch' }, [input, el('span', { class: 'track' })])]);
  };
  body.append(
    mkTog('Editable después', 'Si lo activas, podrás seguir editándolo tras enviarlo', (v) => editable = v),
    mkTog('Dibujo secreto', 'Llega oculto; se revela solo al tocarlo', (v) => secret = v),
    el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '10px' }, html: icon('send') + ' Enviar', onclick: async () => {
      sh.close();
      current.sent = true; current.editableAfter = editable; current.draft = false;
      if (secret) current.secret = true;
      await db.put('drawings', current);
      await playSendAnimation(current.thumb);       // animación cinematográfica + sonido especial
      const { sendDrawingToPartner } = await import('./chat.js');
      await sendDrawingToPartner(current, { secret });
      toast(secret ? 'Enviado en secreto 💌' : t('toast.sent'));
      bus.emit('gallery:refresh');
    } }),
  );
}
async function duplicateDrawing() {
  await doSave(true);
  const copy = { ...structuredClone(current), id: uid('draw'), title: (current.title || 'Dibujo') + ' copia', createdAt: Date.now(), updatedAt: Date.now() };
  await db.put('drawings', copy); bus.emit('gallery:refresh'); toast(t('common.duplicate') + ' ✓');
}
