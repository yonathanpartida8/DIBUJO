// Minimal SPA router. Routes render into #view-root. Studio can take over full screen.
import { $, $$ } from './utils.js';
import { bus } from './bus.js';

const routes = new Map();
let current = null;

export function register(name, renderFn) { routes.set(name, renderFn); }

export async function go(name, params = {}) {
  const render = routes.get(name);
  if (!render) { console.warn('no route', name); return; }
  // Leave hook
  if (current && current.leave) { try { await current.leave(); } catch {} }
  const root = $('#view-root');
  root.innerHTML = '';
  const ctx = { params, root };
  current = { name, leave: null };
  const view = await render(ctx);
  if (view && view.leave) current.leave = view.leave;
  // Tab highlight
  const tabRoute = name === 'studio-new' ? 'studio' : name;
  $$('.tab').forEach((tb) => tb.classList.toggle('active', tb.dataset.route === tabRoute));
  // Studio y pantallas de entrada ocupan todo (sin barra de pestañas).
  document.body.dataset.fullscreen = ['studio', 'studio-new', 'player', 'login', 'pairing', 'onboarding'].includes(name) ? '1' : '0';
  bus.emit('route:change', name);
  try { history.replaceState({ route: name }, '', `?route=${name}`); } catch {}
  root.scrollTo?.(0, 0);
}

export function initTabbar() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const r = tab.dataset.route;
      go(r);
    });
  });
}
export function currentRoute() { return current?.name; }
