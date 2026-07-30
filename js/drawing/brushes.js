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

// ---- Grano invariante a la escala -------------------------------------
// TODO el detalle interno de un pincel con grano se define en FRACCIONES del
// radio, y la cantidad de motas crece con el ÁREA (con techo por rendimiento).
// Así un pincel de 4 px y otro de 200 px tienen la MISMA textura, sin que
// aparezcan "objetos duplicados", motas sueltas ni líneas separadas.
const specks = (r, per = 0.9, max = 220) => Math.max(4, Math.min(max, Math.round(r * per)));
// Cantidad por ÁREA: la textura mantiene la misma densidad visual al crecer el
// pincel (un pincel 4× más grande necesita ~16× más motas, no 4×). Los sellos
// van en caché, así que podemos permitirnos miles de motas finas.
const areaN = (r, dens = 0.06, max = 2600) => Math.max(6, Math.min(max, Math.round(r * r * dens)));
// Núcleo opaco: se pinta a alfa 1 dentro del búfer del trazo, así los dabs
// contiguos se UNEN en vez de acumularse (nada de discos oscuros visibles).
function coreDab(ctx, x, y, r, hex) {
  ctx.fillStyle = rgba(hex, 1);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
}
// Mordida: quita pigmento con huecos irregulares → textura seca del papel.
function bite(ctx, x, y, r, rng, n, minF, maxF) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.283, d = Math.sqrt(rng()) * r;
    const rr = r * (minF + rng() * (maxF - minF));
    ctx.fillStyle = 'rgba(0,0,0,' + (0.35 + rng() * 0.65) + ')';
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7); ctx.fill();
  }
  ctx.restore();
}

export const BRUSHES = {
  /* ---------- LÁPICES (secos, con grano) ---------- */
  pencil: {
    id: 'pencil', name: 'Lápiz', cat: 'pencil', size: 5, opacity: 0.92, spacing: 0.06, grain: true,
    // Grafito: núcleo unido (alfa 1 en el búfer) mordido por el grano del papel.
    // Todo en fracciones de r → misma textura a 4 px y a 200 px.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      coreDab(ctx, x, y, r * 0.94, hex);
      // Grano FINO y abundante (por área) → textura de papel, no burbujas.
      bite(ctx, x, y, r, rng, areaN(r, 0.10, 3000), 0.012, 0.045);
      // estrías finas en el sentido del trazo (grano del grafito)
      const n = areaN(r, 0.05, 1400);
      ctx.save(); ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < n; i++) {
        const along = (rng() - 0.5) * r * 1.9, side = (rng() - 0.5) * r * 1.8;
        const px = x + Math.cos(ang) * along - Math.sin(ang) * side;
        const py = y + Math.sin(ang) * along + Math.cos(ang) * side;
        ctx.fillStyle = 'rgba(0,0,0,' + (0.15 + rng() * 0.4) + ')';
        ctx.beginPath(); ctx.arc(px, py, r * 0.018, 0, 7); ctx.fill();
      }
      ctx.restore();
    },
  },
  charcoal: {
    id: 'charcoal', name: 'Carboncillo', cat: 'pencil', size: 18, opacity: 0.88, spacing: 0.07, grain: true,
    // Oscuro y polvoriento: núcleo suave + polvo muy fino alrededor.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      softDab(ctx, x, y, r, hex, 0.9, 0.5);
      bite(ctx, x, y, r * 0.95, rng, areaN(r, 0.09, 2800), 0.014, 0.05);
      const n = areaN(r, 0.05, 1600);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.4) * r * 1.22;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.008 + rng() * 0.022), hex, 0.3 + rng() * 0.5);
      }
    },
  },
  crayon: {
    id: 'crayon', name: 'Crayón', cat: 'pencil', size: 14, opacity: 0.95, spacing: 0.05, grain: true,
    // Cera: cuerpo denso con microhuecos donde la cera no toca el papel
    // (antes eran líneas paralelas separadas — ya no).
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      coreDab(ctx, x, y, r * 0.95, hex);
      bite(ctx, x, y, r, rng, areaN(r, 0.11, 3000), 0.02, 0.055);
    },
  },

  /* ---------- MARCADORES ---------- */
  marker: {
    id: 'marker', name: 'Marcador', cat: 'pen', size: 24, opacity: 0.5, spacing: 0.035,
    blend: 'multiply', noPressure: true,
    // Tinta de plumilla ancha: banda translúcida y uniforme que se oscurece al
    // superponer pasadas (multiply), como un marcador real. Cinta continua.
    ink: { profile: 'chisel', follow: true, tilt: 0.30, nib: 1.0, round: 0.42 },
    dab(ctx, x, y, r, hex, o, hard, ang) { chiselDab(ctx, x, y, r * 1.35, r * 0.5, ang, hex, o); },
  },

  /* ---------- PLUMAS (tinta nítida) ---------- */
  pen: {
    id: 'pen', name: 'Pluma', cat: 'pen', size: 7, opacity: 1, spacing: 0.06,
    // Tinta limpia de borde nítido; la presión afina la línea. Cinta continua.
    ink: { profile: 'round', taper: 0.42 },
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, hex, o); },
  },
  ballpoint: {
    id: 'ballpoint', name: 'Bolígrafo', cat: 'pen', size: 3.4, opacity: 0.92, spacing: 0.09,
    // Línea fina y constante, apenas sensible a la presión.
    ink: { profile: 'round', taper: 0.7, min: 0.5 },
    dab(ctx, x, y, r, hex, o, hard, ang, rng) { hardDab(ctx, x, y, r * 0.9, hex, o); },
  },
  calligraphy: {
    id: 'calligraphy', name: 'Caligrafía', cat: 'pen', size: 22, opacity: 1, spacing: 0.025, noPressure: true,
    // Plumilla ancha en ángulo fijo: contraste dramático entre subidas y bajadas.
    ink: { profile: 'chisel', angle: -0.62, nib: 1.0, round: 0.16 },
    dab(ctx, x, y, r, hex, o) { chiselDab(ctx, x, y, r, r * 0.16, -0.6, hex, o); },
  },

  /* ---------- PINCELES (húmedos) ---------- */
  brush: {
    id: 'brush', name: 'Pincel redondo', cat: 'brush', size: 20, opacity: 0.95, spacing: 0.05,
    // Pincel redondo: cinta suave que engorda y afina con la presión.
    ink: { profile: 'round', taper: 0.28 },
    dab(ctx, x, y, r, hex, o, hard) { softDab(ctx, x, y, r, hex, o, hard ?? 0.72); },
  },
  watercolor: {
    id: 'watercolor', name: 'Acuarela', cat: 'brush', size: 38, opacity: 0.22, spacing: 0.28,
    blend: 'multiply',
    // Aguada translúcida: cinta ancha a baja opacidad que se acumula (multiply).
    ink: { profile: 'round', taper: 0.4 },
    dab(ctx, x, y, r, hex, o, hard) { softDab(ctx, x, y, r, hex, o, 0.05); },
  },

  flat: {
    id: 'flat', name: 'Pincel plano', cat: 'brush', size: 26, opacity: 0.92, spacing: 0.03,
    // Brocha plana: banda ancha de plumilla, ancho variable según la dirección.
    ink: { profile: 'chisel', follow: true, tilt: 0.14, nib: 1.0, round: 0.30 },
    dab(ctx, x, y, r, hex, o, hard, ang) { chiselDab(ctx, x, y, r * 0.38, r * 1.25, ang, hex, o); },
  },
  smudge: {
    id: 'smudge', name: 'Difuminador', cat: 'brush', size: 34, opacity: 1, spacing: 0.1, smudge: true,
    // Arrastra el pigmento ya pintado (implementado en paint.js).
    dab() {},
  },

  /* ---------- AERÓGRAFOS ---------- */
  airbrush: {
    id: 'airbrush', name: 'Aerógrafo', cat: 'spray', size: 52, opacity: 0.5, spacing: 0.1,
    // Niebla amplia y uniforme para degradados y sombras. La opacidad vive en
    // el trazo (no por dab), así se ve igual de suave a cualquier tamaño.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      softDab(ctx, x, y, r, hex, 0.1, 0.0);
      // salpicado fino de aerosol, proporcional al radio
      const n = specks(r, 0.5, 90);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.6) * r;
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.02, hex, 0.06 + rng() * 0.1);
      }
    },
  },
  splatter: {
    id: 'splatter', name: 'Salpicado', cat: 'spray', size: 34, opacity: 0.85, spacing: 0.34,
    // Gotas dispersas de distinto tamaño — proporcionales al pincel.
    dab(ctx, x, y, r, hex, o, hard, ang, rng) {
      const n = specks(r, 0.7, 120);
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.283, d = Math.pow(rng(), 0.5) * r;
        const rr = r * (0.012 + rng() * rng() * 0.075);
        hardDab(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, rr, hex, 0.55 + rng() * 0.45);
      }
    },
  },

  /* ---------- BORRADORES ---------- */
  eraser: {
    id: 'eraser', name: 'Borrador', cat: 'erase', size: 22, opacity: 1, spacing: 0.1, erase: true,
    ink: { profile: 'round', taper: 0.6 },
    dab(ctx, x, y, r, hex, o) { hardDab(ctx, x, y, r, '#000', o); },
  },
  eraserSoft: {
    id: 'eraserSoft', name: 'Borrador suave', cat: 'erase', size: 30, opacity: 0.35, spacing: 0.12, erase: true,
    dab(ctx, x, y, r, hex, o) { softDab(ctx, x, y, r, '#000', o, 0.05); },
  },
};

// Compatibilidad: dibujos guardados con herramientas que ya no existen se
// reproducen con su equivalente más cercano en vez de caer a la pluma.
export const BRUSH_ALIAS = { chalk: 'charcoal', pixel: 'marker', eraserPixel: 'eraser' };
export const resolveBrush = (id) => BRUSHES[id] || BRUSHES[BRUSH_ALIAS[id]] || BRUSHES.pen;

export const BRUSH_LIST = Object.values(BRUSHES);

// Categorías del editor (orden de presentación).
export const BRUSH_CATS = {
  pencil: 'Lápices',
  pen: 'Tinta',
  brush: 'Pinceles',
  spray: 'Aerógrafo',
  erase: 'Borrador',
};
