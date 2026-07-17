// ============================================================
// Capa de sincronización en tiempo real.
//
// Dos transportes intercambiables con la MISMA interfaz:
//  · FirebaseTransport   — espacio privado de la pareja (Firestore
//    en tiempo real). Se activa al iniciar sesión con Google y
//    vincular pareja.
//  · BroadcastTransport  — modo local (pestañas/ventanas del mismo
//    dispositivo). Respaldo cuando no hay cuenta.
//
// El resto de la app solo usa sync.send / sync.on y no sabe qué
// transporte hay debajo.
// ============================================================
import { bus } from './bus.js';
import { store } from './store.js';
import { uid } from './utils.js';
import { fb } from './firebase.js';

class BroadcastTransport {
  constructor(room) {
    this.room = room;
    this.ch = null;
    this.selfId = localStorage.getItem('dibujo.peerId') || uid('peer');
    localStorage.setItem('dibujo.peerId', this.selfId);
  }
  connect() {
    if (!('BroadcastChannel' in window)) return false;
    this.ch = new BroadcastChannel(`dibujo:${this.room}`);
    this.ch.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.from === this.selfId) return;
      bus.emit(`sync:${msg.type}`, msg.payload);
    };
    return true;
  }
  send(type, payload) { this.ch?.postMessage({ type, payload, from: this.selfId, ts: Date.now() }); }
  close() { this.ch?.close(); this.ch = null; }
}

class FirebaseTransport {
  connect() { return !!fb.coupleId; }
  send(type, payload) {
    const channel = type === 'message' ? 'message' : type === 'stroke' ? 'stroke' : 'signal';
    fb.publish(channel, type, payload).catch(() => {});
  }
  close() {}
}

class Sync {
  constructor() { this.transport = null; this.connected = false; }

  init() {
    const acc = store.get().account;
    if (acc.mode === 'google' && acc.coupleId) this._useFirebase();
    else this._useLocal();
    // Si la pareja se vincula más tarde, cambia de transporte al vuelo.
    bus.on('couple:attached', () => this._useFirebase());
    // Presencia local (solo aplica al transporte local).
    bus.on('sync:presence', (p) => {
      if (this.transport instanceof BroadcastTransport) {
        store.set('partner', { online: true, lastSeen: Date.now(), name: p?.name || store.get().partner.name });
        clearTimeout(this._pt);
        this._pt = setTimeout(() => store.set('partner', { online: false, lastSeen: Date.now() }), 30000);
      }
    });
    if (this.transport instanceof BroadcastTransport) {
      this._announce();
      this._hb = setInterval(() => this._announce(), 15000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this._announce(); });
    }
    return this.connected;
  }
  _useLocal() {
    this.transport?.close();
    const code = store.get().couple.inviteCode || 'solo';
    this.transport = new BroadcastTransport(code);
    this.connected = this.transport.connect();
  }
  _useFirebase() {
    if (this.transport instanceof FirebaseTransport) return;
    this.transport?.close();
    clearInterval(this._hb);
    this.transport = new FirebaseTransport();
    this.connected = this.transport.connect();
  }
  _announce() { this.transport?.send('presence', { name: store.get().profile.name, ts: Date.now() }); }
  setRoom(code) { if (this.transport instanceof BroadcastTransport) { this.transport.close(); this.transport = new BroadcastTransport(code); this.connected = this.transport.connect(); this._announce(); } }
  send(type, payload) { this.transport?.send(type, payload); }
  on(type, fn) { return bus.on(`sync:${type}`, fn); }
  isConnected() { return this.connected; }
}

export const sync = new Sync();
