self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? '⚡ Urgent Job Nearby!', {
      body: data.body ?? 'An urgent part-time job is available near you. Tap to view.',
      icon: data.icon ?? '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.tag ?? 'urgent-job',
      renotify: true,
      requireInteraction: true,
      data: { url: data.url ?? '/worker/jobs' },
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/worker/jobs'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
