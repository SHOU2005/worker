// Firebase Cloud Messaging service worker — handles background push notifications.
// FCM SDK looks for this file at the root of the site.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyCk1e3yCrlsn0V6qDa43OwTeLaYuNKX2sE",
  authDomain:        "hearus-4f2fe.firebaseapp.com",
  projectId:         "hearus-4f2fe",
  storageBucket:     "hearus-4f2fe.appspot.com",
  messagingSenderId: "616412616901",
  appId:             "1:616412616901:web:5f83157adc3e01fd1478ac",
});

const messaging = firebase.messaging();

// In-memory set of urgent shiftIds we've already shown a notification
// for in the last DEDUPE_WINDOW_MS. The backend can fire the same urgent
// push twice in quick succession (broadcast retry, employer's payment
// webhook + verify both running) — without dedupe the worker gets 8
// buzzes for the same job. Cleaned up after the window expires.
const DEDUPE_WINDOW_MS = 60_000;
const seenUrgent = new Map();  // shiftId → expiry timestamp
function alreadyShown(shiftId) {
  if (!shiftId) return false;
  const now = Date.now();
  // Purge expired entries.
  for (const [k, exp] of seenUrgent) { if (exp <= now) seenUrgent.delete(k); }
  if (seenUrgent.has(shiftId)) return true;
  seenUrgent.set(shiftId, now + DEDUPE_WINDOW_MS);
  return false;
}

// Background messages: FCM calls this when the app tab is closed / not focused.
messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data  = payload.data || {};
  // For URGENT_JOB the server now ships data-only payloads so the title
  // + body live under data.* (so the native APK service can read them).
  // Fall back to top-level notification.* for legacy pushes.
  const title = data.title || notification.title || 'Switch';
  const body  = data.body  || notification.body  || '';

  const isUrgent = data.type === 'URGENT_JOB';
  if (isUrgent && alreadyShown(data.shiftId)) {
    // Dupe — drop the second push to the same worker for the same shift
    // within DEDUPE_WINDOW_MS.
    return;
  }

  self.registration.showNotification(title, {
    body,
    icon:        '/icons/icon-192.png',
    data,
    tag:         isUrgent ? `urgent-${data.shiftId || 'job'}` : (data.notification_id || data.request_id || 'switch-push'),
    renotify:    true,
    requireInteraction: isUrgent,                     // sticky until tapped
    vibrate:     isUrgent ? [400, 100, 400, 100, 400, 100, 400] : [200, 100, 200],
    silent:      false,
  });

  // Re-fire urgent notifications a few times so the worker can't miss it.
  if (isUrgent) {
    let n = 0;
    const id = setInterval(() => {
      n++;
      if (n >= 4) { clearInterval(id); return; }
      self.registration.showNotification(title, {
        body,
        icon:    '/icons/icon-192.png',
        data,
        tag:     `urgent-${data.shiftId || 'job'}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [400, 100, 400, 100, 400],
      });
    }, 3000);
  }
});

// Take control of any open clients as soon as we activate so the same
// service worker handles notifications + tab navigation. Without
// claim(), the installed PWA's first session keeps using whatever SW
// version was registered at install time, and our notificationclick
// handler doesn't run — the OS opens the URL in the browser instead of
// the PWA.
self.addEventListener('install',  (e) => { self.skipWaiting() });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()) });

// When the user taps the notification:
//  1. If the PWA / a tab is already open, focus it AND navigate it to
//     the notification's URL (we used to just focus the existing window
//     without navigating, so the user saw the old screen and thought
//     the tap did nothing — that was "app installed not opening").
//  2. If nothing is open, openWindow at the URL. For installed PWAs
//     the browser launches the PWA when the URL is within its scope.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data           = event.notification.data || {};
  const url            = data.url || '/';
  const notificationId = data.notification_id;

  const target = notificationId
    ? `${url}${url.includes('?') ? '&' : '?'}notif=${encodeURIComponent(notificationId)}`
    : url;
  // Absolute URL — `openWindow` and `client.navigate` both honor it
  // correctly. Relative paths sometimes resolve against the SW's
  // registration scope in surprising ways on Android Chrome PWAs.
  const absoluteTarget = new URL(target, self.location.origin).href;

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (!client.url.startsWith(self.location.origin)) continue;
      // Tell the page in case it wants to handle the navigation itself
      // (some pages listen to NOTIFICATION_CLICK for in-app routing).
      try { client.postMessage({ type: 'NOTIFICATION_CLICK', url, notificationId }); } catch (_) {}
      try {
        // Move the focused client to the right URL. `client.navigate`
        // only works inside the same origin/scope — exactly our case.
        if (client.url !== absoluteTarget && 'navigate' in client) {
          try { await client.navigate(absoluteTarget); } catch (_) {}
        }
        if ('focus' in client) return await client.focus();
      } catch (_) { /* try next client */ }
    }
    // No open window — launch one. For installed PWAs scoped to this
    // origin, the browser opens the PWA shell (not the browser tab).
    if (self.clients.openWindow) return self.clients.openWindow(absoluteTarget);
  })());
});
