// ============================================================
// Pantalla principal — saludo, dibujos compartidos (carrusel
// horizontal) y tablero de widgets personalizable.
// ============================================================
import { el, $, uid, fmtDate, fmtTime, timeAgo, downloadDataURL } from '../core/utils.js';
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { bus } from '../core/bus.js';
import { fb } from '../core/firebase.js';
import { t, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { sheet, modal, toast } from '../core/ui.js';
import { renderBoard } from './widgets.js';
import { openComments } from './gallery.js';
import { openPlayer } from './player-ui.js';

export async function renderHome(ctx) {
  const view = el('div', { class: 'view view-pad home-view' });
  ctx.root.append(view);
  const s = store.get();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  // Cabecera con saludo y presencia de la pareja.
  const partnerDot = () => s.partner.online ? '🟢' : '💤';
  view.append(el('div', { class: 'app-header', style: { padding: '10px 4px 2px' } }, [
    el('div', {}, [
      el('h1', { text: `${greet}, ${s.profile.name} 💗` }),
      el('div', { class: 'sub', id: 'home-partner-sub', text: s.partner.drawing ? `${s.partner.name} está dibujando 🎨` : s.partner.online ? `${s.partner.name} está en línea 🟢` : `${s.partner.name} · ${timeAgo(s.partner.lastSeen, t)}` }),
    ]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'icon-btn', html: icon('music'), onclick: () => import('./vinyl.js').then((m) => m.openVinyl()) }),
      el('button', { class: 'icon-btn', html: icon('settings'), onclick: () => go('settings') }),
    ]),
  ]));

  // ---- Dibujos compartidos (carrusel horizontal) ----
  const sharedTitle = el('div', { class: 'section-title', text: '💌 Dibujos compartidos' });
  sharedTitle.append(el('button', { class: 'more', text: 'Galería ›', onclick: () => go('gallery') }));
  view.append(sharedTitle);
  const carousel = el('div', { class: 'shared-carousel' });
  view.append(carousel);
  await renderShared(carousel);

  // ---- Widgets ----
  const wTitle = el('div', { class: 'section-title', text: '✨ Tu espacio' });
  wTitle.append(el('span', { class: 'more', style: { color: 'var(--text-3)', fontWeight: 400 }, text: 'mantén presionado para editar' }));
  view.append(wTitle);
  const board = el('div', { class: 'widget-board' });
  view.append(board);
  renderBoard(board);

  // ---- Acción rápida ----
  view.append(el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '18px' }, html: '🎨 Dibujar algo bonito', onclick: () => go('studio-new') }));

  const offs = [
    bus.on('shared:list', () => renderShared(carousel)),
    bus.on('gallery:refresh', () => renderShared(carousel)),
    bus.on('widgets:refresh', () => renderBoard(board)),
    bus.on('store:partner', () => {
      const p = store.get().partner;
      const sub = $('#home-partner-sub');
      if (sub) sub.textContent = p.drawing ? `${p.name} está dibujando 🎨` : p.online ? `${p.name} está en línea 🟢` : `${p.name} · ${timeAgo(p.lastSeen, t)}`;
    }),
  ];
  return { leave: () => offs.forEach((o) => o()) };
}

// Une los dibujos del espacio privado (Firebase) con los locales enviados.
async function renderShared(carousel) {
  const cards = [];
  const remote = fb.getShared?.() || [];
  for (const r of remote) cards.push({ ...r, remote: true });
  if (!cards.length) {
    // Modo local: mostrar los dibujos más recientes como tarjetas.
    const local = (await db.allByIndex('drawings', 'updatedAt', 'prev')).slice(0, 10);
    for (const d of local) cards.push({ ...d, byName: d.owner === 'partner' ? store.get().partner.name : store.get().profile.name, remote: false });
  }
  carousel.innerHTML = '';
  if (!cards.length) {
    carousel.append(el('div', { class: 'shared-card shared-empty', onclick: () => go('studio-new') }, [
      el('div', { style: { fontSize: '2rem' }, text: '🎨' }),
      el('div', { class: 'w-sub', text: 'Su primer dibujo compartido los espera' }),
    ]));
    return;
  }
  for (const c of cards) carousel.append(sharedCard(c, carousel));
}

function sharedCard(d, carousel) {
  const card = el('div', { class: 'shared-card' });
  const img = el('div', { class: 'sc-img' });
  if (d.thumb) img.append(el('img', { src: d.thumb }));
  card.append(img);
  const rx = Object.entries(d.reactions || {}).filter(([, n]) => n > 0).map(([e, n]) => `${e}${n}`).join(' ');
  card.append(el('div', { class: 'sc-meta' }, [
    el('div', { class: 'sc-title', text: d.title || 'Sin título' }),
    el('div', { class: 'sc-sub', text: `${d.byName || 'Alguien con amor'} · ${fmtDate(d.updatedAt || d.createdAt, getLang())} ${fmtTime(d.updatedAt || d.createdAt)}` }),
    rx ? el('div', { class: 'sc-rx', text: rx }) : null,
  ]));
  card.onclick = () => openSharedDetail(d, carousel);
  return card;
}

// Tarjeta ampliada: reaccionar, comentar, favorito, descargar, historial…
async function openSharedDetail(d, carousel) {
  const body = el('div');
  const s = sheet(d.title || 'Sin título', body);
  const big = el('img', { src: d.thumb, style: { width: '100%', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)' } });
  body.append(big);
  body.append(el('div', { class: 'w-sub', style: { margin: '8px 2px' }, text: `Por ${d.byName || '💗'} · ${fmtDate(d.createdAt || d.updatedAt, getLang())} · ${fmtTime(d.updatedAt || d.createdAt)}` }));

  // Reacciones en vivo.
  const rWrap = el('div', { class: 'scroll-x', style: { margin: '10px 0' } });
  ['❤️', '😍', '🥰', '👏', '🔥', '😮', '🎨'].forEach((r) => {
    const count = d.reactions?.[r] || 0;
    const b = el('button', { class: 'chip' + (count ? ' active' : ''), text: `${r} ${count || ''}`, onclick: async () => {
      d.reactions = d.reactions || {}; d.reactions[r] = (d.reactions[r] || 0) + 1;
      b.textContent = `${r} ${d.reactions[r]}`; b.classList.add('active');
      if (d.remote) await fb.patchSharedDrawing(d.id, { reactions: d.reactions });
      else { const local = await db.get('drawings', d.id); if (local) { local.reactions = d.reactions; await db.put('drawings', local); } }
    } });
    rWrap.append(b);
  });
  body.append(rWrap);

  const acts = el('div', { class: 'grid-2', style: { gap: '8px' } });
  const act = (emoji, label, fn) => el('button', { class: 'btn btn-ghost', html: `${emoji} ${label}`, onclick: fn });
  acts.append(
    act('💬', 'Comentar', async () => { const local = d.remote ? d : await db.get('drawings', d.id); openComments(local || d); }),
    act(d.favorite ? '💖' : '🤍', 'Favorito', async () => { d.favorite = !d.favorite; if (d.remote) await fb.patchSharedDrawing(d.id, { favorite: d.favorite }); else { const local = await db.get('drawings', d.id); if (local) { local.favorite = d.favorite; await db.put('drawings', local); } } toast(d.favorite ? '💖 Favorito' : 'Quitado'); s.close(); renderShared(carousel); }),
    act('⬇️', 'Descargar', () => { if (d.thumb) { downloadDataURL(d.thumb, (d.title || 'dibujo') + '.png'); toast('Descargado ✓'); } }),
    act('▶️', 'Ver historial', async () => {
      s.close();
      try {
        let full = null;
        if (d.remote) full = await fb.fetchSharedDrawing(d);
        else { const local = await db.get('drawings', d.id); full = local ? { doc: local.doc, recording: local.recording } : null; }
        if (full?.recording?.ops?.length) openPlayer({ doc: full.doc, recording: full.recording, title: d.title });
        else toast('Este dibujo no tiene proceso grabado');
      } catch { toast('No se pudo cargar el historial'); }
    }),
    act('✏️', 'Abrir y editar', async () => {
      s.close();
      if (!d.remote) { go('studio', { id: d.id }); return; }
      try {
        const full = await fb.fetchSharedDrawing(d);
        const local = { id: d.id, title: d.title, createdAt: d.createdAt, updatedAt: Date.now(), thumb: d.thumb, doc: full.doc, recording: full.recording, favorite: d.favorite, reactions: d.reactions || {}, comments: d.comments || [], owner: 'partner', received: true };
        await db.put('drawings', local);
        go('studio', { id: d.id });
      } catch { toast('No se pudo descargar el dibujo'); }
    }),
    act('💌', 'Mensaje', () => { s.close(); go('chat'); }),
  );
  body.append(acts);
}
