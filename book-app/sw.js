// Offline support: the app shell and bundled books are cached up front,
// fonts as they load. Also receives EPUBs shared from other Android apps.
const VERSION = 'spread-v3';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/epub.js', 'js/storage.js', 'catalog.json',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same database and upgrade as js/storage.js.
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('spread-books', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('inbox')) db.createObjectStore('inbox', { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function receiveShare(request) {
  const form = await request.formData();
  const files = form.getAll('book').filter((f) => f && f.size);
  if (files.length) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('inbox', 'readwrite');
      for (const file of files) tx.objectStore('inbox').add({ file, name: file.name });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  const isFont = url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  // Network first for our own files so updates land quickly; cache as fallback.
  e.respondWith(
    (isFont ? caches.match(req) : Promise.resolve(null)).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })))
  );
});
