// Realtime sync abstraction.
// Local-first with a pluggable transport. The default transport is
// BroadcastChannel — this makes "two people" real across browser tabs/windows
// on the same device (open the invite link in a second tab to collaborate).
//
// The interface (connect / send / on / presence) is transport-agnostic, so a
// production backend (WebSocket, WebRTC data channel, Firebase, Supabase
// Realtime) can be dropped in by implementing the same 4 methods — nothing
// else in the app changes.
import { bus } from './bus.js';
import { store } from './store.js';
import { uid } from './utils.js';

class BroadcastTransport {
  constructor(room) {
    this.room = room;
    this.ch = null;
    this.self = store.get().profile.name || 'me';
    this.selfId = localStorage.getItem('dibujo.peerId') || uid('peer');
    localStorage.setItem('dibujo.peerId', this.selfId);
  }
  connect() {
    if (!('BroadcastChannel' in window)) return false;
    this.ch = new BroadcastChannel(`dibujo:${this.room}`);
    this.ch.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.from === this.selfId) return; // ignore own echo
      bus.emit(`sync:${msg.type}`, msg.payload);
      bus.emit('sync:any', msg);
    };
    return true;
  }
  send(type, payload) {
    if (!this.ch) return;
    this.ch.postMessage({ type, payload, from: this.selfId, ts: Date.now() });
  }
  close() { this.ch?.close(); this.ch = null; }
}

class Sync {
  constructor() {
    this.transport = null;
    this.connected = false;
    this.room = 'default';
    this._presenceTimer = null;
  }
  init() {
    const code = store.get().couple.inviteCode || 'solo';
    this.room = code;
    this.transport = new BroadcastTransport(this.room);
    this.connected = this.transport.connect();
    // Announce presence periodically.
    this._announce();
    this._presenceTimer = setInterval(() => this._announce(), 15000);
    // Track partner presence via incoming presence beats.
    bus.on('sync:presence', (p) => {
      store.set('partner', { online: true, lastSeen: Date.now(), name: p.name || store.get().partner.name });
      clearTimeout(this._partnerTimeout);
      this._partnerTimeout = setTimeout(() => store.set('partner', { online: false, lastSeen: Date.now() }), 30000);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._announce(); });
    return this.connected;
  }
  _announce() {
    this.send('presence', { name: store.get().profile.name, ts: Date.now() });
  }
  setRoom(code) {
    this.transport?.close();
    this.room = code;
    this.transport = new BroadcastTransport(code);
    this.connected = this.transport.connect();
    this._announce();
  }
  send(type, payload) { this.transport?.send(type, payload); }
  on(type, fn) { return bus.on(`sync:${type}`, fn); }
  isConnected() { return this.connected; }
}

export const sync = new Sync();
