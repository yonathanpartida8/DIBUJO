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

// Icono SVG por herramienta (la UI no usa emojis).
const TOOL_ICON = {
  pencil: 'toolPencil', pen: 'toolPen', ballpoint: 'toolCallig', marker: 'toolMarker',
  brush: 'toolBrush', watercolor: 'toolWater', airbrush: 'toolSpray', chalk: 'toolMarker',
  charcoal: 'toolPencil', crayon: 'toolMarker', pixel: 'toolPixel', calligraphy: 'toolCallig',
  eraser: 'toolEraser', eraserSoft: 'toolEraser', eraserPixel: 'toolPixel',
};


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
      await doSave(true);
      autosaveOff?.(); offCollab?.(); offBroadcast?.(); offPointer?.();
      fb.setDrawing?.(false);
      const { stopScratch } = await import('../core/sounds.js'); stopScratch();
    },
  };

  // ---------- builders ----------
  function buildTopBar() {
    const bar = el('div', { class: 'st-top' });
    const back = el('button', { class: 'icon-btn', html: icon('back'), onclick: async () => { await doSave(true); go('gallery'); } });
    const undo = el('button', { class: 'icon-btn', id: 'btn-undo', html: icon('undo'), onclick: () => { engine.undo(); haptic(); } });
    const redo = el('button', { class: 'icon-btn', id: 'btn-redo', html: icon('redo'), onclick: () => { engine.redo(); haptic(); } });
    const title = el('div', { class: 'title' }, [
      el('div', { class: 'n', id: 'st-title', text: t('studio.untitled') }),
      el('div', { class: 'save-state', id: 'st-save' }, [el('span', { class: 'rec-dot' }, [el('i'), 'REC ']), el('span', { id: 'st-timer', text: '0:00' })]),
    ]);
    const layers = el('button', { class: 'icon-btn', html: icon('layers'), onclick: openLayers });
    const more = el('button', { class: 'icon-btn', html: icon('more'), onclick: openMenu });
    bar.append(back, undo, redo, title, layers, more);
    return bar;
  }

  // Barra horizontal de herramientas — fuera del lienzo, desplazable,
  // con ilustraciones de herramienta y rueda de color al final.
  function buildToolbar() {
    const bar = el('div', { class: 'st-toolbar' });
    const tools = [
      ['pencil', 'toolPencil'], ['pen', 'toolPen'], ['ballpoint', 'toolCallig'], ['marker', 'toolMarker'],
      ['brush', 'toolBrush'], ['watercolor', 'toolWater'], ['airbrush', 'toolSpray'], ['pixel', 'toolPixel'],
      ['sep'],
      ['bucket', 'toolBucket'], ['eyedropper', 'dropper'], ['eraser', 'toolEraser'],
      ['sep'],
      ['line', 'line'], ['shapes', 'toolShapes'], ['symmetry', 'symmetry'],
      ['ruler-tool', 'ruler'], ['pencil-sim', 'toolPencil'], ['more-tools', 'more'],
    ];
    for (const [tool, ic] of tools) {
      if (tool === 'sep') { bar.append(el('i', { class: 'st-sep' })); continue; }
      const b = el('button', { class: 'st-tool', dataset: { tool }, html: icon(ic), title: BRUSHES[tool]?.name || tool, 'aria-label': BRUSHES[tool]?.name || tool });
      b.onclick = () => onToolButton(tool, b);
      bar.append(b);
    }
    // Rueda de color fija al final (anillo cromático + color actual).
    const wheelBtn = el('button', { class: 'st-wheel-btn', id: 'st-wheel-btn', 'aria-label': t('studio.color'), onclick: openColorWheel }, [el('i', { class: 'st-wheel-core', id: 'st-wheel-core' })]);
    bar.append(el('i', { class: 'st-sep' }), wheelBtn);
    return bar;
  }

  function buildDock() {
    const d = el('div', { class: 'st-dock' });
    const toolbar = buildToolbar();
    const quick = el('div', { class: 'st-quick' });
    const swatch = el('button', { class: 'st-color-swatch', id: 'st-swatch', onclick: openColorWheel });
    const sizePrev = el('div', { class: 'st-size-preview', onclick: openBrushOptions }, [el('i', { id: 'st-sizedot' })]);
    const slider = el('input', { class: 'slider', type: 'range', min: 1, max: 200, value: engine.brushSize, id: 'st-size' });
    slider.oninput = () => { engine.brushSize = +slider.value; updateSizeDot(); };
    const brushBtn = el('button', { class: 'icon-btn', html: icon('pen'), onclick: openBrushPicker });
    quick.append(swatch, sizePrev, el('div', { class: 'st-slider-wrap' }, [slider]), brushBtn);

    const palette = el('div', { class: 'st-palette', id: 'st-palette' });

    const actions = el('div', { class: 'st-quick' });
    const mk = (ic, fn, title) => el('button', { class: 'icon-btn', html: icon(ic), onclick: fn, title });
    actions.append(
      mk('paper', openPaper, t('studio.paper')),
      mk('image', openMedia, t('studio.media')),
      mk('sticker', openAssetsPanel, 'Assets'),
      mk('music', openMusic, t('studio.music')),
      mk('play', () => openPlayer({ doc: engine.serialize(), recording: recorder.serialize(), title: current?.title }), t('studio.play')),
      mk('stats', () => openStatsSheet(recorder.stats(), current), t('studio.stats')),
      mk('save', () => doSave(true).then(() => toast(t('toast.saved'), { icon: '💕' })), t('common.save')),
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
  sound('tap'); haptic();
  if (tool === 'shapes') return openShapes();
  if (tool === 'symmetry') return openSymmetry();
  if (tool === 'more-tools') return openMoreTools();
  if (tool === 'ruler-tool') { const on = ruler.toggle(); btn.classList.toggle('active', on); toast(on ? 'Regla activa — barrera física' : 'Regla desactivada'); return; }
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
  const sl = $('#st-size'); if (sl) sl.value = engine.brushSize;
  updateSizeDot();
  const core = $('#st-wheel-core'); if (core) core.style.background = engine.color;
}
function updateSizeDot() {
  const dot = $('#st-sizedot'); if (!dot) return;
  const s = Math.max(3, Math.min(34, engine.brushSize * 0.7));
  dot.style.width = s + 'px'; dot.style.height = s + 'px'; dot.style.background = engine.color;
}
function refreshColorUI() {
  const sw = $('#st-swatch'); if (sw) sw.style.background = engine.color;
  const core = $('#st-wheel-core'); if (core) core.style.background = engine.color;
  updateSizeDot();
}
function refreshPalette() {
  const p = $('#st-palette'); if (!p) return;
  p.innerHTML = '';
  engine.recentColors.forEach((c) => {
    const b = el('button', { class: 'st-swatch' + (c === engine.color ? ' active' : ''), style: { background: c }, onclick: () => { engine.setColor(c); refreshColorUI(); refreshPalette(); } });
    p.append(b);
  });
}

// ---------- Save ----------
function scheduleSave() { clearTimeout(saveTimer); const st = $('#st-save'); saveTimer = setTimeout(() => doSave(false), 1400); }
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
  // pastel presets
  const presets = ['#ef92a6', '#f7b7c4', '#ffd9e4', '#cbb6e8', '#a98fd4', '#b8e0d2', '#8fd4bb', '#ffd7bd', '#ffcaa0', '#bcd8f2', '#fdeec2', '#5a4e58', '#ffffff', '#2a2530'];
  const pal = el('div', { class: 'st-palette', style: { flexWrap: 'wrap', justifyContent: 'center' } });
  presets.forEach((c) => pal.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => { engine.setColor(c); wheel.set(c); preview.style.background = c; hexIn.value = c; refreshColorUI(); refreshPalette(); } })));
  wrap.append(wheel.node, preview, el('div', { class: 'field', style: { width: '100%' } }, [hexIn]), pal);
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
  const shapes = [['line', 'Línea', icon('line')], ['rect', 'Rectángulo', ''], ['ellipse', 'Círculo', ''], ['triangle', 'Triángulo', ''], ['star', 'Estrella', ''], ['polygon', 'Polígono', '']];
  const s = sheet(t('studio.shapes') || 'Figuras', body);
  shapes.forEach(([id, name]) => {
    const b = el('button', { class: 'tile', style: { padding: '16px', textAlign: 'center' }, onclick: () => { engine.setTool(id); refreshToolUI(); s.close(); } }, [
      el('div', { style: { fontSize: '1.6rem' }, text: { line: '╱', rect: '▭', ellipse: '◯', triangle: '△', star: '✦', polygon: '⬡' }[id] }),
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
  const tabDefs = [['gif', 'GIFs'], ['image', 'Imagen'], ['text', 'Texto'], ['emoji', 'Emoji'], ['sticker', 'Stickers']];
  tabDefs.forEach(([id, label], i) => tabs.append(el('button', { class: i === 0 ? 'active' : '', text: label, onclick: (e) => { tabs.querySelectorAll('button').forEach((b) => b.classList.remove('active')); e.target.classList.add('active'); showTab(id); } })));
  body.append(tabs, panel);
  showTab('gif');
  function showTab(id) {
    panel.innerHTML = '';
    if (id === 'gif') return gifTab(panel, s);
    if (id === 'image') { pickImageFile((src) => { addImageMedia(src, 'image'); s.close(); }); return; }
    if (id === 'text') return textTab(panel, s);
    if (id === 'emoji') return emojiTab(panel, s, 'emoji');
    if (id === 'sticker') return emojiTab(panel, s, 'sticker');
  }
}
function gifTab(panel, s) {
  const input = el('input', { class: 'input', placeholder: t('common.search') + ' GIFs (Klipy)…' });
  const grid = el('div', { class: 'gif-grid', style: { marginTop: '10px' } });
  panel.append(input, grid);
  const load = async (q) => { grid.innerHTML = '<div class="sk" style="height:90px"></div>'.repeat(6); const res = await searchGifs(q || 'bear love'); grid.innerHTML = ''; if (!res.length) { grid.append(el('p', { style: { color: 'var(--text-2)', gridColumn: '1/-1' }, text: 'No hay resultados o sin conexión.' })); return; } res.forEach((g) => grid.append(el('img', { src: g.preview, loading: 'lazy', onclick: () => { addImageMedia(g.url, 'gif'); s.close(); toast('GIF añadido'); } }))); };
  let tmr; input.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => load(input.value.trim()), 400); };
  load('bear love'); // el buscador siempre inicia con "bear love" 🐻💕
}
function textTab(panel, s) {
  const ta = el('textarea', { class: 'textarea', placeholder: 'Escribe algo bonito…' });
  const colorIn = el('input', { type: 'color', value: engine.color, style: { width: '48px', height: '40px', border: 'none', background: 'none' } });
  const sizeSl = el('input', { class: 'slider', type: 'range', min: 16, max: 120, value: 48 });
  panel.append(el('div', { class: 'field' }, [ta]), el('div', { class: 'row', style: { background: 'var(--surface-inset)', borderRadius: 'var(--r-md)' } }, [el('span', { text: 'Color' }), colorIn, el('div', { style: { flex: 1 } }, [sizeSl])]),
    el('button', { class: 'btn btn-primary btn-block', style: { marginTop: '12px' }, text: 'Añadir texto', onclick: () => { if (!ta.value.trim()) return; engine.addMedia({ type: 'text', text: ta.value, color: colorIn.value, fontSize: +sizeSl.value, x: engine.docW / 2 - 100, y: engine.docH / 2 - 30, w: 200, h: 60, rot: 0, opacity: 1 }); s.close(); } }));
}
function emojiTab(panel, s, type) {
  const emojis = type === 'emoji'
    ? '😀😍🥰😘😊🥺😎🤩😴🤗😇🙃😜🤔😅😂🥳😳😌❤️🧡💛💚💙💜🤍🖤💗💖💕💞💓💘💌💋🌸🌺🌷🌹🌻🌼✨⭐🌟💫🔥🌈☀️🌙⛅🍓🍑🍒🍰🧁🍩🍭🎀🎁🐻🐰🐱🐶🦊🐼🐨🦄🕊️'.match(/./gu)
    : '🐻💐🌈🦋🎀🍰🌸💖🐰🌷☕🍓🧸🎈🌙⭐🐱🌻🍭🎨🖌️💌🕊️🫧🌼🍀🐨🐣🌟💫🎵🪴'.match(/./gu);
  const grid = el('div', { class: 'emoji-grid' });
  emojis.forEach((e) => grid.append(el('button', { text: e, onclick: () => { const size = type === 'emoji' ? 80 : 140; engine.addMedia({ type: type === 'emoji' ? 'text' : 'text', text: e, fontSize: size, x: engine.docW / 2 - size / 2, y: engine.docH / 2 - size / 2, w: size, h: size, rot: 0, opacity: 1 }); s.close(); } })));
  panel.append(grid);
}
function addImageMedia(src, type) {
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => { const maxW = engine.docW * 0.6; const scale = Math.min(1, maxW / img.width); const w = img.width * scale, h = img.height * scale; const m = engine.addMedia({ type, src, x: (engine.docW - w) / 2, y: (engine.docH - h) / 2, w, h, rot: 0, opacity: 1 }); m._img = img; engine.renderMedia(); };
  img.onerror = () => toast('No se pudo cargar la imagen');
  img.src = src;
}
function pickImageFile(cb) {
  const inp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => { const f = inp.files[0]; if (f) { const url = await blobToDataURL(f); cb(url); } inp.remove(); };
  inp.click();
}

// ---------- Media overlay (drag/resize/rotate on canvas) ----------
let selectedMediaId = null;
function renderMediaOverlay(media) {
  const layer = engine.mediaLayer; if (!layer) return;
  layer.innerHTML = '';
  media.forEach((m) => {
    const obj = el('div', { class: 'media-obj' + (m.id === selectedMediaId ? ' selected' : ''), style: { left: m.x + 'px', top: m.y + 'px', width: m.w + 'px', height: m.h + 'px', transform: `rotate(${m.rot || 0}deg)`, opacity: m.opacity ?? 1 } });
    if (m.type === 'text') obj.append(el('div', { class: 'txt', style: { fontSize: (m.fontSize || 40) + 'px', color: m.color || 'inherit', fontFamily: m.font || 'Nunito, sans-serif' }, text: m.text }));
    else obj.append(el('img', { src: m._img ? (m._img.src) : m.src }));
    if (m.id === selectedMediaId) {
      obj.append(
        el('div', { class: 'handle del', html: icon('close'), onpointerdown: (e) => { e.stopPropagation(); engine.removeMedia(m.id); selectedMediaId = null; } }),
        el('div', { class: 'handle br', onpointerdown: (e) => startResize(e, m) }),
        el('div', { class: 'handle rot', onpointerdown: (e) => startRotate(e, m) }),
      );
    }
    obj.addEventListener('pointerdown', (e) => { if (e.target.classList.contains('handle')) return; selectedMediaId = m.id; startDrag(e, m); renderMediaOverlay(engine.media); });
    layer.append(obj);
  });
}
function docScale() { return engine.baseScale * engine.zoom; }
function startDrag(e, m) {
  e.stopPropagation(); const sx = e.clientX, sy = e.clientY, ox = m.x, oy = m.y, sc = docScale();
  const move = (ev) => { m.x = ox + (ev.clientX - sx) / sc; m.y = oy + (ev.clientY - sy) / sc; renderMediaOverlay(engine.media); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); engine.markDirty(); };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
}
function startResize(e, m) {
  e.stopPropagation(); const sx = e.clientX, sy = e.clientY, ow = m.w, oh = m.h, ratio = m.h / m.w, sc = docScale();
  const move = (ev) => { const nw = Math.max(20, ow + (ev.clientX - sx) / sc); m.w = nw; m.h = m.type === 'text' ? nw * (oh / ow) : nw * ratio; if (m.type === 'text') m.fontSize = (m.fontSize || 40) * (nw / ow) / 1; renderMediaOverlay(engine.media); };
  const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); engine.markDirty(); };
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
function openMusic() {
  const body = el('div');
  const s = sheet(t('studio.music'), body);
  if (current?.music) {
    body.append(el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } }, [
      el('div', { class: 'r-ic', html: icon('music') }),
      el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: current.music.name || 'Canción' }), el('div', { class: 'r-sub', text: 'La canción de este dibujo' })]),
      el('button', { class: 'btn btn-soft btn-sm', text: '▶ Tocar', onclick: async () => { const { openVinyl } = await import('./vinyl.js'); s.close(); openVinyl({ id: current.id + '_music', name: current.music.name, src: current.music.src, kind: 'song' }); } }),
      el('button', { class: 'icon-btn', html: icon('trash'), onclick: () => { current.music = null; engine.markDirty(); s.close(); openMusic(); } }),
    ]));
  }
  body.append(el('button', { class: 'btn btn-primary btn-block', html: icon('music') + ' Elegir canción para este dibujo', onclick: () => pickAudioFile(async (src, name) => { if (!current) await doSave(true); current.music = { src, name, loop: true, volume: 0.8, autoplay: true }; engine.markDirty(); s.close(); const { openVinyl } = await import('./vinyl.js'); openVinyl({ id: current.id + '_music', name, src, kind: 'song' }); }) }));
  body.append(el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, text: '💿 Abrir tocadiscos', onclick: async () => { const { openVinyl } = await import('./vinyl.js'); s.close(); openVinyl(); } }));
  body.append(el('p', { style: { color: 'var(--text-3)', fontSize: '0.78rem', marginTop: '10px', textAlign: 'center' }, text: 'Cada dibujo puede tener su propia música. Suena en el tocadiscos al abrirlo. 💿' }));
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
    item('send', 'Enviar a mi pareja', () => sendToPartner(false)),
    item('secret', 'Enviar como secreto', () => sendToPartner(true)),
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
async function sendToPartner(secret = false) {
  await doSave(true);
  const { sendDrawingToPartner } = await import('./chat.js');
  await sendDrawingToPartner(current, { secret });
  toast(secret ? 'Enviado en secreto' : t('toast.sent')); sound('send');
}
async function duplicateDrawing() {
  await doSave(true);
  const copy = { ...structuredClone(current), id: uid('draw'), title: (current.title || 'Dibujo') + ' copia', createdAt: Date.now(), updatedAt: Date.now() };
  await db.put('drawings', copy); bus.emit('gallery:refresh'); toast(t('common.duplicate') + ' ✓');
}
