// ============================================================
// Bootstrap de la app — tema, service worker, rutas, sesión,
// invitaciones, instalación PWA y logros.
// ============================================================
import { $, $$ } from './core/utils.js';
import { store } from './core/store.js';
import { applyTheme } from './core/theme-apply.js';
import { applyDOM } from './core/i18n.js';
import { register, go, initTabbar } from './core/router.js';
import { sync } from './core/sync.js';
import { bus } from './core/bus.js';
import { toast } from './core/ui.js';
import { fb } from './core/firebase.js';

// Vistas
import { renderStudio } from './ui/studio.js';
import { renderGallery } from './ui/gallery.js';
import { renderChat } from './ui/chat.js';
import { renderUs } from './ui/us.js';
import { renderSettings } from './ui/settings.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderHome } from './ui/home.js';
import { renderLogin, renderPairing } from './ui/login.js';

async function boot() {
  applyTheme();
  applyDOM();

  register('login', renderLogin);
  register('pairing', renderPairing);
  register('home', renderHome);
  register('studio', renderStudio);
  register('studio-new', renderStudio);
  register('gallery', renderGallery);
  register('chat', renderChat);
  register('us', renderUs);
  register('settings', renderSettings);
  register('onboarding', renderOnboarding);

  initTabbar();

  // Mostrar app y ocultar splash.
  $('#app').hidden = false;
  setTimeout(() => { const sp = $('#splash'); sp?.classList.add('hide'); setTimeout(() => sp?.remove(), 400); }, 650);

  await routeInitial();

  // Sincronización (transporte local o Firebase según cuenta/pareja).
  handleInviteParam();
  sync.init();

  // Logros: comprobación al arrancar (solo tras onboarding) y en cada cambio.
  import('./couples/achievements.js').then((m) => {
    if (store.get().onboarded) { m.markActiveDay(); m.checkAll(); }
    bus.on('gallery:refresh', () => { m.markActiveDay(); m.checkAll(); });
  });

  bus.on('i18n:change', () => applyDOM());
  registerSW();
}

// Decide la pantalla inicial según el estado de la cuenta.
async function routeInitial() {
  const params = new URLSearchParams(location.search);
  const routeParam = params.get('route');
  const acc = store.get().account;

  if (acc.mode === 'google') {
    // Restaura la sesión de Google en segundo plano; entra directo a la app.
    fb.restoreSession().then((user) => {
      if (!user) { store.set('account', { mode: null }); go('login'); }
    }).catch(() => {});
    goHomeOr(routeParam);
    return;
  }
  if (acc.mode === 'local') {
    if (!store.get().onboarded) { go('onboarding'); return; }
    goHomeOr(routeParam);
    return;
  }
  // Primera vez: si vuelve de un redirect de Google, la sesión aparecerá aquí.
  try {
    const user = await Promise.race([
      fb.restoreSession(),
      new Promise((res) => setTimeout(() => res(null), 3500)),
    ]);
    if (user) {
      const { afterLogin } = await import('./ui/login.js');
      afterLogin(null);
      return;
    }
  } catch {}
  go('login');
}
function goHomeOr(routeParam) {
  if (routeParam && ['home', 'studio', 'gallery', 'chat', 'us', 'settings'].includes(routeParam)) go(routeParam);
  else go('home');
}

function handleInviteParam() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite');
  if (invite) {
    store.set('couple', { inviteCode: invite });
    setTimeout(() => toast('💞 Código de invitación recibido'), 1200);
  }
}

// Captura del prompt de instalación PWA.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__deferredPrompt = e; bus.emit('pwa:installable'); });
window.addEventListener('appinstalled', () => toast('¡Dibujo instalada! 🎉'));

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Actualización lista — vuelve a abrir la app'); });
    });
  } catch (e) { console.warn('SW registration failed', e); }
}

// Sin zoom accidental: el lienzo gestiona su propio zoom.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

boot();
