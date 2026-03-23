// Merlin Service Worker
// Minimal — no offline caching. Only purpose:
// 1. Enable PWA "Install App" prompt
// 2. Force-clear any stale caches on update
// 3. skipWaiting + claim to immediately activate new version

const CACHE_VERSION = "merlin-v1";

// Install: skip waiting to activate immediately
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// Activate: clear ALL old caches, then claim all clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) => {
            console.log("[SW] Clearing cache:", name);
            return caches.delete(name);
          })
        )
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all clients that a new version is available
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED" });
          });
        });
      })
  );
});

// Fetch: pass-through (no caching) — let the browser/CDN handle it
self.addEventListener("fetch", (event) => {
  // Don't intercept — just use normal network behavior
  return;
});
