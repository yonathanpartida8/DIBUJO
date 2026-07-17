// ============================================================
// Sistema de logros — 300+ logros generados por categorías y
// niveles, con rarezas (común → mítico), insignias, animación
// de desbloqueo, sonido y recompensas cosméticas.
// ============================================================
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { bus } from '../core/bus.js';

export const RARITIES = [
  { id: 'comun', name: 'Común', color: '#b8c4c9', glow: 'rgba(184,196,201,.5)' },
  { id: 'raro', name: 'Raro', color: '#8fb8e8', glow: 'rgba(143,184,232,.5)' },
  { id: 'epico', name: 'Épico', color: '#c39ae0', glow: 'rgba(195,154,224,.55)' },
  { id: 'legendario', name: 'Legendario', color: '#f0b95e', glow: 'rgba(240,185,94,.55)' },
  { id: 'mitico', name: 'Mítico', color: '#ef92a6', glow: 'rgba(239,146,166,.65)' },
];

// Cada categoría genera un logro por nivel (tier). 21 categorías × 15 niveles = 315 logros.
const TIERS = [1, 3, 5, 10, 15, 20, 30, 50, 75, 100, 150, 250, 400, 700, 1000];
const CATS = [
  { id: 'draw', emoji: '🎨', name: 'Artistas', unit: 'dibujos', metric: (m) => m.drawings },
  { id: 'stroke', emoji: '🖌️', name: 'Trazos de amor', unit: 'trazos', metric: (m) => m.strokes, mult: 20 },
  { id: 'time', emoji: '⏱️', name: 'Tiempo creativo', unit: 'minutos dibujando', metric: (m) => m.minutes, mult: 2 },
  { id: 'color', emoji: '🌈', name: 'Arcoíris', unit: 'colores usados', metric: (m) => m.colors },
  { id: 'tool', emoji: '🧰', name: 'Herramientas', unit: 'herramientas distintas', metric: (m) => m.tools, tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  { id: 'layer', emoji: '📚', name: 'Por capas', unit: 'capas en un dibujo', metric: (m) => m.maxLayers, tiers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 25, 30] },
  { id: 'msg', emoji: '💬', name: 'Conversadores', unit: 'mensajes', metric: (m) => m.messages, mult: 5 },
  { id: 'gif', emoji: '🎞️', name: 'GIF lovers', unit: 'GIF enviados', metric: (m) => m.gifs },
  { id: 'audio', emoji: '🎙️', name: 'Susurros', unit: 'notas de voz', metric: (m) => m.audios },
  { id: 'sticker', emoji: '🌸', name: 'Stickers', unit: 'stickers enviados', metric: (m) => m.stickers },
  { id: 'sent', emoji: '💌', name: 'Cartas de amor', unit: 'dibujos enviados', metric: (m) => m.sentDrawings },
  { id: 'fav', emoji: '💖', name: 'Favoritos', unit: 'favoritos', metric: (m) => m.favorites },
  { id: 'streak', emoji: '🔥', name: 'Racha', unit: 'días seguidos', metric: (m) => m.streak, tiers: [2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365] },
  { id: 'memory', emoji: '📸', name: 'Recuerdos', unit: 'recuerdos guardados', metric: (m) => m.memories },
  { id: 'folder', emoji: '📁', name: 'Organizados', unit: 'carpetas', metric: (m) => m.folders, tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20] },
  { id: 'react', emoji: '😍', name: 'Reacciones', unit: 'reacciones', metric: (m) => m.reactions, mult: 2 },
  { id: 'comment', emoji: '📝', name: 'Comentaristas', unit: 'comentarios', metric: (m) => m.comments },
  { id: 'music', emoji: '🎵', name: 'Su banda sonora', unit: 'canciones', metric: (m) => m.songs, tiers: [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50] },
  { id: 'replay', emoji: '▶️', name: 'Cinéfilos', unit: 'procesos grabados', metric: (m) => m.recorded },
  { id: 'edit', emoji: '♻️', name: 'Perfeccionistas', unit: 'ediciones', metric: (m) => m.edits, mult: 3 },
  { id: 'days', emoji: '📅', name: 'Constancia', unit: 'días activos', metric: (m) => m.activeDays, tiers: [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 150, 250, 365] },
];

function rarityFor(tierIdx) {
  if (tierIdx <= 3) return RARITIES[0];
  if (tierIdx <= 7) return RARITIES[1];
  if (tierIdx <= 10) return RARITIES[2];
  if (tierIdx <= 13) return RARITIES[3];
  return RARITIES[4];
}

// Catálogo completo (generado una sola vez).
export const ACHIEVEMENTS = (() => {
  const out = [];
  for (const cat of CATS) {
    const tiers = cat.tiers || TIERS.map((t) => t * (cat.mult || 1));
    tiers.forEach((target, i) => {
      out.push({
        id: `${cat.id}_${i}`,
        cat: cat.id,
        emoji: cat.emoji,
        name: `${cat.name} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'][i]}`,
        desc: `Alcancen ${target} ${cat.unit}`,
        target,
        tier: i,
        rarity: rarityFor(i),
        metric: cat.metric,
        reward: i >= 13 ? '🌟 Marco mítico de perfil' : i >= 10 ? '✨ Insignia dorada' : i >= 7 ? '💜 Insignia épica' : null,
      });
    });
  }
  return out;
})();

// Recuento de métricas desde la base local.
async function computeMetrics() {
  const [drawings, messages, folders, memories, media] = await Promise.all([
    db.all('drawings'), db.all('messages'), db.all('folders'), db.all('memories'), db.all('media'),
  ]);
  const s = store.get();
  const m = {
    drawings: drawings.length,
    strokes: drawings.reduce((n, d) => n + (d.stats?.strokes || 0), 0),
    minutes: Math.floor(drawings.reduce((n, d) => n + (d.stats?.activeMs || 0), 0) / 60000),
    colors: drawings.reduce((n, d) => n + (d.stats?.colors?.length || 0), 0),
    tools: new Set(drawings.flatMap((d) => d.stats?.tools || [])).size,
    maxLayers: Math.max(1, ...drawings.map((d) => d.doc?.stack?.layers?.length || 1)),
    messages: messages.length,
    gifs: messages.filter((x) => x.type === 'gif').length,
    audios: messages.filter((x) => x.type === 'audio').length,
    stickers: messages.filter((x) => x.type === 'sticker').length,
    sentDrawings: messages.filter((x) => x.type === 'drawing' && x.from === 'me').length,
    favorites: drawings.filter((d) => d.favorite).length,
    streak: s.couple.streak || 0,
    memories: memories.length,
    folders: folders.length,
    reactions: drawings.reduce((n, d) => n + Object.values(d.reactions || {}).reduce((a, b) => a + b, 0), 0)
      + messages.reduce((n, x) => n + Object.keys(x.reactions || {}).length, 0),
    comments: drawings.reduce((n, d) => n + (d.comments?.length || 0), 0),
    songs: media.filter((x) => x.kind === 'song').length + drawings.filter((d) => d.music).length,
    recorded: drawings.filter((d) => d.recording?.ops?.length).length,
    edits: drawings.reduce((n, d) => n + (d.updatedAt !== d.createdAt ? 1 : 0), 0) * 3,
    activeDays: (s.couple.activeDays || []).length,
  };
  return m;
}

// Registra el día activo (para el logro de constancia).
export function markActiveDay() {
  const d = new Date(); const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const days = store.get().couple.activeDays || [];
  if (!days.includes(key)) store.set('couple', { activeDays: [...days, key].slice(-400) });
}

// Comprueba y desbloquea. Emite 'achieve:unlocked' con los nuevos.
export async function checkAll() {
  const metrics = await computeMetrics();
  const have = new Set(store.get().couple.achievements || []);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    if ((a.metric(metrics) || 0) >= a.target) { have.add(a.id); fresh.push(a); }
  }
  if (fresh.length) {
    store.set('couple', { achievements: [...have] });
    bus.emit('achieve:unlocked', fresh);
    import('../core/sounds.js').then((m) => m.playFx('achieve'));
  }
  return fresh;
}

export function progressFor(a, metrics) {
  return Math.min(1, (a.metric(metrics) || 0) / a.target);
}
export { computeMetrics };
