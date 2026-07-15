// Playback UI + statistics sheet.
import { el, $, fmtClock, fmtDuration, fmtDate } from '../core/utils.js';
import { Player } from '../drawing/player.js';
import { sheet, modal } from '../core/ui.js';
import { t, getLang } from '../core/i18n.js';
import { icon } from './icons.js';
import { BRUSHES } from '../drawing/brushes.js';

export function openPlayer({ doc, recording, title }) {
  if (!recording || !recording.ops || !recording.ops.length) {
    modal([el('h2', { text: t('studio.play') }), el('p', { style: { color: 'var(--text-2)', marginTop: '8px' }, text: 'Este dibujo aún no tiene proceso grabado. Dibuja algo y se grabará automáticamente.' }), el('div', { class: 'modal-actions' }, [el('button', { class: 'btn btn-primary btn-block', text: t('common.close'), onclick: () => $('#modal-host').click() })])]);
    return;
  }
  const overlay = el('div', { class: 'studio view', style: { zIndex: 800, background: 'rgba(30,25,35,0.9)', backdropFilter: 'blur(6px)' } });
  const top = el('div', { class: 'st-top', style: { background: 'transparent', border: 'none' } }, [
    el('button', { class: 'icon-btn', html: icon('back'), onclick: destroy }),
    el('div', { class: 'title' }, [el('div', { class: 'n', style: { color: '#fff' }, text: title || t('studio.play') })]),
    el('div', { style: { width: '44px' } }),
  ]);
  const stage = el('div', { class: 'st-stage' });
  const frame = el('div', { class: 'st-canvas-frame' });
  const canvas = el('canvas');
  frame.append(canvas); stage.append(frame);
  const dock = el('div', { class: 'st-dock', style: { background: 'transparent', border: 'none' } });
  overlay.append(top, stage, dock);
  document.body.append(overlay);

  const player = new Player(canvas, doc, recording);
  // fit
  const fit = () => {
    const s = Math.min((stage.clientWidth - 32) / player.w, (stage.clientHeight - 32) / player.h);
    frame.style.width = player.w + 'px'; frame.style.height = player.h + 'px';
    frame.style.transformOrigin = 'top left';
    frame.style.transform = `translate(${(stage.clientWidth - player.w * s) / 2}px, ${(stage.clientHeight - player.h * s) / 2}px) scale(${s})`;
  };
  setTimeout(fit, 30); window.addEventListener('resize', fit);

  // controls
  const bar = el('div', { class: 'pb-bar' });
  const timeLbl = el('span', { class: 'lab', text: '0:00', style: { color: '#fff', width: '42px' } });
  const totalLbl = el('span', { class: 'lab', text: fmtClock(player.total), style: { color: '#fff', width: '42px' } });
  const scrub = el('input', { class: 'slider', type: 'range', min: 0, max: player.total, value: 0, step: 10, style: { flex: 1 } });
  scrub.oninput = () => { player.pause(); player.seek(+scrub.value); syncPlayIcon(); };
  const track = el('div', { class: 'pb-track' }, [timeLbl, scrub, totalLbl]);
  const playBtn = el('button', { class: 'icon-btn big', style: { background: 'linear-gradient(135deg,var(--rose),var(--lav))' }, html: iconWhite('play'), onclick: () => { player.toggle(); syncPlayIcon(); } });
  const restart = el('button', { class: 'icon-btn', html: iconWhite('rotate'), onclick: () => { player.seek(0); player.play(); syncPlayIcon(); } });
  const controls = el('div', { class: 'pb-controls' }, [restart, playBtn]);
  const speeds = el('div', { class: 'pb-speed' });
  [0.5, 1, 2, 4, 8].forEach((sp) => { const b = el('button', { class: 'chip' + (sp === 1 ? ' active' : ''), text: sp + '×', onclick: () => { player.setSpeed(sp); speeds.querySelectorAll('.chip').forEach((c) => c.classList.remove('active')); b.classList.add('active'); } }); speeds.append(b); });
  bar.append(track, controls, speeds);
  dock.append(bar);

  player.onTick = (cur) => { scrub.value = cur; timeLbl.textContent = fmtClock(cur); };
  player.onEnd = () => syncPlayIcon();
  function syncPlayIcon() { playBtn.innerHTML = player.playing ? iconWhite('pause') : iconWhite('play'); }
  function iconWhite(n) { return icon(n).replace('<svg', '<svg style="fill:#fff"'); }
  function destroy() { player.destroy(); window.removeEventListener('resize', fit); overlay.remove(); }
  setTimeout(() => { player.play(); syncPlayIcon(); }, 400);
}

export function openStatsSheet(stats, drawing) {
  const body = el('div');
  const grid = el('div', { class: 'grid-2', style: { gap: '10px' } });
  const stat = (num, lab) => el('div', { class: 'card', style: { textAlign: 'center' } }, [el('div', { class: 'stat' }, [el('div', { class: 'num', text: num }), el('div', { class: 'lab', text: lab })])]);
  grid.append(
    stat(fmtDuration(stats.activeMs), 'Tiempo real dibujando'),
    stat(stats.strokes, 'Trazos'),
    stat(stats.colors.length, 'Colores'),
    stat(stats.tools.length, 'Herramientas'),
  );
  body.append(grid);
  // colors used
  if (stats.colors.length) {
    body.append(el('div', { class: 'section-title', text: 'Colores utilizados' }));
    const pal = el('div', { class: 'st-palette', style: { flexWrap: 'wrap' } });
    stats.colors.forEach((c) => pal.append(el('div', { class: 'st-swatch', style: { background: c } })));
    body.append(pal);
  }
  // tools
  if (stats.tools.length) {
    body.append(el('div', { class: 'section-title', text: 'Herramientas' }));
    const chips = el('div', { class: 'scroll-x' });
    stats.tools.forEach((tl) => chips.append(el('span', { class: 'chip', text: (BRUSHES[tl]?.emoji || '🎨') + ' ' + (BRUSHES[tl]?.name || tl) })));
    body.append(chips);
  }
  // dates
  const lang = getLang();
  body.append(el('div', { class: 'rows', style: { marginTop: '16px' } }, [
    el('div', { class: 'row' }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Fecha de creación' })]), el('div', { class: 'r-val', text: drawing?.createdAt ? fmtDate(drawing.createdAt, lang) : '—' })]),
    el('div', { class: 'row' }, [el('div', { class: 'r-main' }, [el('div', { class: 'r-title', text: 'Última edición' })]), el('div', { class: 'r-val', text: drawing?.updatedAt ? fmtDate(drawing.updatedAt, lang) : '—' })]),
  ]));
  sheet(t('studio.stats'), body);
}
