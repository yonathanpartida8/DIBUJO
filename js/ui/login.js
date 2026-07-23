// ============================================================
// Inicio de sesión + sistema de pareja.
//  1) "Continuar con Google"  → Firebase Auth, perfil automático.
//  2) "Usar sin cuenta"       → modo local (todo en el dispositivo).
// Tras el login: elegir entre entrar sin pareja, invitar a tu
// pareja (código AB7K-XP93) o introducir un código recibido.
// ============================================================
import { el, $ } from '../core/utils.js';
import { store } from '../core/store.js';
import { fb } from '../core/firebase.js';
import { go } from '../core/router.js';
import { toast, sound } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';

const heartSVG = '<svg viewBox="0 0 32 32" width="72" height="72" style="fill:var(--primary);filter:drop-shadow(0 8px 20px rgba(239,146,166,.4))"><path d="M16 28C16 28 4 20.5 4 12.5C4 8.4 7.1 5.5 10.8 5.5C13 5.5 15 6.7 16 8.6C17 6.7 19 5.5 21.2 5.5C24.9 5.5 28 8.4 28 12.5C28 20.5 16 28 16 28Z"/></svg>';
const googleSVG = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-1.8 13.6-4.9l-6.3-5.3C29.2 35.2 26.7 36 24 36c-5.3 0-9.7-2.6-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 35.4 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/></svg>';

export function renderLogin(ctx) {
  const view = el('div', { class: 'view login-view' });
  ctx.root.append(view);
  const card = el('div', { class: 'login-card' });
  view.append(card);
  showWelcome(card);
  return {};
}

function showWelcome(card) {
  card.innerHTML = '';
  card.append(
    el('div', { class: 'login-heart', html: heartSVG }),
    el('h1', { class: 'login-title', text: 'Dibujo' }),
    el('p', { class: 'login-sub', text: 'Un espacio privado para dibujar juntos,\naunque estén a miles de kilómetros.' }),
    el('button', { class: 'btn btn-block btn-lg login-google', html: googleSVG + '<span>Continuar con Google</span>', onclick: () => doGoogle(card) }),
    el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '10px' }, text: 'Usar sin cuenta (solo este dispositivo)', onclick: () => {
      store.set('account', { mode: 'local' });
      if (!store.get().onboarded) go('onboarding'); else go('home');
    } }),
    el('p', { class: 'login-note', text: 'Con Google, sus dibujos, chat y recuerdos se sincronizan en tiempo real entre ambos.' }),
  );
}

async function doGoogle(card) {
  const btn = card.querySelector('.login-google');
  btn.disabled = true; btn.querySelector('span').textContent = 'Conectando…';
  try {
    const user = await fb.signInWithGoogle();
    if (!user) return; // flujo por redirect en curso
    sound('love');
    afterLogin(card);
  } catch (e) {
    console.warn(e);
    toast(e?.message || 'No se pudo iniciar sesión. Revisa tu conexión.', { ms: 3600 });
    btn.disabled = false; btn.querySelector('span').textContent = 'Continuar con Google';
  }
}

// Tras iniciar sesión: elegir camino de pareja.
export function afterLogin(cardOrNull) {
  if (fb.coupleId) { finish(); return; }
  const card = cardOrNull || $('.login-card');
  if (!card) { go('pairing'); return; }
  showPairing(card);
}

export function renderPairing(ctx) {
  const view = el('div', { class: 'view login-view' });
  ctx.root.append(view);
  const card = el('div', { class: 'login-card' });
  view.append(card);
  showPairing(card);
  return {};
}

function showPairing(card) {
  const name = store.get().profile.name || 'Hola';
  card.innerHTML = '';
  card.append(
    el('div', { class: 'login-big-icon', html: heartSVG }),
    el('h2', { class: 'login-title', style: { fontSize: '1.5rem' }, text: `¡Hola, ${name}!` }),
    el('p', { class: 'login-sub', text: '¿Cómo quieres empezar?' }),
    bigOption('users', 'Entrar sin pareja', 'Explora la app; puedes vincularte después', () => finish()),
    bigOption('send', 'Invitar a tu pareja :>', 'Genera un código único para compartir', () => showInvite(card)),
    bigOption('key', 'Tengo un código', 'Tu pareja ya te invitó', () => showJoin(card)),
  );
}

function bigOption(ic, title, sub, fn) {
  return el('button', { class: 'login-option', onclick: fn }, [
    el('div', { class: 'lo-emoji', html: icon(ic) }),
    el('div', { class: 'lo-main' }, [el('div', { class: 'lo-title', text: title }), el('div', { class: 'lo-sub', text: sub })]),
    el('div', { class: 'lo-arrow', text: '›' }),
  ]);
}

async function showInvite(card) {
  card.innerHTML = '';
  card.append(el('div', { class: 'login-big-icon lbi-accent', html: icon('send') }), el('h2', { class: 'login-title', style: { fontSize: '1.4rem' }, text: 'Tu código de pareja' }), el('div', { class: 'sk', style: { height: '64px', margin: '14px 0' } }));
  let code;
  try { code = await fb.createInvite(); }
  catch { toast('No se pudo generar el código'); showPairing(card); return; }
  card.innerHTML = '';
  card.append(
    el('div', { class: 'login-big-icon lbi-accent', html: icon('send') }),
    el('h2', { class: 'login-title', style: { fontSize: '1.4rem' }, text: 'Comparte este código' }),
    el('div', { class: 'invite-code', text: code }),
    el('p', { class: 'login-sub', text: 'Cuando tu pareja lo introduzca, quedarán vinculados para siempre y se creará su espacio privado.' }),
    el('button', { class: 'btn btn-primary btn-block', text: 'Copiar y compartir', onclick: async () => {
      const msg = `Únete a nuestro espacio en Dibujo. Código: ${code} — ${location.origin}${location.pathname}`;
      try { if (navigator.share) await navigator.share({ text: msg }); else { await navigator.clipboard.writeText(msg); toast('Copiado ✓'); } } catch {}
    } }),
    el('div', { class: 'login-waiting' }, [el('span', { class: 'pulse-dot' }), 'Esperando a tu pareja…']),
    el('button', { class: 'btn btn-ghost btn-block', text: 'Entrar mientras tanto', onclick: () => finish() }),
  );
  fb.watchLink(() => { sound('achieve'); toast('¡Están vinculados!', { ms: 3000 }); finish(); });
}

function showJoin(card) {
  card.innerHTML = '';
  const input = el('input', { class: 'input invite-input', placeholder: 'AB7K-XP93', maxlength: 9, autocapitalize: 'characters' });
  input.oninput = () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); };
  const btn = el('button', { class: 'btn btn-primary btn-block btn-lg', text: 'Vincularnos', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Vinculando…';
    try {
      await fb.joinWithCode(input.value);
      sound('achieve'); toast('¡Espacio privado creado!', { ms: 3000 });
      finish();
    } catch (e) { toast(e.message || 'Código no válido'); btn.disabled = false; btn.textContent = 'Vincularnos'; }
  } });
  card.append(
    el('div', { class: 'login-big-icon lbi-accent', html: icon('key') }),
    el('h2', { class: 'login-title', style: { fontSize: '1.4rem' }, text: 'Introduce el código' }),
    el('p', { class: 'login-sub', text: 'El código que te compartió tu pareja' }),
    el('div', { class: 'field', style: { margin: '14px 0' } }, [input]),
    btn,
    el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, text: 'Volver', onclick: () => showPairing(card) }),
  );
  setTimeout(() => input.focus(), 80);
}

function finish() {
  if (!store.get().onboarded) store.set({ onboarded: true });
  go('home');
}
