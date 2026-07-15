// Generates pastel PWA icons (PNG) without external deps.
// Minimal PNG encoder: signature + IHDR + IDAT (zlib) + IEND.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../assets/icons/', import.meta.url), { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function png(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function lerp(a, b, t) { return a + (b - a) * t; }
function draw(size, { maskable } = {}) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const pad = maskable ? size * 0.14 : size * 0.06;
  const r = size / 2 - pad;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // diagonal pastel gradient background (blush -> lavender)
      const t = (x + y) / (2 * size);
      let R = lerp(0xFF, 0xE6, t), G = lerp(0xD9, 0xDC, t), B = lerp(0xE4, 0xFB, t);
      let a = 255;
      // rounded-square mask for maskable safe area vs circle for regular
      const dx = x - cx, dy = y - cy;
      if (!maskable) {
        // rounded square
        const rr = size * 0.22;
        const qx = Math.abs(dx) - (size / 2 - pad - rr);
        const qy = Math.abs(dy) - (size / 2 - pad - rr);
        const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
        if (outside > 0) { a = 0; }
      }
      // heart shape (two circles + triangle), soft rose
      const hx = (x - cx) / (r * 0.92);
      const hy = (y - cy - r * 0.08) / (r * 0.92);
      const hv = Math.pow(hx * hx + hy * hy - 0.30, 3) - hx * hx * hy * hy * hy;
      if (hv < 0) {
        const ht = (x + y) / (2 * size);
        R = lerp(0xFF, 0xF6, ht); G = lerp(0x8F, 0xB7, ht); B = lerp(0xA6, 0xC4, ht);
      }
      buf[i] = R; buf[i + 1] = G; buf[i + 2] = B; buf[i + 3] = a;
    }
  }
  return png(size, size, buf);
}

const base = new URL('../assets/icons/', import.meta.url);
writeFileSync(new URL('icon-192.png', base), draw(192));
writeFileSync(new URL('icon-512.png', base), draw(512));
writeFileSync(new URL('icon-maskable-512.png', base), draw(512, { maskable: true }));
writeFileSync(new URL('apple-touch-icon.png', base), draw(180));
writeFileSync(new URL('favicon.png', base), draw(64));
console.log('icons generated');
