// ============================================================
// Pantalla de inicio — ultra limpia y premium.
// Fondo aurora WebGL2 que reacciona al tacto, saludo dinámico
// según la hora local con entrada animada, y solo dos botones
// principales: Dibujar e Inbox. Nada más compite por atención.
// ============================================================
import { el, $, timeAgo } from '../core/utils.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { mountAurora } from '../gl/aurora.js';
import { playFx } from '../core/sounds.js';

function greetingFor(hour) {
  if (hour < 6) return 'Buenas madrugadas';
  if (hour < 12) return 'Buenos días';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

export async function renderHome(ctx) {
  const s = store.get();
  const view = el('div', { class: 'view home-hero' });
  ctx.root.append(view);

  // Fondo aurora (WebGL2 con degradación a CSS).
  const aurora = mountAurora(view);
  view.addEventListener('pointermove', (e) => aurora.touch(e.clientX, e.clientY), { passive: true });
  view.addEventListener('pointerdown', (e) => aurora.touch(e.clientX, e.clientY), { passive: true });

  // Iconos discretos arriba a la derecha (espacio, chat, ajustes).
  const topbar = el('div', { class: 'hero-topbar' }, [
    el('button', { class: 'hero-icon', html: icon('heart'), 'aria-label': 'Nuestro espacio', onclick: () => go('us') }),
    el('button', { class: 'hero-icon', html: icon('chat'), 'aria-label': 'Chat', onclick: () => go('chat') }, [el('i', { class: 'hero-dot', id: 'hero-chat-dot', hidden: true })]),
    el('button', { class: 'hero-icon', html: icon('settings'), 'aria-label': 'Ajustes', onclick: () => go('settings') }),
  ]);
  view.append(topbar);

  // Saludo dinámico con fecha del día.
  const now = new Date();
  const hour = now.getHours();
  const dateLine = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const p = store.get().partner;
  const presence = p.drawing ? `${p.name} está dibujando ahora` : p.online ? `${p.name} está en línea` : `${p.name} · ${timeAgo(p.lastSeen, t)}`;

  const presenceChip = el('button', { class: 'hero-presence', id: 'hero-presence', onclick: () => go('chat') }, [
    partnerAvatar(p),
    el('i', { class: 'presence-dot' + (p.online ? ' on' : '') }),
    el('span', { text: presence }),
  ]);
  const center = el('div', { class: 'hero-center' }, [
    el('div', { class: 'hero-date', text: dateLine }),
    el('div', { class: 'hero-greet', text: `${greetingFor(hour)},` }),
    el('div', { class: 'hero-name', text: s.profile.name }),
    presenceChip,
  ]);
  view.append(center);

  // Dos botones principales — glass premium con brillo que sigue al dedo
  // e inclinación 3D sutil mientras se mantiene presionado.
  const actions = el('div', { class: 'hero-actions' }, [
    heroButton('pen', 'Dibujar', 'Un lienzo nuevo para los dos', 'draw', () => go('studio-new')),
    heroButton('inbox', 'Inbox', 'Sus dibujos y sorpresas', 'inbox', () => go('gallery')),
  ]);
  view.append(actions);

  // Entrada escalonada: la fecha y el saludo llegan con desenfoque → nitidez.
  const seq = [
    [topbar, 0], [center.children[0], 1], [center.children[1], 2],
    [center.children[2], 3], [presenceChip, 4], [actions.children[0], 5], [actions.children[1], 6],
  ];
  for (const [node, i] of seq) {
    node.animate(
      [{ opacity: 0, transform: 'translateY(20px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
      { duration: 680, delay: 80 + i * 95, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' }
    );
  }

  function partnerAvatar(pp) {
    const a = el('span', { class: 'hero-mini-avatar' });
    if (pp.avatar) a.append(el('img', { src: pp.avatar }));
    else a.textContent = (pp.name || '?')[0].toUpperCase();
    return a;
  }

  function heroButton(ic, title, sub, kind, fn) {
    const b = el('button', { class: `hero-btn hero-btn-${kind}` }, [
      el('span', { class: 'hb-glow' }),
      el('span', { class: 'hb-shine' }),
      el('span', { class: 'hb-icon', html: icon(ic) }),
      el('span', { class: 'hb-text' }, [el('span', { class: 'hb-title', text: title }), el('span', { class: 'hb-sub', text: sub })]),
      el('span', { class: 'hb-arrow', html: icon('back') }),
    ]);
    // Brillo radial que sigue el punto de contacto + inclinación 3D.
    const setPointer = (e) => {
      const r = b.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      b.style.setProperty('--px', (px * 100) + '%');
      b.style.setProperty('--py', (py * 100) + '%');
      b.style.setProperty('--tiltX', ((py - 0.5) * -6) + 'deg');
      b.style.setProperty('--tiltY', ((px - 0.5) * 8) + 'deg');
    };
    b.addEventListener('pointerdown', (e) => { setPointer(e); b.classList.add('pressed'); aurora.touch(e.clientX, e.clientY); playFx('tap'); });
    b.addEventListener('pointermove', (e) => { if (b.classList.contains('pressed')) setPointer(e); });
    const release = () => b.classList.remove('pressed');
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('click', fn);
    return b;
  }

  const offs = [
    bus.on('store:partner', () => {
      const pr = store.get().partner;
      const node = $('#hero-presence');
      if (!node) return;
      node.querySelector('span').textContent = pr.drawing ? `${pr.name} está dibujando ahora` : pr.online ? `${pr.name} está en línea` : `${pr.name} · ${timeAgo(pr.lastSeen, t)}`;
      node.querySelector('.presence-dot').classList.toggle('on', pr.online);
    }),
    bus.on('sync:message', () => { const d = $('#hero-chat-dot'); if (d) d.hidden = false; }),
  ];

  return { leave: () => { aurora.destroy(); offs.forEach((o) => o()); } };
}
