// ============================================================
// Biblioteca de assets — imágenes, GIF, stickers, videos, música,
// pinceles, texturas, fondos, marcos y plantillas.
// Con buscador, favoritos y recientes.
// ============================================================
import { el, uid, blobToDataURL } from '../core/utils.js';
import { db } from '../core/db.js';
import { sheet, toast } from '../core/ui.js';
import { searchGifs } from '../media/klipy.js';
import { BRUSH_LIST } from '../drawing/brushes.js';
import { PAPER_TEXTURES } from '../drawing/engine.js';

const CATS = [
  ['img', '🖼️', 'Imágenes'], ['gif', '🎞️', 'GIF'], ['sticker', '🌸', 'Stickers'],
  ['video', '🎬', 'Videos'], ['song', '🎵', 'Música'], ['brush', '🖌️', 'Pinceles'],
  ['texture', '🧻', 'Texturas'], ['bg', '🌄', 'Fondos'], ['frame', '🪞', 'Marcos'], ['template', '📐', 'Plantillas'],
];

const STICKERS = '🐻💐🌈🦋🎀🍰🌸💖🐰🌷☕🍓🧸🎈🌙⭐🐱🌻🍭🎨💌🕊️🌼🍀🐨🐣💫🎵🪴🫧😍🥰'.match(/./gu);
const BACKGROUNDS = ['#ffffff', '#fff7f0', '#fef6e4', '#f4f1ff', '#eef7f2', '#fdeef1', '#ffe9ef', '#e8f4fd'];
const FRAMES = [['💗 Corazones', '💗'], ['🌸 Flores', '🌸'], ['⭐ Estrellas', '⭐'], ['🐻 Ositos', '🐻'], ['✨ Brillos', '✨']];
const TEMPLATES = [
  { name: 'Retrato 3:4', w: 1080, h: 1440 }, { name: 'Cuadrado', w: 1200, h: 1200 },
  { name: 'Paisaje 4:3', w: 1440, h: 1080 }, { name: 'Historia 9:16', w: 1080, h: 1920 },
  { name: 'Tarjeta postal', w: 1400, h: 1000 },
];

// onPick(asset) — se llama al elegir un asset (según categoría).
export async function openAssets({ onPick } = {}) {
  const body = el('div');
  const s = sheet('📦 Biblioteca de assets', body, { height: '86dvh' });

  const search = el('input', { class: 'input', placeholder: 'Buscar en la biblioteca…' });
  const tabs = el('div', { class: 'scroll-x', style: { margin: '10px 0' } });
  const quick = el('div', { class: 'scroll-x', style: { marginBottom: '8px' } });
  const panel = el('div');
  body.append(search, tabs, quick, panel);

  let cat = 'img', mode = 'all'; // all | fav | recent
  for (const [id, emoji, name] of CATS) {
    tabs.append(el('button', { class: 'chip' + (id === cat ? ' active' : ''), dataset: { c: id }, text: `${emoji} ${name}`, onclick: (e) => { cat = id; tabs.querySelectorAll('.chip').forEach((x) => x.classList.remove('active')); e.target.classList.add('active'); paint(); } }));
  }
  [['all', 'Todo'], ['fav', '💖 Favoritos'], ['recent', '🕑 Recientes']].forEach(([id, label]) => {
    quick.append(el('button', { class: 'chip' + (id === 'all' ? ' active' : ''), dataset: { m: id }, text: label, onclick: (e) => { mode = id; quick.querySelectorAll('.chip').forEach((x) => x.classList.remove('active')); e.target.classList.add('active'); paint(); } }));
  });
  let tmr; search.oninput = () => { clearTimeout(tmr); tmr = setTimeout(paint, 350); };

  async function userAssets(kind) {
    let list = (await db.all('media')).filter((m) => m.kind === kind);
    if (mode === 'fav') list = list.filter((m) => m.fav);
    if (mode === 'recent') list = list.sort((a, b) => (b.usedAt || 0) - (a.usedAt || 0)).slice(0, 12);
    const q = search.value.trim().toLowerCase();
    if (q) list = list.filter((m) => (m.name || '').toLowerCase().includes(q));
    return list;
  }
  const pick = async (asset) => { if (asset.id) { asset.usedAt = Date.now(); await db.put('media', asset).catch(() => {}); } s.close(); onPick?.(asset); };
  const favBtn = (asset) => el('button', { class: 'asset-fav' + (asset.fav ? ' on' : ''), text: asset.fav ? '💖' : '🤍', onclick: async (e) => { e.stopPropagation(); asset.fav = !asset.fav; await db.put('media', asset); e.target.textContent = asset.fav ? '💖' : '🤍'; e.target.classList.toggle('on', asset.fav); } });

  async function paint() {
    panel.innerHTML = '';
    const q = search.value.trim();
    const addBtn = (accept, kind) => el('button', { class: 'btn btn-soft btn-block', style: { marginBottom: '10px' }, text: '＋ Añadir desde el dispositivo', onclick: () => {
      const inp = el('input', { type: 'file', accept, style: { display: 'none' } });
      document.body.append(inp);
      inp.onchange = async () => { const f = inp.files[0]; if (f) { const src = await blobToDataURL(f); await db.put('media', { id: uid('asset'), kind, name: f.name.replace(/\.[^.]+$/, ''), src, addedAt: Date.now() }); paint(); toast('Añadido ✓'); } inp.remove(); };
      inp.click();
    } });

    if (cat === 'img' || cat === 'video') {
      panel.append(addBtn(cat === 'img' ? 'image/*' : 'video/*', cat));
      const list = await userAssets(cat);
      const grid = el('div', { class: 'gif-grid' });
      list.forEach((a) => { const cell = el('div', { style: { position: 'relative' } }, [el('img', { src: a.kind === 'video' ? '' : a.src, style: a.kind === 'video' ? { display: 'none' } : {} }), favBtn(a)]); if (a.kind === 'video') cell.prepend(el('video', { src: a.src, muted: true, style: { width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--r-sm)' } })); cell.onclick = () => pick(a); grid.append(cell); });
      if (!list.length) panel.append(emptyNote('Añade sus fotos y videos favoritos'));
      panel.append(grid);
    } else if (cat === 'gif') {
      const grid = el('div', { class: 'gif-grid' });
      grid.innerHTML = '<div class="sk" style="height:90px"></div>'.repeat(6);
      panel.append(grid);
      const res = await searchGifs(q || 'bear love');
      grid.innerHTML = '';
      res.forEach((g) => grid.append(el('img', { src: g.preview, onclick: () => pick({ kind: 'gif', src: g.url }) })));
      if (!res.length) grid.append(el('p', { style: { gridColumn: '1/-1', color: 'var(--text-2)' }, text: 'Sin conexión o sin resultados' }));
    } else if (cat === 'sticker') {
      const grid = el('div', { class: 'emoji-grid' });
      STICKERS.forEach((e) => grid.append(el('button', { text: e, onclick: () => pick({ kind: 'sticker', text: e }) })));
      panel.append(grid);
    } else if (cat === 'song') {
      panel.append(addBtn('audio/*', 'song'));
      const list = await userAssets('song');
      list.forEach((a) => panel.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => pick(a) }, [el('div', { class: 'r-ic', text: '🎵' }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: a.name })]), favBtn(a)])));
      if (!list.length) panel.append(emptyNote('Su banda sonora empieza aquí 🎶'));
    } else if (cat === 'brush') {
      const grid = el('div', { class: 'grid-auto' });
      BRUSH_LIST.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase())).forEach((b) => grid.append(el('button', { class: 'tile', style: { padding: '12px', textAlign: 'center' }, onclick: () => pick({ kind: 'brush', id: b.id }) }, [el('div', { style: { fontSize: '1.5rem' }, text: b.emoji }), el('div', { class: 'meta', html: `<div class="t">${b.name}</div>` })])));
      panel.append(grid);
    } else if (cat === 'texture') {
      const grid = el('div', { class: 'grid-auto' });
      Object.entries(PAPER_TEXTURES).forEach(([id, name]) => grid.append(el('button', { class: 'tile', style: { padding: '14px', textAlign: 'center' }, onclick: () => pick({ kind: 'texture', id }) }, [el('div', { style: { fontSize: '1.4rem' }, text: '🧻' }), el('div', { class: 'meta', html: `<div class="t">${name}</div>` })])));
      panel.append(grid);
    } else if (cat === 'bg') {
      const pal = el('div', { class: 'st-palette', style: { flexWrap: 'wrap' } });
      BACKGROUNDS.forEach((c) => pal.append(el('button', { class: 'st-swatch', style: { background: c, width: '44px', height: '44px' }, onclick: () => pick({ kind: 'bg', color: c }) })));
      panel.append(pal, addBtn('image/*', 'bg'));
      const list = await userAssets('bg');
      const grid = el('div', { class: 'gif-grid' });
      list.forEach((a) => grid.append(el('img', { src: a.src, onclick: () => pick(a) })));
      panel.append(grid);
    } else if (cat === 'frame') {
      const grid = el('div', { class: 'grid-auto' });
      FRAMES.forEach(([name, emoji]) => grid.append(el('button', { class: 'tile', style: { padding: '14px', textAlign: 'center' }, onclick: () => pick({ kind: 'frame', emoji, name }) }, [el('div', { style: { fontSize: '1.5rem' }, text: emoji }), el('div', { class: 'meta', html: `<div class="t">${name}</div>` })])));
      panel.append(grid);
    } else if (cat === 'template') {
      TEMPLATES.forEach((tp) => panel.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => pick({ kind: 'template', ...tp }) }, [el('div', { class: 'r-ic', text: '📐' }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: tp.name }), el('div', { class: 'r-sub', text: `${tp.w} × ${tp.h}` })])])));
    }
  }
  function emptyNote(text) { return el('p', { style: { color: 'var(--text-3)', textAlign: 'center', padding: '10px', fontSize: '0.85rem' }, text }); }
  paint();
}
