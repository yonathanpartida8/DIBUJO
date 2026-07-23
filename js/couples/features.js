// Couples logic — streaks, achievements, daily challenges, goals, memories.
import { store } from '../core/store.js';
import { db } from '../core/db.js';
import { uid } from '../core/utils.js';

export const ACHIEVEMENTS = [
  { id: 'first', emoji: '🎨', name: 'Primer trazo', desc: 'Crea tu primer dibujo' },
  { id: 'five', emoji: '🖐️', name: 'Manos a la obra', desc: '5 dibujos creados' },
  { id: 'twenty', emoji: '🌟', name: 'Artistas', desc: '20 dibujos creados' },
  { id: 'streak3', emoji: '🔥', name: 'En racha', desc: '3 días seguidos dibujando' },
  { id: 'streak7', emoji: '💗', name: 'Una semana juntos', desc: '7 días de racha' },
  { id: 'collab', emoji: '🤝', name: 'Juntos es mejor', desc: 'Un dibujo colaborativo' },
  { id: 'sent', emoji: '💌', name: 'Cartas de amor', desc: 'Envía un dibujo a tu pareja' },
  { id: 'colorful', emoji: '🌈', name: 'Arcoíris', desc: 'Usa 10 colores en un dibujo' },
  { id: 'marathon', emoji: '⏱️', name: 'Maratón', desc: '30 min dibujando' },
  { id: 'favorite', emoji: '💖', name: 'Momentos favoritos', desc: 'Marca un dibujo como favorito' },
];

export const DAILY_CHALLENGES = [
  'Dibuja cómo te sientes hoy', 'Retrátense el uno al otro', 'Dibuja tu lugar favorito juntos',
  'Un dibujo solo con tonos pastel', 'Dibuja vuestra primera cita', 'Un animalito que os represente',
  'Dibuja el futuro que sueñan', 'Solo pueden usar 3 colores', 'Dibuja un recuerdo bonito',
  'Un corazón, a vuestra manera', 'Dibuja lo que cenaron hoy', 'Un paisaje de ensueño',
];

export function todaysChallenge() {
  const day = Math.floor(Date.now() / 86400000);
  return DAILY_CHALLENGES[day % DAILY_CHALLENGES.length];
}

export function dayKey(ts = Date.now()) { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }

// Register drawing activity → update streak + achievements. Returns newly unlocked.
export async function registerActivity() {
  const c = store.get().couple;
  const today = dayKey();
  let streak = c.streak || 0;
  if (c.lastStreakDay !== today) {
    const yesterday = dayKey(Date.now() - 86400000);
    streak = c.lastStreakDay === yesterday ? streak + 1 : 1;
    store.set('couple', { streak, lastStreakDay: today });
  }
  return checkAchievements();
}

export async function checkAchievements() {
  const drawings = await db.all('drawings');
  const messages = await db.all('messages');
  const c = store.get().couple;
  const have = new Set(c.achievements || []);
  const add = [];
  const unlock = (id) => { if (!have.has(id)) { have.add(id); add.push(id); } };
  if (drawings.length >= 1) unlock('first');
  if (drawings.length >= 5) unlock('five');
  if (drawings.length >= 20) unlock('twenty');
  if ((c.streak || 0) >= 3) unlock('streak3');
  if ((c.streak || 0) >= 7) unlock('streak7');
  if (drawings.some((d) => (d.stats?.colors?.length || 0) >= 10)) unlock('colorful');
  if (drawings.some((d) => (d.stats?.activeMs || 0) >= 30 * 60000)) unlock('marathon');
  if (drawings.some((d) => d.favorite)) unlock('favorite');
  if (messages.some((m) => m.type === 'drawing' && m.from === 'me')) unlock('sent');
  if (c.collabDone) unlock('collab');
  if (add.length) store.set('couple', { achievements: [...have] });
  return add;
}

export async function addMemory({ title, date, note, emoji }) {
  const m = { id: uid('mem'), title, date: date || Date.now(), note: note || '', emoji: emoji || '💖', createdAt: Date.now() };
  await db.put('memories', m);
  return m;
}
export function generateInvite() {
  let code = store.get().couple.inviteCode;
  if (!code) { code = Math.random().toString(36).slice(2, 8).toUpperCase(); store.set('couple', { inviteCode: code }); }
  const base = location.origin + location.pathname;
  return { code, link: `${base}?invite=${code}` };
}
