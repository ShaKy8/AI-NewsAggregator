/**
 * Service Worker for AI News Hub
 * Provides offline functionality and caching
 */

const CACHE_NAME = 'ai-news-hub-v1';
const STATIC_CACHE = 'ai-news-static-v1';
const DYNAMIC_CACHE = 'ai-news-dynamic-v1';

// Assets to cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/admin.html',
    '/admin.js',
    '/architecture.html',
    '/favicon.svg',
    '/manifest.json',
    '/utils/sanitizer.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('[SW] Installing service worker');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Static assets cached');
                return self.skipWaiting(); // Activate immediately
            })
            .catch(error => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating service worker');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim(); // Take control immediately
            })
    );
});

// Fetch event - serve from cache with network fallback
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip cross-origin requests
    if (url.origin !== location.origin) {
        return;
    }
    
    // Handle API requests with cache-first strategy for news, network-first for others
    if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/news') {
            // Cache-first for news articles (they don't change often)
            event.respondWith(cacheFirstStrategy(request, DYNAMIC_CACHE));
        } else {
            // Network-first for other API calls (sources, admin operations)
            event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
        }
        return;
    }
    
    // Handle static assets with cache-first strategy
    if (STATIC_ASSETS.includes(url.pathname) || url.pathname === '/') {
        event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
        return;
    }
    
    // Handle other requests with network-first strategy
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
});

// Cache-first strategy: check cache first, fallback to network
async function cacheFirstStrategy(request, cacheName) {
    try {
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);
            
            // Update cache in background for API requests
            if (request.url.includes('/api/')) {
                updateCacheInBackground(request, cache);
            }
            
            return cachedResponse;
        }
        
        // Not in cache, fetch from network
        console.log('[SW] Cache miss, fetching from network:', request.url);
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache-first strategy failed:', error);
        
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        throw error;
    }
}

// Network-first strategy: try network first, fallback to cache
async function networkFirstStrategy(request, cacheName) {
    try {
        console.log('[SW] Network-first for:', request.url);
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.status === 200) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache for:', request.url);
        
        const cache = await caches.open(cacheName);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        throw error;
    }
}

// Update cache in background without blocking the response
async function updateCacheInBackground(request, cache) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
            console.log('[SW] Background cache update completed for:', request.url);
        }
    } catch (error) {
        console.log('[SW] Background cache update failed for:', request.url, error);
    }
}

// Handle background sync for offline actions
self.addEventListener('sync', event => {
    console.log('[SW] Background sync:', event.tag);
    
    if (event.tag === 'refresh-news') {
        event.waitUntil(refreshNewsInBackground());
    }
});

// Refresh news in background
async function refreshNewsInBackground() {
    try {
        const response = await fetch('/api/refresh');
        if (response.ok) {
            console.log('[SW] Background news refresh completed');
            
            // Notify all clients about the update
            const clients = await self.clients.matchAll();
            clients.forEach(client => {
                client.postMessage({
                    type: 'news-refreshed',
                    timestamp: Date.now()
                });
            });
        }
    } catch (error) {
        console.error('[SW] Background news refresh failed:', error);
    }
}

// Handle push notifications (placeholder for future implementation)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            data: data.url,
            requireInteraction: false,
            tag: 'news-update'
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Handle notification click
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.notification.data) {
        event.waitUntil(
            clients.openWindow(event.notification.data)
        );
    }
});