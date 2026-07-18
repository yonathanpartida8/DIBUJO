// ============================================================
// Reproductor de música tocadiscos — disco de vinilo animado,
// portada, ecualizador en vivo, fondo dinámico y mini-reproductor
// persistente. Sustituye por completo al <audio controls>.
// ============================================================
import { el, $, fmtClock, blobToDataURL } from '../core/utils.js';
import { bus } from '../core/bus.js';
import { toast } from '../core/ui.js';
import { db } from '../core/db.js';
import { uid } from '../core/utils.js';
import { icon } from './icons.js';

// Estado global del reproductor (persiste entre vistas).
const state = window.__vinylState = window.__vinylState || {
  audio: null, track: null, playing: false, volume: 0.8, loop: true,
  mode: localStorage.getItem('dibujo.playerMode') || 'vinyl', // vinyl | cover | minimal
};

let actx, analyser, srcNode;

function ensureAudio() {
  if (state.audio) return state.audio;
  const a = new Audio();
  a.loop = state.loop; a.volume = state.volume;
  a.addEventListener('play', () => { state.playing = true; bus.emit('vinyl:state'); });
  a.addEventListener('pause', () => { state.playing = false; bus.emit('vinyl:state'); });
  a.addEventListener('timeupdate', () => bus.emit('vinyl:tick'));
  state.audio = a;
  return a;
}

// Ecualizador: WebAudio analyser (con fallback a animación simulada).
function attachAnalyser() {
  try {
    if (analyser) return analyser;
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    srcNode = actx.createMediaElementSource(state.audio);
    analyser = actx.createAnalyser();
    analyser.fftSize = 64;
    srcNode.connect(analyser).connect(actx.destination);
    return analyser;
  } catch { return null; }
}

export function playTrack(track) {
  const a = ensureAudio();
  state.track = track;
  a.src = track.src;
  a.play().catch(() => {});
  bus.emit('vinyl:state');
}
export function togglePlay() {
  const a = ensureAudio();
  if (!state.track) return;
  state.playing ? a.pause() : a.play().catch(() => {});
}

// ---------- Vista completa (overlay) ----------
export async function openVinyl(initialTrack) {
  if (initialTrack) playTrack(initialTrack);
  const overlay = el('div', { class: 'vinyl-overlay' });
  document.body.append(overlay);

  const bg = el('div', { class: 'vinyl-bg' });
  const card = el('div', { class: 'vinyl-card' });
  overlay.append(bg, card);

  const disc = el('div', { class: 'vinyl-disc' }, [
    el('div', { class: 'vinyl-grooves' }),
    el('div', { class: 'vinyl-label' }, [el('span', { text: '💿' })]),
  ]);
  const cover = el('div', { class: 'vinyl-cover' });
  const title = el('div', { class: 'vinyl-title' });
  const artist = el('div', { class: 'vinyl-artist' });
  const eq = el('div', { class: 'vinyl-eq' }, Array.from({ length: 18 }, () => el('i')));
  const timeCur = el('span', { class: 'v-time', text: '0:00' });
  const timeTot = el('span', { class: 'v-time', text: '0:00' });
  const seek = el('input', { class: 'slider', type: 'range', min: 0, max: 1000, value: 0 });
  const playBtn = el('button', { class: 'vinyl-play', html: icon('playFilled') });
  const loopBtn = el('button', { class: 'icon-btn', html: icon('loop') });
  const volSl = el('input', { class: 'slider', type: 'range', min: 0, max: 100, value: state.volume * 100, style: { width: '110px' } });
  const addBtn = el('button', { class: 'btn btn-soft btn-sm', text: '＋ Canción' });
  const listBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Biblioteca' });
  const closeBtn = el('button', { class: 'icon-btn vinyl-close', html: icon('close') });

  // Modos de visualización: vinilo girando · portada estática · minimalista.
  const modes = el('div', { class: 'segment vinyl-modes' });
  [['vinyl', 'Vinilo'], ['cover', 'Portada'], ['minimal', 'Mínimo']].forEach(([id, label]) => {
    modes.append(el('button', { class: id === state.mode ? 'active' : '', text: label, onclick: (e) => {
      state.mode = id; localStorage.setItem('dibujo.playerMode', id);
      modes.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      card.dataset.mode = id;
    } }));
  });
  card.dataset.mode = state.mode;

  card.append(closeBtn, modes, disc, cover, title, artist, eq,
    el('div', { class: 'vinyl-seek' }, [timeCur, seek, timeTot]),
    el('div', { class: 'vinyl-controls' }, [loopBtn, playBtn, el('span', { class: 'vinyl-vol-ic', html: icon('volume') }), volSl]),
    el('div', { class: 'vinyl-actions' }, [addBtn, listBtn]));

  const a = ensureAudio();
  const an = state.track ? attachAnalyser() : null;
  const bars = [...eq.children];
  let raf;
  const animateEq = () => {
    if (an && state.playing) {
      const data = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(data);
      bars.forEach((b, i) => { b.style.height = 6 + (data[i + 2] / 255) * 30 + 'px'; });
    } else if (state.playing) {
      bars.forEach((b, i) => { b.style.height = 8 + Math.abs(Math.sin(Date.now() / 300 + i)) * 24 + 'px'; });
    } else bars.forEach((b) => { b.style.height = '6px'; });
    raf = requestAnimationFrame(animateEq);
  };
  animateEq();

  const sync = () => {
    const t = state.track;
    title.textContent = t ? t.name : 'Sin música';
    artist.textContent = t ? (t.artist || 'Su canción') : 'Agrega una canción para su espacio';
    disc.classList.toggle('spin', state.playing);
    playBtn.innerHTML = state.playing ? icon('pauseFilled') : icon('playFilled');
    loopBtn.style.opacity = state.loop ? 1 : 0.4;
    cover.innerHTML = '';
    cover.hidden = !t?.cover;
    if (t?.cover) cover.append(el('img', { src: t.cover }));
    bg.style.background = t?.cover ? `center/cover url(${t.cover})` : 'linear-gradient(135deg, var(--rose), var(--lav))';
  };
  const tick = () => {
    if (!a.duration) return;
    timeCur.textContent = fmtClock(a.currentTime * 1000);
    timeTot.textContent = fmtClock(a.duration * 1000);
    if (!seek._drag) seek.value = (a.currentTime / a.duration) * 1000;
  };
  const off1 = bus.on('vinyl:state', sync);
  const off2 = bus.on('vinyl:tick', tick);
  sync(); tick();

  playBtn.onclick = () => { togglePlay(); if (actx?.state === 'suspended') actx.resume(); };
  loopBtn.onclick = () => { state.loop = !state.loop; a.loop = state.loop; sync(); };
  volSl.oninput = () => { state.volume = +volSl.value / 100; a.volume = state.volume; };
  seek.onpointerdown = () => seek._drag = true;
  seek.onchange = () => { if (a.duration) a.currentTime = (+seek.value / 1000) * a.duration; seek._drag = false; };
  addBtn.onclick = () => pickSong();
  listBtn.onclick = () => openLibrary();
  closeBtn.onclick = () => { cancelAnimationFrame(raf); off1(); off2(); overlay.classList.add('out'); setTimeout(() => overlay.remove(), 260); showMini(); };
  overlay.onclick = (e) => { if (e.target === overlay) closeBtn.onclick(); };
}

// Selector de archivo → guarda en biblioteca y reproduce.
function pickSong() {
  const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) { inp.remove(); return; }
    const src = await blobToDataURL(f);
    const track = { id: uid('song'), name: f.name.replace(/\.[^.]+$/, ''), artist: '', src, cover: null, addedAt: Date.now(), kind: 'song' };
    await db.put('media', track);
    playTrack(track);
    toast('🎵 ' + track.name);
  };
  inp.click();
}

async function openLibrary() {
  const { sheet } = await import('../core/ui.js');
  const all = (await db.all('media')).filter((m) => m.kind === 'song');
  const body = el('div');
  if (!all.length) body.append(el('p', { style: { color: 'var(--text-2)', textAlign: 'center', padding: '12px' }, text: 'Aún no hay canciones. Agrega la primera 🎶' }));
  const s = sheet('Su música', body);
  all.forEach((tk) => body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { playTrack(tk); s.close(); } }, [
    el('div', { class: 'r-ic', text: '🎵' }),
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: tk.name }), el('div', { class: 'r-sub', text: tk.artist || '—' })]),
  ])));
}

// ---------- Mini reproductor flotante ----------
let mini;
export function showMini() {
  if (!state.track) return;
  if (!mini) {
    mini = el('div', { class: 'vinyl-mini' });
    document.body.append(mini);
    bus.on('vinyl:state', renderMini);
  }
  renderMini();
}
function renderMini() {
  if (!mini || !state.track) return;
  mini.hidden = false;
  mini.innerHTML = '';
  mini.append(
    el('div', { class: 'vm-disc' + (state.playing ? ' spin' : '') }),
    el('div', { class: 'vm-name', text: state.track.name }),
    el('button', { class: 'vm-btn', html: state.playing ? icon('pauseFilled') : icon('playFilled'), onclick: (e) => { e.stopPropagation(); togglePlay(); } }),
    el('button', { class: 'vm-btn', html: icon('close'), onclick: (e) => { e.stopPropagation(); state.audio?.pause(); mini.hidden = true; } }),
  );
  mini.onclick = () => { mini.hidden = true; openVinyl(); };
}
