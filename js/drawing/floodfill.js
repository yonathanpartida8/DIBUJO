// Smart bucket fill — scanline flood fill with tolerance + edge detection.
// Fills only the enclosed region around the seed point (respecting drawn borders
// across ALL visible layers for edge detection, but painting only the target
// layer), so it never floods the whole canvas past a closed outline.
import { hexToRgb } from './color.js';

export function floodFill({ targetCtx, sampleImageData, x, y, hex, tolerance = 32, alpha = 1, w, h, expand = 1 }) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const src = sampleImageData.data;      // composite (for border detection)
  const idx = (px, py) => (py * w + px) * 4;
  const si = idx(x, y);
  const target = [src[si], src[si + 1], src[si + 2], src[si + 3]];
  const [fr, fg, fb] = hexToRgb(hex);
  const tol2 = tolerance * tolerance;

  const match = (i) => {
    const dr = src[i] - target[0], dg = src[i + 1] - target[1], db = src[i + 2] - target[2], da = src[i + 3] - target[3];
    return (dr * dr + dg * dg + db * db + da * da) <= tol2 * 4;
  };

  const out = targetCtx.getImageData(0, 0, w, h);
  const od = out.data;
  const visited = new Uint8Array(w * h);
  const stack = [[x, y]];
  const fa = Math.round(alpha * 255);

  while (stack.length) {
    let [px, py] = stack.pop();
    // move to left edge of span
    let lx = px;
    while (lx >= 0 && !visited[py * w + lx] && match(idx(lx, py))) lx--;
    lx++;
    let spanUp = false, spanDown = false;
    for (let cx = lx; cx < w && !visited[py * w + cx] && match(idx(cx, py)); cx++) {
      const p = py * w + cx;
      visited[p] = 1;
      const oi = p * 4;
      od[oi] = fr; od[oi + 1] = fg; od[oi + 2] = fb; od[oi + 3] = fa;
      if (py > 0) {
        const up = match(idx(cx, py - 1)) && !visited[(py - 1) * w + cx];
        if (up && !spanUp) { stack.push([cx, py - 1]); spanUp = true; }
        else if (!up) spanUp = false;
      }
      if (py < h - 1) {
        const dn = match(idx(cx, py + 1)) && !visited[(py + 1) * w + cx];
        if (dn && !spanDown) { stack.push([cx, py + 1]); spanDown = true; }
        else if (!dn) spanDown = false;
      }
    }
  }

  // Optional: expand fill by `expand` px to close 1px anti-aliased gaps at borders.
  if (expand > 0) dilate(visited, w, h, expand, od, fr, fg, fb, fa);

  targetCtx.putImageData(out, 0, 0);
}

function dilate(visited, w, h, radius, od, fr, fg, fb, fa) {
  const copy = visited.slice();
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (copy[py * w + px]) continue;
      let hit = false;
      for (let dy = -radius; dy <= radius && !hit; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (copy[ny * w + nx]) { hit = true; break; }
        }
      }
      if (hit) { const oi = (py * w + px) * 4; od[oi] = fr; od[oi + 1] = fg; od[oi + 2] = fb; od[oi + 3] = fa; }
    }
  }
}

// Eyedropper — sample composited color at a point.
export function pickColor(imageData, x, y, w) {
  const i = (Math.round(y) * w + Math.round(x)) * 4;
  const d = imageData.data;
  if (d[i + 3] === 0) return null;
  return '#' + [d[i], d[i + 1], d[i + 2]].map((c) => c.toString(16).padStart(2, '0')).join('');
}
