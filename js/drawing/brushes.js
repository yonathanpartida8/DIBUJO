// ============================================================
// Biblioteca de pinceles. Cada pincel es una función de "dab";
// el motor recorre el trazo y estampa dabs a intervalos.
// Un PRNG sembrado (mulberry32) mantiene el grano determinista
// para que la reproducción del proceso sea idéntica.
//
// v4: cada pincel tiene comportamiento, textura y propósito
// claramente DIFERENTE — nada de duplicados con variaciones.
// ============================================================
import { hexToRgb } from './color.js';

// PRNG sembrado (mulberry32) — determinista por trazo.
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
// Punta biselada (elipse orientada) — marcadores y caligrafía.
function chiselDab(ctx, x, y, rx, ry, ang, hex, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = rgba(hex, alpha);
  ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fill();
  ctx.restore();
}

export const BRUSHES = {
  /* ---------- LÁPICES (secos, con grano) ---------- */
  pencil: {
    id: 'pencil', name: 'Lápiz', cat: 'pencil', size: 5, opacity: 0.9, spacing: 0.14,
    // Grafito fino: núcleo delgado + estrías de grano a lo largo del trazo.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      hardDab(ctx, x, y, r * 0.55, hex, o * 0.5);
      const n = 3 + (r | 0);
      for (let i = 0; i < n; i++) {
        const along = (rng() - 0.5) * r * 2.2, side = (rng() - 0.5) * r * 1.4;
        const px = x + Math.cos(ang) * along - Math.sin(ang) * side;
        const py = y + Math.sin(ang) * along + Math.cos(ang) * side;
        hardDab(ctx, px, py, 0.5, hex, o * 0.35 * rng());
      }
    },
  },
  charcoal: {
    id: 'charcoal', name: 'Carboncillo', cat: 'pencil', size: 18, opacity: 0.85, spacing: 0.12,
    // Oscuro y polvoriento: mancha con arrastre trasero (smear).
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      softDab(ctx, x, y, r * 0.8, hex, o * 0.5, 0.25);
      // arrastre hacia atrás del movimiento
      for (let i = 0; i < 4; i++) {
        const back = rng() * r * 1.6;
        softDab(ctx, x - Math.cos(ang) * back, y - Math.sin(ang) * back, r * (0.5 - i * 0.08), hex, o * 0.18, 0.15);
      }
      const n = 10 + (r | 0);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.4) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.5 + rng() * 1.2, hex, o * (0.2 + rng() * 0.45));
      }
    },
  },
  chalk: {
    id: 'chalk', name: 'Tiza', cat: 'pencil', size: 20, opacity: 0.8, spacing: 0.16,
    // Grano grueso y saltos: cubre de forma irregular, ideal sobre fondos oscuros.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = 16 + (r | 0) * 2;
      for (let i = 0; i < n; i++) {
        if (rng() < 0.45) continue; // saltos de tiza
        const a = rng() * 6.283, d = Math.sqrt(rng()) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.7 + rng() * 1.1, hex, o * (0.25 + rng() * 0.4));
      }
    },
  },
  crayon: {
    id: 'crayon', name: 'Crayón', cat: 'pencil', size: 14, opacity: 0.9, spacing: 0.1,
    // Cera: trazos gruesos con huecos donde la cera no toca el papel.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = 6 + (r | 0);
      for (let i = 0; i < n; i++) {
        if (rng() < 0.3) continue;
        const side = (rng() - 0.5) * r * 2;
        const px = x - Math.sin(ang) * side, py = y + Math.cos(ang) * side;
        hardDab(ctx, px, py, 1 + rng() * 1.6, hex, o * (0.5 + rng() * 0.4));
      }
    },
  },

  /* ---------- MARCADORES ---------- */
  marker: {
    id: 'marker', name: 'Marcador', cat: 'marker', size: 24, opacity: 0.55, spacing: 0.035,
    blend: 'multiply', noPressure: true,
    // Punta biselada plana: banda ancha, translúcida y uniforme que se
    // oscurece al superponer pasadas (multiply), como un marcador real.
    dab(ctx, x, y, r, hex, o, hard, ang) {
      chiselDab(ctx, x, y, r * 1.35, r * 0.5, ang, hex, o);
    },
  },
  pixel: {
    id: 'pixel', name: 'Pixel', cat: 'marker', size: 8, opacity: 1, spacing: 0.5, pixel: true, noPressure: true,
    dab(ctx, x, y, r, hex, o) {
      const s = Math.max(1, Math.round(r * 2));
      ctx.fillStyle = rgba(hex, o);
      ctx.fillRect(Math.round(x / s) * s - s / 2, Math.round(y / s) * s - s / 2, s, s);
    },
  },

  /* ---------- PLUMAS (tinta nítida) ---------- */
  pen: {
    id: 'pen', name: 'Pluma', cat: 'pen', size: 7, opacity: 1, spacing: 0.06, smooth: true,
    // Tinta limpia con borde nítido; la presión afina la línea.
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, hex, o); },
  },
  ballpoint: {
    id: 'ballpoint', name: 'Bolígrafo', cat: 'pen', size: 3.2, opacity: 0.9, spacing: 0.09, smooth: true,
    // Línea fina constante con pequeñas acumulaciones de tinta ocasionales.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      hardDab(ctx, x, y, r * 0.9, hex, o * (0.8 + rng() * 0.2));
      if (rng() < 0.035) hardDab(ctx, x, y, r * 1.7, hex, o * 0.55); // gotita de tinta
    },
  },
  calligraphy: {
    id: 'calligraphy', name: 'Caligrafía', cat: 'pen', size: 22, opacity: 1, spacing: 0.025, noPressure: true,
    // Plumilla ancha en ángulo fijo: contraste dramático entre subidas y bajadas.
    dab(ctx, x, y, r, hex, o) {
      chiselDab(ctx, x, y, r, r * 0.16, -0.6, hex, o);
    },
  },

  /* ---------- PINCELES (húmedos) ---------- */
  brush: {
    id: 'brush', name: 'Pincel redondo', cat: 'brush', size: 20, opacity: 0.95, spacing: 0.05,
    // Pincel redondo con borde suave y afinado marcado por presión.
    dab(ctx, x, y, r, hex, o, hard) { softDab(ctx, x, y, r, hex, o, hard ?? 0.72); },
  },
  watercolor: {
    id: 'watercolor', name: 'Acuarela', cat: 'brush', size: 40, opacity: 0.14, spacing: 0.28,
    blend: 'multiply',
    // Aguada translúcida con borde que se encharca (más pigmento en el filo).
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const jx = (rng() - 0.5) * r * 0.4, jy = (rng() - 0.5) * r * 0.4;
      softDab(ctx, x + jx, y + jy, r, hex, o, 0.05);
      // filo encharcado
      ctx.save();
      ctx.strokeStyle = rgba(hex, o * 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x + jx, y + jy, r * (0.86 + rng() * 0.1), rng() * 6.28, rng() * 6.28 + 3.5); ctx.stroke();
      ctx.restore();
    },
  },

  flat: {
    id: 'flat', name: 'Pincel plano', cat: 'brush', size: 26, opacity: 0.9, spacing: 0.03,
    // Brocha plana: banda ancha orientada al trazo con cerdas secas en los bordes.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      chiselDab(ctx, x, y, r * 0.38, r * 1.25, ang, hex, o);
      // cerdas: pequeñas vetas en los extremos de la brocha
      for (let i = 0; i < 3; i++) {
        const off = (rng() - 0.5) * r * 2.3;
        const px = x - Math.sin(ang) * off, py = y + Math.cos(ang) * off;
        if (Math.abs(off) > r * 0.8) hardDab(ctx, px, py, 0.8, hex, o * 0.5 * rng());
      }
    },
  },
  smudge: {
    id: 'smudge', name: 'Difuminador', cat: 'brush', size: 34, opacity: 1, spacing: 0.1, smudge: true,
    // Arrastra el pigmento ya pintado (implementado en paint.js).
    dab() {},
  },

  /* ---------- AERÓGRAFOS ---------- */
  airbrush: {
    id: 'airbrush', name: 'Aerógrafo', cat: 'spray', size: 52, opacity: 0.04, spacing: 0.26,
    // Niebla amplia y uniforme para degradados y sombras.
    dab(ctx, x, y, r, hex, o) { softDab(ctx, x, y, r, hex, o, 0.02); },
  },
  splatter: {
    id: 'splatter', name: 'Salpicado', cat: 'spray', size: 34, opacity: 0.5, spacing: 0.6,
    // Gotas dispersas de distinto tamaño — textura y energía.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = 5 + ((r / 4) | 0);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.5) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.6 + rng() * rng() * 3.4, hex, o * (0.5 + rng() * 0.5));
      }
    },
  },

  /* ---------- BORRADORES ---------- */
  eraser: {
    id: 'eraser', name: 'Borrador', cat: 'erase', size: 22, opacity: 1, spacing: 0.1, erase: true, smooth: true,
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, '#000', o); },
  },
  eraserSoft: {
    id: 'eraserSoft', name: 'Borrador suave', cat: 'erase', size: 30, opacity: 0.35, spacing: 0.12, erase: true,
    dab(ctx, x, y, r, hex, o) { softDab(ctx, x, y, r, '#000', o, 0.05); },
  },
  eraserPixel: {
    id: 'eraserPixel', name: 'Borrador píxel', cat: 'erase', size: 10, opacity: 1, spacing: 0.5, erase: true, pixel: true, noPressure: true,
    dab(ctx, x, y, r) { const s = Math.max(1, Math.round(r * 2)); ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x / s) * s - s / 2, Math.round(y / s) * s - s / 2, s, s); },
  },
};

export const BRUSH_LIST = Object.values(BRUSHES);

// Categorías del editor (orden de presentación).
export const BRUSH_CATS = {
  pencil: 'Lápices',
  marker: 'Marcadores',
  pen: 'Plumas',
  brush: 'Pinceles',
  spray: 'Aerógrafos',
  erase: 'Borradores',
};
