// ============================================================
// Sistema de widgets del inicio — colocación libre, arrastrar,
// redimensionar (S/M/L), ocultar, color y transparencia.
// Mantén presionado el tablero para entrar en modo edición
// (estilo iOS). La disposición se guarda en el store.
// ============================================================
import { el, $, uid, elapsedParts, fmtDate, timeAgo, clamp } from '../core/utils.js';
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { bus } from '../core/bus.js';
import { t, getLang } from '../core/i18n.js';
import { sheet, promptDialog, toast } from '../core/ui.js';
import { go } from '../core/router.js';

const PHRASES = [
  'El amor se dibuja todos los días 💗', 'Contigo, hasta los garabatos son arte ✨',
  'Dos corazones, un solo lienzo 🎨', 'Cada trazo tuyo me enamora 🥰',
  'La distancia es solo un espacio en blanco por pintar 🌈', 'Eres mi color favorito 💜',
  'Hoy es un buen día para dibujarte un te quiero 💌', 'Nuestro amor no cabe en un lienzo 🖼️',
  'Pintemos juntos este día 🌸', 'Tu sonrisa es mi mejor obra 😊',
];

// ---------- Registro de widgets ----------
// Cada tipo define: nombre, emoji, tamaño por defecto y render(content, ws).
export const WIDGET_TYPES = {
  days: { name: 'Días juntos', emoji: '💞', h: 2, async render(c) {
    const since = store.get().couple.since;
    if (!since) { c.append(wLabel('💍', 'Definan su aniversario en Nosotros')); return; }
    const p = elapsedParts(since);
    c.append(el('div', { class: 'w-big', text: p.days }), el('div', { class: 'w-cap', text: 'días juntos 💕' }),
      el('div', { class: 'w-sub', text: `${p.hours}h ${p.minutes}m ${p.seconds}s` }));
    c._timer = setInterval(() => { const q = elapsedParts(since); const sub = c.querySelector('.w-sub'); if (sub) sub.textContent = `${q.hours}h ${q.minutes}m ${q.seconds}s`; const big = c.querySelector('.w-big'); if (big) big.textContent = q.days; }, 1000);
  } },
  countdown: { name: 'Cuenta regresiva', emoji: '⏳', h: 2, async render(c, ws) {
    if (!ws.data?.date) { c.append(wLabel('⏳', 'Toca para elegir una fecha')); c.onclick = async () => { const d = await promptDialog({ title: 'Fecha (AAAA-MM-DD)', placeholder: '2026-12-24' }); if (d) { ws.data = { ...ws.data, date: d, label: await promptDialog({ title: '¿Qué esperan?', placeholder: 'Nuestro reencuentro' }) }; saveLayout(); bus.emit('widgets:refresh'); } }; return; }
    const ms = new Date(ws.data.date).getTime() - Date.now();
    const days = Math.max(0, Math.ceil(ms / 86400000));
    c.append(el('div', { class: 'w-big', text: days }), el('div', { class: 'w-cap', text: `días para ${ws.data.label || 'el gran día'} ⏳` }));
  } },
  weather: { name: 'Clima', emoji: '⛅', h: 2, async render(c) {
    c.append(wLabel('⛅', 'Cargando clima…'));
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 }) : rej());
      const { latitude, longitude } = pos.coords;
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`);
      const j = await r.json();
      const code = j.current.weather_code;
      const icon = code === 0 ? '☀️' : code < 4 ? '⛅' : code < 60 ? '🌫️' : code < 70 ? '🌧️' : code < 80 ? '❄️' : '⛈️';
      c.innerHTML = '';
      c.append(el('div', { class: 'w-big', text: `${Math.round(j.current.temperature_2m)}°` }), el('div', { class: 'w-cap', text: icon + ' clima de hoy' }));
    } catch { c.innerHTML = ''; c.append(wLabel('⛅', 'Clima no disponible')); }
  } },
  music: { name: 'Música', emoji: '🎵', h: 2, async render(c) {
    const track = window.__vinylState?.track;
    if (track) c.append(el('div', { class: 'w-disc-mini' + (window.__vinylState.playing ? ' spin' : '') }), el('div', { class: 'w-cap', text: track.name }), el('div', { class: 'w-sub', text: track.artist || 'Su canción 🎶' }));
    else c.append(wLabel('🎵', 'Sin música ahora'));
    c.onclick = () => import('./vinyl.js').then((m) => m.openVinyl());
  } },
  lastDrawing: { name: 'Último dibujo', emoji: '🖼️', h: 3, async render(c) {
    const ds = await db.allByIndex('drawings', 'updatedAt', 'prev');
    if (!ds.length) { c.append(wLabel('🖼️', 'Aún sin dibujos')); return; }
    const d = ds[0];
    c.append(el('img', { class: 'w-img', src: d.thumb }), el('div', { class: 'w-cap', text: d.title || 'Sin título' }));
    c.onclick = () => go('studio', { id: d.id });
  } },
  activity: { name: 'Actividad reciente', emoji: '🕑', h: 2, async render(c) {
    const [ds, ms] = await Promise.all([db.allByIndex('drawings', 'updatedAt', 'prev'), db.allByIndex('messages', 'ts', 'prev')]);
    const items = [];
    if (ds[0]) items.push(`🎨 Dibujo · ${timeAgo(ds[0].updatedAt, t)}`);
    if (ms[0]) items.push(`💬 Mensaje · ${timeAgo(ms[0].ts, t)}`);
    if (!items.length) items.push('Todo tranquilo por aquí 🌙');
    c.append(el('div', { class: 'w-cap', text: 'Actividad' }), ...items.map((x) => el('div', { class: 'w-sub', text: x })));
  } },
  phrase: { name: 'Frase del día', emoji: '💬', h: 2, async render(c) {
    const day = Math.floor(Date.now() / 86400000);
    c.append(el('div', { class: 'w-quote', text: PHRASES[day % PHRASES.length] }));
  } },
  memories: { name: 'Recuerdos', emoji: '📸', h: 2, async render(c) {
    const mems = await db.allByIndex('memories', 'date', 'prev');
    if (!mems.length) { c.append(wLabel('📸', 'Guarden recuerdos en Nosotros')); return; }
    const m = mems[Math.floor(Math.random() * mems.length)];
    c.append(el('div', { style: { fontSize: '1.6rem' }, text: m.emoji }), el('div', { class: 'w-cap', text: m.title }), el('div', { class: 'w-sub', text: fmtDate(m.date, getLang()) }));
  } },
  notes: { name: 'Notas', emoji: '📝', h: 2, async render(c, ws) {
    c.append(el('div', { class: 'w-cap', text: '📝 Nota' }), el('div', { class: 'w-quote', style: { fontSize: '0.85rem' }, text: ws.data?.text || 'Toca para escribir una notita…' }));
    c.onclick = async () => { const txt = await promptDialog({ title: 'Nota', value: ws.data?.text || '' }); if (txt != null) { ws.data = { text: txt }; saveLayout(); bus.emit('widgets:refresh'); } };
  } },
  photo: { name: 'Foto favorita', emoji: '🖼️', h: 3, async render(c, ws) {
    if (ws.data?.src) { c.append(el('img', { class: 'w-img', src: ws.data.src })); }
    else { c.append(wLabel('🖼️', 'Toca para elegir una foto')); }
    c.onclick = () => {
      const inp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
      document.body.append(inp);
      inp.onchange = async () => { const f = inp.files[0]; if (f) { const r = new FileReader(); r.onload = () => { ws.data = { src: r.result }; saveLayout(); bus.emit('widgets:refresh'); }; r.readAsDataURL(f); } inp.remove(); };
      inp.click();
    };
  } },
  birthday: { name: 'Cumpleaños', emoji: '🎂', h: 2, async render(c, ws) {
    if (!ws.data?.date) { c.append(wLabel('🎂', 'Toca para configurar')); c.onclick = async () => { const d = await promptDialog({ title: 'Cumpleaños (MM-DD)', placeholder: '07-24' }); if (d) { ws.data = { date: d, name: await promptDialog({ title: '¿De quién?', value: store.get().partner.name }) }; saveLayout(); bus.emit('widgets:refresh'); } }; return; }
    const [mm, dd] = ws.data.date.split('-').map(Number);
    const now = new Date(); let next = new Date(now.getFullYear(), mm - 1, dd);
    if (next < now) next = new Date(now.getFullYear() + 1, mm - 1, dd);
    const days = Math.ceil((next - now) / 86400000);
    c.append(el('div', { class: 'w-big', text: days }), el('div', { class: 'w-cap', text: `días para el cumple de ${ws.data.name || '💗'} 🎂` }));
  } },
  calendar: { name: 'Calendario', emoji: '📅', h: 2, async render(c) {
    const now = new Date();
    c.append(el('div', { class: 'w-cap', text: now.toLocaleDateString('es-MX', { weekday: 'long' }) }),
      el('div', { class: 'w-big', text: now.getDate() }),
      el('div', { class: 'w-sub', text: now.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) }));
  } },
  goals: { name: 'Objetivos', emoji: '🎯', h: 2, async render(c) {
    const goals = store.get().couple.goals || [];
    if (!goals.length) { c.append(wLabel('🎯', 'Creen metas en Nosotros')); return; }
    const g = goals[0]; const count = await db.count('drawings');
    const prog = Math.min(1, count / g.target);
    c.append(el('div', { class: 'w-cap', text: '🎯 ' + g.title }), el('div', { class: 'bar', style: { margin: '8px 0' } }, [el('i', { style: { width: prog * 100 + '%' } })]), el('div', { class: 'w-sub', text: `${count}/${g.target}` }));
  } },
  achievements: { name: 'Logros', emoji: '🏆', h: 2, async render(c) {
    const n = (store.get().couple.achievements || []).length;
    c.append(el('div', { class: 'w-big', text: n }), el('div', { class: 'w-cap', text: 'logros desbloqueados 🏆' }));
    c.onclick = () => import('./achievements-ui.js').then((m) => m.openAchievements());
  } },
  partner: { name: 'Mi pareja', emoji: '💗', h: 2, async render(c) {
    const p = store.get().partner;
    const av = el('div', { class: 'avatar', style: { margin: '0 auto 6px', background: p.color || 'var(--lav)' } });
    if (p.avatar) av.append(el('img', { src: p.avatar })); else av.textContent = (p.name || '?')[0];
    const state = p.drawing ? '🎨 dibujando ahora' : p.online ? '🟢 en línea' : '💤 ' + timeAgo(p.lastSeen, t);
    c.append(av, el('div', { class: 'w-cap', text: p.name }), el('div', { class: 'w-sub', text: state }));
    c.onclick = () => go('chat');
  } },
  streak: { name: 'Racha', emoji: '🔥', h: 2, async render(c) {
    c.append(el('div', { class: 'w-big', text: store.get().couple.streak || 0 }), el('div', { class: 'w-cap', text: 'días de racha 🔥' }));
  } },
};

function wLabel(emoji, text) {
  return el('div', { class: 'w-empty' }, [el('div', { style: { fontSize: '1.5rem' }, text: emoji }), el('div', { class: 'w-sub', text })]);
}

// ---------- Disposición ----------
const DEFAULT_LAYOUT = [
  { id: 'w1', type: 'partner', col: 0, row: 0, w: 1 },
  { id: 'w2', type: 'days', col: 1, row: 0, w: 1 },
  { id: 'w3', type: 'lastDrawing', col: 0, row: 1, w: 1 },
  { id: 'w4', type: 'phrase', col: 1, row: 1, w: 1 },
  { id: 'w5', type: 'streak', col: 0, row: 2, w: 1 },
  { id: 'w6', type: 'activity', col: 1, row: 2, w: 1 },
];
export function getLayout() { return store.get().widgets || structuredClone(DEFAULT_LAYOUT); }
export function saveLayout(layout) { store.set({ widgets: layout || getLayout() }); }

let editMode = false;

// Renderiza el tablero de widgets dentro de `host`.
export function renderBoard(host) {
  const layout = getLayout().filter((w) => !w.hidden);
  host.innerHTML = '';
  host.className = 'widget-board' + (editMode ? ' editing' : '');
  layout.sort((a, b) => (a.row - b.row) || (a.col - b.col));
  for (const ws of layout) {
    const def = WIDGET_TYPES[ws.type];
    if (!def) continue;
    const card = el('div', { class: 'widget', dataset: { wid: ws.id }, style: {
      gridColumn: ws.w === 2 ? 'span 2' : `span 1`,
      gridRow: `span ${def.h >= 3 ? 2 : 1}`,
      background: ws.color || '',
      opacity: ws.alpha != null ? ws.alpha : '',
    } });
    const content = el('div', { class: 'w-content' });
    card.append(content);
    def.render(content, ws).catch(() => {});
    if (editMode) {
      card.classList.add('jiggle');
      card.append(
        el('button', { class: 'w-del', text: '✕', onclick: (e) => { e.stopPropagation(); ws.hidden = true; persist(layout); renderBoard(host); } }),
        el('button', { class: 'w-size', text: ws.w === 2 ? '◱' : '◳', onclick: (e) => { e.stopPropagation(); ws.w = ws.w === 2 ? 1 : 2; persist(layout); renderBoard(host); } }),
        el('button', { class: 'w-style', text: '🎨', onclick: (e) => { e.stopPropagation(); customize(ws, layout, host); } }),
      );
      enableDrag(card, ws, layout, host);
    }
    host.append(card);
  }
  if (editMode) {
    host.append(el('button', { class: 'widget w-add', onclick: () => addWidget(layout, host) }, [el('div', { style: { fontSize: '1.6rem' }, text: '＋' }), el('div', { class: 'w-sub', text: 'Añadir widget' })]));
    host.append(el('button', { class: 'btn btn-primary btn-block', style: { gridColumn: '1/-1' }, text: 'Listo ✓', onclick: () => { editMode = false; renderBoard(host); } }));
  }
  // Mantener presionado → modo edición.
  let lp;
  host.onpointerdown = (e) => { if (editMode) return; lp = setTimeout(() => { editMode = true; renderBoard(host); if (navigator.vibrate) navigator.vibrate(12); }, 550); };
  host.onpointerup = host.onpointermove = () => clearTimeout(lp);
}

function persist(layout) {
  const full = getLayout();
  for (const ws of layout) { const i = full.findIndex((x) => x.id === ws.id); if (i >= 0) full[i] = ws; }
  saveLayout(full);
}

// Arrastrar para reordenar (intercambia posiciones al soltar encima de otro).
function enableDrag(card, ws, layout, host) {
  let start = null;
  card.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    start = { x: e.clientX, y: e.clientY };
    card.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!start) return;
      card.style.zIndex = 10;
      card.style.transform = `translate(${ev.clientX - start.x}px, ${ev.clientY - start.y}px) scale(1.05)`;
    };
    const up = (ev) => {
      card.removeEventListener('pointermove', move);
      card.removeEventListener('pointerup', up);
      card.style.transform = ''; card.style.zIndex = '';
      if (!start) return;
      const target = document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList?.contains('widget') && n !== card && n.dataset.wid);
      if (target) {
        const other = layout.find((x) => x.id === target.dataset.wid);
        if (other) { [ws.row, other.row] = [other.row, ws.row]; [ws.col, other.col] = [other.col, ws.col]; persist(layout); renderBoard(host); }
      }
      start = null;
    };
    card.addEventListener('pointermove', move);
    card.addEventListener('pointerup', up);
  });
}

function customize(ws, layout, host) {
  const body = el('div');
  const colors = ['', 'var(--primary-soft)', 'var(--accent-soft)', '#ffe9d6', '#e2f3ea', '#e3edfa', '#fdf3d8'];
  const pal = el('div', { class: 'st-palette', style: { flexWrap: 'wrap', marginBottom: '14px' } });
  colors.forEach((c) => pal.append(el('button', { class: 'st-swatch', style: { background: c || 'var(--surface)' }, onclick: () => { ws.color = c; persist(layout); renderBoard(host); } })));
  const alpha = el('input', { class: 'slider', type: 'range', min: 30, max: 100, value: (ws.alpha ?? 1) * 100 });
  alpha.oninput = () => { ws.alpha = +alpha.value / 100; persist(layout); renderBoard(host); };
  body.append(el('div', { class: 'opt-group' }, [el('div', { class: 'lab', text: 'Color de fondo' }), pal]),
    el('div', { class: 'opt-group' }, [el('div', { class: 'lab', text: 'Transparencia' }), alpha]));
  sheet('Personalizar widget', body);
}

function addWidget(layout, host) {
  const body = el('div', { class: 'grid-auto' });
  const s = sheet('Añadir widget', body);
  const full = getLayout();
  for (const [type, def] of Object.entries(WIDGET_TYPES)) {
    body.append(el('button', { class: 'tile', style: { padding: '14px', textAlign: 'center' }, onclick: () => {
      const hidden = full.find((w) => w.type === type && w.hidden);
      if (hidden) hidden.hidden = false;
      else full.push({ id: uid('w'), type, col: 0, row: Math.max(0, ...full.map((x) => x.row)) + 1, w: 1 });
      saveLayout(full); s.close(); renderBoard(host);
    } }, [el('div', { style: { fontSize: '1.5rem' }, text: def.emoji }), el('div', { class: 'meta', html: `<div class="t">${def.name}</div>` })]));
  }
}
