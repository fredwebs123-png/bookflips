// Small settings live in localStorage; books (EPUB files and covers) live in
// IndexedDB. The service worker opens the same database to hand over books
// shared from other Android apps, so keep DB_NAME/upgrade in sync with sw.js.

export const prefs = {
  get(key, fallback) {
    try { const v = localStorage.getItem('spread:' + key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('spread:' + key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const DB_NAME = 'spread-books';
let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(storeName, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage is full or unavailable.'));
  });
}

export const shelf = {
  all: () => run('books', 'readonly', (s) => s.getAll()),
  get: (id) => run('books', 'readonly', (s) => s.get(id)),
  put: (record) => run('books', 'readwrite', (s) => s.put(record)),
  remove: (id) => run('books', 'readwrite', (s) => s.delete(id)),
};

// Files shared into the app while it was closed.
export async function takeInbox() {
  const items = await run('inbox', 'readonly', (s) => s.getAll());
  if (items?.length) await run('inbox', 'readwrite', (s) => s.clear());
  return items || [];
}
