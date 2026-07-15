// Klipy GIF search integration.
const API_KEY = '7HOIFEhbgdIjjP6m7bBtXcFaYqlfcYVL2Tc4v5f4hSSSLJ5gO2zghUvQo3JELuSm';
const BASE = 'https://api.klipy.com/v2';

// Robustly pull a gif URL out of an item regardless of the exact schema shape.
function pickUrl(item, keys) {
  const found = [];
  const walk = (o, depth = 0) => {
    if (!o || depth > 5) return;
    if (typeof o === 'string') { if (/\.(gif|webp|mp4)(\?|$)/i.test(o)) found.push(o); return; }
    if (typeof o !== 'object') return;
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'string' && /\.(gif|webp|mp4)(\?|$)/i.test(v)) found.push(v);
      else walk(v, depth + 1);
    }
  };
  walk(item);
  return found;
}

function normalize(item) {
  const urls = pickUrl(item);
  const gif = urls.find((u) => /\.gif/i.test(u)) || urls[0];
  const preview = urls.find((u) => /(tiny|small|preview|nano)/i.test(u)) || gif;
  const w = item.width || item.dims?.[0] || 200;
  const h = item.height || item.dims?.[1] || 200;
  return gif ? { id: item.id || gif, url: gif, preview: preview || gif, w, h } : null;
}

export async function searchGifs(q, { limit = 24 } = {}) {
  const url = `${BASE}/search?key=${API_KEY}&q=${encodeURIComponent(q || 'love')}&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('klipy ' + res.status);
    const data = await res.json();
    const list = data.data || data.results || data.gifs || data.items || (Array.isArray(data) ? data : []);
    const arr = Array.isArray(list) ? list : (list.data || list.items || []);
    return arr.map(normalize).filter(Boolean);
  } catch (e) {
    console.warn('GIF search failed', e);
    return [];
  }
}

export async function trendingGifs(opts) {
  try {
    const res = await fetch(`${BASE}/trending?key=${API_KEY}&limit=${opts?.limit || 24}`);
    if (res.ok) {
      const data = await res.json();
      const list = data.data || data.results || data.items || [];
      const arr = Array.isArray(list) ? list : (list.data || []);
      const mapped = arr.map(normalize).filter(Boolean);
      if (mapped.length) return mapped;
    }
  } catch {}
  return searchGifs('love couple', opts);
}
