// Minimal IndexedDB wrapper. Stores: recipes, lists, meta, feedback.
// Note: the database name is kept stable (not renamed with the app) so existing
// users keep the recipes already saved on their device. It is never shown in the UI.
const DB_NAME = 'hostel';
const DB_VERSION = 2;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('recipes')) {
        db.createObjectStore('recipes', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('lists')) {
        db.createObjectStore('lists', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // Connector feedback: edits/corrections and cancelled imports, used to
      // improve the import parsers. Added in DB_VERSION 2.
      if (!db.objectStoreNames.contains('feedback')) {
        db.createObjectStore('feedback', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const db = {
  async getAll(store) {
    return reqToPromise((await tx(store, 'readonly')).getAll());
  },
  async get(store, id) {
    return reqToPromise((await tx(store, 'readonly')).get(id));
  },
  async put(store, value) {
    await reqToPromise((await tx(store, 'readwrite')).put(value));
    return value;
  },
  async delete(store, id) {
    return reqToPromise((await tx(store, 'readwrite')).delete(id));
  },
  async clear(store) {
    return reqToPromise((await tx(store, 'readwrite')).clear());
  }
};
