'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import ActiveShiftCard from '@/components/worker/ActiveShiftCard'
import JyotiArrivalFlow from '@/components/worker/JyotiArrivalFlow'
import { useLanguage } from '@/app/worker/LanguageContext'

// Full-screen route the worker lands on after accepting a job. Mirrors the
// dashboard ActiveShiftCard but takes over the whole viewport so the
// arrival → selfie → OTP → countdown → end → rate flow has zero visual
// distraction. The card itself is unchanged — same component, same state
// machine, same modals. Just hosted on a dedicated route.
//
// We fetch the booking via GET /api/bookings/[id] (added in this slice).
// If the booking row already includes checkInTime / arrivalSelfieAt, the
// card mounts at the correct stage automatically.

export default function ActiveShiftPage() {
  const router = useRouter()
  const params = useParams<{ bookingId: string }>()
  const search = useSearchParams()
  const { t } = useLanguage()
  const bookingId = params?.bookingId
  // ?confirm=1 lands here from the dashboard-stack accept flow. Triggers
  // Jyoti to auto-open with the post-accept opener ("aap jaoge na?")
  // instead of waiting for the worker to tap the orb.
  const autoStartReason: 'post_accept_confirm' | null =
    search?.get('confirm') === '1' ? 'post_accept_confirm' : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [booking, setBooking] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!bookingId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}`)
        if (cancelled) return
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          setError(d.error || 'Could not load shift')
          setLoading(false)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setBooking(data.booking)
        setLoading(false)
      } catch {
        if (!cancelled) {
          setError('Network error')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [bookingId])

  return (
    <div style={{
      minHeight: '100vh', background: '#000000', color: '#FFFFFF',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      display: 'flex', flexDirection: 'column' as const,
    }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <button
          onClick={() => router.push('/worker/dashboard')}
          aria-label="Back"
          style={{
            width: 38, height: 38, borderRadius: 19, border: 'none',
            background: 'rgba(255,255,255,0.08)', color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
            {booking?.shift?.title || t('activeShift') || 'Active shift'}
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '2px 0 0' }}>
            {booking?.shift?.address || booking?.shift?.city || ''}
          </p>
        </div>
      </header>

      <main style={{ flex: 1, padding: 16 }}>
        {loading && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 240,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 14,
              border: '3px solid rgba(255,255,255,0.15)',
              borderTopColor: '#FFFFFF',
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        )}
        {!loading && error && (
          <div style={{
            padding: 24, borderRadius: 14,
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: '#FCA5A5',
          }}>
            {error}
          </div>
        )}
        {!loading && booking && (
          <ActiveShiftCard booking={booking} onArrived={() => { /* no-op on full-screen route */ }} />
        )}
      </main>

      {/* Jyoti voice assistant — only mounted on the dedicated arrival route
          where the worker has the screen to themselves. The orb floats above
          the BottomNav safe area; tapping starts an ElevenLabs session and
          the agent can open maps, fire the selfie camera, or submit the OTP
          via the worker's authenticated cookies. */}
      {!loading && booking && (
        <JyotiArrivalFlow
          shift={booking.shift}
          bookingId={booking.id}
          autoStartReason={autoStartReason}
          onShiftStarted={() => {
            // Re-fetch so the card mounts at the "shift in progress" stage
            // once Jyoti's verify_otp_and_start tool flips the booking.
            ;(async () => {
              try {
                const r = await fetch(`/api/bookings/${bookingId}`)
                if (r.ok) {
                  const d = await r.json()
                  setBooking(d.booking)
                }
              } catch { /* swallow — card will still show last state */ }
            })()
          }}
        />
      )}
    </div>
  )
}
