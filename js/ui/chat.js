// ============================================================
// Chat de pareja — responder, editar, eliminar, reaccionar,
// fijar mensajes, escribiendo…, en línea, últ. conexión,
// enviado/entregado/leído, fotos, GIF, stickers, dibujos y
// audios compactos. Sincronizado en tiempo real.
// ============================================================
import { el, $, uid, fmtTime, timeAgo, blobToDataURL } from '../core/utils.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { sync } from '../core/sync.js';
import { fb } from '../core/firebase.js';
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { sheet, toast, sound, confirmDialog, promptDialog } from '../core/ui.js';
import { searchGifs } from '../media/klipy.js';
import { go } from '../core/router.js';

let unread = 0;
let replyTarget = null; // mensaje al que se responde

export async function renderChat(ctx) {
  const root = ctx.root;
  unread = 0; updateBadge();
  const p = store.get().partner;
  const wrap = el('div', { class: 'chat-wrap view' });
  const head = el('div', { class: 'chat-head' }, [
    el('button', { class: 'icon-btn', html: icon('back'), onclick: () => go('home') }),
    avatarEl(p),
    el('div', { class: 'who' }, [el('div', { class: 'n', text: p.name }), presenceEl()]),
    el('button', { class: 'icon-btn', html: icon('heart'), onclick: () => go('us') }),
  ]);
  const pinned = el('div', { class: 'chat-pinned', hidden: true });
  const scroll = el('div', { class: 'chat-scroll', id: 'chat-scroll' });
  const replyBar = el('div', { class: 'chat-replybar', hidden: true });
  const input = buildInput(scroll, replyBar);
  wrap.append(head, pinned, scroll, replyBar, input);
  root.append(wrap);

  await loadMessages(scroll, pinned);

  const offs = [
    // Mensajes entrantes en tiempo real.
    sync.on('message', async (m) => {
      m.state = 'read';
      await db.put('messages', m);
      appendMessage(scroll, m, true);
      renderPinned(pinned);
      sound('receive');
    }),
    // Ediciones/eliminaciones/reacciones remotas.
    bus.on('sync:messageChange', async ({ msg }) => {
      if (!msg?.id) return;
      await db.put('messages', msg);
      await loadMessages(scroll, pinned);
    }),
    sync.on('typing', () => showTyping(scroll)),
    bus.on('store:partner', () => {
      const pe = wrap.querySelector('.chat-head .who');
      if (pe) { pe.querySelector('.n').textContent = store.get().partner.name; pe.querySelector('.s').replaceWith(presenceEl()); }
    }),
  ];
  return { leave: () => offs.forEach((o) => o()) };
}

function avatarEl(p) {
  const a = el('div', { class: 'avatar', style: p.color ? { background: p.color } : {} });
  if (p.avatar) a.append(el('img', { src: p.avatar })); else a.textContent = (p.name || '?')[0].toUpperCase();
  return a;
}
function presenceEl() {
  const p = store.get().partner;
  if (p.drawing) return el('div', { class: 's', text: '🎨 dibujando…' });
  if (p.online) return el('div', { class: 's', text: '● ' + t('chat.online') });
  return el('div', { class: 's off', text: t('chat.lastSeen') + ' ' + timeAgo(p.lastSeen, t) });
}

async function loadMessages(scroll, pinned) {
  const msgs = (await db.allByIndex('messages', 'ts', 'next')).filter((m) => !m.deleted);
  scroll.innerHTML = '';
  if (!msgs.length) scroll.append(el('div', { class: 'empty' }, [el('div', { class: 'em-emoji', text: '💌' }), el('div', { text: 'Comienza la conversación con tu amor' })]));
  msgs.forEach((m) => appendMessage(scroll, m, false));
  renderPinned(pinned);
  scroll.scrollTop = scroll.scrollHeight;
}

async function renderPinned(pinned) {
  if (!pinned) return;
  const msgs = (await db.all('messages')).filter((m) => m.pinned && !m.deleted).sort((a, b) => b.ts - a.ts);
  pinned.hidden = !msgs.length;
  pinned.innerHTML = '';
  if (msgs.length) {
    const m = msgs[0];
    pinned.append(el('span', { text: '📌' }), el('span', { class: 'cp-text', text: m.text || (m.type === 'drawing' ? 'Un dibujo' : m.type) }),
      el('button', { class: 'cp-x', text: '✕', onclick: async () => { m.pinned = false; await db.put('messages', m); fb.patchSharedMessage?.(m.id, { pinned: false }); renderPinned(pinned); } }));
  }
}

function bubbleContent(bubble, m) {
  if (m.replyTo) {
    bubble.append(el('div', { class: 'bq' }, [el('div', { class: 'bq-name', text: m.replyTo.from === 'me' ? store.get().profile.name : store.get().partner.name }), el('div', { class: 'bq-text', text: m.replyTo.text || m.replyTo.type })]));
  }
  if (m.type === 'text') bubble.append(el('span', { text: m.text }));
  else if (m.type === 'image' || m.type === 'gif') {
    if ((m.src || '').startsWith('data:video')) bubble.append(el('video', { src: m.src, controls: true, playsinline: true, style: { maxWidth: '200px', borderRadius: 'var(--r-md)' } }));
    else bubble.append(el('img', { src: m.src, style: { maxWidth: '200px' } }));
  }
  else if (m.type === 'sticker' || m.type === 'emoji') bubble.append(el('div', { style: { fontSize: '3rem' }, text: m.text }));
  else if (m.type === 'drawing') { const im = el('img', { src: m.thumb, style: { maxWidth: '200px', cursor: 'pointer' } }); im.onclick = () => m.drawingId && go('studio', { id: m.drawingId }); bubble.append(im); if (m.text) bubble.append(el('div', { text: m.text })); }
  else if (m.type === 'audio') bubble.append(audioBubble(m));
  const time = el('span', { class: 'time' });
  time.append(document.createTextNode((m.edited ? 'editado · ' : '') + fmtTime(m.ts)));
  if (m.from === 'me') {
    const ticks = el('span', { class: 'ticks', text: m.state === 'sent' ? '✓' : '✓✓' });
    if (m.state === 'read') ticks.style.color = '#8fd0ff';
    time.append(' ', ticks);
  }
  bubble.append(time);
  // Reacciones.
  const rx = Object.entries(m.reactions || {}).filter(([, v]) => v);
  if (rx.length) bubble.append(el('div', { class: 'b-rx', text: rx.map(([e]) => e).join(' ') }));
}

// Audio compacto con onda y play propio (nada de <audio controls>).
function audioBubble(m) {
  const wrap = el('div', { class: 'audio-bubble' });
  const btn = el('button', { class: 'ab-play', text: '▶' });
  const wave = el('div', { class: 'ab-wave' }, Array.from({ length: 24 }, (_, i) => el('i', { style: { height: 4 + ((i * 7919) % 14) + 'px' } })));
  const dur = el('span', { class: 'ab-dur', text: '· audio' });
  wrap.append(btn, wave, dur);
  let audio;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (!audio) { audio = new Audio(m.src); audio.onended = () => { btn.textContent = '▶'; wave.classList.remove('playing'); }; audio.ontimeupdate = () => { dur.textContent = Math.floor(audio.currentTime) + 's'; }; }
    if (audio.paused) { audio.play(); btn.textContent = '⏸'; wave.classList.add('playing'); }
    else { audio.pause(); btn.textContent = '▶'; wave.classList.remove('playing'); }
  };
  return wrap;
}

function appendMessage(scroll, m, animate) {
  const emptyEl = scroll.querySelector('.empty'); if (emptyEl) emptyEl.remove();
  const mine = m.from === 'me';
  const bubble = el('div', { class: 'bubble ' + (mine ? 'me' : 'them') + (animate ? ' pop-in' : ''), dataset: { mid: m.id } });
  bubbleContent(bubble, m);
  if (!animate) bubble.style.animation = 'none';
  // Mantener presionado → acciones del mensaje.
  let lp;
  bubble.addEventListener('pointerdown', () => { lp = setTimeout(() => messageActions(m, scroll), 480); });
  bubble.addEventListener('pointerup', () => clearTimeout(lp));
  bubble.addEventListener('pointermove', () => clearTimeout(lp));
  bubble.oncontextmenu = (e) => { e.preventDefault(); messageActions(m, scroll); };
  const typing = scroll.querySelector('.typing'); if (typing) typing.remove();
  scroll.append(bubble);
  scroll.scrollTop = scroll.scrollHeight;
}

// ---------- Acciones: responder, reaccionar, editar, fijar, eliminar ----------
function messageActions(m, scroll) {
  if (navigator.vibrate) navigator.vibrate(10);
  const body = el('div');
  const s = sheet(null, body);
  // Fila de reacciones rápidas.
  const rx = el('div', { class: 'rx-row' });
  ['❤️', '😂', '😮', '🥺', '🔥', '👍'].forEach((e) => rx.append(el('button', { class: 'rx-btn', text: e, onclick: async () => {
    m.reactions = m.reactions || {};
    m.reactions[e] = !m.reactions[e];
    await db.put('messages', m);
    fb.patchSharedMessage?.(m.id, { reactions: m.reactions });
    s.close(); refreshBubble(scroll, m);
  } })));
  body.append(rx);
  const item = (emoji, label, fn, danger) => el('button', { class: 'row tappable', style: { width: '100%', color: danger ? '#d66' : '' }, onclick: () => { s.close(); fn(); } }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })])]);
  body.append(item('↩️', 'Responder', () => { replyTarget = m; showReplyBar(); }));
  if (m.from === 'me' && m.type === 'text') body.append(item('✏️', 'Editar', async () => {
    const txt = await promptDialog({ title: 'Editar mensaje', value: m.text });
    if (txt != null && txt !== m.text) { m.text = txt; m.edited = true; await db.put('messages', m); fb.patchSharedMessage?.(m.id, { text: txt, edited: true }); refreshBubble(scroll, m); }
  }));
  body.append(item(m.pinned ? '📌' : '📍', m.pinned ? 'Desfijar' : 'Fijar', async () => {
    m.pinned = !m.pinned; await db.put('messages', m); fb.patchSharedMessage?.(m.id, { pinned: m.pinned });
    renderPinned($('.chat-pinned')); toast(m.pinned ? '📌 Fijado' : 'Desfijado');
  }));
  if (m.type === 'text') body.append(item('📋', 'Copiar', () => { navigator.clipboard?.writeText(m.text); toast('Copiado ✓'); }));
  if (m.from === 'me') body.append(item('🗑️', 'Eliminar', async () => {
    if (!(await confirmDialog({ title: 'Eliminar mensaje', danger: true }))) return;
    m.deleted = true; await db.put('messages', m); fb.patchSharedMessage?.(m.id, { deleted: true });
    scroll.querySelector(`[data-mid="${m.id}"]`)?.remove();
  }, true));
}

function refreshBubble(scroll, m) {
  const node = scroll.querySelector(`[data-mid="${m.id}"]`);
  if (!node) return;
  node.innerHTML = '';
  bubbleContent(node, m);
}

function showTyping(scroll) {
  if (scroll.querySelector('.typing')) return;
  const typing = el('div', { class: 'typing' }, [el('i'), el('i'), el('i')]);
  scroll.append(typing); scroll.scrollTop = scroll.scrollHeight;
  setTimeout(() => typing.remove(), 3500);
}

function showReplyBar() {
  const bar = $('.chat-replybar'); if (!bar || !replyTarget) return;
  bar.hidden = false;
  bar.innerHTML = '';
  bar.append(el('span', { text: '↩️' }), el('span', { class: 'cp-text', text: replyTarget.text || replyTarget.type }),
    el('button', { class: 'cp-x', text: '✕', onclick: () => { replyTarget = null; bar.hidden = true; } }));
  $('.chat-input input')?.focus();
}

function buildInput(scroll, replyBar) {
  const bar = el('div', { class: 'chat-input' });
  const plus = el('button', { class: 'icon-btn', html: icon('plus'), onclick: () => openAttach(scroll) });
  const field = el('input', { class: 'input grow', placeholder: t('chat.placeholder') });
  const emojiBtn = el('button', { class: 'icon-btn', html: icon('emoji'), onclick: () => quickEmoji(field) });
  const micBtn = el('button', { class: 'icon-btn', html: icon('mic'), onclick: () => recordVoice(scroll) });
  const sendBtn = el('button', { class: 'icon-btn active send-btn', html: icon('send'), onclick: send });
  bar.append(plus, field, emojiBtn, micBtn, sendBtn);
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  let typingTmr; field.addEventListener('input', () => { clearTimeout(typingTmr); typingTmr = setTimeout(() => sync.send('typing', {}), 150); });
  function send() {
    const txt = field.value.trim(); if (!txt) return;
    const m = { id: uid('msg'), ts: Date.now(), from: 'me', type: 'text', text: txt, state: 'sent' };
    if (replyTarget) { m.replyTo = { id: replyTarget.id, from: replyTarget.from, text: replyTarget.text, type: replyTarget.type }; replyTarget = null; replyBar.hidden = true; }
    field.value = '';
    sendBtn.classList.add('sending'); setTimeout(() => sendBtn.classList.remove('sending'), 400);
    commitOutgoing(scroll, m);
  }
  return bar;
}

async function commitOutgoing(scroll, m) {
  await db.put('messages', m);
  appendMessage(scroll, m, true);
  sync.send('message', { ...m, from: 'them' });
  sound('send');
  setTimeout(() => updateState(scroll, m.id, 'delivered'), 700);
  // "Leído" real cuando la pareja está en línea; simulado en modo local.
  const wait = store.get().partner.online ? 1500 : 2600;
  setTimeout(() => updateState(scroll, m.id, 'read'), wait);
  if (!fb.coupleId && !store.get().partner.online) simulateReply(scroll, m);
}
async function updateState(scroll, id, state) {
  const m = await db.get('messages', id); if (!m) return;
  m.state = state; await db.put('messages', m);
  refreshBubble(scroll, m);
}
const replies = ['¡Me encanta! 🥰', '😍😍😍', 'Qué bonito, mi amor 💕', 'Jajaja 💗', 'Te quiero muchísimo 🌸', 'Dibujemos algo juntos 🎨', '¡Sí! 💖', 'Mi persona favorita ✨'];
function simulateReply(scroll, srcMsg) {
  setTimeout(() => showTyping(scroll), 1200);
  setTimeout(async () => {
    const m = { id: uid('msg'), ts: Date.now(), from: 'them', type: 'text', text: replies[Math.floor(Math.random() * replies.length)], state: 'read' };
    await db.put('messages', m); appendMessage(scroll, m, true); sound('receive');
  }, 2600);
}

function quickEmoji(field) {
  const body = el('div');
  const grid = el('div', { class: 'emoji-grid' });
  '❤️😍🥰😘😊🥺😎🤗😇😜😂🥳💗💖💕💞💌🌸🌺🌷🌹✨⭐🔥🌈🍓🍰🧁🎀🎁🐻🐰🐱🦄🕊️💐'.match(/./gu).forEach((e) => grid.append(el('button', { text: e, onclick: () => { field.value += e; field.focus(); } })));
  body.append(grid); sheet('Emojis', body);
}

function openAttach(scroll) {
  const body = el('div', { class: 'grid-auto' });
  const s = sheet('Enviar', body);
  const opt = (emoji, label, fn) => el('button', { class: 'tile', style: { padding: '18px', textAlign: 'center' }, onclick: fn }, [el('div', { style: { fontSize: '1.8rem' }, text: emoji }), el('div', { class: 'meta', html: `<div class="t">${label}</div>` })]);
  body.append(
    opt('🖼️', 'Foto', () => { s.close(); pickFile('image/*', (src) => commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'image', src, state: 'sent' })); }),
    opt('🎬', 'Video', () => { s.close(); pickFile('video/*', (src) => commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'image', src, state: 'sent' })); }),
    opt('🎞️', 'GIF', () => { s.close(); openGifPicker(scroll); }),
    opt('🎨', 'Dibujo', () => { s.close(); openDrawingPicker(scroll); }),
    opt('✍️', 'Mini dibujo', () => { s.close(); openMiniSketch(scroll); }),
    opt('🌈', 'Sticker', () => { s.close(); openSticker(scroll); }),
  );
}
function openGifPicker(scroll) {
  const body = el('div');
  const input = el('input', { class: 'input', placeholder: 'Buscar GIFs…', value: 'bear love' });
  const grid = el('div', { class: 'gif-grid', style: { marginTop: '10px' } });
  body.append(input, grid); const s = sheet('GIFs', body);
  const load = async (q) => { grid.innerHTML = '<div class="sk" style="height:90px"></div>'.repeat(6); const res = await searchGifs(q || 'bear love'); grid.innerHTML = ''; res.forEach((g) => grid.append(el('img', { src: g.preview, onclick: () => { commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'gif', src: g.url, state: 'sent' }); s.close(); } }))); if (!res.length) grid.append(el('p', { style: { gridColumn: '1/-1', color: 'var(--text-2)' }, text: 'Sin resultados' })); };
  let tmr; input.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => load(input.value.trim()), 400); };
  load('bear love'); // siempre inicia con "bear love" 🐻
}
async function openDrawingPicker(scroll) {
  const drawings = await db.allByIndex('drawings', 'updatedAt', 'prev');
  const body = el('div', { class: 'grid-2' }); const s = sheet('Enviar dibujo', body);
  if (!drawings.length) body.append(el('p', { style: { color: 'var(--text-2)' }, text: 'Aún no tienes dibujos.' }));
  drawings.forEach((d) => body.append(el('div', { class: 'tile', onclick: async () => { await sendDrawingToPartner(d); s.close(); toast(t('toast.sent'), { icon: '💌' }); go('chat'); } }, [el('div', { class: 'thumb' }, [el('img', { src: d.thumb })]), el('div', { class: 'meta', html: `<div class="t">${d.title || ''}</div>` })])));
}
// Mini dibujo a mano dentro del chat.
function openMiniSketch(scroll) {
  const body = el('div');
  const cv = el('canvas', { width: 320, height: 240, style: { width: '100%', borderRadius: 'var(--r-md)', background: '#fff', touchAction: 'none', boxShadow: 'var(--shadow-sm)' } });
  const g = cv.getContext('2d'); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#ef92a6';
  let last = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) }; };
  cv.onpointerdown = (e) => { last = pos(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = (e) => { if (!last) return; const p = pos(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; };
  cv.onpointerup = () => last = null;
  const colors = el('div', { class: 'st-palette', style: { margin: '10px 0' } });
  ['#ef92a6', '#a98fd4', '#5a4e58', '#8fd4bb', '#f4b183'].forEach((c) => colors.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => g.strokeStyle = c })));
  const s = sheet('✍️ Mini dibujo', body);
  body.append(cv, colors, el('button', { class: 'btn btn-primary btn-block', text: 'Enviar 💌', onclick: () => { commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'image', src: cv.toDataURL(), state: 'sent' }); s.close(); } }));
}
function openSticker(scroll) {
  const body = el('div'); const grid = el('div', { class: 'emoji-grid' });
  '🐻💐🌈🦋🎀🍰🌸💖🐰🌷☕🍓🧸🎈🌙⭐🐱🌻🍭🎨💌🕊️🌼🍀🐨🐣💫🎵🪴🫧'.match(/./gu).forEach((e) => grid.append(el('button', { text: e, onclick: () => { commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'sticker', text: e, state: 'sent' }); s.close(); } })));
  body.append(grid); const s = sheet('Stickers', body);
}
function pickFile(accept, cb) {
  const inp = el('input', { type: 'file', accept, style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => { if (inp.files[0]) cb(await blobToDataURL(inp.files[0])); inp.remove(); };
  inp.click();
}
async function recordVoice(scroll) {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Grabación no disponible');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(stream); const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = async () => { stream.getTracks().forEach((tr) => tr.stop()); const blob = new Blob(chunks, { type: 'audio/webm' }); const src = await blobToDataURL(blob); commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'audio', src, state: 'sent' }); };
    rec.start();
    toast('🎙️ Grabando… toca para enviar');
    const stop = () => { rec.stop(); document.removeEventListener('pointerdown', stop, true); };
    setTimeout(() => document.addEventListener('pointerdown', stop, true), 400);
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 15000);
  } catch { toast('Permiso de micrófono denegado'); }
}

export async function sendDrawingToPartner(d) {
  const m = { id: uid('msg'), ts: Date.now(), from: 'me', type: 'drawing', drawingId: d.id, thumb: d.thumb, text: '', state: 'sent' };
  await db.put('messages', m);
  sync.send('message', { ...m, from: 'them' });
  fb.shareDrawing?.(d).catch(() => {});
}

function updateBadge() { const b = $('#chat-badge'); if (b) b.hidden = unread === 0; }
bus.on('sync:message', async () => {
  const { currentRoute } = await import('../core/router.js');
  if (currentRoute() !== 'chat') { unread++; const b = $('#chat-badge'); if (b) b.hidden = false; toast('💌 ' + store.get().partner.name); }
});
