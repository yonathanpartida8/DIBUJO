// ============================================================
// UI de logros — galería con rarezas, progreso, insignias y
// animación de desbloqueo estilo celebración.
// ============================================================
import { el } from '../core/utils.js';
import { store } from '../core/store.js';
import { bus } from '../core/bus.js';
import { sheet } from '../core/ui.js';
import { ACHIEVEMENTS, RARITIES, computeMetrics, progressFor } from '../couples/achievements.js';

export async function openAchievements() {
  const metrics = await computeMetrics();
  const have = new Set(store.get().couple.achievements || []);
  const body = el('div');
  const s = sheet(`🏆 Logros · ${have.size}/${ACHIEVEMENTS.length}`, body, { height: '86dvh' });

  // Filtros por rareza.
  let filter = null;
  const chips = el('div', { class: 'scroll-x', style: { marginBottom: '10px' } });
  chips.append(el('button', { class: 'chip active', text: 'Todos', onclick: (e) => { filter = null; sel(e.target); paint(); } }));
  for (const r of RARITIES) chips.append(el('button', { class: 'chip', text: r.name, onclick: (e) => { filter = r.id; sel(e.target); paint(); } }));
  const sel = (n) => { chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); n.classList.add('active'); };
  body.append(chips);
  const grid = el('div', { class: 'ach-grid' });
  body.append(grid);

  function paint() {
    grid.innerHTML = '';
    const list = ACHIEVEMENTS.filter((a) => !filter || a.rarity.id === filter);
    // Desbloqueados primero, luego los más cercanos a lograrse.
    list.sort((a, b) => (have.has(b.id) - have.has(a.id)) || (progressFor(b, metrics) - progressFor(a, metrics)));
    for (const a of list.slice(0, 120)) {
      const unlocked = have.has(a.id);
      const prog = progressFor(a, metrics);
      const card = el('div', { class: 'ach-card' + (unlocked ? ' unlocked' : ''), style: { '--rar': a.rarity.color, '--glow': a.rarity.glow } }, [
        el('div', { class: 'ach-emoji', text: a.emoji }),
        el('div', { class: 'ach-name', text: a.name }),
        el('div', { class: 'ach-desc', text: a.desc }),
        el('div', { class: 'ach-rar', text: a.rarity.name }),
        !unlocked ? el('div', { class: 'bar', style: { marginTop: '6px' } }, [el('i', { style: { width: prog * 100 + '%' } })]) : null,
        unlocked && a.reward ? el('div', { class: 'ach-reward', text: a.reward }) : null,
      ]);
      grid.append(card);
    }
    if (list.length > 120) grid.append(el('p', { style: { gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }, text: `…y ${list.length - 120} más por descubrir` }));
  }
  paint();
}

// Celebración al desbloquear (toast grande animado).
bus.on('achieve:unlocked', (list) => {
  const a = list[0];
  const n = el('div', { class: 'ach-pop', style: { '--rar': a.rarity.color, '--glow': a.rarity.glow } }, [
    el('div', { class: 'ach-pop-emoji', text: a.emoji }),
    el('div', {}, [
      el('div', { class: 'ach-pop-title', text: '¡Logro desbloqueado!' }),
      el('div', { class: 'ach-pop-name', text: `${a.name} · ${a.rarity.name}` }),
      list.length > 1 ? el('div', { class: 'ach-pop-more', text: `+${list.length - 1} más` }) : null,
    ]),
  ]);
  document.body.append(n);
  setTimeout(() => n.classList.add('out'), 3200);
  setTimeout(() => n.remove(), 3700);
});
