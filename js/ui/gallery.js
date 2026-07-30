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

  // Cabecera fija con desenfoque; el título grande se encoge al desplazar.
  const header = el('header', { class: 'ibx-head' }, [
    el('div', { class: 'ibx-bar' }, [
      el('button', { class: 'icon-btn ghost', html: icon('back'), 'aria-label': 'Volver', onclick: () => go('home') }),
      el('div', { class: 'ibx-bar-title', text: 'Inbox' }),
      el('div', { class: 'ibx-acts' }, [
        el('button', { class: 'icon-btn ghost', html: icon('chat'), 'aria-label': 'Chat', onclick: () => go('chat') }),
        el('button', { class: 'icon-btn ghost', html: icon('heart'), 'aria-label': 'Nuestro espacio', onclick: () => go('us') }),
      ]),
    ]),
    el('div', { class: 'ibx-hero' }, [
      el('h1', { class: 'ibx-title', text: 'Inbox' }),
      el('p', { class: 'ibx-sub', text: 'Todo lo que se han dibujado' }),
    ]),
  ]);
  view.append(header);

  // Filtros — riel de píldoras sobre una pista hundida (se siente nativo).
  let filter = ctx.params.filter || 'all';
  let activeFolder = null;
  const filterBar = el('nav', { class: 'seg', 'aria-label': 'Filtros' });
  const filters = [['all', t('gallery.all')], ['received', t('gallery.received')], ['mine', t('gallery.mine')], ['drafts', 'Borradores'], ['favorites', t('gallery.favorites')], ['secret', 'Secretos']];
  filters.forEach(([id, label]) => filterBar.append(el('button', {
    class: 'seg-item' + (id === filter ? ' on' : ''), text: label, dataset: { f: id },
    'aria-pressed': id === filter ? 'true' : 'false',
    onclick: (e) => { filter = id; activeFolder = null; syncChips(); renderFeed(); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); },
  })));
  view.append(filterBar);
  db.all('drawings').then((all) => {
    const n = all.filter((d) => d.draft && !d.sent).length;
    const chip = filterBar.querySelector('[data-f="drafts"]');
    if (chip && n) chip.append(el('i', { class: 'seg-count', text: String(n) }));
  });
  function syncChips() {
    filterBar.querySelectorAll('.seg-item').forEach((c) => {
      const on = c.dataset.f === filter;
      c.classList.toggle('on', on); c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  // Sombra + título compacto al desplazar (sin saltos: solo clase).
  const onScroll = () => {
    const y = view.scrollTop || document.documentElement.scrollTop || 0;
    header.classList.toggle('stuck', y > 18);
  };
  view.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  // Vista previa dinámica: los recuerdos cobran vida — miniaturas que van
  // cambiando solas, en orden aleatorio, con fundidos suaves y paneo lento.
  const liveWrap = el('div');
  const foldersWrap = el('div');
  const feedWrap = el('div', { class: 'inbox-feed' });
  view.append(liveWrap, foldersWrap, feedWrap);

  let liveTimer = null;
  let introDone = false;
  await renderLive();
  await renderFolders();
  await renderFeed();

  // Botón flotante: crear siempre a un pulgar de distancia.
  const fab = el('button', { class: 'ibx-fab', html: icon('add') + '<span>Dibujar</span>', 'aria-label': 'Nuevo dibujo', onclick: () => go('studio-new') });
  view.append(fab);

  const offs = [
    // Refrescar NO reconstruye el carrusel ni las carpetas: antes se rehacía
    // todo el DOM en cada cambio y se veía como un parpadeo general.
    bus.on('gallery:refresh', () => { renderFolders(); renderFeed(); }),
    bus.on('shared:list', () => renderFeed()),
  ];
  return { leave: () => {
    clearInterval(liveTimer);
    window.removeEventListener('scroll', onScroll);
    offs.forEach((o) => o());
  } };

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
    // Ritmo calmado (antes 2.6 s: se percibía como parpadeo constante) y
    // respeta "reducir movimiento" del sistema.
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!calm) liveTimer = setInterval(() => { if (!document.hidden) show(pickNext()); }, 6000);
    panel.onclick = () => { if (current) openDrawing(current); };
  }

  // ---------- Carpetas ----------
  async function renderFolders() {
    const folders = await db.all('folders');
    foldersWrap.innerHTML = '';
    // Sin carpetas la sección entera desaparece: se crea desde el menú de la
    // tarjeta ("Mover a carpeta"). Menos ruido en pantalla.
    if (!folders.length) return;
    const title = el('div', { class: 'section-title', text: t('gallery.folders') });
    title.append(el('button', { class: 'more', text: '+ ' + t('gallery.newFolder'), onclick: newFolder }));
    foldersWrap.append(title);
    const scroll = el('div', { class: 'scroll-x' });
    // "Todas" (no "Todos"): evita duplicar el chip del filtro de arriba.
    scroll.append(el('button', { class: 'chip' + (activeFolder === null ? ' active' : ''), text: 'Todas', onclick: () => { activeFolder = null; syncFolderChips(); renderFeed(); } }));
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
      // Vacío con contexto: cada filtro explica qué falta y qué hacer.
      const EMPTY = {
        all: ['image', t('gallery.empty'), t('gallery.emptySub')],
        received: ['inbox', 'Nada recibido todavía', 'Cuando tu pareja te envíe un dibujo, aparecerá aquí.'],
        mine: ['pen', 'Aún no has dibujado', 'Tu primer trazo empieza aquí.'],
        drafts: ['paper', 'Sin borradores', 'Lo que dejes a medias se guardará aquí.'],
        favorites: ['heart', 'Sin favoritos', 'Toca el corazón de un dibujo para guardarlo aquí.'],
        secret: ['secret', 'Sin secretos', 'Envía un dibujo en secreto para sorprenderla.'],
      };
      const [ic, title, sub] = EMPTY[filter] || EMPTY.all;
      feedWrap.append(el('div', { class: 'ibx-empty' }, [
        el('div', { class: 'ibx-empty-ic', html: icon(ic) }),
        el('div', { class: 'ibx-empty-t', text: title }),
        el('div', { class: 'ibx-empty-s', text: sub }),
        el('button', { class: 'btn btn-primary', style: { marginTop: '14px' }, html: icon('add') + ' ' + t('gallery.newDrawing'), onclick: () => go('studio-new') }),
      ]));
      view.classList.add('is-empty');   // oculta el FAB: la llamada ya está aquí
      return;
    }
    // La entrada escalonada solo la primera vez: al refrescar (favorito,
    // sincronización…) las tarjetas ya no vuelven a animarse — eso se veía
    // como un parpadeo de toda la lista.
    view.classList.remove('is-empty');
    drawings.forEach((d, i) => {
      const card = feedCard(d);
      if (!introDone) { card.classList.add('enter'); card.style.animationDelay = Math.min(i * 55, 330) + 'ms'; }
      feedWrap.append(card);
    });
    introDone = true;
  }

  function feedCard(d) {
    const isPartner = d.owner === 'partner' || d.received;
    const who = isPartner ? store.get().partner.name : store.get().profile.name;
    // Los dibujos secretos aparecen en el Inbox pero SIEMPRE velados hasta
    // que cada persona los toca (también quien los envió).
    const revealedSet = new Set(JSON.parse(localStorage.getItem('dibujo.revealed') || '[]'));
    const hidden = d.secret && !revealedSet.has(d.id);
    const card = el('article', { class: 'inbox-card ' + (isPartner ? 'from-her' : 'from-me') });

    // Imagen protagonista, con velo degradado y los datos encima.
    const media = el('div', { class: 'ic-media' });
    if (d.thumb) media.append(el('img', { src: d.thumb, alt: d.title || '', loading: 'lazy', decoding: 'async' }));
    else media.append(el('div', { class: 'ic-noimg', html: icon('image') }));
    media.append(el('div', { class: 'ic-scrim' }));
    media.append(el('div', { class: 'ic-over' }, [
      el('span', { class: 'ic-author' }, [el('i', { class: 'ic-dot' }), who]),
      el('h3', { class: 'ic-title', text: d.title || t('studio.untitled') }),
    ]));
    // Distintivos: interactivo, secreto, borrador.
    const badges = el('div', { class: 'ic-badges' });
    if ((d.doc?.media || []).some((m) => m.tap)) badges.append(el('span', { class: 'ic-badge accent', html: icon('zap'), title: 'Interactivo' }));
    if (d.draft && !d.sent) badges.append(el('span', { class: 'ic-badge', text: 'Borrador' }));
    if (d.secret) badges.append(el('span', { class: 'ic-badge', html: icon('secret'), title: 'Secreto' }));
    if (badges.childNodes.length) media.append(badges);
    if (hidden) {
      media.append(el('button', { class: 'ic-secret' }, [
        el('span', { class: 'ic-secret-icon', html: icon('secret') }),
        el('span', { class: 'ic-secret-t', text: 'Dibujo secreto' }),
        el('span', { class: 'ic-secret-s', text: 'Toca para revelar' }),
      ]));
    }
    card.append(media);

    // Pie: fecha + acciones (objetivos táctiles amplios).
    const rx = Object.entries(d.reactions || {}).filter(([, n]) => n > 0).map(([e, n]) => `${e} ${n}`).join('  ');
    const foot = el('div', { class: 'ic-foot' }, [
      el('div', { class: 'ic-info' }, [
        el('div', { class: 'ic-date', text: timeAgo(d.updatedAt || d.createdAt, t) }),
        rx ? el('div', { class: 'ic-rx', text: rx }) : null,
      ]),
      el('div', { class: 'ic-actions' }, [
        d.recording?.ops?.length ? el('button', { class: 'ic-act', html: icon('play'), 'aria-label': 'Ver proceso', onclick: (e) => { e.stopPropagation(); openPlayer({ doc: d.doc, recording: d.recording, title: d.title }); } }) : null,
        el('button', { class: 'ic-act' + (d.favorite ? ' fav' : ''), html: icon('heart'), 'aria-label': 'Favorito', onclick: async (e) => { e.stopPropagation(); d.favorite = !d.favorite; e.currentTarget.classList.toggle('fav', d.favorite); if (!d.remote) await db.put('drawings', d); else fb.patchSharedDrawing?.(d.id, { favorite: d.favorite }); } }),
        el('button', { class: 'ic-act', html: icon('more'), 'aria-label': 'Más opciones', onclick: (e) => { e.stopPropagation(); cardMenu(d); } }),
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
  // Visor de solo lectura a pantalla completa: zoom por pellizco / doble toque
  // y desplazamiento con un dedo. Nunca modifica el dibujo (queda bloqueado).
  function openViewer(d, isPartner) {
    const overlay = el('div', { class: 'viewer-overlay' });
    const stage = el('div', { class: 'viewer-stage' });
    // Envoltorio con la MISMA relación de aspecto que el dibujo: así las zonas
    // interactivas caen exactamente sobre los objetos, sin bandas negras.
    const docW = d.doc?.w || 1080, docH = d.doc?.h || 1440;
    const wrap = el('div', { class: 'viewer-wrap', style: { aspectRatio: `${docW} / ${docH}` } });
    const img = el('img', { class: 'viewer-img', src: d.thumb, alt: d.title || '' });
    wrap.append(img);
    const hotspots = buildHotspots(d, docW, docH);
    if (hotspots) wrap.append(hotspots);
    stage.append(wrap);
    const top = el('div', { class: 'viewer-top' }, [
      el('button', { class: 'icon-btn', html: icon('back'), onclick: close }),
      el('div', { class: 'viewer-title', text: d.title || t('studio.untitled') }),
      el('span', { class: 'pill', html: icon('lock'), style: { gap: '5px' } }),
    ]);
    const foot = el('div', { class: 'viewer-foot' });
    if (d.recording?.ops?.length) foot.append(el('button', { class: 'btn btn-ghost btn-sm', html: icon('play') + ' Ver proceso', onclick: () => openPlayer({ doc: d.doc, recording: d.recording, title: d.title }) }));
    foot.append(el('button', { class: 'btn btn-soft btn-sm', html: icon('dup') + ' Duplicar como mío', onclick: async () => {
      const copy = { ...structuredClone(d), id: uid('draw'), title: (d.title || 'Dibujo') + ' (copia)', createdAt: Date.now(), updatedAt: Date.now(), owner: 'me', received: false, sent: false, secret: false, favorite: false };
      await db.put('drawings', copy); close(); renderFeed(); toast('Copia creada — esa sí es tuya');
    } }));
    overlay.append(stage, top, foot);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('in'));
    function close() { overlay.classList.remove('in'); setTimeout(() => overlay.remove(), 240); }

    // Transformación (pan + zoom) aplicada solo a la imagen.
    let scale = 1, tx = 0, ty = 0;
    const applyT = () => { wrap.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
    const pts = new Map(); let gesture = null, panStart = null;
    stage.addEventListener('pointerdown', (e) => {
      // Las zonas interactivas reciben su propio toque: capturar el puntero en
      // el escenario robaba el click y nunca se disparaba la reacción.
      if (e.target.closest?.('.hot-spot')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); stage.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const a = [...pts.values()]; gesture = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), s: scale, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2, tx, ty }; panStart = null; }
      else panStart = { x: e.clientX, y: e.clientY, tx, ty }; });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (gesture && pts.size >= 2) { const a = [...pts.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); scale = Math.max(1, Math.min(6, gesture.s * (d / gesture.d))); const c = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2; tx = gesture.tx + (c - gesture.cx); ty = gesture.ty + (cy - gesture.cy); applyT(); }
      else if (panStart && scale > 1) { tx = panStart.tx + (e.clientX - panStart.x); ty = panStart.ty + (e.clientY - panStart.y); applyT(); }
    });
    const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) gesture = null; };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    let lastTap = 0;
    img.addEventListener('click', () => { const now = Date.now(); if (now - lastTap < 300) { if (scale > 1) { scale = 1; tx = ty = 0; } else scale = 2.5; applyT(); } lastTap = now; });
  }

  async function cardMenu(d) {
    const body = el('div');
    const s = sheet(d.title || t('studio.untitled'), body);
    const item = (ic, label, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { s.close(); fn(); } }, [el('div', { class: 'r-ic', html: icon(ic) }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })])]);
    body.append(
      item('pen', t('common.edit'), () => openDrawing(d)),
      item('play', t('studio.play'), () => openPlayer({ doc: d.doc, recording: d.recording, title: d.title })),
      // Ver el dibujo tal y como lo recibirá tu pareja (con lo interactivo).
      item('zap', (d.doc?.media || []).some((m) => m.tap) ? 'Probar interactivo' : 'Ver como lo verá', () => openViewer(d, false)),
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

// ============================================================
// Dibujos interactivos — el que recibe puede TOCAR los objetos que el autor
// marcó y estos reaccionan: laten, giran, crecen, revelan un mensaje
// escondido, sueltan corazones o suenan.
// ============================================================
const TAP_LABEL = 'Toca los elementos que brillan';
function buildHotspots(d, docW, docH) {
  const media = (d.doc?.media || []).filter((m) => m.tap);
  if (!media.length) return null;
  const layer = el('div', { class: 'viewer-hot' });
  media.forEach((m) => {
    const spot = el('button', {
      class: 'hot-spot',
      'aria-label': 'Elemento interactivo',
      style: {
        left: (m.x / docW * 100) + '%', top: (m.y / docH * 100) + '%',
        width: (m.w / docW * 100) + '%', height: (m.h / docH * 100) + '%',
        transform: `rotate(${m.rot || 0}deg)`,
      },
    });
    spot.onclick = (e) => { e.stopPropagation(); fireTap(m, spot, layer); };
    layer.append(spot);
  });
  // Pista inicial para que se note que el dibujo es interactivo.
  const hint = el('div', { class: 'hot-hint', text: TAP_LABEL });
  layer.append(hint);
  setTimeout(() => hint.classList.add('out'), 3400);
  setTimeout(() => hint.remove(), 4000);
  return layer;
}
function fireTap(m, spot, layer) {
  const fx = m.tap;
  import('../core/sounds.js').then((s) => s.playFx(fx === 'sound' ? 'achieve' : 'tap')).catch(() => {});
  if (navigator.vibrate) navigator.vibrate(12);
  if (fx === 'beat' || fx === 'spin' || fx === 'grow') {
    spot.classList.remove('fx-beat', 'fx-spin', 'fx-grow');
    void spot.offsetWidth;                       // reinicia la animación
    spot.classList.add('fx-' + fx);
    setTimeout(() => spot.classList.remove('fx-' + fx), 900);
    return;
  }
  if (fx === 'reveal') {
    const b = el('div', { class: 'hot-msg', text: m.tapMsg || 'Te amo' });
    const r = spot.style;
    b.style.left = r.left; b.style.top = r.top;
    layer.append(b);
    requestAnimationFrame(() => b.classList.add('in'));
    setTimeout(() => { b.classList.remove('in'); setTimeout(() => b.remove(), 300); }, 2600);
    return;
  }
  if (fx === 'hearts') {
    const rect = spot.getBoundingClientRect(), lr = layer.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const h = el('i', { class: 'hot-heart' });
      h.style.left = ((rect.left - lr.left) + rect.width * (0.2 + Math.random() * 0.6)) + 'px';
      h.style.top = ((rect.top - lr.top) + rect.height * 0.5) + 'px';
      h.style.animationDelay = (i * 55) + 'ms';
      h.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      layer.append(h);
      setTimeout(() => h.remove(), 1800 + i * 55);
    }
  }
}
