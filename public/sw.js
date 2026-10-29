const CACHE_NAME = 'tretmax-static-v2'
const APP_SHELL = '/'
const PRECACHE_URLS = [
  APP_SHELL,
  '/manifest.webmanifest',
  '/icons/tretmax-192.png',
  '/icons/tretmax-512.png',
]
const SUPABASE_PATHS = ['/auth/', '/rest/v1/', '/storage/v1/', '/functions/v1/']

function isSupabaseRequest(url) {
  return SUPABASE_PATHS.some((path) => url.pathname.startsWith(path))
}

function isStaticAsset(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || isSupabaseRequest(url)) return false
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest'
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // Navigation is network-first so auth state and server updates are never served from a data cache.
  if (request.mode === 'navigate' && request.method === 'GET' && url.origin === self.location.origin) {
    event.respondWith(fetch(request).catch(() => caches.match(APP_SHELL)))
    return
  }

  // Only immutable Vite assets and public branding files may enter the cache. Supabase and private app
  // responses are deliberately excluded, including requests with query parameters.
  if (!isStaticAsset(request, url)) return
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())))
      }
      return response
    })),
  )
})
