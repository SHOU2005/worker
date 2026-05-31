'use client'

import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'

const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyCk1e3yCrlsn0V6qDa43OwTeLaYuNKX2sE',
  authDomain:        'hearus-4f2fe.firebaseapp.com',
  projectId:         'hearus-4f2fe',
  storageBucket:     'hearus-4f2fe.appspot.com',
  messagingSenderId: '616412616901',
  appId:             '1:616412616901:web:5f83157adc3e01fd1478ac',
}

const APP_NAME = 'switchnow'
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || ''

function getFirebaseApp() {
  return getApps().find(a => a.name === APP_NAME) ?? initializeApp(FIREBASE_CONFIG, APP_NAME)
}

/**
 * Dedicated scope for the Firebase messaging SW. Using a unique path
 * (the convention FCM expects) means we don't fight worker-sw.js /
 * employer-sw.js for the `/` registration slot — both SWs can coexist.
 * Chrome's most common "notifications won't enable" symptom on the
 * worker app was caused by the FCM register call silently replacing
 * worker-sw.js at scope `/`, leaving the page with one SW that has no
 * push handler.
 */
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope/'

/** Retry POST /api/push/token up to 3 times — 1s, 2s, 4s backoff. */
async function sendTokenWithRetry(token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('/api/push/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ token }),
      })
      if (res.ok) return true
      // 4xx → not retryable (auth issue, malformed token)
      if (res.status >= 400 && res.status < 500) return false
    } catch { /* network blip — retry */ }
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
  }
  return false
}

let lastRegisteredToken: string | null = null
let visibilityListenerAttached = false

/**
 * If persisting the token failed (flaky network, 5xx) and the page
 * later returns to the foreground, retry once. Cheap and idempotent —
 * /api/push/token dedupes by token string.
 */
function attachVisibilityRetry() {
  if (visibilityListenerAttached) return
  visibilityListenerAttached = true
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !lastRegisteredToken) return
    void sendTokenWithRetry(lastRegisteredToken)
  })
}

/**
 * Detect whether we're running inside the Capacitor APK shell. The
 * native shell exposes `window.Capacitor.isNativePlatform()`; we
 * dynamic-import to avoid breaking SSR / non-native builds.
 */
async function isCapacitorNative(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    return !!cap?.isNativePlatform?.()
  } catch { return false }
}

/**
 * Native (APK) push registration via @capacitor/push-notifications.
 * Returns the actual Android FCM token that UrgentRingService receives,
 * NOT the VAPID web-push token (which only works inside service worker
 * subscriptions). Without this branch, web getToken() hands back a
 * VAPID key the native Firebase SDK can't deliver against — pushes
 * silently disappear on the APK.
 */
async function registerNativeFCMToken(): Promise<string | null> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== 'granted') {
      console.warn('[FCM] native permission not granted:', perm.receive)
      return null
    }
    // Register asynchronously — the actual token arrives in the
    // 'registration' event below. Promisify it.
    const token = await new Promise<string | null>((resolve) => {
      const timeout = setTimeout(() => resolve(null), 10_000)
      PushNotifications.addListener('registration', (t) => {
        clearTimeout(timeout)
        resolve(t.value || null)
      })
      PushNotifications.addListener('registrationError', (err) => {
        clearTimeout(timeout)
        console.warn('[FCM] native registration error:', err)
        resolve(null)
      })
      PushNotifications.register().catch(() => resolve(null))
    })
    return token
  } catch (err) {
    console.warn('[FCM] native registration failed:', err)
    return null
  }
}

/**
 * Register the device's FCM token with our backend. Resilient to flaky
 * networks via 3-attempt exponential backoff + a visibilitychange retry
 * so a worker who locks their phone briefly doesn't end up with a stale
 * token that the server has never seen.
 *
 * Path split:
 *   - Native APK (Capacitor): use @capacitor/push-notifications to get
 *     the actual Android FCM registration token.
 *   - Web / PWA: register the Firebase messaging SW + getToken() with
 *     the VAPID key. Web push only.
 */
export async function registerFCMToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const native = await isCapacitorNative()
  console.log('[FCM] register start — native=' + native + ' notif=' + (typeof Notification !== 'undefined' ? Notification.permission : 'n/a'))

  // Native path — bypass the WebView Notification API entirely.
  if (native) {
    const token = await registerNativeFCMToken()
    if (!token) { console.warn('[FCM] native register returned no token'); return null }
    console.log('[FCM] native token len=' + token.length)
    lastRegisteredToken = token
    const ok = await sendTokenWithRetry(token)
    console.log('[FCM] POST /api/push/token ok=' + ok)
    attachVisibilityRetry()
    return token
  }

  // Web / PWA path
  if (!('serviceWorker' in navigator)) { console.warn('[FCM] no SW support'); return null }
  // VAPID_KEY is required for web push — Firebase getToken silently
  // returns null when it's empty, so we have to flag this loudly.
  // Set NEXT_PUBLIC_FIREBASE_VAPID_KEY in Vercel env vars; the value
  // lives in Firebase Console → Project Settings → Cloud Messaging →
  // Web Push certificates.
  if (!VAPID_KEY) {
    console.error('[FCM] NEXT_PUBLIC_FIREBASE_VAPID_KEY is empty — notifications cannot register on web. Set it in Vercel env.')
    throw new Error('Notifications are not configured on this deploy. Contact support.')
  }
  try {
    // Dedicated scope so we don't trample the role-specific SWs that
    // already own scope `/`. See FCM_SW_SCOPE comment.
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SW_SCOPE })
    // Wait for the SW we JUST registered to activate. `navigator.
    // serviceWorker.ready` resolves on the FIRST active SW, which on the
    // worker app is worker-sw.js — we'd race past activation if we used
    // the global ready promise.
    await new Promise<void>(resolve => {
      if (reg.active) return resolve()
      const sw = reg.installing || reg.waiting
      if (!sw) return resolve()
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve() })
    })

    const app = getFirebaseApp()
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })

    if (!token) {
      console.warn('[FCM] web getToken empty — likely a stale browser permission. Ask the user to revoke + re-grant.')
      throw new Error('Could not register device for notifications. Try toggling notifications off and on in browser settings.')
    }
    console.log('[FCM] web token len=' + token.length)
    lastRegisteredToken = token

    const ok = await sendTokenWithRetry(token)
    console.log('[FCM] POST /api/push/token ok=' + ok)
    attachVisibilityRetry()
    return token
  } catch (err) {
    console.warn('[FCM] web token registration failed:', err)
    throw err
  }
}

export async function setupForegroundMessages(onMsg: (payload: any) => void) {
  if (typeof window === 'undefined') return
  // Native APK: use Capacitor's pushNotificationReceived event — the web
  // Firebase JS SDK throws "messaging/unsupported-browser" inside the
  // Capacitor WebView, which is what generated the noisy uncaught
  // promise rejection workers were seeing.
  if (await isCapacitorNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      PushNotifications.addListener('pushNotificationReceived', (notif) => {
        // Shape match the web payload so the rest of the code in
        // UrgentJobAlert can read it uniformly.
        onMsg({ notification: { title: notif.title, body: notif.body }, data: notif.data })
      })
    } catch (err) {
      console.warn('[FCM] native foreground listener failed:', err)
    }
    return
  }
  // Web / PWA path
  try {
    const app = getFirebaseApp()
    const messaging = getMessaging(app)
    onMessage(messaging, onMsg)
  } catch (err) {
    console.warn('[FCM] web foreground listener failed:', err)
  }
}
