/* AV Field Tools service worker: app shell offline, CDN libraries cached after first use. */
const VERSION = 'avft-1.0.0';
const SHELL = ['./', './index.html', './core.js', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    // shell: cache first, refresh in the background
    e.respondWith(caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => hit);
      return hit || net;
    }));
  } else if (/cdnjs\.cloudflare\.com|jsdelivr\.net|unpkg\.com|tessdata/.test(url.host + url.pathname)) {
    // libraries and OCR data: network first, then cache
    e.respondWith(fetch(e.request).then(res => { if (res.ok || res.type === 'opaque') caches.open(VERSION + '-lib').then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
  }
});
