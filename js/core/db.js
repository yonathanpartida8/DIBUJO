// IndexedDB wrapper — drawings, folders, messages, media blobs, memories.
// Local-first storage that works fully offline.

const DB_NAME = 'dibujo';
const DB_VERSION = 1;

const STORES = {
  drawings: { keyPath: 'id', indexes: [['updatedAt', 'updatedAt'], ['folderId', 'folderId'], ['favorite', 'favorite']] },
  folders: { keyPath: 'id', indexes: [['createdAt', 'createdAt']] },
  messages: { keyPath: 'id', indexes: [['ts', 'ts']] },
  media: { keyPath: 'id' },            // blobs: images, audio, gifs cached
  memories: { keyPath: 'id', indexes: [['date', 'date']] },
  meta: { keyPath: 'k' },
};

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: cfg.keyPath });
          (cfg.indexes || []).forEach(([n, kp]) => os.createIndex(n, kp));
        }
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqP(request) {
  return new Promise((res, rej) => { request.onsuccess = () => res(request.result); request.onerror = () => rej(request.error); });
}

export const db = {
  async put(store, value) { return tx(store, 'readwrite', (os) => reqP(os.put(value))); },
  async get(store, key) { return tx(store, 'readonly', (os) => reqP(os.get(key))); },
  async del(store, key) { return tx(store, 'readwrite', (os) => reqP(os.delete(key))); },
  async all(store) { return tx(store, 'readonly', (os) => reqP(os.getAll())); },
  async clear(store) { return tx(store, 'readwrite', (os) => reqP(os.clear())); },
  async count(store) { return tx(store, 'readonly', (os) => reqP(os.count())); },
  async allByIndex(store, index, direction = 'prev') {
    const db_ = await open();
    return new Promise((resolve, reject) => {
      const out = [];
      const t = db_.transaction(store, 'readonly');
      const idx = t.objectStore(store).index(index);
      idx.openCursor(null, direction).onsuccess = (e) => {
        const c = e.target.result;
        if (c) { out.push(c.value); c.continue(); } else resolve(out);
      };
      t.onerror = () => reject(t.error);
    });
  },
  async setMeta(k, v) { return this.put('meta', { k, v }); },
  async getMeta(k, fallback = null) { const r = await this.get('meta', k); return r ? r.v : fallback; },
  async exportAll() {
    const out = {};
    for (const name of Object.keys(STORES)) out[name] = await this.all(name);
    return out;
  },
  async importAll(dump) {
    for (const [name, rows] of Object.entries(dump)) {
      if (!STORES[name]) continue;
      for (const row of rows) await this.put(name, row);
    }
  },
};
