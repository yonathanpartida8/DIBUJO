// Color utilities + interactive color wheel (hue ring + SV triangle/square).
import { el, clamp } from '../core/utils.js';

export function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); v = clamp(v, 0, 1);
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((x) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
export function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hsvToHex = (h, s, v) => rgbToHex(...hsvToRgb(h, s, v));

// Build an interactive wheel widget. onChange receives hex.
export function colorWheel({ size = 240, hex = '#ef92a6', onChange }) {
  const [r0, g0, b0] = hexToRgb(hex);
  let [h, s, v] = rgbToHsv(r0, g0, b0);
  const cv = el('canvas', { class: 'wheel-canvas', width: size, height: size });
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const ctx = cv.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const ringOuter = size / 2, ringInner = size / 2 - 26;
  const sqSize = (ringInner) * Math.SQRT1_2 * 2 * 0.92;

  function drawRing() {
    for (let a = 0; a < 360; a += 1) {
      const start = (a - 0.5) * Math.PI / 180, end = (a + 1) * Math.PI / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, (ringOuter + ringInner) / 2, start, end);
      ctx.strokeStyle = `hsl(${a}, 80%, 62%)`;
      ctx.lineWidth = ringOuter - ringInner;
      ctx.stroke();
    }
  }
  function drawSquare() {
    // SV square in current hue
    const x0 = cx - sqSize / 2, y0 = cy - sqSize / 2;
    const img = ctx.createImageData(Math.ceil(sqSize), Math.ceil(sqSize));
    for (let yy = 0; yy < sqSize; yy++) {
      for (let xx = 0; xx < sqSize; xx++) {
        const sv = xx / sqSize, vv = 1 - yy / sqSize;
        const [rr, gg, bb] = hsvToRgb(h, sv, vv);
        const i = (yy * Math.ceil(sqSize) + xx) * 4;
        img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, x0, y0);
    // handles
    const hr = (ringOuter + ringInner) / 2;
    const ha = h * Math.PI / 180;
    ctx.beginPath(); ctx.arc(cx + Math.cos(ha) * hr, cy + Math.sin(ha) * hr, 8, 0, 7); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
    const px = x0 + s * sqSize, py = y0 + (1 - v) * sqSize;
    ctx.beginPath(); ctx.arc(px, py, 7, 0, 7); ctx.strokeStyle = v > 0.5 ? '#000' : '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }
  function redraw() { ctx.clearRect(0, 0, size, size); drawRing(); drawSquare(); }

  let mode = null;
  function pick(clientX, clientY) {
    const rect = cv.getBoundingClientRect();
    const x = (clientX - rect.left) * (size / rect.width);
    const y = (clientY - rect.top) * (size / rect.height);
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (mode === 'ring' || (mode == null && d >= ringInner - 4 && d <= ringOuter + 4)) {
      mode = 'ring';
      h = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;
    } else {
      mode = 'square';
      const x0 = cx - sqSize / 2, y0 = cy - sqSize / 2;
      s = clamp((x - x0) / sqSize, 0, 1);
      v = clamp(1 - (y - y0) / sqSize, 0, 1);
    }
    redraw();
    onChange?.(hsvToHex(h, s, v));
  }
  const down = (e) => { mode = null; e.preventDefault(); const p = e.touches ? e.touches[0] : e; pick(p.clientX, p.clientY); const move = (ev) => { const q = ev.touches ? ev.touches[0] : ev; pick(q.clientX, q.clientY); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  cv.addEventListener('pointerdown', down);
  redraw();
  return {
    node: cv,
    set(hexVal) { const [rr, gg, bb] = hexToRgb(hexVal); [h, s, v] = rgbToHsv(rr, gg, bb); redraw(); },
    get() { return hsvToHex(h, s, v); },
  };
}
