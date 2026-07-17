// ============================================================
// Sonidos satisfactorios — sintetizados con WebAudio (0 KB de
// audio descargado). Cada categoría se puede activar/desactivar
// en Ajustes. Volúmenes suaves, nada invasivo.
// ============================================================
import { store } from './store.js';

let ctx;
const ac = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

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

// Catálogo de eventos → clave de ajuste + síntesis.
const FX = {
  draw:      { key: 'sndDraw',    play: () => noise({ peak: 0.012, rel: 0.06, hp: 3500 }) },
  erase:     { key: 'sndErase',   play: () => noise({ peak: 0.02, rel: 0.12, hp: 900 }) },
  send:      { key: 'sndMsg',     play: () => { tone(740, { peak: 0.06, rel: 0.12 }); tone(990, { delay: 0.07, peak: 0.05, rel: 0.14 }); } },
  receive:   { key: 'sndMsg',     play: () => { tone(880, { peak: 0.05, rel: 0.1 }); tone(660, { delay: 0.08, peak: 0.05, rel: 0.16 }); } },
  panelOpen: { key: 'sndPanel',   play: () => tone(520, { peak: 0.035, rel: 0.1, slide: 160 }) },
  panelClose:{ key: 'sndPanel',   play: () => tone(600, { peak: 0.03, rel: 0.1, slide: -180 }) },
  achieve:   { key: 'sndAchieve', play: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, { delay: i * 0.09, peak: 0.07, rel: 0.25 })); } },
  save:      { key: 'sndSave',    play: () => { tone(660, { peak: 0.05, rel: 0.1 }); tone(830, { delay: 0.06, peak: 0.05, rel: 0.18 }); } },
  tap:       { key: 'sounds',     play: () => tone(660, { peak: 0.04, rel: 0.09 }) },
  pop:       { key: 'sounds',     play: () => tone(520, { peak: 0.05, rel: 0.08, slide: 120 }) },
  love:      { key: 'sounds',     play: () => { tone(740, { peak: 0.05, rel: 0.2 }); tone(932, { delay: 0.05, peak: 0.04, rel: 0.24 }); } },
};

export function playFx(name) {
  const s = store.get().settings;
  if (s.sounds !== 'on') return;
  const fx = FX[name] || FX.tap;
  if (fx.key !== 'sounds' && s[fx.key] !== 'on') return;
  try { fx.play(); } catch {}
}

// Sonido de trazo continuo (rasguño suave mientras se dibuja).
let scratchNode = null;
export function startScratch() {
  const s = store.get().settings;
  if (s.sounds !== 'on' || s.sndDraw !== 'on' || scratchNode) return;
  try {
    const a = ac();
    const len = a.sampleRate * 0.4;
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 4200; f.Q.value = 0.6;
    const g = a.createGain(); g.gain.value = 0.006;
    src.connect(f).connect(g).connect(a.destination); src.start();
    scratchNode = { src, g };
  } catch {}
}
export function stopScratch() {
  if (!scratchNode) return;
  try { scratchNode.g.gain.exponentialRampToValueAtTime(0.0001, ac().currentTime + 0.08); scratchNode.src.stop(ac().currentTime + 0.12); } catch {}
  scratchNode = null;
}
