// Minimal IndexedDB wrapper. Stores: recipes, lists, meta.
const DB_NAME = 'hostel';
const DB_VERSION = 1;
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
