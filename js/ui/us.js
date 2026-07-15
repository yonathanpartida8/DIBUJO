// "Nosotros" — couple hub: time together, streak, challenge, goals, achievements,
// memories calendar, invite link, collaborative drawing.
import { el, $, uid, elapsedParts, fmtDate } from '../core/utils.js';
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { bus } from '../core/bus.js';
import { t, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { sheet, modal, toast, promptDialog, confirmDialog } from '../core/ui.js';
import { go } from '../core/router.js';
import { ACHIEVEMENTS, DAILY_CHALLENGES, todaysChallenge, generateInvite, checkAchievements, addMemory } from '../couples/features.js';

let counterInt;

export async function renderUs(ctx) {
  const root = ctx.root;
  await checkAchievements();
  const s = store.get();
  const view = el('div', { class: 'view view-pad' });
  root.append(view);

  // Header with avatars
  const header = el('div', { class: 'app-header', style: { padding: '10px 4px 4px' } }, [
    el('div', {}, [el('h1', { text: t('us.title') }), el('div', { class: 'sub', text: `${s.profile.name} 💞 ${s.partner.name}` })]),
    el('div', { class: 'header-actions' }, [el('button', { class: 'icon-btn', html: icon('settings'), onclick: () => go('settings') })]),
  ]);
  view.append(header);

  // Avatars pair
  view.append(el('div', { class: 'card card-grad', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginTop: '8px' } }, [
    el('div', { class: 'avatar-pair' }, [avatar(s.profile, 'lg'), avatar(s.partner, 'lg')]),
    counterEl(),
  ]));

  // Streak + challenge
  const row = el('div', { class: 'grid-2', style: { marginTop: '12px' } });
  row.append(
    el('div', { class: 'card', style: { textAlign: 'center' } }, [el('div', { class: 'streak', style: { fontSize: '1.8rem', justifyContent: 'center' }, html: `🔥 ${s.couple.streak || 0}` }), el('div', { class: 'lab', style: { color: 'var(--text-2)', fontSize: '0.78rem' }, text: `${t('us.streak')} · ${t('us.days')}` })]),
    el('div', { class: 'card', style: { textAlign: 'center' }, onclick: () => go('studio-new') }, [el('div', { style: { fontSize: '1.6rem' }, text: '🎯' }), el('div', { class: 'lab', style: { color: 'var(--text-2)', fontSize: '0.78rem', marginTop: '4px' }, text: t('us.challenge') })]),
  );
  view.append(row);

  // Daily challenge card
  view.append(el('div', { class: 'card', style: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' } }, [
    el('div', { style: { fontSize: '2rem' }, text: '✨' }),
    el('div', { style: { flex: 1 } }, [el('div', { style: { fontWeight: 700 }, text: t('us.challenge') }), el('div', { style: { color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '2px' }, text: todaysChallenge() })]),
    el('button', { class: 'btn btn-primary btn-sm', text: '¡Vamos!', onclick: () => go('studio-new') }),
  ]));

  // Collaborative toggle + invite
  view.append(el('div', { class: 'rows', style: { marginTop: '16px' } }, [
    settingRow('🤝', t('us.collab'), 'Dibujen en el mismo lienzo, en vivo', toggle(s.couple.collab, (v) => { store.set('couple', { collab: v }); if (v) toast('Modo colaborativo activado 🤝'); })),
    tapRow('🔗', t('us.invite'), 'Comparte un enlace con tu pareja', doInvite),
    tapRow('💍', t('us.setAnniversary'), s.couple.since ? fmtDate(s.couple.since, getLang()) : 'Sin definir', setAnniversary),
    tapRow('🖼️', 'Editar perfiles', 'Nombres, avatares y colores', () => go('settings', { section: 'profile' })),
  ]));

  // Goals
  const goalsWrap = el('div');
  view.append(goalsWrap);
  renderGoals();

  // Achievements
  view.append(el('div', { class: 'section-title', text: '🏆 ' + t('us.achievements') }));
  const have = new Set(store.get().couple.achievements || []);
  const ach = el('div', { class: 'grid-auto' });
  ACHIEVEMENTS.forEach((a) => {
    const unlocked = have.has(a.id);
    ach.append(el('div', { class: 'card', style: { textAlign: 'center', opacity: unlocked ? 1 : 0.45, filter: unlocked ? '' : 'grayscale(1)' } }, [
      el('div', { style: { fontSize: '2rem' }, text: a.emoji }),
      el('div', { style: { fontWeight: 700, fontSize: '0.85rem', marginTop: '4px' }, text: a.name }),
      el('div', { style: { color: 'var(--text-2)', fontSize: '0.72rem' }, text: a.desc }),
    ]));
  });
  view.append(ach);

  // Memories calendar
  view.append(el('div', { class: 'section-title', text: '📅 ' + t('us.memories') }).appendChild(el('button', { class: 'more', text: '+ Añadir', onclick: newMemory })).parentElement);
  const memWrap = el('div');
  view.append(memWrap);
  renderMemories();

  counterInt = setInterval(updateCounter, 1000);
  const off = bus.on('gallery:refresh', () => { renderGoals(); });
  return { leave: () => { clearInterval(counterInt); off(); } };

  // ---------- pieces ----------
  function counterEl() {
    const wrap = el('div', { id: 'together-counter', style: { textAlign: 'center' } });
    updateCounterInto(wrap);
    return wrap;
  }
  function updateCounter() { const w = $('#together-counter'); if (w) updateCounterInto(w); }
  function updateCounterInto(w) {
    const since = store.get().couple.since;
    if (!since) { w.innerHTML = ''; w.append(el('div', { style: { color: 'var(--text-2)' }, text: 'Definan su aniversario 💍' }), el('button', { class: 'btn btn-primary btn-sm', style: { marginTop: '6px' }, text: t('us.setAnniversary'), onclick: setAnniversary })); return; }
    const p = elapsedParts(since);
    w.innerHTML = '';
    w.append(el('div', { style: { color: 'var(--text-2)', fontSize: '0.8rem' }, text: t('us.together') }));
    const nums = el('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '4px' } });
    [[p.days, 'días'], [p.hours, 'h'], [p.minutes, 'm'], [p.seconds, 's']].forEach(([n, l]) => nums.append(el('div', { class: 'stat' }, [el('div', { class: 'num', text: n }), el('div', { class: 'lab', text: l })])));
    w.append(nums);
  }

  async function renderGoals() {
    goalsWrap.innerHTML = '';
    const title = el('div', { class: 'section-title', text: '🎯 ' + t('us.goals') });
    title.append(el('button', { class: 'more', text: '+ Añadir', onclick: newGoal }));
    goalsWrap.append(title);
    const goals = store.get().couple.goals || [];
    if (!goals.length) { goalsWrap.append(el('p', { style: { color: 'var(--text-3)', fontSize: '0.85rem', padding: '4px' }, text: 'Creen metas juntos: “20 dibujos este mes” 💪' })); return; }
    const count = await db.count('drawings');
    goals.forEach((g) => {
      const prog = Math.min(1, (g.type === 'drawings' ? count : g.done || 0) / g.target);
      const card = el('div', { class: 'card', style: { marginBottom: '8px' } }, [
        el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' } }, [el('span', { style: { fontWeight: 700 }, text: g.title }), el('span', { style: { color: 'var(--text-2)' }, text: `${g.type === 'drawings' ? count : (g.done || 0)}/${g.target}` })]),
        el('div', { class: 'bar' }, [el('i', { style: { width: (prog * 100) + '%' } })]),
      ]);
      card.oncontextmenu = (e) => { e.preventDefault(); removeGoal(g); };
      let lp; card.addEventListener('pointerdown', () => lp = setTimeout(() => removeGoal(g), 600)); card.addEventListener('pointerup', () => clearTimeout(lp));
      goalsWrap.append(card);
    });
  }
  async function newGoal() {
    const title = await promptDialog({ title: 'Nueva meta', placeholder: 'Ej. 20 dibujos juntos' });
    if (!title) return;
    const target = parseInt(await promptDialog({ title: '¿Objetivo? (número de dibujos)', value: '20' })) || 10;
    const goals = [...(store.get().couple.goals || []), { id: uid('goal'), title, target, type: 'drawings', done: 0 }];
    store.set('couple', { goals }); renderGoals();
  }
  async function removeGoal(g) {
    if (!(await confirmDialog({ title: 'Eliminar meta', message: g.title, danger: true }))) return;
    store.set('couple', { goals: (store.get().couple.goals || []).filter((x) => x.id !== g.id) }); renderGoals();
  }

  async function renderMemories() {
    memWrap.innerHTML = '';
    const mems = (await db.allByIndex('memories', 'date', 'prev'));
    if (!mems.length) { memWrap.append(el('p', { style: { color: 'var(--text-3)', fontSize: '0.85rem', padding: '4px' }, text: 'Guarda vuestros momentos especiales 📸' })); return; }
    mems.forEach((m) => {
      const card = el('div', { class: 'card', style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } }, [
        el('div', { style: { fontSize: '1.8rem' }, text: m.emoji }),
        el('div', { style: { flex: 1 } }, [el('div', { style: { fontWeight: 700 }, text: m.title }), el('div', { style: { color: 'var(--text-2)', fontSize: '0.8rem' }, text: fmtDate(m.date, getLang()) + (m.note ? ' · ' + m.note : '') })]),
        el('button', { class: 'icon-btn', html: icon('trash'), onclick: async () => { await db.del('memories', m.id); renderMemories(); } }),
      ]);
      memWrap.append(card);
    });
  }
  async function newMemory() {
    const title = await promptDialog({ title: 'Nuevo recuerdo', placeholder: 'Nuestra primera cita…' });
    if (!title) return;
    const emojis = ['💖', '🌸', '🎉', '🏖️', '🍰', '✈️', '🌙', '⭐'];
    await addMemory({ title, emoji: emojis[Math.floor(Math.random() * emojis.length)] });
    renderMemories();
  }
}

function avatar(p, cls = '') {
  const a = el('div', { class: 'avatar ' + cls, style: p.color ? { background: p.color } : {} });
  if (p.avatar) a.append(el('img', { src: p.avatar })); else a.textContent = (p.name || '?')[0].toUpperCase();
  return a;
}
function settingRow(emoji, title, sub, right) {
  return el('div', { class: 'row' }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })]), right]);
}
function tapRow(emoji, title, sub, fn) {
  return el('div', { class: 'row tappable', onclick: fn }, [el('div', { class: 'r-ic', text: emoji }), el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: title }), el('div', { class: 'r-sub', text: sub })]), el('div', { class: 'r-val', text: '›' })]);
}
function toggle(checked, onChange) {
  const input = el('input', { type: 'checkbox' }); input.checked = checked; input.onchange = () => onChange(input.checked);
  return el('label', { class: 'switch' }, [input, el('span', { class: 'track' })]);
}
function setAnniversary() {
  const input = el('input', { class: 'input', type: 'date', value: store.get().couple.since ? new Date(store.get().couple.since).toISOString().slice(0, 10) : '' });
  const m = modal([el('h2', { text: t('us.setAnniversary') }), el('div', { class: 'field', style: { marginTop: '12px' } }, [input]), el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-ghost btn-block', text: t('common.cancel'), onclick: () => m.close() }), el('button', { class: 'btn btn-primary btn-block', text: t('common.save'), onclick: () => { if (input.value) { store.set('couple', { since: new Date(input.value).getTime() }); toast('💍 Guardado'); go('us'); } m.close(); } })])]);
}
function doInvite() {
  const { code, link } = generateInvite();
  const body = el('div', { style: { textAlign: 'center' } }, [
    el('div', { style: { fontSize: '2.4rem' }, text: '🔗' }),
    el('p', { style: { color: 'var(--text-2)', margin: '8px 0' }, text: 'Comparte este enlace con tu pareja para dibujar juntos en tiempo real.' }),
    el('div', { class: 'input', style: { wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem' }, text: link }),
    el('div', { class: 'pill warm', style: { margin: '12px auto', display: 'inline-flex' }, text: 'Código: ' + code }),
    el('button', { class: 'btn btn-primary btn-block', html: icon('share') + ' ' + t('common.share'), onclick: async () => { try { if (navigator.share) await navigator.share({ title: 'Dibujemos juntos 💕', text: 'Únete a nuestro lienzo en Dibujo', url: link }); else { await navigator.clipboard.writeText(link); toast(t('toast.copied')); } } catch { await navigator.clipboard.writeText(link).catch(() => {}); toast(t('toast.copied')); } } }),
  ]);
  sheet(t('us.invite'), body);
}
