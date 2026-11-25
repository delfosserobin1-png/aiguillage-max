/* Aiguillage : réseau d'abord, copie locale si hors connexion. L'API SNCF n'est jamais mise en cache. */
const CACHE = 'aiguillage-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'shared.js', 'manifest.webmanifest', 'icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // GitHub Pages laisse le téléphone garder chaque fichier 10 min : on revalide à chaque fois (réponse 304 légère
  // si rien n'a changé), pour qu'une mise à jour de l'app se voie à la réouverture suivante.
  const req = e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
