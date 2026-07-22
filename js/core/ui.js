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
  import('./sounds.js').then((m) => m.playFx('panelOpen'));
  // El cierre retardado solo limpia si esta hoja sigue montada — así abrir
  // una hoja nueva justo después de cerrar otra no la borra por accidente.
  const close = () => {
    box.style.animation = 'sheetIn var(--dur-3) var(--ease) reverse';
    import('./sounds.js').then((m) => m.playFx('panelClose'));
    setTimeout(() => { if (box.parentNode === host) { host.hidden = true; host.innerHTML = ''; } onClose?.(); }, 260);
  };
  host.onclick = (e) => { if (e.target === host) close(); };

  // Gesto nativo: arrastrar el asa (o la cabecera) hacia abajo para cerrar.
  const grip = box.querySelector('.grip');
  if (grip) {
    let startY = null;
    grip.addEventListener('pointerdown', (e) => {
      startY = e.clientY;
      box.classList.add('dragging');
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      const dy = Math.max(0, e.clientY - startY);
      box.style.transform = `translateY(${dy}px)`;
      box.style.opacity = String(1 - Math.min(0.35, dy / 500));
    });
    const end = (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      box.classList.remove('dragging');
      if (dy > 110) { box.style.transition = 'transform 0.22s ease, opacity 0.22s ease'; box.style.transform = 'translateY(110%)'; setTimeout(() => { if (box.parentNode === host) { host.hidden = true; host.innerHTML = ''; } onClose?.(); }, 210); import('./sounds.js').then((m) => m.playFx('panelClose')); }
      else { box.style.transition = 'transform 0.26s cubic-bezier(0.22,1,0.36,1)'; box.style.transform = ''; box.style.opacity = ''; setTimeout(() => box.style.transition = '', 280); }
      startY = null;
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
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

// ---------- Sonidos (delegado al motor central de sounds.js) ----------
import { playFx } from './sounds.js';
export function sound(type = 'tap') { playFx(type); }
