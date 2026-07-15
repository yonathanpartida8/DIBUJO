// UI primitives — toasts, modals, bottom sheets, confirm, sounds.
import { el, $ } from './utils.js';
import { store } from './store.js';
import { t } from './i18n.js';

// ---------- Toast ----------
export function toast(msg, { icon = '', ms = 2200 } = {}) {
  const host = $('#toast-host');
  const node = el('div', { class: 'toast' }, [icon ? el('span', { text: icon }) : null, el('span', { text: msg })]);
  host.append(node);
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 240); }, ms);
}

// ---------- Modal ----------
export function modal(content, { onClose } = {}) {
  const host = $('#modal-host');
  host.innerHTML = '';
  const box = el('div', { class: 'modal' });
  box.append(...(Array.isArray(content) ? content : [content]));
  host.append(box);
  host.hidden = false;
  const close = () => { host.hidden = true; host.innerHTML = ''; onClose?.(); };
  host.onclick = (e) => { if (e.target === host) close(); };
  return { close, box };
}

// ---------- Bottom sheet ----------
export function sheet(title, content, { onClose, height } = {}) {
  const host = $('#sheet-host');
  host.innerHTML = '';
  const box = el('div', { class: 'sheet' });
  if (height) box.style.height = height;
  box.append(el('div', { class: 'grip' }));
  if (title) box.append(el('h3', { text: title }));
  box.append(...(Array.isArray(content) ? content : [content]));
  host.append(box);
  host.hidden = false;
  const close = () => { box.style.animation = 'sheetIn var(--dur-3) var(--ease) reverse'; setTimeout(() => { host.hidden = true; host.innerHTML = ''; onClose?.(); }, 260); };
  host.onclick = (e) => { if (e.target === host) close(); };
  return { close, box };
}

// ---------- Confirm ----------
export function confirmDialog({ title, message, confirmText, danger } = {}) {
  return new Promise((resolve) => {
    const m = modal([
      el('h2', { text: title || t('common.confirm') }),
      message ? el('p', { text: message, style: { color: 'var(--text-2)', marginTop: '6px' } }) : null,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-ghost btn-block', text: t('common.cancel'), onclick: () => { m.close(); resolve(false); } }),
        el('button', { class: `btn btn-block ${danger ? 'btn-primary' : 'btn-accent'}`, text: confirmText || t('common.confirm'), onclick: () => { m.close(); resolve(true); } }),
      ]),
    ]);
  });
}

// ---------- Prompt ----------
export function promptDialog({ title, value = '', placeholder = '', confirmText } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { class: 'input', value, placeholder });
    const m = modal([
      el('h2', { text: title }),
      el('div', { class: 'field', style: { marginTop: '12px' } }, [input]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn btn-ghost btn-block', text: t('common.cancel'), onclick: () => { m.close(); resolve(null); } }),
        el('button', { class: 'btn btn-primary btn-block', text: confirmText || t('common.save'), onclick: () => { m.close(); resolve(input.value.trim()); } }),
      ]),
    ]);
    setTimeout(() => input.focus(), 60);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { m.close(); resolve(input.value.trim()); } });
  });
}

// ---------- Sounds (WebAudio, tiny warm blips) ----------
let actx;
export function sound(type = 'tap') {
  if (store.get().settings.sounds !== 'on') return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const now = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    const map = { tap: 660, ok: 880, send: 990, pop: 520, love: 740 };
    o.type = 'sine'; o.frequency.value = map[type] || 660;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.06, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g).connect(actx.destination);
    o.start(now); o.stop(now + 0.2);
  } catch {}
}
