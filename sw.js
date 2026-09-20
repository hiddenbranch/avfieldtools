/* AV Field Tools service worker: app shell offline, CDN libraries cached after first use. */
const VERSION = 'avft-1.1.1';
const SHELL = ['./', './index.html', './license.js?v=1.1.1', './core.js?v=1.1.1', './app.js?v=1.1.1', './manifest.webmanifest?v=1.1.1', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'reload' }).then(r => { if (r.ok) return c.put(u, r); }).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    const isPage = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
    if (isPage) {
      e.respondWith(fetch(e.request).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
      return;
    }
    e.respondWith(caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => { if (res.ok) caches.open(VERSION).then(c => c.put(e.request, res.clone())); return res; }).catch(() => hit);
      return hit || net;
    }));
  } else if (/cdnjs\.cloudflare\.com|jsdelivr\.net|unpkg\.com|tessdata/.test(url.host + url.pathname)) {
    // libraries and OCR data: network first, then cache
    e.respondWith(fetch(e.request).then(res => { if (res.ok || res.type === 'opaque') caches.open(VERSION + '-lib').then(c => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
  }
});
