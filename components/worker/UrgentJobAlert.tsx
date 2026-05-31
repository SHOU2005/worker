'use client'
/**
 * Urgent-job foreground alert — opens a full-screen modal and plays a
 * "tring tring" tone on loop the moment an URGENT_JOB FCM push arrives
 * while the worker app is foregrounded. The sound auto-stops when the
 * worker taps "View Job" or "Dismiss", and after a 60-second hard cap
 * to keep us out of the user's face if they've abandoned the tab.
 *
 * Sound is synthesised in real time via Web Audio API (no asset needed).
 * Background pushes use the urgent_ring sound name set on the FCM
 * Android channel + APNs payload (see lib/fcm-server.ts).
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, X, MapPin } from 'lucide-react'
import { setupForegroundMessages, registerFCMToken } from '@/lib/fcm-client'

interface UrgentPayload {
  title:   string
  body:    string
  shiftId: string
  url:     string
  kind:    'urgent' | 'new'
  earn?:   number   // worker take-home in ₹ — flat ₹100/hr × duration
}

const RING_ASSET           = '/urgent-ring.wav'
const RING_INTERVAL_MS     = 2_000      // re-trigger the audio loop every 2s in case the file is shorter
const MAX_RING_DURATION_MS = 60_000     // hard cap so the page never rings forever

export default function UrgentJobAlert() {
  const router = useRouter()
  const [alert, setAlert] = useState<UrgentPayload | null>(null)
  const audioElRef    = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef   = useRef<AudioContext | null>(null)
  const intervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Prime the audio element on first user gesture so autoplay restrictions
  // don't silence the ring when the push arrives. Mobile browsers (esp. iOS
  // Safari + Android Chrome) require a user-initiated play() — load() alone
  // does NOT unlock the element, you have to actually call play() inside the
  // gesture (then immediately pause). After this, subsequent play() calls
  // outside a gesture (e.g. when an urgent job arrives via FCM or polling)
  // are allowed.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const prime = () => {
      if (audioElRef.current) return
      const el = new Audio(RING_ASSET)
      el.preload = 'auto'
      el.loop    = true
      el.volume  = 1.0
      el.muted   = true
      audioElRef.current = el
      // Actually unlock: play (muted) inside the gesture, then pause + unmute
      const p = el.play()
      const finish = () => { el.pause(); el.currentTime = 0; el.muted = false }
      if (p && typeof p.then === 'function') p.then(finish).catch(finish)
      else finish()
      // Same for the WebAudio synth context — create + immediately resume
      // so playSynthPair() works without a follow-up gesture if the WAV
      // is unavailable.
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          audioCtxRef.current.resume().catch(() => {})
        }
      } catch { /* AudioContext not available */ }
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown',     prime)
      window.removeEventListener('touchstart',  prime)
    }
    window.addEventListener('pointerdown', prime, { once: true, passive: true })
    window.addEventListener('keydown',     prime, { once: true })
    window.addEventListener('touchstart',  prime, { once: true, passive: true })
    return () => {
      window.removeEventListener('pointerdown', prime)
      window.removeEventListener('keydown',     prime)
      window.removeEventListener('touchstart',  prime)
    }
  }, [])

  // Web-Audio synthesised fallback for the (rare) case where the WAV file
  // hasn't loaded yet — same two-beep pattern as before.
  function playSynthPair() {
    let ctx = audioCtxRef.current
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioCtxRef.current = ctx
      } catch { return }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const now = ctx.currentTime
    const tone = (start: number, freq: number) => {
      const osc  = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.001, start)
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(start)
      osc.stop(start + 0.34)
    }
    tone(now,        880)
    tone(now + 0.36, 880)
  }

  function startRinging() {
    if (typeof window === 'undefined') return

    // Preferred path: real "trin tring" WAV looped via <audio>.
    let el = audioElRef.current
    if (!el) {
      el = new Audio(RING_ASSET)
      el.preload = 'auto'
      el.loop    = true
      el.volume  = 1.0
      audioElRef.current = el
    }
    el.currentTime = 0
    const playPromise = el.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      // Autoplay blocked — fall back to Web-Audio synthesis (which is allowed
      // when triggered indirectly through user gestures the SDK already had).
      playPromise.catch(() => {
        playSynthPair()
        intervalRef.current = setInterval(playSynthPair, RING_INTERVAL_MS)
      })
    }

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([400, 200, 400, 200, 400, 200, 400])
    }
    stopTimerRef.current = setTimeout(stopRinging, MAX_RING_DURATION_MS)
  }

  function stopRinging() {
    if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current = null }
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
    if (audioElRef.current)   { try { audioElRef.current.pause(); audioElRef.current.currentTime = 0 } catch {} }
    if (audioCtxRef.current)  { try { audioCtxRef.current.close() } catch {}; audioCtxRef.current = null }
  }

  useEffect(() => {
    // Register the device's FCM token with the backend so urgent
    // broadcasts can reach it. On native APK this triggers the
    // Capacitor push-notifications prompt (which Android can grant);
    // on web/PWA it gates on Notification.permission internally.
    // Without this call, every worker page loaded with no token
    // registered = silent push delivery loss.
    registerFCMToken().catch(() => { /* warn-only inside the lib */ })

    setupForegroundMessages((payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => {
      const data = payload.data || {}
      // Pop + ring for both URGENT_JOB and NEW_JOB pushes — every job worth
      // a worker's attention triggers the same alert flow.
      if (data.type !== 'URGENT_JOB' && data.type !== 'NEW_JOB') return
      const isUrgent = data.type === 'URGENT_JOB'
      // Best-effort earn extraction from FCM data — server includes pay
      // string like "₹700 per worker"; pull the digits if present.
      let earnFromPay: number | undefined
      if (data.pay) {
        const m = data.pay.replace(/,/g, '').match(/(\d+)/)
        if (m) earnFromPay = parseInt(m[1], 10)
      }
      const next: UrgentPayload = {
        title:   payload.notification?.title || data.title || (isUrgent ? '🚨 Urgent job nearby' : '🔔 New job posted'),
        body:    payload.notification?.body  || data.body  || 'Tap to view',
        shiftId: data.shiftId || '',
        url:     data.url || (data.shiftId ? `/worker/jobs?${isUrgent ? 'urgent' : 'shift'}=${data.shiftId}` : '/worker/jobs'),
        kind:    isUrgent ? 'urgent' : 'new',
        earn:    earnFromPay,
      }
      setAlert(next)
      startRinging()
    }).catch(() => {})

    return () => stopRinging()
  }, [])

  // Foreground polling fallback — rings the worker's phone for new urgent
  // jobs even when browser notifications are blocked. Polls /api/shifts
  // every 12s while the tab is visible, comparing against a baseline of
  // shift IDs captured on mount. A new urgent shift fires the same alert
  // the FCM listener does. Works regardless of Notification.permission.
  const seenShiftIds = useRef<Set<string>>(new Set())
  const baselineSeeded = useRef(false)
  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let timer: ReturnType<typeof setInterval> | null = null

    async function tick() {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/shifts', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { shifts?: Array<{ id: string; title?: string; address?: string; city?: string; isUrgent?: boolean; duration?: number }> }
        const list = data.shifts || []
        // First pass — seed baseline so we don't ring for shifts that were
        // already in the feed when the worker opened the app.
        if (!baselineSeeded.current) {
          for (const s of list) seenShiftIds.current.add(s.id)
          baselineSeeded.current = true
          return
        }
        for (const s of list) {
          if (seenShiftIds.current.has(s.id)) continue
          seenShiftIds.current.add(s.id)
          // Pop + ring for every newly-posted shift — urgent or not. The
          // visual distinction (URGENT badge / red zap) is rendered from
          // payload.kind below, but both kinds get the same trin tring.
          setAlert(prev => prev?.shiftId === s.id ? prev : ({
            title:   s.title || (s.isUrgent ? '🚨 Urgent job nearby' : '🔔 New job posted'),
            body:    [s.address, s.city].filter(Boolean).join(', ') || 'Tap to view',
            shiftId: s.id,
            url:     `/worker/jobs?${s.isUrgent ? 'urgent' : 'shift'}=${s.id}`,
            kind:    s.isUrgent ? 'urgent' : 'new',
            // Worker take-home is a flat ₹100/hr × duration (lib/pricing.ts).
            earn:    s.duration ? Math.round(100 * s.duration) : undefined,
          }))
          startRinging()
        }
      } catch { /* network blip — try again next tick */ }
    }

    // Kick once immediately to seed, then poll
    tick()
    timer = setInterval(tick, 12_000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  function dismiss() { stopRinging(); setAlert(null) }
  function open()    { const url = alert?.url || '/worker/jobs'; stopRinging(); setAlert(null); router.push(url) }

  if (!alert) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.92)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: '#FFFFFF',
        borderRadius: 24, padding: '28px 22px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        animation: 'pulse 1.4s ease-in-out infinite',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22,
            background: alert.kind === 'urgent' ? 'rgba(251,191,36,0.15)' : 'rgba(34,197,94,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap style={{ width: 22, height: 22, color: alert.kind === 'urgent' ? '#F59E0B' : '#22C55E' }} />
          </div>
          <div>
            <p style={{
              fontSize: 12, fontWeight: 800,
              color: alert.kind === 'urgent' ? '#F59E0B' : '#22C55E',
              textTransform: 'uppercase', letterSpacing: 1, margin: 0,
            }}>
              {alert.kind === 'urgent' ? 'Urgent Job' : 'New Job'}
            </p>
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', margin: '2px 0 0' }}>
              {alert.kind === 'urgent' ? 'First to accept wins' : 'Tap to view'}
            </p>
          </div>
        </div>
        <p style={{ fontSize: 20, fontWeight: 900, color: '#111111', margin: '0 0 6px', lineHeight: 1.25 }}>{alert.title}</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: alert.earn ? 14 : 18 }}>
          <MapPin style={{ width: 14, height: 14, color: 'rgba(0,0,0,0.5)', marginTop: 3, flexShrink: 0 }} />
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.7)', margin: 0, lineHeight: 1.4 }}>{alert.body}</p>
        </div>
        {alert.earn && alert.earn > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#111111', borderRadius: 14, padding: '12px 16px', marginBottom: 18,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>You earn</p>
            <p style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: -0.5 }}>
              ₹{alert.earn.toLocaleString('en-IN')}
            </p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={dismiss}
            style={{ flex: 1, height: 52, borderRadius: 14, border: '1px solid rgba(0,0,0,0.12)', background: '#FFFFFF', color: 'rgba(0,0,0,0.6)', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <X style={{ width: 14, height: 14 }} /> Dismiss
          </button>
          <button onClick={open}
            style={{ flex: 2, height: 52, borderRadius: 14, border: 'none', background: '#111111', color: '#FFFFFF', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
            View Job →
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.02) } }`}</style>
    </div>
  )
}
