// ============================================================
// Personalizar inicio — el usuario diseña su propia pantalla:
// dibujar encima, añadir GIFs y textos arrastrables, cambiar el
// fondo, activar efectos románticos… y con "Inicio compartido"
// ambos editan el MISMO inicio sincronizado en tiempo real.
// ============================================================
import { el, uid, clamp } from '../core/utils.js';
import { store } from '../core/store.js';
import { sync } from '../core/sync.js';
import { bus } from '../core/bus.js';
import { sheet, toast, promptDialog } from '../core/ui.js';
import { icon } from './icons.js';
import { searchGifs } from '../media/klipy.js';

export function getHomeCfg() {
  return store.get().homeCustom || { bg: null, drawing: null, gifs: [], texts: [], hearts: false, shared: false };
}
function saveCfg(cfg) {
  store.set({ homeCustom: cfg });
  if (cfg.shared) sync.send('homeCfg', cfg); // inicio compartido: sincroniza al vuelo
  bus.emit('home:custom');
}
// Recepción en tiempo real del inicio compartido de la pareja.
sync.on?.('homeCfg', (cfg) => {
  if (!cfg) return;
  store.set({ homeCustom: { ...cfg, shared: true } });
  bus.emit('home:custom');
});

// ---------- Renderiza la personalización sobre la Home ----------
export function renderCustomLayer(host) {
  host.querySelector('.hc-layer')?.remove();
  const cfg = getHomeCfg();
  // Los elementos propios del inicio (saludo y botones Dibujar/Inbox) siempre
  // se muestran, y respetan la posición que el usuario les dio en el editor.
  const pos = cfg.pos || {};
  const center = host.querySelector('.hero-center');
  const actions = host.querySelector('.hero-actions');
  if (center) center.style.translate = pos.center ? `${pos.center.dx}vw ${pos.center.dy}vh` : '';
  if (actions) actions.style.translate = pos.actions ? `${pos.actions.dx}vw ${pos.actions.dy}vh` : '';
  const layer = el('div', { class: 'hc-layer' });
  if (cfg.bg) layer.style.background = cfg.bg.includes('gradient') ? cfg.bg : `linear-gradient(180deg, ${cfg.bg}cc, transparent 70%)`;
  if (cfg.drawing) layer.append(el('img', { class: 'hc-drawing', src: cfg.drawing, alt: '' }));
  for (const g of cfg.gifs) layer.append(el('img', { class: 'hc-gif anim-float', src: g.src, style: { left: g.x + '%', top: g.y + '%', width: g.w + '%' } }));
  for (const tx of cfg.texts) layer.append(el('div', { class: 'hc-text', text: tx.text, style: { left: tx.x + '%', top: tx.y + '%', fontSize: tx.size + 'px', color: tx.color } }));
  if (cfg.hearts) {
    const fx = el('div', { class: 'hc-hearts' });
    for (let i = 0; i < 9; i++) fx.append(el('i', { style: { left: (5 + i * 11) + '%', animationDelay: (i * 1.7) + 's', animationDuration: (9 + (i % 4) * 3) + 's' } }));
    layer.append(fx);
  }
  host.prepend(layer);
}

// ---------- Menú "Personalizar inicio" ----------
export function openCustomizeSheet(homeView) {
  const body = el('div');
  const sh = sheet('Personalizar inicio', body);
  const opt = (ic, title, sub, fn) => el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { sh.close(); fn(); } }, [el('div', { class: 'r-ic', html: icon(ic) }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })])]);
  const cfg = getHomeCfg();
  body.append(
    opt('toolPencil', 'Dibujar inicio', 'Pinta libremente sobre tu pantalla', () => openEditor(homeView, 'draw')),
    opt('gif', 'Añadir GIFs', 'Decora con GIFs animados', () => openEditor(homeView, 'gif')),
    opt('sparkle', 'Ambas', 'Dibuja y decora a la vez', () => openEditor(homeView, 'both')),
    opt('sun', 'Fondo y efectos', 'Color, textos y corazones flotantes', () => openEditor(homeView, 'style')),
  );
  // Inicio compartido: el mismo inicio para ambos, editable por los dos.
  const input = el('input', { type: 'checkbox' }); input.checked = !!cfg.shared;
  input.onchange = () => { const c = getHomeCfg(); c.shared = input.checked; saveCfg(c); toast(input.checked ? 'Inicio compartido activado' : 'Inicio compartido desactivado'); };
  body.append(el('div', { class: 'row', style: { background: 'var(--surface-inset)', borderRadius: 'var(--r-md)', marginTop: '8px' } }, [
    el('div', { class: 'r-ic', html: icon('users') }),
    el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Inicio compartido' }), el('div', { class: 'r-sub', text: 'Ambos editan el mismo inicio, sincronizado' })]),
    el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]),
  ]));
  body.append(el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, text: 'Restablecer inicio', onclick: () => { store.set({ homeCustom: null }); bus.emit('home:custom'); sh.close(); toast('Inicio restablecido'); } }));
}

// ---------- Editor a pantalla completa ----------
function openEditor(homeView, mode) {
  const cfg = structuredClone(getHomeCfg());
  cfg.pos = cfg.pos || {};
  const overlay = el('div', { class: 'hc-editor' });
  document.body.append(overlay);

  // Los elementos del inicio también se pueden MOVER: se crean manijas
  // exactamente encima del saludo y de los botones reales (visibles detrás).
  const movers = el('div', { class: 'hc-movers' });
  overlay.append(movers);
  const addMover = (key, label, target) => {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const box = el('div', { class: 'hc-mover', text: label, style: { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' } });
    let start = null;
    box.addEventListener('pointerdown', (e) => { e.stopPropagation(); box.setPointerCapture(e.pointerId); start = { x: e.clientX, y: e.clientY, base: { ...(cfg.pos[key] || { dx: 0, dy: 0 }) }, left: r.left, top: r.top }; });
    box.addEventListener('pointermove', (e) => {
      if (!start) return;
      const ddx = (e.clientX - start.x), ddy = (e.clientY - start.y);
      box.style.left = (start.left + ddx) + 'px'; box.style.top = (start.top + ddy) + 'px';
      cfg.pos[key] = { dx: start.base.dx + ddx / innerWidth * 100, dy: start.base.dy + ddy / innerHeight * 100 };
      // vista previa en vivo sobre el elemento real
      target.style.translate = `${cfg.pos[key].dx}vw ${cfg.pos[key].dy}vh`;
    });
    box.addEventListener('pointerup', () => start = null);
    movers.append(box);
  };
  setTimeout(() => {
    addMover('center', 'Saludo y nombre — arrastra para mover', homeView?.querySelector('.hero-center'));
    addMover('actions', 'Botones Dibujar e Inbox — arrastra para mover', homeView?.querySelector('.hero-actions'));
  }, 60);

  // Lienzo de dibujo (transparente, encima de todo el inicio).
  const cv = el('canvas', { class: 'hc-canvas' });
  const items = el('div', { class: 'hc-items' });
  overlay.append(cv, items);
  const g = cv.getContext('2d');
  const fit = () => {
    const prev = cfg.drawing;
    cv.width = overlay.clientWidth; cv.height = overlay.clientHeight;
    g.lineCap = g.lineJoin = 'round';
    if (prev) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, cv.width, cv.height); im.src = prev; }
  };
  setTimeout(fit, 30);

  let brushColor = '#e8899e', brushSize = 7, drawMode = (mode === 'draw' || mode === 'both');
  let last = null;
  cv.style.pointerEvents = drawMode ? 'auto' : 'none';
  cv.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!last) return;
    g.strokeStyle = brushColor; g.lineWidth = brushSize;
    g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(e.clientX, e.clientY); g.stroke();
    last = { x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointerup', () => { last = null; cfg.drawing = cv.toDataURL(); });

  const paintItems = () => {
    items.innerHTML = '';
    for (const gf of cfg.gifs) items.append(dragItem(el('img', { class: 'hc-gif', src: gf.src, style: { left: gf.x + '%', top: gf.y + '%', width: gf.w + '%' } }), gf));
    for (const tx of cfg.texts) items.append(dragItem(el('div', { class: 'hc-text', text: tx.text, style: { left: tx.x + '%', top: tx.y + '%', fontSize: tx.size + 'px', color: tx.color } }), tx));
  };
  // Arrastrar elementos por porcentaje de pantalla; mantener presionado borra.
  function dragItem(node, data) {
    node.style.pointerEvents = 'auto';
    let start = null, lp;
    node.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      node.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, ox: data.x, oy: data.y };
      lp = setTimeout(() => { if (confirm('¿Quitar este elemento?')) { cfg.gifs = cfg.gifs.filter((z) => z !== data); cfg.texts = cfg.texts.filter((z) => z !== data); paintItems(); } }, 700);
    });
    node.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clearTimeout(lp);
      data.x = clamp(start.ox + (e.clientX - start.x) / overlay.clientWidth * 100, 0, 92);
      data.y = clamp(start.oy + (e.clientY - start.y) / overlay.clientHeight * 100, 0, 92);
      node.style.left = data.x + '%'; node.style.top = data.y + '%';
    });
    node.addEventListener('pointerup', () => { start = null; clearTimeout(lp); });
    return node;
  }
  paintItems();

  // Barra del editor.
  const bar = el('div', { class: 'hc-bar' });
  const tool = (ic, label, fn, active) => { const b = el('button', { class: 'hc-tool' + (active ? ' active' : ''), html: icon(ic) }, [el('span', { text: label })]); b.onclick = () => fn(b); return b; };
  const drawBtn = tool('toolPencil', 'Dibujar', (b) => { drawMode = !drawMode; cv.style.pointerEvents = drawMode ? 'auto' : 'none'; b.classList.toggle('active', drawMode); }, drawMode);
  bar.append(
    drawBtn,
    tool('gif', 'GIF', () => pickGif((src) => { cfg.gifs.push({ id: uid('hg'), src, x: 30, y: 30, w: 22 }); paintItems(); })),
    tool('text', 'Texto', async () => { const txt = await promptDialog({ title: 'Texto para tu inicio', placeholder: 'Te amo…' }); if (txt) { cfg.texts.push({ id: uid('ht'), text: txt, x: 20, y: 20, size: 26, color: '#a45064' }); paintItems(); } }),
    tool('sun', 'Fondo', () => pickBg((bg) => { cfg.bg = bg; overlay.style.background = bg || 'transparent'; })),
    tool('heart', 'Efectos', (b) => { cfg.hearts = !cfg.hearts; b.classList.toggle('active', cfg.hearts); toast(cfg.hearts ? 'Corazones flotantes activados' : 'Efectos desactivados'); }),
  );
  const done = el('button', { class: 'btn btn-primary hc-done', text: 'Listo', onclick: () => {
    if (drawMode) cfg.drawing = cv.toDataURL();
    saveCfg(cfg);
    overlay.remove();
    toast('Tu inicio quedó precioso');
    bus.emit('home:custom');
  } });
  const cancel = el('button', { class: 'icon-btn hc-cancel', html: icon('close'), onclick: () => overlay.remove() });
  overlay.append(bar, done, cancel);

  // Paleta rápida del pincel del editor.
  const pal = el('div', { class: 'hc-pal' });
  ['#e8899e', '#a68fd0', '#8fbca4', '#5a4e58', '#f2c14e', '#ffffff'].forEach((c) => pal.append(el('button', { class: 'st-swatch', style: { background: c }, onclick: () => brushColor = c })));
  const sz = el('input', { class: 'slider', type: 'range', min: 2, max: 26, value: brushSize, style: { width: '90px' } });
  sz.oninput = () => brushSize = +sz.value;
  pal.append(sz);
  overlay.append(pal);

  function pickGif(cb) {
    const b2 = el('div');
    const input = el('input', { class: 'input', placeholder: 'Buscar GIFs…', value: 'bear love' });
    const grid = el('div', { class: 'gif-grid', style: { marginTop: '10px' } });
    b2.append(input, grid);
    const s2 = sheet('Elegir GIF', b2);
    const load = async (q) => { grid.innerHTML = '<div class="sk" style="height:90px"></div>'.repeat(6); const res = await searchGifs(q || 'bear love'); grid.innerHTML = ''; res.forEach((x) => grid.append(el('img', { src: x.preview, onclick: () => { cb(x.url); s2.close(); } }))); };
    let tm; input.oninput = () => { clearTimeout(tm); tm = setTimeout(() => load(input.value.trim()), 400); };
    load('bear love');
  }
  function pickBg(cb) {
    const b2 = el('div');
    const s2 = sheet('Fondo del inicio', b2);
    const opts = [null, '#fbe9ee', '#efe7fb', '#e9f3ed', '#fdf3e2', '#e3edfa',
      'linear-gradient(160deg,#fbe9ee,#efe7fb)', 'linear-gradient(160deg,#e9f3ed,#e3edfa)', 'linear-gradient(160deg,#fdf3e2,#fbe9ee)'];
    const grid = el('div', { class: 'st-palette', style: { flexWrap: 'wrap' } });
    opts.forEach((c) => grid.append(el('button', { class: 'st-swatch', style: { width: '52px', height: '52px', background: c || 'var(--surface)' }, onclick: () => { cb(c); s2.close(); } })));
    b2.append(grid);
  }
}
