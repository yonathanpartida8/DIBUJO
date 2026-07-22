// ============================================================
// Motor de audio v2 — cada interacción importante suena.
//
// · Botones: 3 variantes por evento, elegidas al azar para que
//   nunca suene repetitivo; transiciones con envolventes suaves.
// · Dibujo: cada herramienta tiene su sonido continuo en loop
//   (lápiz, pluma, marcador, brocha, aerógrafo, borrador…) que
//   arranca al trazar y se detiene limpio (fade corto) al soltar.
// · Regla: sonidos propios de agarrar y soltar.
//
// ARCHIVOS EXTERNOS: si colocas .wav o .mp3 en la carpeta Audio/
// (ver Audio/README.md con los nombres esperados), se detectan y
// usan automáticamente; si no existen, suena la síntesis WebAudio
// integrada (0 KB). Nada que configurar.
// ============================================================
import { store } from './store.js';

let ctx;
const ac = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

/* ------------------------------------------------------------
   Carga de archivos externos (autodetección, con caché)
   ------------------------------------------------------------ */
const fileCache = new Map();   // ruta base → AudioBuffer | null (null = no existe)
// Índice opcional (Audio/manifest.json): si existe y lista rutas, solo esas se
// cargan (cero peticiones fallidas). Si se elimina, se sondea cada archivo.
let indexPromise = null;
function loadIndex() {
  return indexPromise ??= fetch('Audio/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (Array.isArray(j) ? new Set(j) : null))
    .catch(() => null);
}
async function loadFile(base) {
  if (fileCache.has(base)) return fileCache.get(base);
  const index = await loadIndex();
  if (index && !index.has(base)) { fileCache.set(base, null); return null; }
  for (const ext of ['.wav', '.mp3']) {
    try {
      const res = await fetch(`Audio/${base}${ext}`);
      if (res.ok && (res.headers.get('content-type') || '').startsWith('audio')) {
        const buf = await ac().decodeAudioData(await res.arrayBuffer());
        fileCache.set(base, buf);
        return buf;
      }
    } catch {}
  }
  fileCache.set(base, null);
  return null;
}
function playBuffer(buf, { volume = 0.5, loop = false } = {}) {
  const a = ac();
  const src = a.createBufferSource();
  src.buffer = buf; src.loop = loop;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(volume, a.currentTime + 0.03);
  src.connect(g).connect(a.destination);
  src.start();
  return { src, g };
}

/* ------------------------------------------------------------
   Síntesis de respaldo (suave, agradable, nunca estridente)
   ------------------------------------------------------------ */
function env(g, t0, a = 0.008, peak = 0.08, rel = 0.18) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + rel);
}
function tone(freq, { type = 'sine', peak = 0.07, rel = 0.18, delay = 0, slide = 0 } = {}) {
  const a = ac(), t0 = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + rel);
  env(g, t0, 0.008, peak, rel);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + rel + 0.05);
}
function noise({ peak = 0.03, rel = 0.1, delay = 0, hp = 2000 } = {}) {
  const a = ac(), t0 = a.currentTime + delay;
  const len = a.sampleRate * (rel + 0.05);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); env(g, t0, 0.004, peak, rel);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0); src.stop(t0 + rel + 0.05);
}

/* ------------------------------------------------------------
   Catálogo de eventos.
   file: base de archivo en Audio/ (sin extensión).
   variants: nº de variantes externas (file-1, file-2, file-3…).
   synth: lista de síntesis alternativas (se elige una al azar).
   ------------------------------------------------------------ */
const FX = {
  tap: { key: 'sounds', file: 'UI/tap', variants: 3, synth: [
    () => tone(660, { peak: 0.038, rel: 0.09 }),
    () => tone(590, { peak: 0.036, rel: 0.1, slide: 60 }),
    () => tone(720, { peak: 0.034, rel: 0.08, slide: -40 }),
  ] },
  pop: { key: 'sounds', file: 'UI/pop', variants: 3, synth: [
    () => tone(520, { peak: 0.05, rel: 0.08, slide: 120 }),
    () => tone(470, { peak: 0.048, rel: 0.09, slide: 150 }),
    () => tone(560, { peak: 0.045, rel: 0.08, slide: 90 }),
  ] },
  love: { key: 'sounds', file: 'UI/love', variants: 3, synth: [
    () => { tone(740, { peak: 0.05, rel: 0.2 }); tone(932, { delay: 0.05, peak: 0.04, rel: 0.24 }); },
    () => { tone(698, { peak: 0.05, rel: 0.2 }); tone(880, { delay: 0.06, peak: 0.04, rel: 0.22 }); },
    () => { tone(784, { peak: 0.045, rel: 0.2 }); tone(988, { delay: 0.05, peak: 0.04, rel: 0.24 }); },
  ] },
  send: { key: 'sndMsg', file: 'UI/send', variants: 3, synth: [
    () => { tone(740, { peak: 0.06, rel: 0.12 }); tone(990, { delay: 0.07, peak: 0.05, rel: 0.14 }); },
    () => { tone(700, { peak: 0.055, rel: 0.12 }); tone(940, { delay: 0.06, peak: 0.05, rel: 0.14 }); },
    () => { tone(780, { peak: 0.055, rel: 0.11 }); tone(1040, { delay: 0.07, peak: 0.045, rel: 0.13 }); },
  ] },
  receive: { key: 'sndMsg', file: 'UI/receive', variants: 3, synth: [
    () => { tone(880, { peak: 0.05, rel: 0.1 }); tone(660, { delay: 0.08, peak: 0.05, rel: 0.16 }); },
    () => { tone(830, { peak: 0.05, rel: 0.1 }); tone(620, { delay: 0.08, peak: 0.05, rel: 0.15 }); },
    () => { tone(930, { peak: 0.045, rel: 0.1 }); tone(700, { delay: 0.07, peak: 0.05, rel: 0.16 }); },
  ] },
  panelOpen: { key: 'sndPanel', file: 'UI/panel-open', variants: 3, synth: [
    () => tone(520, { peak: 0.035, rel: 0.1, slide: 160 }),
    () => tone(480, { peak: 0.033, rel: 0.11, slide: 190 }),
    () => tone(550, { peak: 0.03, rel: 0.1, slide: 140 }),
  ] },
  panelClose: { key: 'sndPanel', file: 'UI/panel-close', variants: 3, synth: [
    () => tone(600, { peak: 0.03, rel: 0.1, slide: -180 }),
    () => tone(640, { peak: 0.028, rel: 0.1, slide: -200 }),
    () => tone(560, { peak: 0.03, rel: 0.11, slide: -150 }),
  ] },
  achieve: { key: 'sndAchieve', file: 'UI/achieve', variants: 2, synth: [
    () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { delay: i * 0.09, peak: 0.07, rel: 0.25 })),
    () => [587, 740, 880, 1175].forEach((f, i) => tone(f, { delay: i * 0.08, peak: 0.065, rel: 0.24 })),
  ] },
  save: { key: 'sndSave', file: 'UI/save', variants: 3, synth: [
    () => { tone(660, { peak: 0.05, rel: 0.1 }); tone(830, { delay: 0.06, peak: 0.05, rel: 0.18 }); },
    () => { tone(620, { peak: 0.05, rel: 0.1 }); tone(780, { delay: 0.06, peak: 0.05, rel: 0.17 }); },
    () => { tone(700, { peak: 0.045, rel: 0.1 }); tone(880, { delay: 0.05, peak: 0.045, rel: 0.18 }); },
  ] },
  erase: { key: 'sndErase', file: 'Drawing/Eraser/erase', variants: 2, synth: [
    () => noise({ peak: 0.02, rel: 0.12, hp: 900 }),
    () => noise({ peak: 0.018, rel: 0.14, hp: 700 }),
  ] },
  fill: { key: 'sndDraw', file: 'Drawing/Fill/fill', variants: 2, synth: [
    () => { tone(300, { peak: 0.05, rel: 0.3, slide: 260, type: 'triangle' }); noise({ peak: 0.015, rel: 0.25, hp: 1200 }); },
    () => { tone(340, { peak: 0.045, rel: 0.28, slide: 220, type: 'triangle' }); },
  ] },
  rulerGrab: { key: 'sndDraw', file: 'Drawing/Ruler/grab', variants: 2, synth: [
    () => { tone(240, { peak: 0.05, rel: 0.08, type: 'triangle' }); noise({ peak: 0.012, rel: 0.05, hp: 3000 }); },
    () => tone(260, { peak: 0.045, rel: 0.09, type: 'triangle', slide: 40 }),
  ] },
  rulerDrop: { key: 'sndDraw', file: 'Drawing/Ruler/release', variants: 2, synth: [
    () => { tone(200, { peak: 0.055, rel: 0.1, type: 'triangle', slide: -60 }); },
    () => { tone(180, { peak: 0.05, rel: 0.12, type: 'triangle', slide: -50 }); },
  ] },
  shape: { key: 'sndDraw', file: 'Drawing/shape', variants: 2, synth: [
    () => tone(500, { peak: 0.035, rel: 0.12, slide: 90 }),
    () => tone(540, { peak: 0.032, rel: 0.11, slide: 70 }),
  ] },
  select: { key: 'sndDraw', file: 'Transform/select', variants: 2, synth: [
    () => tone(760, { peak: 0.03, rel: 0.07 }),
    () => tone(800, { peak: 0.028, rel: 0.07 }),
  ] },
  move: { key: 'sndDraw', file: 'Transform/move', variants: 2, synth: [
    () => noise({ peak: 0.008, rel: 0.06, hp: 4000 }),
    () => noise({ peak: 0.007, rel: 0.07, hp: 3600 }),
  ] },
  transform: { key: 'sndDraw', file: 'Transform/transform', variants: 2, synth: [
    () => tone(420, { peak: 0.035, rel: 0.14, slide: 120, type: 'triangle' }),
    () => tone(460, { peak: 0.032, rel: 0.13, slide: 100, type: 'triangle' }),
  ] },
  transition: { key: 'sndPanel', file: 'Transitions/screen', variants: 3, synth: [
    () => tone(440, { peak: 0.02, rel: 0.14, slide: 120 }),
    () => tone(480, { peak: 0.018, rel: 0.13, slide: 100 }),
    () => tone(410, { peak: 0.02, rel: 0.15, slide: 140 }),
  ] },
};

function enabled(key) {
  const s = store.get().settings;
  if (s.sounds !== 'on') return false;
  return key === 'sounds' || s[key] === 'on';
}

export function playFx(name) {
  const fx = FX[name] || FX.tap;
  if (!enabled(fx.key)) return;
  try {
    const n = 1 + Math.floor(Math.random() * (fx.variants || 1));
    loadFile(`${fx.file}-${n}`).then((buf) => {
      if (buf) playBuffer(buf, { volume: 0.5 });
      else fx.synth[Math.floor(Math.random() * fx.synth.length)]();
    });
  } catch {}
}

/* ------------------------------------------------------------
   Sonido continuo de dibujo — un timbre distinto por herramienta.
   Arranca en loop al trazar y se apaga con un fade limpio.
   ------------------------------------------------------------ */
// Perfil de ruido filtrado por herramienta: [tipo, frecuencia, Q, ganancia]
const LOOP_PROFILE = {
  pencil: ['bandpass', 4600, 0.8, 0.007],
  charcoal: ['bandpass', 1400, 0.5, 0.011],
  chalk: ['bandpass', 2400, 0.4, 0.01],
  crayon: ['bandpass', 1800, 0.7, 0.009],
  marker: ['lowpass', 900, 0.4, 0.011],
  pixel: ['bandpass', 5200, 2.2, 0.006],
  pen: ['highpass', 5600, 0.7, 0.005],
  ballpoint: ['highpass', 6400, 0.8, 0.004],
  calligraphy: ['bandpass', 3400, 0.9, 0.007],
  brush: ['lowpass', 1300, 0.3, 0.009],
  watercolor: ['lowpass', 700, 0.3, 0.008],
  airbrush: ['bandpass', 3000, 0.2, 0.012],
  splatter: ['bandpass', 2600, 0.3, 0.01],
  eraser: ['lowpass', 1000, 0.4, 0.012],
  eraserSoft: ['lowpass', 650, 0.3, 0.009],
  eraserPixel: ['bandpass', 4800, 2, 0.007],
};
// Archivo externo esperado por herramienta (loop).
const LOOP_FILE = (tool) => {
  if (tool.startsWith('eraser')) return `Drawing/Eraser/${tool}-loop`;
  return `Drawing/Brushes/${tool}-loop`;
};

let loopNode = null;
export function startScratch(tool = 'pencil') {
  const s = store.get().settings;
  if (s.sounds !== 'on' || s.sndDraw !== 'on' || loopNode) return;
  try {
    const a = ac();
    loopNode = { fading: false };
    // ¿Existe un archivo de loop para esta herramienta?
    loadFile(LOOP_FILE(tool)).then((buf) => {
      if (!loopNode || loopNode.fading) return;
      if (buf) {
        const { src, g } = playBuffer(buf, { volume: 0.35, loop: true });
        loopNode.src = src; loopNode.g = g;
        return;
      }
      // Síntesis: ruido en loop filtrado según la herramienta.
      const [type, freq, q, gain] = LOOP_PROFILE[tool] || LOOP_PROFILE.pencil;
      const len = a.sampleRate * 0.6;
      const nb = a.createBuffer(1, len, a.sampleRate);
      const d = nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = a.createBufferSource(); src.buffer = nb; src.loop = true;
      const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.05);
      src.connect(f).connect(g).connect(a.destination); src.start();
      loopNode.src = src; loopNode.g = g;
    });
  } catch { loopNode = null; }
}
export function stopScratch() {
  if (!loopNode) return;
  const node = loopNode; loopNode = null;
  node.fading = true;
  try {
    if (node.g && node.src) {
      // Fade de 80 ms: detención inmediata pero sin clic.
      node.g.gain.exponentialRampToValueAtTime(0.0001, ac().currentTime + 0.08);
      node.src.stop(ac().currentTime + 0.12);
    }
  } catch {}
}

/* ------------------------------------------------------------
   Sonido global de botones — variante aleatoria en cada pulsación,
   sin duplicar los eventos que ya tienen sonido propio.
   ------------------------------------------------------------ */
let lastTapAt = 0;
export function initGlobalButtonAudio() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest?.('button');
    if (!btn) return;
    if (btn.closest('.st-stage')) return;          // el lienzo tiene sus propios sonidos
    const now = performance.now();
    if (now - lastTapAt < 90) return;              // evita ráfagas
    lastTapAt = now;
    playFx('tap');
  }, { capture: true, passive: true });
}
