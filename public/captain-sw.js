const CACHE = 'switch-captain-v4'
const PRECACHE = ['/captain-manifest.json', '/icons/icon-192.png', '/offline.html']

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
  // Skip API + cross-origin (Razorpay, Firebase, fonts). Cross-origin
  // caching was breaking payment flows on installed PWAs.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)) }
      return res
    // On a transient network failure: serve the cached copy if we have
    // it, otherwise fall back to the offline page. Never redirect to
    // /captain/login — silently logging the user out on a wifi blip is
    // worse than showing "you're offline".
    }).catch(() => caches.match(e.request).then(cached => cached || caches.match('/offline.html')))
  )
})

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(self.registration.showNotification(data.title ?? 'Switch Captain', {
    body: data.body ?? '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
    tag: data.tag ?? 'captain-notif', renotify: true,
    data: { url: data.url ?? '/captain' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/captain'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const c of clients) { if (c.url.includes('/captain') && 'focus' in c) return c.focus() }
      return self.clients.openWindow(url)
    })
  )
})
