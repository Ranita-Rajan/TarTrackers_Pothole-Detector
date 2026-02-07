// Service worker for Tar Trackers - Minimal version
// This version clears all caches and unregisters itself
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Clear ALL caches
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('Clearing cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      // Unregister this service worker
      return self.registration.unregister();
    })
  );
  self.clients.claim();
});

// No fetch interception - let everything go through normally
self.addEventListener('fetch', () => {
  // Do nothing - let requests pass through
});
