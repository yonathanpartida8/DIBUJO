// First-run onboarding — warm, minimal, sets up the couple.
import { el, $ } from '../core/utils.js';
import { store } from '../core/store.js';
import { t } from '../core/i18n.js';
import { go } from '../core/router.js';

export function renderOnboarding(ctx) {
  const root = ctx.root;
  const view = el('div', { class: 'view view-pad', style: { minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '460px', margin: '0 auto' } });
  root.append(view);

  let step = 0;
  const data = { name: store.get().profile.name, partner: store.get().partner.name, since: '' };
  const card = el('div', { class: 'card card-grad', style: { textAlign: 'center', padding: '30px 22px' } });
  view.append(card);
  render();

  function render() {
    card.innerHTML = '';
    if (step === 0) {
      card.append(
        el('div', { style: { fontSize: '3.4rem' }, text: '💕' }),
        el('h1', { style: { fontFamily: 'var(--font-round)', marginTop: '8px' }, text: t('onb.welcome') }),
        el('p', { style: { color: 'var(--text-2)', margin: '8px 0 20px' }, text: t('onb.sub') }),
        input('onb.yourName', data.name, (v) => data.name = v),
        input('onb.partnerName', data.partner, (v) => data.partner = v),
        el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '16px' }, text: t('onb.next'), onclick: () => { step = 1; render(); } }),
      );
    } else {
      card.append(
        el('div', { style: { fontSize: '3.4rem' }, text: '💍' }),
        el('h2', { style: { fontFamily: 'var(--font-round)', marginTop: '8px' }, text: t('onb.anniversary') }),
        el('p', { style: { color: 'var(--text-2)', margin: '8px 0 16px' }, text: 'Opcional — para vuestro contador de tiempo juntos.' }),
        el('input', { class: 'input', type: 'date', style: { textAlign: 'center' }, oninput: (e) => data.since = e.target.value }),
        el('button', { class: 'btn btn-primary btn-block btn-lg', style: { marginTop: '20px' }, html: '🎨 ' + t('onb.start'), onclick: finish }),
        el('button', { class: 'btn btn-ghost btn-block', style: { marginTop: '8px' }, text: t('common.back'), onclick: () => { step = 0; render(); } }),
      );
    }
  }
  function input(key, val, on) {
    const i = el('input', { class: 'input', value: val, placeholder: t(key), style: { marginBottom: '10px', textAlign: 'center' } });
    i.oninput = () => on(i.value);
    return el('div', {}, [el('label', { style: { display: 'block', fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '4px' }, text: t(key) }), i]);
  }
  function finish() {
    store.set('profile', { name: data.name.trim() || 'Yo' });
    store.set('partner', { name: data.partner.trim() || 'Mi amor' });
    if (data.since) store.set('couple', { since: new Date(data.since).getTime() });
    store.set({ onboarded: true });
    go('home');
  }
}
