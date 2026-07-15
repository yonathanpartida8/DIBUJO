// Gallery — drawings, folders, favorites, history, comments, reactions.
import { el, $, uid, fmtDate, timeAgo } from '../core/utils.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { t, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { sheet, modal, promptDialog, confirmDialog, toast } from '../core/ui.js';
import { openPlayer } from './player-ui.js';

export async function renderGallery(ctx) {
  const root = ctx.root;
  const view = el('div', { class: 'view view-pad' });
  root.append(view);

  const header = el('div', { class: 'app-header', style: { padding: '10px 4px 4px' } }, [
    el('div', {}, [el('h1', { text: t('gallery.title') }), el('div', { class: 'sub', text: t('gallery.sub') })]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'icon-btn', html: icon('settings'), onclick: () => go('settings') }),
      el('button', { class: 'icon-btn', html: icon('add'), onclick: () => go('studio-new') }),
    ]),
  ]);
  view.append(header);

  // filters
  let filter = ctx.params.filter || 'all';
  let activeFolder = null;
  const filterBar = el('div', { class: 'scroll-x', style: { marginTop: '8px' } });
  const filters = [['all', t('gallery.all')], ['favorites', t('gallery.favorites')], ['received', t('gallery.received')], ['mine', t('gallery.mine')]];
  filters.forEach(([id, label]) => filterBar.append(el('button', { class: 'chip' + (id === filter ? ' active' : ''), text: label, dataset: { f: id }, onclick: () => { filter = id; activeFolder = null; syncChips(); renderGrid(); } })));
  view.append(filterBar);
  function syncChips() { filterBar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.f === filter)); }

  // folders
  const foldersWrap = el('div');
  view.append(foldersWrap);

  const gridWrap = el('div');
  view.append(gridWrap);

  await renderFolders();
  await renderGrid();

  const off = bus.on('gallery:refresh', () => { renderFolders(); renderGrid(); });
  return { leave: () => off() };

  async function renderFolders() {
    const folders = await db.all('folders');
    foldersWrap.innerHTML = '';
    const title = el('div', { class: 'section-title', text: t('gallery.folders') });
    title.append(el('button', { class: 'more', text: '+ ' + t('gallery.newFolder'), onclick: newFolder }));
    foldersWrap.append(title);
    const scroll = el('div', { class: 'scroll-x' });
    scroll.append(el('button', { class: 'chip' + (activeFolder === null ? ' active' : ''), text: '🗂️ ' + t('gallery.all'), onclick: () => { activeFolder = null; syncFolderChips(); renderGrid(); } }));
    folders.forEach((f) => scroll.append(el('button', { class: 'chip' + (activeFolder === f.id ? ' active' : ''), dataset: { fid: f.id }, html: `${f.emoji || '📁'} ${f.name}`, onclick: () => { activeFolder = f.id; syncFolderChips(); renderGrid(); }, oncontextmenu: (e) => { e.preventDefault(); folderMenu(f); } })));
    foldersWrap.append(scroll);
    function syncFolderChips() { scroll.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', (c.dataset.fid || null) === activeFolder)); }
  }
  async function newFolder() {
    const name = await promptDialog({ title: t('gallery.newFolder'), placeholder: 'Recuerdos, Retos…' });
    if (!name) return;
    const emojis = ['📁', '💖', '🌸', '⭐', '🎨', '🌈', '🐻', '🍰'];
    await db.put('folders', { id: uid('folder'), name, emoji: emojis[Math.floor(Math.random() * emojis.length)], createdAt: Date.now() });
    renderFolders();
  }
  function folderMenu(f) {
    const body = el('div');
    const s = sheet(f.name, body);
    body.append(
      el('button', { class: 'btn btn-ghost btn-block', style: { marginBottom: '8px' }, text: t('common.rename'), onclick: async () => { const n = await promptDialog({ title: t('common.rename'), value: f.name }); if (n) { f.name = n; await db.put('folders', f); s.close(); renderFolders(); } } }),
      el('button', { class: 'btn btn-soft btn-block', html: icon('trash') + ' ' + t('common.delete'), onclick: async () => { await db.del('folders', f.id); s.close(); if (activeFolder === f.id) activeFolder = null; renderFolders(); renderGrid(); } }),
    );
  }

  async function renderGrid() {
    let drawings = await db.allByIndex('drawings', 'updatedAt', 'prev');
    if (filter === 'favorites') drawings = drawings.filter((d) => d.favorite);
    if (filter === 'received') drawings = drawings.filter((d) => d.owner === 'partner' || d.received);
    if (filter === 'mine') drawings = drawings.filter((d) => d.owner === 'me' && !d.received);
    if (activeFolder) drawings = drawings.filter((d) => d.folderId === activeFolder);

    gridWrap.innerHTML = '';
    if (!drawings.length) {
      gridWrap.append(el('div', { class: 'empty' }, [el('div', { class: 'em-emoji', text: '🎨' }), el('div', { style: { fontWeight: 700 }, text: t('gallery.empty') }), el('div', { text: t('gallery.emptySub') }), el('button', { class: 'btn btn-primary', style: { marginTop: '8px' }, html: icon('add') + ' ' + t('gallery.newDrawing'), onclick: () => go('studio-new') })]));
      return;
    }
    const grid = el('div', { class: 'grid-2', style: { marginTop: '12px' } });
    drawings.forEach((d) => grid.append(drawingTile(d)));
    gridWrap.append(grid);
  }

  function drawingTile(d) {
    const tile = el('div', { class: 'tile' });
    const thumb = el('div', { class: 'thumb' });
    if (d.thumb) thumb.append(el('img', { src: d.thumb, alt: d.title }));
    else thumb.append(el('div', { style: { fontSize: '2rem' }, text: '🖼️' }));
    if (d.favorite) thumb.append(el('div', { style: { position: 'absolute', top: '8px', right: '8px', fontSize: '1.1rem' }, text: '💖' }));
    if (d.recording?.ops?.length) thumb.append(el('button', { class: 'icon-btn', style: { position: 'absolute', bottom: '8px', right: '8px', width: '34px', height: '34px' }, html: icon('play'), onclick: (e) => { e.stopPropagation(); openPlayer({ doc: d.doc, recording: d.recording, title: d.title }); } }));
    const meta = el('div', { class: 'meta' }, [el('div', { class: 't', text: d.title || t('studio.untitled') }), el('div', { class: 'd', text: timeAgo(d.updatedAt, t) })]);
    tile.append(thumb, meta);
    tile.onclick = () => go('studio', { id: d.id });
    let lp; tile.addEventListener('pointerdown', () => { lp = setTimeout(() => tileMenu(d), 500); }); tile.addEventListener('pointerup', () => clearTimeout(lp)); tile.addEventListener('pointermove', () => clearTimeout(lp));
    tile.oncontextmenu = (e) => { e.preventDefault(); tileMenu(d); };
    return tile;
  }

  async function tileMenu(d) {
    const body = el('div');
    const s = sheet(d.title || t('studio.untitled'), body);
    const item = (ic, label, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { s.close(); fn(); } }, [el('div', { class: 'r-ic', html: typeof ic === 'string' && ic.length <= 2 ? '' : icon(ic), text: ic.length <= 2 ? ic : '' }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })])]);
    body.append(
      item('pen', t('common.edit'), () => go('studio', { id: d.id })),
      item('play', t('studio.play'), () => openPlayer({ doc: d.doc, recording: d.recording, title: d.title })),
      item('💬', 'Comentarios y reacciones', () => openComments(d)),
      item(d.favorite ? '💔' : '💖', d.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', async () => { d.favorite = !d.favorite; await db.put('drawings', d); renderGrid(); }),
      item('📁', 'Mover a carpeta', () => moveToFolder(d)),
      item('send', 'Enviar a mi pareja', async () => { const { sendDrawingToPartner } = await import('./chat.js'); await sendDrawingToPartner(d); toast(t('toast.sent'), { icon: '💌' }); }),
      item('dup', t('common.duplicate'), async () => { const copy = { ...structuredClone(d), id: uid('draw'), title: (d.title || 'Dibujo') + ' copia', createdAt: Date.now(), updatedAt: Date.now(), favorite: false }; await db.put('drawings', copy); renderGrid(); }),
      item('trash', t('common.delete'), async () => { if (await confirmDialog({ title: t('common.delete'), message: '¿Eliminar este dibujo?', danger: true })) { await db.del('drawings', d.id); renderGrid(); } }),
    );
  }
  async function moveToFolder(d) {
    const folders = await db.all('folders');
    const body = el('div');
    const s = sheet('Mover a carpeta', body);
    body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: async () => { d.folderId = null; await db.put('drawings', d); s.close(); renderGrid(); } }, [el('div', { class: 'r-ic', text: '🗂️' }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Sin carpeta' })])]));
    folders.forEach((f) => body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: async () => { d.folderId = f.id; await db.put('drawings', d); s.close(); renderGrid(); toast('Movido a ' + f.name); } }, [el('div', { class: 'r-ic', text: f.emoji || '📁' }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: f.name })])])));
    if (!folders.length) body.append(el('p', { style: { color: 'var(--text-2)', textAlign: 'center' }, text: 'Crea una carpeta primero' }));
  }
}

// Comments + reactions (shared, stored on the drawing)
export function openComments(d) {
  const body = el('div');
  const s = sheet('💬 ' + (d.title || t('studio.untitled')), body);
  d.reactions = d.reactions || {}; d.comments = d.comments || [];
  const reactions = ['❤️', '😍', '🥰', '👏', '🔥', '😮', '🎨'];
  const rWrap = el('div', { class: 'scroll-x', style: { marginBottom: '12px' } });
  reactions.forEach((r) => { const count = d.reactions[r] || 0; const b = el('button', { class: 'chip' + (count ? ' active' : ''), text: `${r} ${count || ''}`, onclick: async () => { d.reactions[r] = (d.reactions[r] || 0) + 1; await db.put('drawings', d); b.textContent = `${r} ${d.reactions[r]}`; b.classList.add('active'); } }); rWrap.append(b); });
  body.append(rWrap);
  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40vh', overflow: 'auto' } });
  const renderComments = () => { list.innerHTML = ''; if (!d.comments.length) list.append(el('p', { style: { color: 'var(--text-3)', textAlign: 'center', padding: '10px' }, text: 'Sin comentarios aún 💭' })); d.comments.forEach((c) => list.append(el('div', { class: 'bubble ' + (c.from === 'me' ? 'me' : 'them'), style: { maxWidth: '100%' } }, [c.text, el('span', { class: 'time', text: timeAgo(c.ts, t) })]))); };
  renderComments();
  body.append(list);
  const input = el('input', { class: 'input', placeholder: 'Escribe un comentario…', style: { marginTop: '10px' } });
  const send = el('button', { class: 'btn btn-primary', html: icon('send'), onclick: async () => { const txt = input.value.trim(); if (!txt) return; d.comments.push({ id: uid('c'), text: txt, from: 'me', ts: Date.now() }); await db.put('drawings', d); input.value = ''; renderComments(); list.scrollTop = list.scrollHeight; } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send.click(); });
  body.append(el('div', { style: { display: 'flex', gap: '8px' } }, [el('div', { style: { flex: 1 } }, [input]), send]));
}
