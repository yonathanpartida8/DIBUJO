// ============================================================
// Inbox — nada de cuadrícula: feed vertical de tarjetas con
// profundidad, identidad por autor (rosa = tu pareja, verde = tú)
// y transición fluida hacia el lienzo. Conserva carpetas,
// favoritos, comentarios, reacciones y todo el historial.
// ============================================================
import { el, $, uid, fmtDate, fmtTime, timeAgo } from '../core/utils.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { fb } from '../core/firebase.js';
import { t, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { sheet, promptDialog, confirmDialog, toast } from '../core/ui.js';
import { openPlayer } from './player-ui.js';

export async function renderGallery(ctx) {
  const root = ctx.root;
  const view = el('div', { class: 'view view-pad inbox-view' });
  root.append(view);

  const header = el('div', { class: 'app-header', style: { padding: '10px 4px 4px' } }, [
    el('button', { class: 'icon-btn', html: icon('back'), onclick: () => go('home') }),
    el('div', {}, [el('h1', { text: 'Inbox' }), el('div', { class: 'sub', text: 'Sus dibujos, juntos' })]),
    el('div', { class: 'header-actions' }, [
      el('button', { class: 'icon-btn', html: icon('chat'), onclick: () => go('chat') }),
      el('button', { class: 'icon-btn', html: icon('heart'), onclick: () => go('us') }),
      el('button', { class: 'icon-btn', html: icon('add'), onclick: () => go('studio-new') }),
    ]),
  ]);
  view.append(header);

  // Filtros + carpetas.
  let filter = ctx.params.filter || 'all';
  let activeFolder = null;
  const filterBar = el('div', { class: 'scroll-x', style: { marginTop: '6px' } });
  const filters = [['all', t('gallery.all')], ['received', t('gallery.received')], ['mine', t('gallery.mine')], ['drafts', 'Borradores'], ['favorites', t('gallery.favorites')], ['secret', 'Secretos']];
  filters.forEach(([id, label]) => filterBar.append(el('button', { class: 'chip' + (id === filter ? ' active' : ''), text: label, dataset: { f: id }, onclick: () => { filter = id; activeFolder = null; syncChips(); renderFeed(); } })));
  view.append(filterBar);
  // El chip de borradores muestra cuántos hay pendientes.
  db.all('drawings').then((all) => {
    const n = all.filter((d) => d.draft && !d.sent).length;
    const chip = filterBar.querySelector('[data-f="drafts"]');
    if (chip && n) chip.textContent = `Borradores · ${n}`;
  });
  function syncChips() { filterBar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.f === filter)); }

  // Vista previa dinámica: los recuerdos cobran vida — miniaturas que van
  // cambiando solas, en orden aleatorio, con fundidos suaves y paneo lento.
  const liveWrap = el('div');
  const foldersWrap = el('div');
  const feedWrap = el('div', { class: 'inbox-feed' });
  view.append(liveWrap, foldersWrap, feedWrap);

  let liveTimer = null;
  await renderLive();
  await renderFolders();
  await renderFeed();

  const offs = [
    bus.on('gallery:refresh', () => { renderLive(); renderFolders(); renderFeed(); }),
    bus.on('shared:list', () => renderFeed()),
  ];
  return { leave: () => { clearInterval(liveTimer); offs.forEach((o) => o()); } };

  // ---------- Recuerdos vivos ----------
  async function renderLive() {
    clearInterval(liveTimer);
    liveWrap.innerHTML = '';
    const drawings = (await db.allByIndex('drawings', 'updatedAt', 'prev')).filter((d) => d.thumb && !(d.secret && !d.revealed && (d.owner === 'partner' || d.received)));
    if (drawings.length < 2) return; // con 0-1 dibujos no hay rotación que mostrar
    const panel = el('div', { class: 'memories-live' });
    const imgA = el('img', { alt: '' });
    const imgB = el('img', { alt: '' });
    const caption = el('div', { class: 'ml-caption' }, [el('div', {}, [el('div', { class: 'ml-title' }), el('div', { class: 'ml-sub' })]), null]);
    const badge = el('div', { class: 'ml-badge', html: icon('heart') + '<span>Sus recuerdos</span>' });
    panel.append(imgA, imgB, badge, caption);
    liveWrap.append(panel);

    let current = null;         // dibujo mostrado
    let front = imgA;           // capa visible
    const pickNext = () => {
      const pool = drawings.filter((d) => d !== current);
      return pool[Math.floor(Math.random() * pool.length)] || drawings[0];
    };
    const show = (d) => {
      const back = front === imgA ? imgB : imgA;
      back.src = d.thumb;
      // reinicia el Ken Burns de la capa entrante
      back.classList.remove('show'); void back.offsetWidth;
      back.classList.add('show');
      front.classList.remove('show');
      front = back; current = d;
      caption.querySelector('.ml-title').textContent = d.title || t('studio.untitled');
      const who = (d.owner === 'partner' || d.received) ? store.get().partner.name : store.get().profile.name;
      caption.querySelector('.ml-sub').textContent = `${who} · ${fmtDate(d.updatedAt || d.createdAt, getLang())}`;
    };
    show(pickNext());
    liveTimer = setInterval(() => { if (!document.hidden) show(pickNext()); }, 3800);
    panel.onclick = () => { if (current) openDrawing(current); };
  }

  // ---------- Carpetas ----------
  async function renderFolders() {
    const folders = await db.all('folders');
    foldersWrap.innerHTML = '';
    const title = el('div', { class: 'section-title', text: t('gallery.folders') });
    title.append(el('button', { class: 'more', text: '+ ' + t('gallery.newFolder'), onclick: newFolder }));
    foldersWrap.append(title);
    const scroll = el('div', { class: 'scroll-x' });
    scroll.append(el('button', { class: 'chip' + (activeFolder === null ? ' active' : ''), text: t('gallery.all'), onclick: () => { activeFolder = null; syncFolderChips(); renderFeed(); } }));
    folders.forEach((f) => scroll.append(el('button', { class: 'chip' + (activeFolder === f.id ? ' active' : ''), dataset: { fid: f.id }, text: f.name, onclick: () => { activeFolder = f.id; syncFolderChips(); renderFeed(); }, oncontextmenu: (e) => { e.preventDefault(); folderMenu(f); } })));
    foldersWrap.append(scroll);
    function syncFolderChips() { scroll.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', (c.dataset.fid || null) === activeFolder)); }
  }
  async function newFolder() {
    const name = await promptDialog({ title: t('gallery.newFolder'), placeholder: 'Recuerdos, Retos…' });
    if (!name) return;
    await db.put('folders', { id: uid('folder'), name, createdAt: Date.now() });
    renderFolders();
  }
  function folderMenu(f) {
    const body = el('div');
    const s = sheet(f.name, body);
    body.append(
      el('button', { class: 'btn btn-ghost btn-block', style: { marginBottom: '8px' }, text: t('common.rename'), onclick: async () => { const n = await promptDialog({ title: t('common.rename'), value: f.name }); if (n) { f.name = n; await db.put('folders', f); s.close(); renderFolders(); } } }),
      el('button', { class: 'btn btn-soft btn-block', html: icon('trash') + ' ' + t('common.delete'), onclick: async () => { await db.del('folders', f.id); s.close(); if (activeFolder === f.id) activeFolder = null; renderFolders(); renderFeed(); } }),
    );
  }

  // ---------- Feed ----------
  async function renderFeed() {
    let drawings = await db.allByIndex('drawings', 'updatedAt', 'prev');
    // Une los compartidos remotos que aún no están en local.
    for (const r of (fb.getShared?.() || [])) {
      if (!drawings.some((d) => d.id === r.id)) drawings.push({ ...r, remote: true, owner: r.by === fb.user?.uid ? 'me' : 'partner', received: r.by !== fb.user?.uid });
    }
    drawings.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    if (filter === 'favorites') drawings = drawings.filter((d) => d.favorite);
    if (filter === 'drafts') drawings = drawings.filter((d) => d.draft && !d.sent);
    if (filter === 'received') drawings = drawings.filter((d) => d.owner === 'partner' || d.received);
    if (filter === 'mine') drawings = drawings.filter((d) => d.owner !== 'partner' && !d.received);
    if (filter === 'secret') drawings = drawings.filter((d) => d.secret);
    if (activeFolder) drawings = drawings.filter((d) => d.folderId === activeFolder);

    feedWrap.innerHTML = '';
    if (!drawings.length) {
      feedWrap.append(el('div', { class: 'empty' }, [
        el('div', { class: 'empty-icon', html: icon('image') }),
        el('div', { style: { fontWeight: 700 }, text: t('gallery.empty') }),
        el('div', { text: t('gallery.emptySub') }),
        el('button', { class: 'btn btn-primary', style: { marginTop: '8px' }, html: icon('add') + ' ' + t('gallery.newDrawing'), onclick: () => go('studio-new') }),
      ]));
      return;
    }
    drawings.forEach((d, i) => {
      const card = feedCard(d);
      card.style.animationDelay = Math.min(i * 60, 360) + 'ms';
      feedWrap.append(card);
    });
  }

  function feedCard(d) {
    const isPartner = d.owner === 'partner' || d.received;
    const who = isPartner ? store.get().partner.name : store.get().profile.name;
    // Los dibujos secretos aparecen en el Inbox pero SIEMPRE velados hasta
    // que cada persona los toca (también quien los envió).
    const revealedSet = new Set(JSON.parse(localStorage.getItem('dibujo.revealed') || '[]'));
    const hidden = d.secret && !revealedSet.has(d.id);
    const card = el('article', { class: 'inbox-card ' + (isPartner ? 'from-her' : 'from-me') });

    // Autor + fecha.
    card.append(el('div', { class: 'ic-head' }, [
      el('span', { class: 'ic-author' }, [el('i', { class: 'ic-dot' }), who]),
      el('span', { class: 'ic-date', text: `${fmtDate(d.updatedAt || d.createdAt, getLang())} · ${fmtTime(d.updatedAt || d.createdAt)}` }),
    ]));

    // Imagen (o velo de secreto).
    const media = el('div', { class: 'ic-media' });
    if (d.thumb) media.append(el('img', { src: d.thumb, alt: d.title || '' }));
    if (hidden) {
      media.append(el('button', { class: 'ic-secret' }, [
        el('span', { class: 'ic-secret-icon', html: icon('secret') }),
        el('span', { class: 'ic-secret-t', text: 'Dibujo secreto' }),
        el('span', { class: 'ic-secret-s', text: 'Toca para revelar' }),
      ]));
    }
    card.append(media);

    // Pie: título + acciones.
    const rx = Object.entries(d.reactions || {}).filter(([, n]) => n > 0).map(([e, n]) => `${e} ${n}`).join('  ');
    const foot = el('div', { class: 'ic-foot' }, [
      el('div', { class: 'ic-info' }, [
        el('div', { class: 'ic-title', text: d.title || t('studio.untitled') }),
        rx ? el('div', { class: 'ic-rx', text: rx }) : null,
      ]),
      el('div', { class: 'ic-actions' }, [
        d.recording?.ops?.length ? el('button', { class: 'ic-act', html: icon('play'), 'aria-label': 'Ver proceso', onclick: (e) => { e.stopPropagation(); openPlayer({ doc: d.doc, recording: d.recording, title: d.title }); } }) : null,
        el('button', { class: 'ic-act' + (d.favorite ? ' fav' : ''), html: icon('heart'), 'aria-label': 'Favorito', onclick: async (e) => { e.stopPropagation(); d.favorite = !d.favorite; e.currentTarget.classList.toggle('fav', d.favorite); if (!d.remote) await db.put('drawings', d); else fb.patchSharedDrawing?.(d.id, { favorite: d.favorite }); } }),
        el('button', { class: 'ic-act', html: icon('more'), 'aria-label': 'Más', onclick: (e) => { e.stopPropagation(); cardMenu(d); } }),
      ]),
    ]);
    card.append(foot);

    card.onclick = async () => {
      if (d.secret && !d.revealed) return revealSecret(d, card);
      openDrawing(d);
    };
    let lp; card.addEventListener('pointerdown', () => { lp = setTimeout(() => cardMenu(d), 520); });
    card.addEventListener('pointerup', () => clearTimeout(lp));
    card.addEventListener('pointermove', () => clearTimeout(lp));
    card.oncontextmenu = (e) => { e.preventDefault(); cardMenu(d); };
    return card;
  }

  // Revelado del dibujo secreto — desenfoque → nitidez con destello.
  async function revealSecret(d, card) {
    const veil = card.querySelector('.ic-secret');
    card.classList.add('revealing');
    veil?.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: 700, easing: 'cubic-bezier(0.22,1,0.36,1)', fill: 'forwards' });
    const img = card.querySelector('.ic-media img');
    img?.animate([{ filter: 'blur(26px) saturate(0.6)', transform: 'scale(1.06)' }, { filter: 'blur(0px) saturate(1)', transform: 'scale(1)' }], { duration: 900, easing: 'cubic-bezier(0.22,1,0.36,1)' });
    import('../core/sounds.js').then((m) => m.playFx('love'));
    // Revelado local: cada quien lo abre manualmente en su dispositivo.
    const rev = new Set(JSON.parse(localStorage.getItem('dibujo.revealed') || '[]'));
    rev.add(d.id); localStorage.setItem('dibujo.revealed', JSON.stringify([...rev]));
    d.revealed = true;
    if (!d.remote) await db.put('drawings', d);
    setTimeout(() => { veil?.remove(); card.classList.remove('revealing'); }, 750);
  }

  async function openDrawing(d) {
    const isPartner = d.owner === 'partner' || d.received;
    // Lo de tu pareja solo se puede VER (nunca modificar); lo enviado queda
    // sellado salvo que se haya marcado "Editable después".
    if (isPartner || (d.sent && !d.editableAfter)) return openViewer(d, isPartner);
    if (d.remote && !(await db.get('drawings', d.id))) {
      // Descarga el documento completo del espacio privado antes de editar.
      try {
        const full = await fb.fetchSharedDrawing(d);
        await db.put('drawings', { id: d.id, title: d.title, createdAt: d.createdAt, updatedAt: Date.now(), thumb: d.thumb, doc: full.doc, recording: full.recording, favorite: d.favorite, reactions: d.reactions || {}, comments: d.comments || [], owner: 'partner', received: true, secret: d.secret, revealed: true });
      } catch { toast('No se pudo descargar el dibujo'); return; }
    }
    go('studio', { id: d.id });
  }

  // Visor de solo lectura — imagen grande + proceso + duplicar como copia propia.
  function openViewer(d, isPartner) {
    const body = el('div');
    const sh = sheet(d.title || t('studio.untitled'), body);
    body.append(el('img', { src: d.thumb, style: { width: '100%', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-md)' } }));
    body.append(el('p', { style: { color: 'var(--text-3)', fontSize: '0.78rem', textAlign: 'center', margin: '10px 0' }, text: isPartner ? 'Dibujo de tu pareja — solo lectura' : 'Ya fue enviado — quedó sellado con amor' }));
    const acts = el('div', { class: 'grid-2', style: { gap: '8px' } });
    if (d.recording?.ops?.length) acts.append(el('button', { class: 'btn btn-ghost', html: icon('play') + ' Ver proceso', onclick: () => openPlayer({ doc: d.doc, recording: d.recording, title: d.title }) }));
    acts.append(el('button', { class: 'btn btn-ghost', html: icon('dup') + ' Duplicar como mío', onclick: async () => {
      const copy = { ...structuredClone(d), id: uid('draw'), title: (d.title || 'Dibujo') + ' (copia)', createdAt: Date.now(), updatedAt: Date.now(), owner: 'me', received: false, sent: false, secret: false, favorite: false };
      await db.put('drawings', copy); sh.close(); renderFeed(); toast('Copia creada — esa sí es tuya');
    } }));
    body.append(acts);
  }

  async function cardMenu(d) {
    const body = el('div');
    const s = sheet(d.title || t('studio.untitled'), body);
    const item = (ic, label, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { s.close(); fn(); } }, [el('div', { class: 'r-ic', html: icon(ic) }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })])]);
    body.append(
      item('pen', t('common.edit'), () => openDrawing(d)),
      item('play', t('studio.play'), () => openPlayer({ doc: d.doc, recording: d.recording, title: d.title })),
      item('chat', 'Comentarios y reacciones', () => openComments(d)),
      item('paper', 'Mover a carpeta', () => moveToFolder(d)),
      item('send', 'Enviar a mi pareja', async () => { const { sendDrawingToPartner } = await import('./chat.js'); await sendDrawingToPartner(d); toast(t('toast.sent')); }),
      item('secret', 'Enviar como secreto', async () => { const { sendDrawingToPartner } = await import('./chat.js'); await sendDrawingToPartner(d, { secret: true }); toast('Enviado en secreto'); }),
      item('dup', t('common.duplicate'), async () => { const copy = { ...structuredClone(d), id: uid('draw'), title: (d.title || 'Dibujo') + ' copia', createdAt: Date.now(), updatedAt: Date.now(), favorite: false }; await db.put('drawings', copy); renderFeed(); }),
      item('image', 'Descargar', () => { if (d.thumb) { const a = el('a', { href: d.thumb, download: (d.title || 'dibujo') + '.png' }); document.body.append(a); a.click(); a.remove(); toast('Descargado'); } }),
      item('trash', t('common.delete'), async () => { if (await confirmDialog({ title: t('common.delete'), message: '¿Eliminar este dibujo?', danger: true })) { await db.del('drawings', d.id); renderFeed(); } }),
    );
  }
  async function moveToFolder(d) {
    const folders = await db.all('folders');
    const body = el('div');
    const s = sheet('Mover a carpeta', body);
    body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: async () => { d.folderId = null; await db.put('drawings', d); s.close(); renderFeed(); } }, [el('div', { class: 'r-ic', html: icon('paper') }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Sin carpeta' })])]));
    folders.forEach((f) => body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: async () => { d.folderId = f.id; await db.put('drawings', d); s.close(); renderFeed(); toast('Movido a ' + f.name); } }, [el('div', { class: 'r-ic', html: icon('paper') }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: f.name })])])));
    if (!folders.length) body.append(el('p', { style: { color: 'var(--text-2)', textAlign: 'center' }, text: 'Crea una carpeta primero' }));
  }
}

// Comentarios + reacciones (compartidos, guardados en el dibujo).
export function openComments(d) {
  const body = el('div');
  const s = sheet(d.title || t('studio.untitled'), body);
  d.reactions = d.reactions || {}; d.comments = d.comments || [];
  const reactions = ['❤️', '😍', '🥰', '👏', '🔥', '😮', '🎨'];
  const rWrap = el('div', { class: 'scroll-x', style: { marginBottom: '12px' } });
  reactions.forEach((r) => { const count = d.reactions[r] || 0; const b = el('button', { class: 'chip' + (count ? ' active' : ''), text: `${r} ${count || ''}`, onclick: async () => { d.reactions[r] = (d.reactions[r] || 0) + 1; if (!d.remote) await db.put('drawings', d); else fb.patchSharedDrawing?.(d.id, { reactions: d.reactions }); b.textContent = `${r} ${d.reactions[r]}`; b.classList.add('active'); } }); rWrap.append(b); });
  body.append(rWrap);
  const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40vh', overflow: 'auto' } });
  const renderComments = () => { list.innerHTML = ''; if (!d.comments.length) list.append(el('p', { style: { color: 'var(--text-3)', textAlign: 'center', padding: '10px' }, text: 'Sin comentarios aún' })); d.comments.forEach((c) => list.append(el('div', { class: 'bubble ' + (c.from === 'me' ? 'me' : 'them'), style: { maxWidth: '100%' } }, [c.text, el('span', { class: 'time', text: timeAgo(c.ts, t) })]))); };
  renderComments();
  body.append(list);
  const input = el('input', { class: 'input', placeholder: 'Escribe un comentario…', style: { marginTop: '10px' } });
  const send = el('button', { class: 'btn btn-primary', html: icon('send'), onclick: async () => { const txt = input.value.trim(); if (!txt) return; d.comments.push({ id: uid('c'), text: txt, from: 'me', ts: Date.now() }); if (!d.remote) await db.put('drawings', d); else fb.patchSharedDrawing?.(d.id, { comments: d.comments }); input.value = ''; renderComments(); list.scrollTop = list.scrollHeight; } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send.click(); });
  body.append(el('div', { style: { display: 'flex', gap: '8px' } }, [el('div', { style: { flex: 1 } }, [input]), send]));
}
