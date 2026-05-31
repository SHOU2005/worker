const CACHE = 'switch-worker-v4'
const PRECACHE = ['/manifest.json', '/icons/icon-192.png', '/offline.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // Drop any cache other than the current version.
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
    // Tell every controlled page that a new SW took over so they can
    // optionally re-fetch critical data instead of trusting a possibly
    // stale response that started on the old SW.
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of clients) {
      try { c.postMessage({ type: 'SW_UPDATED', cache: CACHE }) } catch (_) {}
    }
  })())
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // Skip API + ALL cross-origin requests (Razorpay, Firebase, fonts).
  // Cross-origin caching was breaking payment flows when a stale broken
  // response stuck in the cache.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)) }
      return res
    // Transient fetch failure → cached copy if we have it, else the
    // offline page. Never redirect to /login on network errors —
    // a wifi blip shouldn't sign the worker out.
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/offline.html')))
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(self.registration.showNotification(data.title ?? 'Switch', {
    body: data.body ?? '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: data.url ?? '/' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/'))
})
