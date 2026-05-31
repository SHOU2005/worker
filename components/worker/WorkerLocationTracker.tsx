'use client'
import { useEffect } from 'react'

/**
 * Worker location tracking — runs continuously while the tab is open,
 * regardless of whether a shift is active. Employers / Ops can always see
 * where workers are on the live map.
 *
 * Two stacked sources:
 *  1. navigator.geolocation.watchPosition — fires on every detected move.
 *  2. setInterval heartbeat — sends a fresh fix every 2 minutes as a safety
 *     net, even when the worker is stationary.
 */
// 5-second cadence so employers see worker movement in near-real-time.
// watchPosition still fires on its own when the device detects motion;
// the heartbeat is the floor — at least one ping every 5 s while the
// tab is visible and the worker is logged in.
const HEARTBEAT_MS    = 5 * 1000   // 5 s heartbeat (was 2 min)
const MIN_SEND_GAP_MS = 5 * 1000   // throttle floor: at most one /api/worker/location call every 5 s
const MIN_MOVE_M      = 3          // even a tiny shift (3 m) is enough to ping — keeps the map fluid

function metersBetween(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000
  const toRad = (x: number) => x * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export default function WorkerLocationTracker() {
  useEffect(() => {
    let watchId: number | null = null
    let intervalId: ReturnType<typeof setInterval> | null = null
    let cancelled = false
    let lastSentAt = 0
    let lastLat: number | null = null
    let lastLng: number | null = null

    function send(lat: number, lng: number, force = false) {
      const now = Date.now()
      // Throttle: at most once every MIN_SEND_GAP_MS unless forced
      if (!force && now - lastSentAt < MIN_SEND_GAP_MS) return
      // Movement gate: skip if barely moved (saves Vercel function invocations)
      if (!force && lastLat != null && lastLng != null) {
        const d = metersBetween(lastLat, lastLng, lat, lng)
        if (d < MIN_MOVE_M && now - lastSentAt < HEARTBEAT_MS) return
      }
      lastSentAt = now
      lastLat = lat
      lastLng = lng
      fetch('/api/worker/location', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lat, lng }),
        keepalive: true,
      }).catch(() => {})
    }

    function pingOnce(force = false) {
      if (cancelled || !('geolocation' in navigator)) return
      if (typeof document !== 'undefined' && document.hidden) return
      // maximumAge:0 forces a fresh GPS read each tick — without this the
      // browser may return a cached fix that's already 30 s old and the
      // employer's map appears frozen even though the heartbeat is firing.
      navigator.geolocation.getCurrentPosition(
        p => send(p.coords.latitude, p.coords.longitude, force),
        () => {},
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
      )
    }

    function onVisibility() {
      if (document.hidden) return
      // Resumed from background — force-send on next reading so the employer
      // sees us right away.
      pingOnce(true)
    }

    ;(async () => {
      try {
        const r = await fetch('/api/auth/me')
        const data = r.ok ? await r.json() : null
        if (cancelled || data?.user?.role !== 'WORKER') return

        // On the published Capacitor app, ask the Android runtime for
        // location permission BEFORE we start watching. This is what
        // triggers the native "Allow Switch Players to access this
        // device's location?" system dialog. The plugin is a no-op on
        // web — the browser keeps using navigator.geolocation which
        // prompts inline when watchPosition is called.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Cap = typeof window !== 'undefined' ? (window as any).Capacitor : null
        if (Cap?.isNativePlatform?.()) {
          try {
            const { Geolocation } = await import('@capacitor/geolocation')
            await Geolocation.requestPermissions({ permissions: ['location'] }).catch(() => null)
          } catch {}
        }

        if (cancelled) return

        // Force the very first reading so the employer sees us immediately.
        pingOnce(true)

        // Real-time stream — fires on each significant movement
        if ('geolocation' in navigator) {
          watchId = navigator.geolocation.watchPosition(
            p => send(p.coords.latitude, p.coords.longitude),
            () => {},
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
          )
        }

        // Heartbeat — guarantees we update at least every 2 minutes while the tab is open
        intervalId = setInterval(() => pingOnce(false), HEARTBEAT_MS)
        document.addEventListener('visibilitychange', onVisibility)
      } catch {}
    })()

    return () => {
      cancelled = true
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (intervalId !== null) clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return null
}
