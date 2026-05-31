const CACHE = 'switch-ops-v4'
const PRECACHE = ['/ops-manifest.json', '/icons/icon-192.png', '/offline.html']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    await self.clients.claim()
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of clients) { try { c.postMessage({ type: 'SW_UPDATED', cache: CACHE }) } catch (_) {} }
  })())
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  // Skip API + cross-origin (Razorpay, Firebase, fonts).
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)) }
      return res
    // Transient fetch failure → cached copy if we have it, else the
    // offline page. Never redirect to /ops on network errors.
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/offline.html')))
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(self.registration.showNotification(data.title ?? 'Switch Ops', {
    body: data.body ?? '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    data: { url: data.url ?? '/ops' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(clients.openWindow(e.notification.data?.url ?? '/ops'))
})
