// ============================================================
// Servicio Firebase — Auth (Google), Firestore en tiempo real,
// Storage, Analytics, presencia y sistema de pareja.
//
// Diseño: carga PEREZOSA y tolerante a fallos. La app funciona
// 100% offline/local sin Firebase; al iniciar sesión con Google
// se activa la sincronización en tiempo real del espacio privado.
// ============================================================
import { bus } from './bus.js';
import { store } from './store.js';
import { uid } from './utils.js';

const VER = '12.16.0';
const CDN = (m) => `https://www.gstatic.com/firebasejs/${VER}/firebase-${m}.js`;

// Configuración obligatoria del proyecto (proporcionada por el usuario).
const firebaseConfig = {
  apiKey: 'AIzaSyBPntVzf8KPhKReJw-N6zOacmyZuhnEUrU',
  authDomain: 'lovedrawing-33b5a.firebaseapp.com',
  projectId: 'lovedrawing-33b5a',
  storageBucket: 'lovedrawing-33b5a.firebasestorage.app',
  messagingSenderId: '395522196177',
  appId: '1:395522196177:web:cba57514f2f1e6a8413bf0',
  measurementId: 'G-ETNTFMEF2Q',
};

class FirebaseService {
  constructor() {
    this.ready = false;      // SDK cargado e inicializado
    this.user = null;        // usuario de Firebase Auth
    this.coupleId = null;    // espacio privado activo
    this._mods = null;       // módulos del SDK
    this._unsubs = [];       // listeners activos (para limpiar)
    this._hb = null;         // heartbeat de presencia
  }

  // ---------- Carga del SDK ----------
  async load() {
    if (this._mods) return this._mods;
    const [appM, authM, fsM, stM] = await Promise.all([
      import(CDN('app')), import(CDN('auth')), import(CDN('firestore')), import(CDN('storage')),
    ]);
    this.app = appM.initializeApp(firebaseConfig);
    // Firestore con caché persistente (offline inteligente, multi-pestaña).
    try {
      this.db = fsM.initializeFirestore(this.app, {
        localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }),
      });
    } catch { this.db = fsM.getFirestore(this.app); }
    this.auth = authM.getAuth(this.app);
    this.auth.languageCode = 'es';
    // Persistencia robusta (IndexedDB): la sesión sobrevive reinicios y
    // funciona en PWA instalada / WebView de Capacitor.
    try { await authM.setPersistence(this.auth, authM.indexedDBLocalPersistence); } catch {}
    this.storage = stM.getStorage(this.app);
    this._mods = { appM, authM, fsM, stM };
    // Analytics: opcional, nunca debe romper la app (p.ej. sin cookies/offline).
    import(CDN('analytics')).then((anM) =>
      anM.isSupported?.().then((ok) => { if (ok) this.analytics = anM.getAnalytics(this.app); }).catch(() => {})
    ).catch(() => {});
    this.ready = true;
    return this._mods;
  }

  logEvent(name, params) {
    try { this._mods && this.analytics && import(CDN('analytics')).then((m) => m.logEvent(this.analytics, name, params)); } catch {}
  }

  // ---------- Autenticación ----------
  // Restaura sesión persistida. Devuelve el usuario (o null) cuando Auth resuelve.
  async restoreSession() {
    const { authM } = await this.load();
    // Completa login por redirect (iOS PWA usa redirect en vez de popup).
    try { await authM.getRedirectResult(this.auth); } catch {}
    return new Promise((resolve) => {
      const off = authM.onAuthStateChanged(this.auth, async (user) => {
        off();
        if (user) await this._onSignedIn(user);
        resolve(user);
      });
    });
  }

  async signInWithGoogle() {
    const { authM } = await this.load();
    const provider = new authM.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const cred = await authM.signInWithPopup(this.auth, provider, authM.browserPopupRedirectResolver);
      await this._onSignedIn(cred.user);
      return cred.user;
    } catch (e) {
      const code = String(e?.code || '');
      // Los WebView/PWA móviles suelen bloquear popups → redirect.
      if (code.includes('popup-blocked') || code.includes('operation-not-supported') || code.includes('cancelled-popup-request')) {
        await authM.signInWithRedirect(this.auth, provider, authM.browserPopupRedirectResolver);
        return null;
      }
      if (code.includes('popup-closed')) throw new Error('Cerraste la ventana antes de terminar. Intenta de nuevo.');
      if (code.includes('unauthorized-domain')) throw new Error('Este dominio no está autorizado en Firebase. Agrégalo en Authentication → Settings → Authorized domains.');
      if (code.includes('network')) throw new Error('Sin conexión. Revisa tu internet e intenta otra vez.');
      throw e;
    }
  }

  async signOut() {
    if (!this._mods) return;
    await this.setPresence({ online: false });
    this._teardown();
    await this._mods.authM.signOut(this.auth);
    this.user = null; this.coupleId = null;
    store.set('account', { mode: 'local', uid: null, coupleId: null });
    bus.emit('fb:signout');
  }

  // Crea/actualiza el perfil automáticamente y arranca presencia + pareja.
  async _onSignedIn(user) {
    this.user = user;
    const { fsM } = this._mods;
    const uref = fsM.doc(this.db, 'users', user.uid);
    const snap = await fsM.getDoc(uref).catch(() => null);
    const prev = snap?.exists() ? snap.data() : {};
    await fsM.setDoc(uref, {
      name: prev.name || user.displayName || 'Yo',
      photo: user.photoURL || prev.photo || null,
      email: user.email || null,
      coupleId: prev.coupleId || null,
      online: true,
      drawing: false,
      lastSeen: fsM.serverTimestamp(),
    }, { merge: true });
    this.coupleId = prev.coupleId || null;
    store.set('account', { mode: 'google', uid: user.uid, coupleId: this.coupleId });
    store.set('profile', { name: prev.name || user.displayName || store.get().profile.name, avatar: user.photoURL || store.get().profile.avatar });
    this._startPresence();
    if (this.coupleId) this._attachCouple();
    this.logEvent('login', { method: 'google' });
    bus.emit('fb:signin', user);
  }

  // ---------- Presencia ----------
  _startPresence() {
    clearInterval(this._hb);
    const beat = () => this.setPresence({ online: !document.hidden });
    this._hb = setInterval(beat, 25000);
    beat();
    document.addEventListener('visibilitychange', beat);
    window.addEventListener('pagehide', () => this.setPresence({ online: false }));
  }
  async setPresence(patch) {
    if (!this.user || !this._mods) return;
    const { fsM } = this._mods;
    try {
      await fsM.setDoc(fsM.doc(this.db, 'users', this.user.uid), { ...patch, lastSeen: fsM.serverTimestamp() }, { merge: true });
    } catch {}
  }
  setDrawing(on) { return this.setPresence({ drawing: !!on }); }

  // ---------- Sistema de pareja ----------
  // Genera un código único con formato AB7K-XP93 y lo publica como invitación.
  async createInvite() {
    const { fsM } = this._mods;
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const part = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    const code = `${part(4)}-${part(4)}`;
    await fsM.setDoc(fsM.doc(this.db, 'invites', code), {
      from: this.user.uid,
      fromName: store.get().profile.name,
      createdAt: fsM.serverTimestamp(),
    });
    return code;
  }

  // La pareja introduce el código → vínculo permanente + espacio privado.
  async joinWithCode(rawCode) {
    const { fsM } = this._mods;
    const code = rawCode.trim().toUpperCase().replace(/\s+/g, '');
    const iref = fsM.doc(this.db, 'invites', code);
    const isnap = await fsM.getDoc(iref);
    if (!isnap.exists()) throw new Error('Código no válido o vencido');
    const { from, fromName } = isnap.data();
    if (from === this.user.uid) throw new Error('Ese código es tuyo 😅 compártelo con tu pareja');
    const coupleId = `cpl_${[from, this.user.uid].sort().join('_').slice(0, 40)}_${code.replace('-', '')}`;
    await fsM.setDoc(fsM.doc(this.db, 'couples', coupleId), {
      members: [from, this.user.uid],
      names: { [from]: fromName || 'Pareja', [this.user.uid]: store.get().profile.name },
      createdAt: fsM.serverTimestamp(),
    });
    await fsM.setDoc(fsM.doc(this.db, 'users', this.user.uid), { coupleId }, { merge: true });
    await fsM.setDoc(fsM.doc(this.db, 'users', from), { coupleId }, { merge: true });
    await fsM.deleteDoc(iref).catch(() => {});
    this.coupleId = coupleId;
    store.set('account', { coupleId });
    this._attachCouple();
    this.logEvent('couple_linked');
    return coupleId;
  }

  // Quien creó la invitación espera a que su pareja la use.
  watchLink(onLinked) {
    const { fsM } = this._mods;
    const off = fsM.onSnapshot(fsM.doc(this.db, 'users', this.user.uid), (snap) => {
      const cid = snap.data()?.coupleId;
      if (cid && cid !== this.coupleId) {
        this.coupleId = cid;
        store.set('account', { coupleId: cid });
        this._attachCouple();
        onLinked?.(cid);
      }
    });
    this._unsubs.push(off);
    return off;
  }

  // ---------- Espacio privado en tiempo real ----------
  _attachCouple() {
    if (!this.coupleId) return;
    const { fsM } = this._mods;
    const cid = this.coupleId;
    const joinTs = Date.now();

    // Presencia de la pareja.
    fsM.getDoc(fsM.doc(this.db, 'couples', cid)).then((snap) => {
      const members = snap.data()?.members || [];
      const partnerUid = members.find((m) => m !== this.user.uid);
      if (!partnerUid) return;
      this.partnerUid = partnerUid;
      const off = fsM.onSnapshot(fsM.doc(this.db, 'users', partnerUid), (ps) => {
        const d = ps.data(); if (!d) return;
        const last = d.lastSeen?.toMillis?.() || Date.now();
        store.set('partner', {
          name: d.name || store.get().partner.name,
          avatar: d.photo || store.get().partner.avatar,
          online: !!d.online && (Date.now() - last) < 70000,
          drawing: !!d.drawing,
          lastSeen: last,
        });
      });
      this._unsubs.push(off);
    }).catch(() => {});

    // Canales en tiempo real: mensajes, trazos en vivo, señales (typing…).
    for (const col of ['messages', 'live', 'signals']) {
      const q = fsM.query(fsM.collection(this.db, 'couples', cid, col), fsM.orderBy('ts', 'asc'), fsM.limitToLast(col === 'messages' ? 200 : 30));
      const off = fsM.onSnapshot(q, (qs) => {
        qs.docChanges().forEach((ch) => {
          const data = { id: ch.doc.id, ...ch.doc.data() };
          if (data.by === this.user.uid) return; // eco propio
          if (col !== 'messages' && (data.ts || 0) < joinTs) return; // señales viejas no
          if (ch.type === 'added') bus.emit(`sync:${data.type || col}`, data.payload ?? data);
          if (col === 'messages' && (ch.type === 'modified' || ch.type === 'removed')) bus.emit('sync:messageChange', { change: ch.type, msg: data.payload ?? data });
        });
      }, () => {});
      this._unsubs.push(off);
    }

    // Dibujos compartidos del espacio.
    const dq = fsM.query(fsM.collection(this.db, 'couples', cid, 'drawings'), fsM.orderBy('updatedAt', 'desc'), fsM.limitToLast(60));
    this._unsubs.push(fsM.onSnapshot(dq, (qs) => {
      const list = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      bus.emit('shared:list', list);
      this._sharedCache = list;
    }, () => {}));

    bus.emit('couple:attached', cid);
  }

  getShared() { return this._sharedCache || []; }

  // Publica en un canal del espacio privado (usado por la capa de sync).
  async publish(channel, type, payload) {
    if (!this.coupleId || !this._mods) return false;
    const { fsM } = this._mods;
    const col = channel === 'message' ? 'messages' : channel === 'stroke' ? 'live' : 'signals';
    await fsM.addDoc(fsM.collection(this.db, 'couples', this.coupleId, col), {
      type, payload, by: this.user.uid, ts: Date.now(),
    });
    return true;
  }

  // Actualiza/borra un mensaje compartido (editar, eliminar, reaccionar, fijar).
  async patchSharedMessage(msgId, patch) {
    if (!this.coupleId) return;
    const { fsM } = this._mods;
    const q = fsM.query(fsM.collection(this.db, 'couples', this.coupleId, 'messages'), fsM.where('payload.id', '==', msgId));
    const qs = await fsM.getDocs(q).catch(() => null);
    qs?.forEach((d) => fsM.setDoc(d.ref, { payload: { ...d.data().payload, ...patch } }, { merge: true }));
  }

  // ---------- Dibujos compartidos (Storage + Firestore) ----------
  async shareDrawing(drawing) {
    if (!this.coupleId) return false;
    const { fsM, stM } = this._mods;
    // El documento completo (capas + grabación) va a Storage; la tarjeta a Firestore.
    const path = `couples/${this.coupleId}/drawings/${drawing.id}.json`;
    const blob = new Blob([JSON.stringify({ doc: drawing.doc, recording: drawing.recording })], { type: 'application/json' });
    await stM.uploadBytes(stM.ref(this.storage, path), blob);
    await fsM.setDoc(fsM.doc(this.db, 'couples', this.coupleId, 'drawings', drawing.id), {
      title: drawing.title || 'Sin título',
      thumb: drawing.thumb || null,
      by: this.user.uid,
      byName: store.get().profile.name,
      stats: drawing.stats || null,
      reactions: drawing.reactions || {},
      comments: drawing.comments || [],
      favorite: !!drawing.favorite,
      createdAt: drawing.createdAt || Date.now(),
      updatedAt: Date.now(),
      storagePath: path,
    });
    this.logEvent('drawing_shared');
    return true;
  }
  async fetchSharedDrawing(card) {
    const { stM } = this._mods;
    const url = await stM.getDownloadURL(stM.ref(this.storage, card.storagePath));
    const res = await fetch(url);
    return res.json();
  }
  async patchSharedDrawing(id, patch) {
    if (!this.coupleId) return;
    const { fsM } = this._mods;
    await fsM.setDoc(fsM.doc(this.db, 'couples', this.coupleId, 'drawings', id), { ...patch, updatedAt: Date.now() }, { merge: true });
  }

  _teardown() {
    this._unsubs.forEach((off) => { try { off(); } catch {} });
    this._unsubs = [];
    clearInterval(this._hb);
  }
}

export const fb = new FirebaseService();
