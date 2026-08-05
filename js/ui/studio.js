// ============================================================
// Estudio de dibujo — ahora sobre el SDK de tldraw.
//
// tldraw aporta el lienzo y las herramientas (selección, mano, lápiz/pincel,
// borrador, texto, notas, flechas, líneas, formas, marcos, láser) con sus
// estilos, deshacer/rehacer y multitáctil. Todo lo que rodea al editor sigue
// siendo de la app: título, guardado en IndexedDB, borradores, miniatura,
// envío a la pareja con su animación, música del dibujo, secretos y sync.
//
// El SDK va empaquetado en vendor/tldraw.bundle.js (ver scripts/build-vendor)
// y se carga solo al abrir el editor, así el arranque de la app no lo paga.
// ============================================================
import { el, $, uid, haptic } from '../core/utils.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { toast, sheet, confirmDialog, promptDialog } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';

let current = null;        // registro del dibujo en IndexedDB
let tl = null;             // instancia montada de tldraw
let editor = null;         // editor de tldraw
let api = null;            // API auxiliar del puente
let saveTimer = null;
let skipSaveOnLeave = false;
let dirty = false;

const VENDOR = new URL('../../vendor/tldraw.bundle.js', import.meta.url).href;

export async function renderStudio(ctx) {
  current = null; editor = null; tl = null; dirty = false; skipSaveOnLeave = false;

  const root = ctx.root;
  const wrap = el('div', { class: 'studio view' });
  root.append(wrap);

  const top = buildTopBar();
  const stage = el('div', { class: 'st-stage tl-stage' });
  wrap.append(top, stage);

  // Estado de carga mientras llega el SDK (1.8 MB, solo la primera vez).
  const loading = el('div', { class: 'tl-loading' }, [
    el('div', { class: 'tl-spinner' }),
    el('div', { class: 'tl-loading-t', text: 'Preparando el lienzo…' }),
  ]);
  stage.append(loading);

  // Documento a abrir (nuevo o existente).
  const id = ctx.params?.id;
  if (id) current = await db.get('drawings', id);

  let mod;
  try {
    mod = await import(/* @vite-ignore */ VENDOR);
  } catch (e) {
    console.error('tldraw no disponible', e);
    loading.remove();
    stage.append(el('div', { class: 'tl-loading' }, [
      el('div', { class: 'big-ic big-ic-lg', html: icon('info') }),
      el('div', { class: 'tl-loading-t', text: 'No se pudo cargar el lienzo' }),
      el('button', { class: 'btn btn-primary', style: { marginTop: '12px' }, text: 'Volver', onclick: () => go('home') }),
    ]));
    return { leave: () => {} };
  }
  api = mod.api;

  ensureTldrawCss();

  const host = el('div', { class: 'tl-host' });
  stage.append(host);

  tl = mod.mount(host, {
    dark: document.body.dataset.theme === 'dark',
    // Fuentes e iconos servidos desde el propio repo (sin CDN → offline OK).
    assetsBase: new URL('../../vendor/assets/', import.meta.url).href,
    // La app ya tiene su propio menú y su barra superior: escondemos los de
    // tldraw para no duplicar controles.
    components: { MainMenu: null, PageMenu: null, DebugPanel: null, DebugMenu: null, HelpMenu: null, NavigationPanel: null },
    onMount: (ed) => {
      editor = ed;
      // Cambios del documento → guardado diferido + estado de deshacer.
      ed.store.listen(() => { markDirty(); syncUndoRedo(); }, { scope: 'document', source: 'user' });
      ed.store.listen(() => syncUndoRedo(), { scope: 'all' });
    },
  });

  await tl.ready;
  loading.remove();

  // Carga del contenido: documento de tldraw, o migración de un dibujo hecho
  // con el motor anterior (se inserta su imagen para poder seguir encima).
  if (current?.doc?.tldraw) {
    try { api.loadSnapshot(editor, current.doc.tldraw); } catch (e) { console.warn('snapshot', e); }
  } else if (current?.thumb) {
    await importLegacyImage(current.thumb);
  }
  syncUndoRedo();
  setTitle(current?.title || '');

  // Título al crear (igual que antes).
  if (!current) {
    const name = await promptDialog({ title: '¿Cómo se llamará este dibujo?', placeholder: 'Nuestro atardecer…', confirmText: 'Comenzar' });
    setTitle(name || t('studio.untitled'));
  }

  return {
    leave: async () => {
      clearTimeout(saveTimer);
      if (!skipSaveOnLeave && dirty) await doSave(false);
      try { const { stopAllMusic } = await import('./vinyl.js'); stopAllMusic(); } catch {}
      try { tl?.destroy(); } catch {}
      editor = null; tl = null;
    },
  };

  // ---------- Barra superior de la app ----------
  function buildTopBar() {
    const back = el('button', { class: 'icon-btn', html: icon('back'), 'aria-label': 'Salir', onclick: onBack });
    const undo = el('button', { class: 'icon-btn', id: 'st-undo', html: icon('undo'), 'aria-label': 'Deshacer', onclick: () => { api?.undo(editor); haptic(); syncUndoRedo(); } });
    const redo = el('button', { class: 'icon-btn', id: 'st-redo', html: icon('redo'), 'aria-label': 'Rehacer', onclick: () => { api?.redo(editor); haptic(); syncUndoRedo(); } });
    const title = el('button', { class: 'st-title-btn', onclick: renameDrawing }, [
      el('div', { class: 'n', id: 'st-title', text: t('studio.untitled') }),
      el('div', { class: 'save-state', id: 'st-savestate', text: '' }),
    ]);
    const send = el('button', { class: 'icon-btn st-send', html: icon('send'), 'aria-label': 'Enviar', onclick: openSendSheet });
    const more = el('button', { class: 'icon-btn', html: icon('more'), 'aria-label': 'Más', onclick: openMenu });
    return el('div', { class: 'st-top' }, [back, undo, redo, title, send, more]);
  }
  function syncUndoRedo() {
    const u = $('#st-undo'), r = $('#st-redo');
    if (u) u.disabled = !api?.canUndo(editor);
    if (r) r.disabled = !api?.canRedo(editor);
  }
}

// ---------- CSS del SDK (una sola vez) ----------
function ensureTldrawCss() {
  if (document.getElementById('tldraw-css')) return;
  const href = new URL('../../vendor/tldraw.css', import.meta.url).href;
  document.head.append(el('link', { id: 'tldraw-css', rel: 'stylesheet', href }));
}

// ---------- Migración de dibujos del motor anterior ----------
// El dibujo antiguo entra como imagen para poder seguir trabajando encima sin
// perder nada de lo ya creado.
async function importLegacyImage(dataUrl) {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], 'dibujo.png', { type: blob.type || 'image/png' });
    await editor.putExternalContent({ type: 'files', files: [file], point: { x: 0, y: 0 }, ignoreParent: false });
    editor.selectNone();
    api.zoomToFit(editor);
  } catch (e) { console.warn('migración', e); }
}

// ---------- Título ----------
function setTitle(name) {
  const n = $('#st-title'); if (n) n.textContent = name || t('studio.untitled');
  if (current) current.title = name || t('studio.untitled');
}
async function renameDrawing() {
  const name = await promptDialog({ title: 'Nombre del dibujo', value: $('#st-title')?.textContent || '' });
  if (name) { setTitle(name); markDirty(); }
}

// ---------- Guardado ----------
function markDirty() {
  dirty = true;
  const s = $('#st-savestate'); if (s) s.textContent = 'sin guardar';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => doSave(false), 1500);
}
function ensureDoc() {
  if (!current) current = { id: uid('draw'), createdAt: Date.now(), folderId: null, favorite: false, comments: [], reactions: {}, owner: 'me' };
  return current;
}
export async function doSave(showState) {
  if (!editor) return null;
  if (!current && api.isEmpty(editor)) return null;   // lienzo vacío y sin registro
  ensureDoc();
  current.title = $('#st-title')?.textContent || t('studio.untitled');
  current.updatedAt = Date.now();
  current.doc = { tldraw: api.getSnapshot(editor), engine: 'tldraw' };
  try {
    const img = await api.toPngDataURL(editor, { scale: 1 });
    if (img.url) { current.thumb = img.url; current.w = img.width; current.h = img.height; }
  } catch { /* la miniatura es opcional */ }
  current.stats = { shapes: api.shapeCount(editor) };
  await db.put('drawings', current);
  dirty = false;
  const s = $('#st-savestate'); if (s) s.textContent = 'guardado';
  if (showState) import('../core/sounds.js').then((m) => m.playFx('save'));
  const ds = store.get().drawStats;
  store.set('drawStats', { ...ds, totalDrawings: Math.max(ds.totalDrawings, await db.count('drawings')) });
  bus.emit('gallery:refresh');
  return current;
}

// ---------- Salir ----------
async function onBack() {
  if (!dirty && current) return go('home');
  if (!current && api?.isEmpty(editor)) return go('home');
  const body = el('div');
  const s = sheet('¿Guardar este dibujo?', body);
  const opt = (ic, title, sub, danger, fn) => el('button', { class: 'row tappable', style: { width: '100%', color: danger ? '#d66' : '' }, onclick: async () => { s.close(); await fn(); } }, [
    el('div', { class: 'r-ic', html: icon(ic) }),
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })]),
  ]);
  body.append(
    opt('save', 'Guardar como borrador', 'Podrás seguir después', false, async () => { ensureDoc(); current.draft = true; await doSave(true); go('home'); }),
    opt('trash', 'Salir sin guardar', 'Se pierde lo dibujado', true, async () => {
      skipSaveOnLeave = true;
      if (current && !current.sent) await db.del('drawings', current.id).catch(() => {});
      go('home');
    }),
    el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, text: t('common.cancel'), onclick: () => s.close() }),
  );
}

// ---------- Menú ----------
function openMenu() {
  const body = el('div');
  const s = sheet('Opciones', body);
  const item = (ic, label, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { s.close(); fn(); } }, [
    el('div', { class: 'r-ic', html: icon(ic) }),
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })]),
  ]);
  body.append(
    item('save', t('common.save'), () => doSave(true).then(() => toast(t('toast.saved')))),
    item('music', t('studio.music'), openMusic),
    item('fit', 'Ajustar a la vista', () => api.zoomToFit(editor)),
    item('select', 'Seleccionar todo', () => api.selectAll(editor)),
    item('download', 'Exportar PNG', exportPng),
    item('trash', 'Vaciar el lienzo', async () => {
      if (await confirmDialog({ title: '¿Vaciar el lienzo?', message: 'Se borra todo lo dibujado.', danger: true })) { api.clear(editor); markDirty(); }
    }),
  );
}
async function exportPng() {
  const { url } = await api.toPngDataURL(editor, { scale: 2 });
  if (!url) return toast('El lienzo está vacío');
  const a = el('a', { href: url, download: ($('#st-title')?.textContent || 'dibujo') + '.png' });
  document.body.append(a); a.click(); a.remove();
  toast('Exportado');
}

// ---------- Música del dibujo ----------
function openMusic() {
  const body = el('div');
  const s = sheet(t('studio.music'), body);
  const m = current?.music;
  if (m) {
    const audio = el('audio', { src: m.src, preload: 'metadata' });
    audio.loop = m.loop !== false; audio.volume = m.volume ?? 0.8;
    const disc = el('div', { class: 'mus-disc' }, [el('i')]);
    const time = el('div', { class: 'mus-time', text: '0:00 / --:--' });
    const bar = el('div', { class: 'mus-bar' }, [el('i', { class: 'mus-fill' })]);
    const playBtn = el('button', { class: 'icon-btn mus-play', html: icon('playFilled'), 'aria-label': 'Reproducir' });
    const fmt = (v) => (isFinite(v) ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` : '--:--');
    const upd = () => {
      const d = audio.duration;
      bar.querySelector('.mus-fill').style.width = (d ? (audio.currentTime / d) * 100 : 0) + '%';
      time.textContent = `${fmt(audio.currentTime)} / ${fmt(d)}`;
    };
    audio.ontimeupdate = upd; audio.onloadedmetadata = upd;
    audio.onplay = () => { playBtn.innerHTML = icon('pauseFilled'); disc.classList.add('spin'); };
    audio.onpause = () => { playBtn.innerHTML = icon('playFilled'); disc.classList.remove('spin'); };
    playBtn.onclick = () => { if (audio.paused) audio.play().catch(() => toast('No se pudo reproducir')); else audio.pause(); };
    bar.onpointerdown = (e) => { const r = bar.getBoundingClientRect(); if (audio.duration) audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * audio.duration; upd(); };
    s.box.addEventListener('sheetclose', () => { audio.pause(); audio.src = ''; }, { once: true });
    const vol = el('input', { class: 'slider slim', type: 'range', min: 0, max: 100, value: Math.round((m.volume ?? 0.8) * 100) });
    const fill = () => vol.style.setProperty('--fill', vol.value + '%'); fill();
    vol.oninput = () => { audio.volume = +vol.value / 100; m.volume = audio.volume; fill(); markDirty(); };
    body.append(
      el('div', { class: 'mus-player' }, [disc, el('div', { class: 'mus-meta' }, [
        el('div', { class: 'mus-name', text: m.name || 'Canción' }),
        el('div', { class: 'mus-sub', text: 'La canción de este dibujo' }), bar, time,
      ]), playBtn]),
      el('div', { class: 'mus-row' }, [el('span', { class: 'mus-ic', html: icon('volume') }), vol]),
      el('div', { class: 'rows', style: { marginTop: '12px' } }, [
        switchRow('loop', 'Repetir', m.loop !== false, (v) => { m.loop = v; audio.loop = v; markDirty(); }),
        switchRow('play', 'Sonar al abrir el dibujo', m.autoplay !== false, (v) => { m.autoplay = v; markDirty(); }),
      ]),
      el('div', { class: 'mus-actions' }, [
        el('button', { class: 'btn btn-ghost', html: icon('music') + ' Cambiar', onclick: () => { audio.pause(); pickSong(s); } }),
        el('button', { class: 'btn btn-soft', html: icon('trash') + ' Quitar', onclick: () => { audio.pause(); current.music = null; markDirty(); s.close(); setTimeout(openMusic, 280); } }),
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
    markDirty(); await doSave(false);
    s.close(); setTimeout(openMusic, 280);
  });
}
function pickAudioFile(cb) {
  const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => {
    const f = inp.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = () => cb(r.result, f.name.replace(/\.[^.]+$/, ''));
      r.readAsDataURL(f);
    }
    inp.remove();
  };
  inp.click();
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

// ---------- Envío a la pareja ----------
function openSendSheet() {
  const body = el('div');
  const s = sheet('Enviar a tu pareja', body);
  let secret = false, editable = false;
  const row = (ic, title, sub, onChange) => {
    const input = el('input', { type: 'checkbox' });
    input.onchange = () => onChange(input.checked);
    return el('div', { class: 'row' }, [
      el('div', { class: 'r-ic', html: icon(ic) }),
      el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })]),
      el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]),
    ]);
  };
  body.append(el('div', { class: 'rows' }, [
    row('secret', 'Enviar en secreto', 'Se revela al tocarlo', (v) => secret = v),
    row('pen', 'Editable después', 'Podrás seguir cambiándolo', (v) => editable = v),
  ]));
  body.append(el('button', {
    class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '14px' }, html: icon('send') + ' Enviar',
    onclick: async () => {
      s.close();
      const d = await doSave(true);
      if (!d) return toast('Dibuja algo primero');
      d.sent = true; d.draft = false; d.editableAfter = editable;
      if (secret) d.secret = true;
      await db.put('drawings', d);
      await playSendAnimation(d.thumb);
      const { sendDrawingToPartner } = await import('./chat.js');
      await sendDrawingToPartner(d, { secret });
      toast(t('toast.sent'));
      go('home');
    },
  }));
}
// Animación cinematográfica de envío (se conserva tal cual).
function playSendAnimation(thumb) {
  return new Promise((resolve) => {
    const ov = el('div', { class: 'send-cine' });
    const card = el('div', { class: 'sc-card' });
    if (thumb) card.append(el('img', { src: thumb, alt: '' }));
    ov.append(el('div', { class: 'sc-glow' }), el('div', { class: 'sc-ring' }), card, el('div', { class: 'sc-label', text: 'Enviando con amor…' }));
    for (let i = 0; i < 28; i++) {
      const p = el('i', { class: 'sc-particle' });
      p.style.setProperty('--a', (Math.random() * 360) + 'deg');
      p.style.setProperty('--d', (60 + Math.random() * 180) + 'px');
      p.style.animationDelay = (Math.random() * 420) + 'ms';
      ov.append(p);
    }
    document.body.append(ov);
    requestAnimationFrame(() => ov.classList.add('in'));
    import('../core/sounds.js').then((m) => m.playFx('sendSpecial')).catch(() => {});
    setTimeout(() => { ov.classList.add('out'); setTimeout(() => { ov.remove(); resolve(); }, 420); }, 1500);
  });
}
