const CACHE_NAME = "mindspace-pwa-v3";
const urlsToCache = [
  "./", "index.html", "styles.css", "app.js", "manifest.json",
  "icon-192.png", "icon-512.png",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap"
];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
