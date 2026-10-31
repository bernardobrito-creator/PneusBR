// Busca sempre a versão nova na internet; se estiver sem conexão, usa a última cópia guardada.
const CACHE = 'pneusbr-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const proprio = url.origin === self.location.origin;
  const cdn = /(^|\.)cdn\.jsdelivr\.net$|(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!proprio && !cdn) return;
  e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(req, c)); } return r; }).catch(() => caches.match(req)));
});
