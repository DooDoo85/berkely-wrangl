// ═══════════════════════════════════════════════════════════════════════
// Wrangl Service Worker
// Level A: App-shell caching only (no data caching)
//
// Caches static assets (JS/CSS bundles, icons, fonts) so the app loads
// instantly even on bad signal. All API calls still go to the network —
// no stale data risk.
//
// Cache version bump: increment WRANGL_CACHE_VERSION when shipping new
// code to force fresh asset downloads on next visit.
// ═══════════════════════════════════════════════════════════════════════

const WRANGL_CACHE_VERSION = 'wrangl-v1'
const SHELL_CACHE = `${WRANGL_CACHE_VERSION}-shell`

// Pre-cache the bare minimum needed to render the app shell.
// Vite hashes asset filenames, so we let runtime caching pick them up
// on first navigation rather than pre-listing them here.
const SHELL_URLS = [
  '/',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

// ─── Install ─────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      // Don't fail install if individual URLs 404 — that's a deployment
      // concern, not a SW concern. Use Promise.allSettled.
      return Promise.allSettled(
        SHELL_URLS.map((url) => cache.add(url).catch(() => null))
      )
    })
  )
  // Activate this SW immediately on first install so the user doesn't
  // have to refresh twice
  self.skipWaiting()
})

// ─── Activate ────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Drop any caches that don't match the current version
      return Promise.all(
        keys
          .filter((k) => !k.startsWith(WRANGL_CACHE_VERSION))
          .map((k) => caches.delete(k))
      )
    })
  )
  // Claim all open tabs so this SW takes effect everywhere immediately
  self.clients.claim()
})

// ─── Fetch ───────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle GET requests
  if (request.method !== 'GET') return

  // Never cache API calls, auth, or anything off-domain.
  // Wrangl talks to Supabase (api.supabase.co) and we explicitly do NOT
  // want to cache that data — always fresh from the network.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/.netlify/')) return

  // Navigation requests (HTML) — network-first so users always get the
  // latest deployed shell. Falls back to cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy))
          return response
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Static assets (JS, CSS, fonts, icons) — cache-first.
  // These are content-hashed by Vite so stale-while-revalidate is safe.
  const isStaticAsset =
    /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/')

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          // Only cache successful, same-origin responses
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      })
    )
    return
  }

  // Everything else — just network, no caching
})

// ─── Message handler ────────────────────────────────────────────────
// Allows the app to force a SW skipWaiting (used by the update prompt)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
