// Chat — modern messaging between the two partners with presence + delivery states.
import { el, $, uid, fmtClock, fmtTime, timeAgo, blobToDataURL } from '../core/utils.js';
import { db } from '../core/db.js';
import { store } from '../core/store.js';
import { sync } from '../core/sync.js';
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { sheet, toast, sound } from '../core/ui.js';
import { searchGifs, trendingGifs } from '../media/klipy.js';
import { go } from '../core/router.js';

let unread = 0;

export async function renderChat(ctx) {
  const root = ctx.root;
  unread = 0; updateBadge();
  const p = store.get().partner;
  const wrap = el('div', { class: 'chat-wrap view' });
  const head = el('div', { class: 'chat-head' }, [
    el('button', { class: 'icon-btn', html: icon('back'), onclick: () => go('gallery') }),
    avatarEl(p),
    el('div', { class: 'who' }, [el('div', { class: 'n', text: p.name }), presenceEl()]),
    el('button', { class: 'icon-btn', html: icon('heart'), onclick: () => go('us') }),
  ]);
  const scroll = el('div', { class: 'chat-scroll', id: 'chat-scroll' });
  const input = buildInput(scroll);
  wrap.append(head, scroll, input);
  root.append(wrap);

  await loadMessages(scroll);

  // realtime receive
  const offMsg = sync.on('message', async (m) => { m.state = 'read'; await db.put('messages', m); appendMessage(scroll, m, true); sound('pop'); });
  const offTyping = sync.on('typing', () => showTyping(scroll));
  const offPresence = bus.on('store:partner', () => { const pe = $('.chat-head .who'); if (pe) { pe.querySelector('.n').textContent = store.get().partner.name; pe.querySelector('.s').replaceWith(presenceEl()); } });

  return { leave: () => { offMsg(); offTyping(); offPresence(); } };
}

function avatarEl(p) {
  const a = el('div', { class: 'avatar', style: p.color ? { background: p.color } : {} });
  if (p.avatar) a.append(el('img', { src: p.avatar })); else a.textContent = (p.name || '?')[0].toUpperCase();
  return a;
}
function presenceEl() {
  const p = store.get().partner;
  if (p.online) return el('div', { class: 's', text: '● ' + t('chat.online') });
  return el('div', { class: 's off', text: t('chat.lastSeen') + ' ' + timeAgo(p.lastSeen, t) });
}

async function loadMessages(scroll) {
  const msgs = (await db.allByIndex('messages', 'ts', 'next'));
  scroll.innerHTML = '';
  if (!msgs.length) {
    scroll.append(el('div', { class: 'empty' }, [el('div', { class: 'em-emoji', text: '💌' }), el('div', { text: 'Empieza la conversación con tu amor' })]));
  }
  msgs.forEach((m) => appendMessage(scroll, m, false));
  scroll.scrollTop = scroll.scrollHeight;
}

function appendMessage(scroll, m, animate) {
  const emptyEl = scroll.querySelector('.empty'); if (emptyEl) emptyEl.remove();
  const mine = m.from === 'me';
  const bubble = el('div', { class: 'bubble ' + (mine ? 'me' : 'them') });
  if (m.type === 'text') bubble.append(document.createTextNode(m.text));
  else if (m.type === 'image' || m.type === 'gif') bubble.append(el('img', { src: m.src, style: { maxWidth: '200px' } }));
  else if (m.type === 'sticker' || m.type === 'emoji') bubble.append(el('div', { style: { fontSize: '3rem' }, text: m.text }));
  else if (m.type === 'drawing') { const im = el('img', { src: m.thumb, style: { maxWidth: '200px', cursor: 'pointer' } }); im.onclick = () => m.drawingId && go('studio', { id: m.drawingId }); bubble.append(im); if (m.text) bubble.append(el('div', { text: m.text })); }
  else if (m.type === 'audio') { bubble.append(el('audio', { src: m.src, controls: true, style: { maxWidth: '200px' } })); }
  const time = el('span', { class: 'time', text: fmtTime(m.ts) });
  if (mine) time.append(' ', el('span', { class: 'ticks', text: m.state === 'read' ? '✓✓' : m.state === 'delivered' ? '✓✓' : '✓', style: { color: m.state === 'read' ? '#8fd0ff' : 'inherit' } }));
  bubble.append(time);
  if (!animate) bubble.style.animation = 'none';
  const typing = scroll.querySelector('.typing'); if (typing) typing.remove();
  scroll.append(bubble);
  scroll.scrollTop = scroll.scrollHeight;
}

function showTyping(scroll) {
  if (scroll.querySelector('.typing')) return;
  const typing = el('div', { class: 'typing' }, [el('i'), el('i'), el('i')]);
  scroll.append(typing); scroll.scrollTop = scroll.scrollHeight;
  setTimeout(() => typing.remove(), 3500);
}

function buildInput(scroll) {
  const bar = el('div', { class: 'chat-input' });
  const plus = el('button', { class: 'icon-btn', html: icon('plus'), onclick: () => openAttach(scroll) });
  const field = el('input', { class: 'input grow', placeholder: t('chat.placeholder') });
  const emojiBtn = el('button', { class: 'icon-btn', html: icon('emoji'), onclick: () => quickEmoji(field) });
  const micBtn = el('button', { class: 'icon-btn', html: icon('mic'), onclick: () => recordVoice(scroll) });
  const sendBtn = el('button', { class: 'icon-btn active', html: icon('send'), onclick: send });
  bar.append(plus, field, emojiBtn, micBtn, sendBtn);
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
  let typingTmr; field.addEventListener('input', () => { clearTimeout(typingTmr); sync.send('typing', {}); });
  function send() {
    const txt = field.value.trim(); if (!txt) return;
    const m = { id: uid('msg'), ts: Date.now(), from: 'me', type: 'text', text: txt, state: 'sent' };
    field.value = ''; commitOutgoing(scroll, m);
  }
  return bar;
}

async function commitOutgoing(scroll, m) {
  await db.put('messages', m);
  appendMessage(scroll, m, true);
  sync.send('message', { ...m, from: 'them' }); // partner receives as "them"
  sound('send');
  // delivery/read simulation + friendly auto-reply when partner isn't truly present
  setTimeout(() => updateState(scroll, m.id, 'delivered'), 700);
  setTimeout(() => updateState(scroll, m.id, 'read'), 1800);
  if (!store.get().partner.online) simulateReply(scroll, m);
}
async function updateState(scroll, id, state) {
  const m = await db.get('messages', id); if (!m) return; m.state = state; await db.put('messages', m);
  // re-render last matching bubble tick
  const bubbles = scroll.querySelectorAll('.bubble.me .ticks');
  const last = bubbles[bubbles.length - 1]; if (last && state === 'read') last.style.color = '#8fd0ff';
}
const replies = ['¡Me encanta! 🥰', '😍😍😍', 'Qué bonito, mi amor 💕', 'Jajaja 💗', 'Te quiero muchísimo 🌸', 'Dibujemos algo juntos 🎨', '¡Sí! 💖', 'Mi persona favorita ✨'];
function simulateReply(scroll, srcMsg) {
  setTimeout(() => showTyping(scroll), 1200);
  setTimeout(async () => {
    const txt = replies[Math.floor(Math.random() * replies.length)];
    const m = { id: uid('msg'), ts: Date.now(), from: 'them', type: 'text', text: txt, state: 'read' };
    await db.put('messages', m); appendMessage(scroll, m, true); sound('pop');
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
  const opt = (emoji, label, fn) => el('button', { class: 'tile', style: { padding: '18px', textAlign: 'center' }, onclick: () => { fn(); } }, [el('div', { style: { fontSize: '1.8rem' }, text: emoji }), el('div', { class: 'meta', html: `<div class="t">${label}</div>` })]);
  body.append(
    opt('🖼️', 'Foto', () => { s.close(); pickImage((src) => commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'image', src, state: 'sent' })); }),
    opt('🎞️', 'GIF', () => { s.close(); openGifPicker(scroll); }),
    opt('🎨', 'Dibujo', async () => { s.close(); openDrawingPicker(scroll); }),
    opt('🌈', 'Sticker', () => { s.close(); openSticker(scroll); }),
  );
}
function openGifPicker(scroll) {
  const body = el('div');
  const input = el('input', { class: 'input', placeholder: 'Buscar GIFs…' });
  const grid = el('div', { class: 'gif-grid', style: { marginTop: '10px' } });
  body.append(input, grid); const s = sheet('GIFs', body);
  const load = async (q) => { grid.innerHTML = '<div class="sk" style="height:90px"></div>'.repeat(6); const res = q ? await searchGifs(q) : await trendingGifs(); grid.innerHTML = ''; res.forEach((g) => grid.append(el('img', { src: g.preview, onclick: () => { commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'gif', src: g.url, state: 'sent' }); s.close(); } }))); if (!res.length) grid.append(el('p', { style: { gridColumn: '1/-1', color: 'var(--text-2)' }, text: 'Sin resultados' })); };
  let tmr; input.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => load(input.value.trim()), 400); }; load('');
}
async function openDrawingPicker(scroll) {
  const drawings = await db.allByIndex('drawings', 'updatedAt', 'prev');
  const body = el('div', { class: 'grid-2' }); const s = sheet('Enviar dibujo', body);
  if (!drawings.length) body.append(el('p', { style: { color: 'var(--text-2)' }, text: 'Aún no tienes dibujos.' }));
  drawings.forEach((d) => body.append(el('div', { class: 'tile', onclick: async () => { await sendDrawingToPartner(d); s.close(); toast(t('toast.sent'), { icon: '💌' }); const { renderChat } = await import('./chat.js'); } }, [el('div', { class: 'thumb' }, [el('img', { src: d.thumb })]), el('div', { class: 'meta', html: `<div class="t">${d.title || ''}</div>` })])));
}
function openSticker(scroll) {
  const body = el('div'); const grid = el('div', { class: 'emoji-grid' });
  '🐻💐🌈🦋🎀🍰🌸💖🐰🌷☕🍓🧸🎈🌙⭐🐱🌻🍭🎨💌🕊️🌼🍀🐨🐣💫🎵🪴🫧'.match(/./gu).forEach((e) => grid.append(el('button', { text: e, onclick: () => { commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'sticker', text: e, state: 'sent' }); s.close(); } })));
  body.append(grid); const s = sheet('Stickers', body);
}
function pickImage(cb) {
  const inp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
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
    rec.onstop = async () => { stream.getTracks().forEach((t) => t.stop()); const blob = new Blob(chunks, { type: 'audio/webm' }); const src = await blobToDataURL(blob); commitOutgoing(scroll, { id: uid('msg'), ts: Date.now(), from: 'me', type: 'audio', src, state: 'sent' }); };
    rec.start();
    toast('🎙️ Grabando… toca para enviar');
    const stop = () => { rec.stop(); document.removeEventListener('pointerdown', stop, true); };
    setTimeout(() => document.addEventListener('pointerdown', stop, true), 400);
    setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 15000);
  } catch { toast('Permiso de micrófono denegado'); }
}

export async function sendDrawingToPartner(d) {
  const m = { id: uid('msg'), ts: Date.now(), from: 'me', type: 'drawing', drawingId: d.id, thumb: d.thumb, text: '', state: 'sent' };
  await db.put('messages', m); sync.send('message', { ...m, from: 'them' });
}

function updateBadge() { const b = $('#chat-badge'); if (b) b.hidden = unread === 0; }
// Global: count unread when not on chat route
bus.on('sync:message', async (m) => {
  const { currentRoute } = await import('../core/router.js');
  if (currentRoute() !== 'chat') { unread++; const b = $('#chat-badge'); if (b) b.hidden = false; toast('💌 ' + store.get().partner.name); }
});
