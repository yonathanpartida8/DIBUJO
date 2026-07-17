// Reactive app store — settings, profile, couple. Persisted to localStorage
// (small, synchronous config); heavy data (drawings, media) lives in IndexedDB.
import { bus } from './bus.js';

const KEY = 'dibujo.store.v1';

const defaults = {
  onboarded: false,
  account: {
    mode: null,            // 'google' | 'local' | null (sin decidir)
    uid: null,
    coupleId: null,
  },
  widgets: null,           // disposición de widgets del inicio (null = por defecto)
  settings: {
    theme: 'pastel',        // pastel | light | dark | auto
    language: 'es',         // es | en
    uiScale: 'm',           // s | m | l | xl
    quality: 'high',        // low | med | high
    performance: 'balanced',// battery | balanced | smooth
    animations: 'on',
    sounds: 'on',
    haptics: 'on',
    notifications: 'on',
    autoBackup: 'on',
    autoSync: 'on',
    privacyLock: 'off',
    stabilizerDefault: 45,
    smoothingDefault: 30,
    // Sonidos por evento (todos configurables).
    sndDraw: 'off', sndErase: 'off', sndMsg: 'on', sndPanel: 'on', sndAchieve: 'on', sndSave: 'on',
  },
  profile: {
    name: 'Yo',
    avatar: null,           // dataURL
    color: '#ef92a6',
    bio: '',
  },
  partner: {
    name: 'Mi amor',
    avatar: null,
    color: '#a98fd4',
    online: false,
    lastSeen: Date.now() - 1000 * 60 * 12,
  },
  couple: {
    since: null,            // timestamp anniversary
    inviteCode: null,
    streak: 0,
    lastStreakDay: null,
    goals: [],
    achievements: [],       // ids unlocked
    dailyChallenge: null,
  },
  drawStats: {
    totalDrawings: 0,
    totalStrokes: 0,
    totalActiveMs: 0,
  },
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k in patch) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && typeof out[k] === 'object' && out[k] != null) {
      out[k] = deepMerge(out[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

class Store {
  constructor() {
    this.state = defaults;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = deepMerge(defaults, JSON.parse(raw));
    } catch (e) { console.warn('store load failed', e); }
  }
  get() { return this.state; }
  // Patch a slice: store.set('settings', { theme:'dark' }) or store.set({...})
  set(pathOrPatch, patch) {
    if (typeof pathOrPatch === 'string') {
      this.state = { ...this.state, [pathOrPatch]: deepMerge(this.state[pathOrPatch] ?? {}, patch) };
      bus.emit(`store:${pathOrPatch}`, this.state[pathOrPatch]);
    } else {
      this.state = deepMerge(this.state, pathOrPatch);
    }
    this.persist();
    bus.emit('store:change', this.state);
    return this.state;
  }
  persist() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { console.warn('persist failed', e); }
  }
  reset() { this.state = structuredClone(defaults); this.persist(); bus.emit('store:change', this.state); }
}

export const store = new Store();
