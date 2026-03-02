const CACHE_NAME = 'schildi-dashboard-v1';
const API_CACHE = 'schildi-api-cache';

// Assets that should be cached (Cache-First strategy)
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

// Install: Cache static assets
self.addEventListener('install', event => {
  console.log('SW: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener('activate', event => {
  console.log('SW: Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE) {
            console.log('SW: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Cache strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests: Network-First (with cache fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful GET requests
          if (request.method === 'GET' && response.status === 200) {
            const responseClone = response.clone();
            caches.open(API_CACHE).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets: Cache-First (with network fallback)
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }
      // Not in cache, fetch from network
      return fetch(request).then(response => {
        // Cache successful responses for future use
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      });
    })
  );
});

// Push: Handle push notifications
self.addEventListener('push', event => {
  console.log('SW: Push received', event);
  
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'Schildi Dashboard', body: event.data.text() || 'Neue Nachricht' };
    }
  }

  const options = {
    title: data.title || 'Schildi Dashboard',
    body: data.body || 'Neue Aktivität',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: data.tag || 'schildi-notification',
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Öffnen' },
      { action: 'dismiss', title: 'Schließen' }
    ],
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(
    self.registration.showNotification(options.title, options)
  );
});

// Notification click: Open/focus dashboard
self.addEventListener('notificationclick', event => {
  console.log('SW: Notification clicked', event);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }

  // Open or focus the dashboard
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Try to focus existing window
      for (const client of clientList) {
        if (client.url.includes(location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// Background sync (future enhancement)
self.addEventListener('sync', event => {
  console.log('SW: Background sync', event);
  if (event.tag === 'background-sync') {
    // Handle background sync tasks
  }
});

console.log('SW: Service Worker loaded');