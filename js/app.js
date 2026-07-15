// App bootstrap — theme, service worker, routing, invite handling, install.
import { $, $$ } from './core/utils.js';
import { store } from './core/store.js';
import { applyTheme } from './core/theme-apply.js';
import { applyDOM, getLang } from './core/i18n.js';
import { register, go, initTabbar } from './core/router.js';
import { sync } from './core/sync.js';
import { bus } from './core/bus.js';
import { toast } from './core/ui.js';

// Views
import { renderStudio } from './ui/studio.js';
import { renderGallery } from './ui/gallery.js';
import { renderChat } from './ui/chat.js';
import { renderUs } from './ui/us.js';
import { renderSettings } from './ui/settings.js';
import { renderOnboarding } from './ui/onboarding.js';

async function boot() {
  applyTheme();
  applyDOM();

  // Register routes
  register('studio', renderStudio);
  register('studio-new', renderStudio);
  register('gallery', renderGallery);
  register('chat', renderChat);
  register('us', renderUs);
  register('settings', renderSettings);
  register('onboarding', renderOnboarding);

  initTabbar();

  // Realtime (BroadcastChannel-based; swap transport for a backend later)
  handleInvite();
  sync.init();

  // Show app, hide splash
  $('#app').hidden = false;
  setTimeout(() => { const sp = $('#splash'); sp.classList.add('hide'); setTimeout(() => sp.remove(), 400); }, 650);

  // Initial route
  const params = new URLSearchParams(location.search);
  const routeParam = params.get('route');
  if (!store.get().onboarded) go('onboarding');
  else if (routeParam && ['studio', 'gallery', 'chat', 'us', 'settings'].includes(routeParam)) go(routeParam);
  else go('gallery');

  // React to language changes → re-render current route labels
  bus.on('i18n:change', () => { applyDOM(); });

  registerSW();
}

function handleInvite() {
  const params = new URLSearchParams(location.search);
  const invite = params.get('invite');
  if (invite) {
    store.set('couple', { inviteCode: invite });
    setTimeout(() => toast('💞 Conectado con tu pareja'), 1200);
  }
}

// PWA install prompt capture
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__deferredPrompt = e; bus.emit('pwa:installable'); });
window.addEventListener('appinstalled', () => toast('¡Dibujo instalada! 🎉'));

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('Actualización disponible — reabre la app'); });
    });
  } catch (e) { console.warn('SW registration failed', e); }
}

// Prevent pinch-zoom on the document (canvas handles its own zoom)
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

boot();
