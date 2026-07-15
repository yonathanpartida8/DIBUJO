// Brush library. Each brush is a "dab" function; the engine walks the path and
// places dabs at spacing intervals. A seeded RNG (passed in) keeps scatter
// deterministic so replaying the recorded strokes reproduces the exact artwork.
import { hexToRgb } from './color.js';

// Seeded PRNG (mulberry32) — deterministic per stroke.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

function softDab(ctx, x, y, r, hex, alpha, hardness) {
  if (r <= 0.2) return;
  const g = ctx.createRadialGradient(x, y, r * Math.min(0.98, hardness), x, y, r);
  const [rr, gg, bb] = hexToRgb(hex);
  g.addColorStop(0, `rgba(${rr},${gg},${bb},${alpha})`);
  g.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
function hardDab(ctx, x, y, r, hex, alpha) {
  ctx.fillStyle = rgba(hex, alpha);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}

export const BRUSHES = {
  pencil: {
    id: 'pencil', name: 'Lápiz', cat: 'dry', emoji: '✏️', size: 4, opacity: 0.9, spacing: 0.12, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      // fine graphite: small core + scattered grain
      hardDab(ctx, x, y, r * 0.72, hex, o * 0.85);
      const n = 2 + (r | 0);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = rng() * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6, hex, o * 0.4 * rng());
      }
    },
  },
  pen: {
    id: 'pen', name: 'Pluma', cat: 'ink', emoji: '🖋️', size: 5, opacity: 1, spacing: 0.08,
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, hex, o); },
  },
  ballpoint: {
    id: 'ballpoint', name: 'Bolígrafo', cat: 'ink', emoji: '🖊️', size: 2.4, opacity: 0.95, spacing: 0.1, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) { hardDab(ctx, x, y, r, hex, o * (0.7 + rng() * 0.3)); },
  },
  marker: {
    id: 'marker', name: 'Marcador', cat: 'ink', emoji: '🖍️', size: 16, opacity: 0.55, spacing: 0.14, blend: 'multiply',
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, hex, o); },
  },
  brush: {
    id: 'brush', name: 'Pincel', cat: 'wet', emoji: '🖌️', size: 14, opacity: 0.92, spacing: 0.08,
    dab(ctx, x, y, r, hex, o, hard) { softDab(ctx, x, y, r, hex, o, hard ?? 0.85); },
  },
  watercolor: {
    id: 'watercolor', name: 'Acuarela', cat: 'wet', emoji: '💧', size: 26, opacity: 0.16, spacing: 0.22, grain: true, blend: 'multiply',
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      for (let i = 0; i < 3; i++) {
        const jx = (rng() - 0.5) * r * 0.6, jy = (rng() - 0.5) * r * 0.6;
        softDab(ctx, x + jx, y + jy, r * (0.7 + rng() * 0.5), hex, o * (0.5 + rng() * 0.5), 0.1);
      }
    },
  },
  airbrush: {
    id: 'airbrush', name: 'Aerógrafo', cat: 'spray', emoji: '💨', size: 34, opacity: 0.05, spacing: 0.25, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = 14 + (r | 0);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.6) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.7 + rng(), hex, o * (0.6 + rng() * 0.4));
      }
    },
  },
  chalk: {
    id: 'chalk', name: 'Tiza', cat: 'dry', emoji: '🧴', size: 18, opacity: 0.85, spacing: 0.2, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = 10 + (r | 0) * 2;
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.5) * r;
        if (rng() > 0.35) hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + rng() * 0.8, hex, o * (0.3 + rng() * 0.5));
      }
    },
  },
  charcoal: {
    id: 'charcoal', name: 'Carboncillo', cat: 'dry', emoji: '⚫', size: 20, opacity: 0.9, spacing: 0.16, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      softDab(ctx, x, y, r * 0.7, hex, o * 0.4, 0.2);
      const n = 14 + (r | 0) * 2;
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.4) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + rng() * 1.1, hex, o * (0.35 + rng() * 0.5));
      }
    },
  },
  crayon: {
    id: 'crayon', name: 'Crayón', cat: 'dry', emoji: '🖍️', size: 14, opacity: 0.8, spacing: 0.14, grain: true,
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      // waxy directional grain
      const n = 8 + (r | 0);
      for (let i = 0; i < n; i++) {
        const off = (rng() - 0.5) * r * 1.6;
        const px = x + Math.cos(ang + 1.57) * off, py = y + Math.sin(ang + 1.57) * off;
        if (rng() > 0.25) hardDab(ctx, px, py, 0.7 + rng() * 0.8, hex, o * (0.4 + rng() * 0.5));
      }
    },
  },
  pixel: {
    id: 'pixel', name: 'Pixel', cat: 'special', emoji: '🟪', size: 8, opacity: 1, spacing: 0.5, pixel: true,
    dab(ctx, x, y, r, hex, o) {
      const s = Math.max(1, Math.round(r * 2));
      ctx.fillStyle = rgba(hex, o);
      ctx.fillRect(Math.round(x / s) * s - s / 2, Math.round(y / s) * s - s / 2, s, s);
    },
  },
  calligraphy: {
    id: 'calligraphy', name: 'Caligrafía', cat: 'ink', emoji: '✒️', size: 16, opacity: 1, spacing: 0.06, nibAngle: -0.7,
    dab(ctx, x, y, r, hex, o, hard, ang) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.7);
      ctx.fillStyle = rgba(hex, o);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.28, 0, 0, 7); ctx.fill();
      ctx.restore();
    },
  },
  // ---- Erasers (engine composites with destination-out) ----
  eraser: { id: 'eraser', name: 'Borrador', cat: 'erase', emoji: '🩹', size: 20, opacity: 1, spacing: 0.1, erase: true,
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, '#000', o); } },
  eraserSoft: { id: 'eraserSoft', name: 'Borrador suave', cat: 'erase', emoji: '☁️', size: 28, opacity: 0.5, spacing: 0.12, erase: true,
    dab(ctx, x, y, r, hex, o) { softDab(ctx, x, y, r, '#000', o, 0.1); } },
  eraserPixel: { id: 'eraserPixel', name: 'Borrador píxel', cat: 'erase', emoji: '🧩', size: 10, opacity: 1, spacing: 0.5, erase: true, pixel: true,
    dab(ctx, x, y, r) { const s = Math.max(1, Math.round(r * 2)); ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x / s) * s - s / 2, Math.round(y / s) * s - s / 2, s, s); } },
};

export const BRUSH_LIST = Object.values(BRUSHES);
export const BRUSH_CATS = {
  ink: 'Tinta', dry: 'Secos', wet: 'Húmedos', spray: 'Spray', special: 'Especiales', erase: 'Borradores',
};
