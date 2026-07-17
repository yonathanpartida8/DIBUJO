// Settings — comprehensive, everything configurable.
import { el, $, downloadDataURL, blobToDataURL } from '../core/utils.js';
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { bus } from '../core/bus.js';
import { t, setLang, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { go } from '../core/router.js';
import { sheet, modal, toast, confirmDialog, promptDialog } from '../core/ui.js';
import { applyTheme } from '../core/theme-apply.js';

export async function renderSettings(ctx) {
  const root = ctx.root;
  const view = el('div', { class: 'view view-pad' });
  root.append(view);
  const s = store.get();

  view.append(el('div', { class: 'app-header', style: { padding: '10px 4px 8px' } }, [
    el('button', { class: 'icon-btn', html: icon('back'), onclick: () => go('us') }),
    el('div', {}, [el('h1', { text: t('set.title') })]),
  ]));

  // Profile card
  view.append(profileCard(s.profile, 'me'), profileCard(s.partner, 'partner'));

  // Cuenta y espacio de pareja
  view.append(section('Cuenta y pareja'));
  view.append(rows(accountRows(s)));

  // Appearance
  view.append(section(t('set.appearance')));
  view.append(rows([
    choiceRow('🎨', t('set.theme'), themeLabel(s.settings.theme), [['pastel', t('set.themePastel')], ['light', t('set.themeLight')], ['dark', t('set.themeDark')], ['auto', t('set.themeAuto')]], s.settings.theme, (v) => { store.set('settings', { theme: v }); applyTheme(); go('settings'); }),
    choiceRow('🌐', t('set.language'), s.settings.language === 'es' ? 'Español' : 'English', [['es', 'Español'], ['en', 'English']], s.settings.language, (v) => { setLang(v); go('settings'); }),
    choiceRow('🔠', t('set.uiSize'), uiLabel(s.settings.uiScale), [['s', 'Pequeño'], ['m', 'Mediano'], ['l', 'Grande'], ['xl', 'Muy grande']], s.settings.uiScale, (v) => { store.set('settings', { uiScale: v }); document.body.dataset.uiscale = v; }),
    toggleRow('✨', t('set.animations'), s.settings.animations === 'on', (v) => { store.set('settings', { animations: v ? 'on' : 'off' }); document.body.dataset.animations = v ? 'on' : 'off'; }),
  ]));

  // Drawing / performance
  view.append(section('Dibujo & ' + t('set.performance')));
  view.append(rows([
    choiceRow('💎', t('set.quality'), qualityLabel(s.settings.quality), [['low', 'Baja'], ['med', 'Media'], ['high', 'Alta']], s.settings.quality, (v) => store.set('settings', { quality: v })),
    choiceRow('⚡', t('set.performance'), perfLabel(s.settings.performance), [['battery', 'Ahorro de batería'], ['balanced', 'Equilibrado'], ['smooth', 'Máxima fluidez']], s.settings.performance, (v) => store.set('settings', { performance: v })),
    sliderRow('🖐️', t('studio.stabilizer'), s.settings.stabilizerDefault, (v) => store.set('settings', { stabilizerDefault: v })),
    sliderRow('〰️', t('studio.smoothing'), s.settings.smoothingDefault, (v) => store.set('settings', { smoothingDefault: v })),
  ]));

  // Feedback
  view.append(section('Sonido y vibración'));
  view.append(rows([
    toggleRow('🔊', t('set.sounds'), s.settings.sounds === 'on', (v) => store.set('settings', { sounds: v ? 'on' : 'off' })),
    toggleRow('✏️', 'Sonido al dibujar', s.settings.sndDraw === 'on', (v) => store.set('settings', { sndDraw: v ? 'on' : 'off' })),
    toggleRow('🩹', 'Sonido al borrar', s.settings.sndErase === 'on', (v) => store.set('settings', { sndErase: v ? 'on' : 'off' })),
    toggleRow('💬', 'Sonidos de mensajes', s.settings.sndMsg === 'on', (v) => store.set('settings', { sndMsg: v ? 'on' : 'off' })),
    toggleRow('🗂️', 'Sonidos de paneles', s.settings.sndPanel === 'on', (v) => store.set('settings', { sndPanel: v ? 'on' : 'off' })),
    toggleRow('🏆', 'Sonido de logros', s.settings.sndAchieve === 'on', (v) => store.set('settings', { sndAchieve: v ? 'on' : 'off' })),
    toggleRow('💾', 'Sonido al guardar', s.settings.sndSave === 'on', (v) => store.set('settings', { sndSave: v ? 'on' : 'off' })),
    toggleRow('📳', t('set.haptics'), s.settings.haptics === 'on', (v) => store.set('settings', { haptics: v ? 'on' : 'off' })),
    toggleRow('🔔', t('set.notifications'), s.settings.notifications === 'on', async (v) => { store.set('settings', { notifications: v ? 'on' : 'off' }); if (v && 'Notification' in window) await Notification.requestPermission(); }),
  ]));

  // Data / privacy / sync
  view.append(section(t('set.backup') + ' & ' + t('set.privacy')));
  view.append(rows([
    toggleRow('☁️', t('set.sync'), s.settings.autoSync === 'on', (v) => store.set('settings', { autoSync: v ? 'on' : 'off' })),
    toggleRow('💾', 'Copia automática', s.settings.autoBackup === 'on', (v) => store.set('settings', { autoBackup: v ? 'on' : 'off' })),
    toggleRow('🔒', 'Bloqueo con código', s.settings.privacyLock === 'on', (v) => store.set('settings', { privacyLock: v ? 'on' : 'off' })),
    tapRow('📤', t('set.export'), 'Descarga todos tus datos', exportData),
    tapRow('📥', t('set.import'), 'Restaura desde un archivo', importData),
    tapRow('📲', t('set.install'), 'Añade Dibujo a tu pantalla', promptInstall),
  ]));

  // About / reset
  view.append(section('Acerca de'));
  view.append(rows([
    infoRow('💕', 'Dibujo', 'Un lienzo para dos · v1.0'),
    tapRow('♻️', t('set.reset'), 'Borra todos los datos locales', resetAll),
  ]));

  view.append(el('div', { style: { height: '20px' } }));
  view.append(el('p', { style: { textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem', paddingBottom: '10px' }, text: 'Hecho con 💗 para las parejas creativas' }));

  if (ctx.params.section === 'profile') setTimeout(() => view.querySelector('.profile-card')?.scrollIntoView({ behavior: 'smooth' }), 100);

  return {};
}

function section(title) { return el('div', { class: 'section-title', text: title }); }

// Filas de cuenta: Google, código de pareja y cierre de sesión.
function accountRows(s) {
  const out = [];
  const acc = s.account;
  if (acc.mode === 'google') {
    out.push(infoRow('☁️', 'Sesión con Google', acc.coupleId ? 'Vinculados — espacio privado activo 💞' : 'Sin pareja vinculada aún'));
    if (!acc.coupleId) out.push(tapRow('💌', 'Invitar a mi pareja', 'Genera el código de vínculo', () => go('pairing')));
    out.push(tapRow('🚪', 'Cerrar sesión', null, async () => {
      const { fb } = await import('../core/firebase.js');
      await fb.signOut().catch(() => {});
      location.reload();
    }));
  } else {
    out.push(infoRow('📱', 'Modo local', 'Tus datos viven solo en este dispositivo'));
    out.push(tapRow('☁️', 'Iniciar sesión con Google', 'Activa la sincronización en tiempo real', async () => {
      const { fb } = await import('../core/firebase.js');
      try { const user = await fb.signInWithGoogle(); if (user) { toast('Sesión iniciada ✓'); go('pairing'); } }
      catch { toast('No se pudo iniciar sesión'); }
    }));
  }
  return out;
}
function rows(children) { return el('div', { class: 'rows' }, children); }
function toggleRow(emoji, title, checked, onChange) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked; input.onchange = () => onChange(input.checked);
  return el('div', { class: 'row' }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title })]), el('label', { class: 'switch' }, [input, el('span', { class: 'track' })])]);
}
function tapRow(emoji, title, sub, fn) {
  return el('div', { class: 'row tappable', onclick: fn }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), sub ? el('div', { class: 'r-sub', text: sub }) : null]), el('div', { class: 'r-val', text: '›' })]);
}
function infoRow(emoji, title, sub) {
  return el('div', { class: 'row' }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })])]);
}
function choiceRow(emoji, title, valLabel, options, current, onChange) {
  const row = el('div', { class: 'row tappable', onclick: () => {
    const body = el('div');
    const sh = sheet(title, body);
    options.forEach(([v, label]) => body.append(el('button', { class: 'row tappable', style: { width: '100%' }, onclick: () => { onChange(v); sh.close(); } }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: label })]), v === current ? el('span', { class: 'pill warm', text: '✓' }) : null])));
  } }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title })]), el('div', { class: 'r-val', text: valLabel + ' ›' })]);
  return row;
}
function sliderRow(emoji, title, value, onChange) {
  const val = el('div', { class: 'r-val', text: value + '%' });
  const sl = el('input', { class: 'slider', type: 'range', min: 0, max: 100, value, style: { flex: 1 } });
  sl.oninput = () => { val.textContent = sl.value + '%'; onChange(+sl.value); };
  return el('div', { class: 'row' }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main', style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [el('span', { style: { fontSize: '0.9rem', minWidth: '90px' }, text: title }), sl]), val]);
}

function profileCard(p, who) {
  const card = el('div', { class: 'card profile-card', style: { display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' } });
  const av = el('div', { class: 'avatar lg', style: p.color ? { background: p.color } : {} });
  if (p.avatar) av.append(el('img', { src: p.avatar })); else av.textContent = (p.name || '?')[0].toUpperCase();
  const editAvatar = () => { const inp = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } }); document.body.append(inp); inp.onchange = async () => { if (inp.files[0]) { const src = await blobToDataURL(inp.files[0]); store.set(who === 'me' ? 'profile' : 'partner', { avatar: src }); go('settings'); } inp.remove(); }; inp.click(); };
  av.onclick = editAvatar;
  const info = el('div', { style: { flex: 1 } }, [
    el('div', { style: { fontWeight: 800, fontSize: '1.05rem' }, text: p.name }),
    el('div', { style: { color: 'var(--text-2)', fontSize: '0.8rem' }, text: who === 'me' ? 'Tu perfil' : 'Tu pareja' }),
  ]);
  const colorIn = el('input', { type: 'color', value: p.color || '#ef92a6', style: { width: '40px', height: '40px', border: 'none', background: 'none' } });
  colorIn.onchange = () => { store.set(who === 'me' ? 'profile' : 'partner', { color: colorIn.value }); go('settings'); };
  const edit = el('button', { class: 'icon-btn', html: icon('pen'), onclick: async () => { const name = await promptDialog({ title: 'Nombre', value: p.name }); if (name) { store.set(who === 'me' ? 'profile' : 'partner', { name }); go('settings'); } } });
  card.append(av, info, colorIn, edit);
  return card;
}

async function exportData() {
  const dump = { store: store.get(), db: await db.exportAll(), version: 1, at: Date.now() };
  const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
  downloadDataURL(URL.createObjectURL(blob), `dibujo-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('Copia exportada 💾');
}
function importData() {
  const inp = el('input', { type: 'file', accept: 'application/json', style: { display: 'none' } });
  document.body.append(inp);
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const dump = JSON.parse(await f.text());
      if (dump.store) { store.set(dump.store); }
      if (dump.db) await db.importAll(dump.db);
      toast('Datos importados ✓'); location.reload();
    } catch { toast('Archivo inválido'); }
    inp.remove();
  };
  inp.click();
}
async function promptInstall() {
  const dp = window.__deferredPrompt;
  if (dp) { dp.prompt(); const { outcome } = await dp.userChoice; if (outcome === 'accepted') toast('¡Instalada! 🎉'); window.__deferredPrompt = null; }
  else modal([el('h2', { text: t('set.install') }), el('p', { style: { color: 'var(--text-2)', marginTop: '8px' }, text: 'En iPhone: toca Compartir → “Añadir a pantalla de inicio”. En Android: menú ⋮ → “Instalar app”.' }), el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-primary btn-block', text: t('common.done'), onclick: () => $('#modal-host').click() })])]);
}
async function resetAll() {
  if (!(await confirmDialog({ title: t('set.reset'), message: '¿Borrar TODOS los datos? Esta acción no se puede deshacer.', danger: true, confirmText: 'Borrar todo' }))) return;
  for (const s of ['drawings', 'folders', 'messages', 'media', 'memories', 'meta']) await db.clear(s);
  store.reset();
  location.reload();
}

const themeLabel = (v) => ({ pastel: t('set.themePastel'), light: t('set.themeLight'), dark: t('set.themeDark'), auto: t('set.themeAuto') }[v] || v);
const uiLabel = (v) => ({ s: 'Pequeño', m: 'Mediano', l: 'Grande', xl: 'Muy grande' }[v] || v);
const qualityLabel = (v) => ({ low: 'Baja', med: 'Media', high: 'Alta' }[v] || v);
const perfLabel = (v) => ({ battery: 'Ahorro', balanced: 'Equilibrado', smooth: 'Fluidez' }[v] || v);
