'use client'
import { useEffect, useRef } from 'react'

// Native-only silent permission requester. Mounts inside both worker
// and employer layouts. On a Capacitor Android shell this fires the
// system permission dialogs on first app launch:
//
//   - Location (foreground)  — Geolocation plugin
//   - Notifications          — PushNotifications plugin (Android 13+
//                              gates POST_NOTIFICATIONS at runtime)
//
// Both apps need location (nearby jobs / worker tracking on one side,
// nearby workers + map on the other) and notifications (FCM push for
// urgent jobs / booking updates).
//
// Idempotent: the plugins return the existing grant without re-prompting
// once granted. If the user previously denied, Android sometimes
// auto-suppresses the dialog ("Don't ask again") — they'd have to
// enable manually in Settings, which is acceptable.
//
// No UI overlay. Web/browser builds: skipped entirely (browsers prompt
// inline from the call site that actually needs the permission).
export default function LocationBootstrap() {
  const ranRef = useRef(false)
  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    ;(async () => {
      try {
        if (typeof window === 'undefined') return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Cap = (window as any).Capacitor
        if (!Cap?.isNativePlatform?.()) return

        // Location (foreground). Capacitor's plugin maps to
        // ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION on Android.
        try {
          const { Geolocation } = await import('@capacitor/geolocation')
          await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => null)
        } catch {}

        // Notifications. Android 13+ requires POST_NOTIFICATIONS at
        // runtime — without this prompt the WebView never receives
        // FCM pushes even with the token registered.
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          await PushNotifications.requestPermissions().catch(() => null)
        } catch {}
      } catch {}
    })()
  }, [])
  return null
}
