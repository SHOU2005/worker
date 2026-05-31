'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, MapPin, Clock, CheckCircle, Phone, User2 } from 'lucide-react'
import { formatCurrency, formatTime } from '@/lib/utils'
import { useLanguage } from '@/app/worker/LanguageContext'
import RateEmployerModal    from '@/components/worker/RateEmployerModal'

// The active-shift card was extracted from app/worker/dashboard/page.tsx
// so both the dashboard (inline card) and the dedicated full-screen route
// at /worker/active/[bookingId] render the same flow without duplication.

export default function ActiveShiftCard({ booking, onArrived }: { booking: Record<string,unknown>; onArrived: () => void }) {
  const { t }      = useLanguage()
  const router     = useRouter()
  const shift      = booking.shift as Record<string,unknown>
  const isActive   = booking.status === 'IN_PROGRESS'
  const alreadyArrived = !!(booking.checkInTime)
  // Rail width is measured from the live element instead of being hardcoded
  // at 280px — on wider phones / tablets the rail stretches to fill the
  // parent (width:100%) but the thumb-max math used to clamp at 220, leaving
  // a big empty gap and making the slider feel broken.
  const thumbW     = 56
  const [trackWidth, setTrackWidth] = useState<number>(280)

  const [pos,           setPos]          = useState(0)
  const [sliding,       setSliding]      = useState(false)
  const [arrived,       setArrived]      = useState(alreadyArrived)
  const [loading,       setLoading]      = useState(false)
  const [shiftStarted,  setShiftStarted] = useState(isActive)
  const [otp,           setOtp]          = useState('')
  const [otpError,      setOtpError]     = useState('')
  const [verifying,     setVerifying]    = useState(false)
  const [otpSecondsLeft,setOtpSecondsLeft] = useState(300)
  const [startedAt,     setStartedAt]    = useState<number | null>(
    booking.checkInTime ? new Date(booking.checkInTime as string).getTime() : null,
  )
  // Selfie capture step was removed — workers go from slide-to-arrive
  // straight to the OTP modal. The Booking.arrivalSelfie column still
  // exists on the DB for backwards compat but isn't required to start.
  const [showOtpModal,  setShowOtpModal] = useState(alreadyArrived && !isActive)
  const [showRateModal, setShowRateModal] = useState(false)
  // Shift has been ended on the server. Hides the live timer + end-shift
  // slider so the worker doesn't slide-to-end again on an already-
  // completed booking (the server returns 400 for that and the worker
  // thinks the action didn't register).
  const [shiftEnded,    setShiftEnded]   = useState(booking.status === 'COMPLETED')
  const [distanceM,     setDistanceM]    = useState<number | null>(null)
  const startX     = useRef(0)
  const railRef    = useRef<HTMLDivElement>(null)

  // Worker must be within 100 m of the shift's lat/lng before slide-to-arrive
  // unlocks. Server (/api/worker/arrive) treats it as advisory only so ops
  // placeholder coords don't lock genuine workers out.
  const ARRIVAL_RADIUS_M = 100
  const destLat = (shift?.lat as number | null | undefined) ?? null
  const destLng = (shift?.lng as number | null | undefined) ?? null
  const haveDest = destLat != null && destLng != null
  const inRange  = haveDest && distanceM != null && distanceM <= ARRIVAL_RADIUS_M

  useEffect(() => {
    if (arrived || shiftStarted) return
    if (!haveDest || !('geolocation' in navigator)) return
    const watchId = navigator.geolocation.watchPosition(
      p => {
        const R = 6_371_000
        const toRad = (x: number) => x * Math.PI / 180
        const dLat = toRad(destLat! - p.coords.latitude)
        const dLng = toRad(destLng! - p.coords.longitude)
        const a = Math.sin(dLat / 2) ** 2
              + Math.cos(toRad(p.coords.latitude)) * Math.cos(toRad(destLat!))
              * Math.sin(dLng / 2) ** 2
        setDistanceM(Math.round(2 * R * Math.asin(Math.sqrt(a))))
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [arrived, shiftStarted, haveDest, destLat, destLng])

  useEffect(() => {
    const measure = () => {
      if (railRef.current) setTrackWidth(railRef.current.getBoundingClientRect().width || 280)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [arrived, shiftStarted])

  useEffect(() => {
    if (!arrived || shiftStarted) return
    setOtpSecondsLeft(300)
    const tk = setInterval(() => {
      setOtpSecondsLeft(s => {
        if (s <= 1) { setOtp(''); setOtpError('OTP expired — ask employer for a new one'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tk)
  }, [arrived, shiftStarted])

  const onStart = useCallback((x: number) => { startX.current = x; setSliding(true) }, [])
  const onMove  = useCallback((x: number) => {
    if (!sliding) return
    const max = trackWidth - thumbW - 4
    setPos(Math.max(0, Math.min(max, x - startX.current)))
  }, [sliding, trackWidth])
  const markArrived = useCallback(async () => {
    if (loading) return
    if (haveDest && distanceM != null && distanceM > ARRIVAL_RADIUS_M) {
      setOtpError(`Move within ${ARRIVAL_RADIUS_M} m of the job to mark arrival`)
      return
    }
    setLoading(true)
    const gps = await new Promise<{ lat: number; lng: number } | null>(resolve => {
      if (!('geolocation' in navigator)) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      )
    })
    const res = await fetch('/api/worker/arrive', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ bookingId: booking.id, ...(gps || {}) }),
    }).catch(() => null)
    setLoading(false)
    if (res && res.ok) {
      setArrived(true)
      setShowOtpModal(true)
      onArrived()
    } else if (res) {
      const d = await res.json().catch(() => ({}))
      if (d?.code === 'OUT_OF_GEOFENCE') {
        setOtpError(d.error || 'Move closer to the work location to mark arrival')
      } else {
        setOtpError(d?.error || 'Could not mark arrival. Try again.')
      }
    } else {
      setOtpError('Network error. Try again.')
    }
  }, [loading, booking.id, onArrived, haveDest, distanceM])

  const onEnd   = useCallback(async () => {
    if (!sliding) return
    setSliding(false)
    const max = trackWidth - thumbW - 4
    if (pos >= max - 20) {
      await markArrived()
    } else {
      setPos(0)
    }
  }, [sliding, pos, trackWidth, markArrived])

  async function verifyOTP() {
    if (otp.length !== 6) return
    setVerifying(true)
    setOtpError('')
    try {
      const res = await fetch(`/api/employer/jobs/${(shift as any).id}/otp`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Per-booking OTP — server flips only THIS booking, not the whole shift.
        body:    JSON.stringify({ otp, bookingId: booking.id }),
      })
      if (!res.ok) {
        setOtpError(t('invalidOTP'))
        setOtp('')
      } else {
        setShiftStarted(true)
        setStartedAt(Date.now())
        setShowOtpModal(false)
      }
    } catch {
      setOtpError(t('invalidOTP'))
    } finally {
      setVerifying(false)
    }
  }

  const address  = (shift?.address || shift?.city || '') as string
  const mapLink  = (shift?.mapLink as string | null | undefined) || ''
  const mapsUrl  = mapLink || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=transit`
  const employer = (shift?.employer as Record<string, unknown> | undefined)
  const ownerUser= (employer?.user as Record<string, unknown> | undefined)
  const ownerName= (ownerUser?.name  as string | undefined) || ''
  const ownerPhone= (ownerUser?.phone as string | undefined) || ''

  return (
    <div className="rounded-2xl p-4 animate-fade-up" style={{ background: '#111111', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <p className="text-[10px] font-bold tracking-wider" style={{ color: 'rgba(255,255,255,0.65)' }}>
          {shiftStarted ? t('shiftInProgress') : t('confirmedShift')}
        </p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-black text-white text-base">{shift?.title as string}</p>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {formatTime(shift?.startTime as string)} – {shift?.endTime ? formatTime(shift.endTime as string) : 'Until completed'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black text-white">{formatCurrency(booking.workerEarning as number)}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{t('yourShare')}</p>
        </div>
      </div>

      {(ownerName || ownerPhone || address) && (
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
          {ownerName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: ownerPhone || address ? 8 : 0 }}>
              <User2 style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.55)' }} />
              <p style={{ color: '#FFF', fontSize: 13, fontWeight: 700, margin: 0 }}>{ownerName}</p>
            </div>
          )}
          {ownerPhone && (
            <a href={`tel:${ownerPhone}`}
               style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: address ? 8 : 0, textDecoration: 'none' }}>
              <Phone style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.55)' }} />
              <p style={{ color: '#3B82F6', fontSize: 13, fontWeight: 700, margin: 0 }}>{ownerPhone}</p>
            </a>
          )}
          {address && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <MapPin style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.55)', marginTop: 2, flexShrink: 0 }} />
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 1.4, margin: 0 }}>{address}</p>
            </div>
          )}
        </div>
      )}

      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          width: '100%', height: 44, borderRadius: 12, marginBottom: 10,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
          color: '#FFFFFF', fontSize: 14, fontWeight: 700, textDecoration: 'none',
        }}
      >
        <MapPin style={{ width: 16, height: 16 }} />
        {t('getDirections')}
      </a>

      {!arrived && !shiftStarted && haveDest && (
        <div style={{
          marginBottom: 10, padding: '12px 14px', borderRadius: 14,
          background: inRange ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${inRange ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.10)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>{inRange ? '✅' : '🚶'}</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: inRange ? '#22C55E' : '#FFFFFF' }}>
              {distanceM == null ? 'Finding you…' : inRange ? 'You\'ve arrived' : `${distanceM > 1000 ? (distanceM/1000).toFixed(1) + ' km' : distanceM + ' m'} away`}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
              {distanceM == null
                ? 'Allow location to track your route to the job site'
                : inRange
                  ? 'Slide below to confirm you\'re at the door'
                  : `Slide-to-arrive unlocks within ${ARRIVAL_RADIUS_M} m`}
            </p>
          </div>
        </div>
      )}

      {!arrived && !shiftStarted && (
        <div
          ref={railRef}
          style={{
            position: 'relative', width: '100%', height: 60, borderRadius: 30,
            background: (haveDest && !inRange) ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${(haveDest && !inRange) ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)'}`,
            overflow: 'hidden', userSelect: 'none' as const,
            opacity: (haveDest && !inRange) ? 0.55 : 1,
            cursor: (haveDest && !inRange) ? 'not-allowed' : 'default',
          }}
          onMouseDown={e => { if (haveDest && !inRange) return; onStart(e.clientX - (railRef.current?.getBoundingClientRect().left || 0)) }}
          onMouseMove={e => onMove(e.clientX - (railRef.current?.getBoundingClientRect().left || 0))}
          onMouseUp={onEnd}
          onMouseLeave={onEnd}
          onTouchStart={e => { if (haveDest && !inRange) return; onStart(e.touches[0].clientX - (railRef.current?.getBoundingClientRect().left || 0)) }}
          onTouchMove={e => onMove(e.touches[0].clientX - (railRef.current?.getBoundingClientRect().left || 0))}
          onTouchEnd={onEnd}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: pos + thumbW / 2, background: 'rgba(255,255,255,0.06)', transition: sliding ? 'none' : 'width 0.25s' }} />
          {/* Centered label — left/right edges of the pill are reserved for
              the thumb and the swipe affordance, so the prompt sits in the
              middle for parity with the green "Mark Arrived" button below. */}
          <p style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.38)', pointerEvents: 'none' as const, textAlign: 'center' as const }}>
            {t('slideToArrive')}
          </p>
          <div style={{
            position: 'absolute', left: pos + 2, top: 2, width: thumbW, height: thumbW, borderRadius: thumbW / 2,
            background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            transition: sliding ? 'none' : 'left 0.25s cubic-bezier(0.34,1.2,0.64,1)',
            cursor: 'grab',
          }}>
            {loading
              ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,0.15)', borderTopColor: '#111', animation: 'spin 0.7s linear infinite' }} />
              : <ArrowRight style={{ width: 22, height: 22, color: '#111111' }} />
            }
          </div>
        </div>
      )}

      {!arrived && !shiftStarted && (() => {
        // Tap-to-arrive mirrors the slide gate: server treats geofence as
        // advisory only, but the UI requires the worker to be within
        // ARRIVAL_RADIUS_M of the shift before the button unlocks. When
        // the shift has no usable lat/lng (ops placeholder), the button
        // stays unlocked so workers aren't trapped.
        const blocked = haveDest && !inRange
        return (
          <button
            onClick={markArrived}
            disabled={loading || blocked}
            style={{
              width: '100%', height: 54, marginTop: 10, borderRadius: 14,
              background: blocked ? 'rgba(255,255,255,0.06)' : '#22C55E',
              color: blocked ? 'rgba(255,255,255,0.4)' : '#FFFFFF',
              border: blocked ? '1px solid rgba(255,255,255,0.10)' : 'none',
              fontSize: 15, fontWeight: 800,
              cursor: loading || blocked ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1,
              transition: 'background 0.2s, color 0.2s, border-color 0.2s',
            }}
          >
            {loading ? (
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.35)', borderTopColor: '#FFFFFF', animation: 'spin 0.7s linear infinite' }} />
            ) : blocked ? (
              <span>
                {distanceM == null
                  ? 'Finding your location…'
                  : `Move ${distanceM > 1000 ? (distanceM/1000).toFixed(1) + ' km' : distanceM + ' m'} closer to enable`}
              </span>
            ) : (
              <>
                <CheckCircle style={{ width: 18, height: 18 }} />
                <span>{t('markArrivedBtn')}</span>
              </>
            )}
          </button>
        )
      })()}

      {arrived && !shiftStarted && showOtpModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            padding: '0 16px', paddingBottom: 'calc(24px + var(--safe-b, 0px))',
            animation: 'fade-up 0.25s ease-out',
          }}
        >
          <div style={{
            width: '100%', maxWidth: 460,
            background: '#111111', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 20, padding: '20px 18px 18px',
            boxShadow: '0 12px 48px rgba(0,0,0,0.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Clock style={{ width: 18, height: 18, color: '#22C55E' }} />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                  📍 {t('arrivedBanner')}
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '2px 0 0' }}>
                  {(shift?.title as string) || ''}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              {/* Server-side OTP is 6 digits (crypto.randomInt(100000, 1000000)
                  in /api/employer/jobs/[id]/otp). Worker input was capped at
                  4 — every entered code failed silently. Now matches. */}
              <input
                type="tel"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                autoComplete="one-time-code"
                autoFocus
                value={otp}
                disabled={otpSecondsLeft === 0}
                onChange={e => { setOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError('') }}
                placeholder="6-digit code"
                style={{
                  flex: 1, minWidth: 0, height: 52, borderRadius: 12,
                  border: '1.5px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)', color: '#FFFFFF',
                  fontSize: 22, fontWeight: 900,
                  textAlign: 'center' as const, letterSpacing: 6, outline: 'none',
                  fontFamily: 'monospace', boxSizing: 'border-box' as const,
                  opacity: otpSecondsLeft === 0 ? 0.5 : 1,
                }}
              />
              <button
                onClick={verifyOTP}
                disabled={otp.length !== 6 || verifying || otpSecondsLeft === 0}
                style={{
                  flex: 1, height: 52, borderRadius: 12, border: 'none',
                  background: otp.length === 6 && otpSecondsLeft > 0 ? '#22C55E' : 'rgba(255,255,255,0.12)',
                  color: otp.length === 6 && otpSecondsLeft > 0 ? '#FFFFFF' : 'rgba(255,255,255,0.3)',
                  fontSize: 14, fontWeight: 800,
                  cursor: otp.length === 6 && otpSecondsLeft > 0 ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                {verifying ? t('verifyingOTP') : t('verifyAndStart')}
              </button>
            </div>
            <p style={{
              fontSize: 11, color: 'rgba(255,255,255,0.5)',
              margin: '10px 0 0', textAlign: 'center' as const,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {otpSecondsLeft > 0
                ? `Code expires in ${Math.floor(otpSecondsLeft/60)}:${String(otpSecondsLeft%60).padStart(2,'0')}`
                : 'Expired — ask employer for a new one'}
            </p>
            {otpError && (
              <p style={{ fontSize: 12, color: '#FF3B30', margin: '8px 0 0', textAlign: 'center' as const }}>
                {otpError}
              </p>
            )}
          </div>
        </div>
      )}

      {shiftStarted && !shiftEnded && (
        <ShiftCountdownTimer
          startedAt={startedAt}
          durationHours={(shift?.duration as number) ?? 0}
          bookingId={booking.id as string}
          onCompleted={() => {
            // Server flipped this booking to COMPLETED. Hide the live
            // timer and end-shift slider immediately so the worker
            // doesn't accidentally re-end (which returns 400 and feels
            // broken), then surface the rate-employer modal.
            setShiftEnded(true)
            setShowRateModal(true)
          }}
        />
      )}

      {shiftEnded && !showRateModal && (
        <div
          style={{
            marginTop: 12, padding: '16px 18px', borderRadius: 14,
            background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.35)',
            color: '#22C55E', fontWeight: 800, fontSize: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          <CheckCircle style={{ width: 18, height: 18 }} />
          Shift completed — returning to dashboard…
        </div>
      )}

      {showRateModal && (
        <RateEmployerModal
          bookingId={booking.id as string}
          employerName={(((shift?.employer as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined)?.name as string) || ''}
          onDone={() => {
            setShowRateModal(false)
            // After rate (or skip), get the worker out of the now-stale
            // active-shift screen. Without this, the page sat on the
            // ended shift indefinitely.
            router.push('/worker/dashboard')
          }}
        />
      )}
    </div>
  )
}

function ShiftCountdownTimer({
  startedAt,
  durationHours,
  bookingId,
  onCompleted,
}: {
  startedAt: number | null
  durationHours: number
  bookingId: string
  onCompleted: () => void
}) {
  const { t } = useLanguage()
  const [, setTick] = useState(0)
  const beepedRef = useRef(false)
  const audioRef  = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!startedAt) return
    const i = setInterval(() => setTick(x => x + 1), 1000)
    return () => clearInterval(i)
  }, [startedAt])

  const startMs   = startedAt ?? Date.now()
  const endMs     = startMs + Math.max(0, durationHours) * 3600_000
  const remaining = endMs - Date.now()
  // Only consider the shift overtime if we have a real positive duration.
  // Previously when `durationHours` was 0/null (legacy data, ops-created
  // shifts), `endMs === startMs` and `remaining < 0` was true on the
  // very first tick — the page blared the overtime ring at the worker
  // the moment they verified the OTP.
  const overtime  = durationHours > 0 && remaining < 0
  const beepKey   = `sw_beep_${bookingId}`
  useEffect(() => {
    if (!startedAt || beepedRef.current) return
    if (typeof window !== 'undefined' && localStorage.getItem(beepKey) === '1') {
      beepedRef.current = true
      return
    }
    if (overtime) {
      beepedRef.current = true
      try { localStorage.setItem(beepKey, '1') } catch {}
      try {
        const a = audioRef.current || new Audio('/urgent-ring.wav')
        audioRef.current = a
        a.currentTime = 0
        a.volume = 0.8
        a.play().catch(() => {})
        setTimeout(() => { try { a.pause() } catch {} }, 3000)
      } catch {}
      try { navigator.vibrate?.([300, 150, 300, 150, 600]) } catch {}
    }
  }, [overtime, startedAt, beepKey])

  const abs   = Math.abs(remaining)
  const total = Math.floor(abs / 1000)
  const h     = Math.floor(total / 3600)
  const m     = Math.floor((total % 3600) / 60)
  const s     = total % 60
  const pad   = (n: number) => String(n).padStart(2, '0')
  const timeStr = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`

  const elapsedMs = Math.max(0, Date.now() - startMs)
  const earned    = ((elapsedMs / 3600_000) * 100).toFixed(2)

  return (
    <div>
      <div style={{
        background: overtime ? 'rgba(245,158,11,0.10)' : 'rgba(34,197,94,0.10)',
        borderRadius: 14,
        border: `1px solid ${overtime ? 'rgba(245,158,11,0.35)' : 'rgba(34,197,94,0.30)'}`,
        padding: '14px 16px',
        boxShadow: overtime ? '0 4px 18px rgba(245,158,11,0.10)' : '0 4px 18px rgba(34,197,94,0.08)',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <CheckCircle style={{ width: 16, height: 16, color: overtime ? '#F59E0B' : '#22C55E' }} />
          <p style={{ fontSize: 13, fontWeight: 800, color: overtime ? '#F59E0B' : '#22C55E', margin: 0 }}>
            {overtime ? t('shiftTimeUpTitle') : t('shiftCountdownLabel')}
          </p>
          <span style={{
            marginLeft: 'auto', fontSize: 9, fontWeight: 900, letterSpacing: 1,
            padding: '2px 6px', borderRadius: 4,
            background: overtime ? '#F59E0B' : '#22C55E',
            color: '#000000',
          }}>
            {overtime ? t('shiftOvertimeLabel').toUpperCase() : 'LIVE'}
          </span>
        </div>
        <div style={{
          fontSize: 36, fontWeight: 900, color: '#FFFFFF', lineHeight: 1.05,
          fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums' as const,
          letterSpacing: -1,
        }}>
          {overtime ? `+${timeStr}` : timeStr}
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', margin: '4px 0 10px' }}>
          {overtime ? t('shiftTimeUpSub') : 'hh : mm : ss'}
        </p>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 10px', borderRadius: 10,
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.55)' }}>
            {t('earnedSoFarLabel')}
          </span>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF', fontFamily: 'monospace' }}>
            ₹{earned}
          </span>
        </div>
      </div>

      <EndShiftSlider
        bookingId={bookingId}
        label={t('slideToEndShift')}
        endingLabel={t('endingShiftBtn')}
        onCompleted={() => {
          try { localStorage.removeItem(beepKey) } catch {}
          onCompleted()
        }}
      />
    </div>
  )
}

function EndShiftSlider({
  bookingId,
  label,
  endingLabel,
  onCompleted,
}: {
  bookingId: string
  label: string
  endingLabel: string
  onCompleted: () => void
}) {
  const thumbW = 52
  const railRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(280)
  const [pos, setPos] = useState(0)
  const [sliding, setSliding] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const startX = useRef(0)

  useEffect(() => {
    const measure = () => {
      if (railRef.current) setTrackWidth(railRef.current.getBoundingClientRect().width || 280)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  function onStart(x: number) { startX.current = x - pos; setSliding(true) }
  function onMove(x: number) {
    if (!sliding) return
    const max = trackWidth - thumbW - 4
    setPos(Math.max(0, Math.min(max, x - startX.current)))
  }
  async function onEnd() {
    if (!sliding) return
    setSliding(false)
    const max = trackWidth - thumbW - 4
    if (pos < max - 20) { setPos(0); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'COMPLETED' }),
      })
      if (res.ok) {
        onCompleted()
      } else {
        setPos(0)
        setSubmitting(false)
      }
    } catch {
      setPos(0)
      setSubmitting(false)
    }
  }

  return (
    <div
      ref={railRef}
      style={{
        position: 'relative' as const, width: '100%', height: 60, borderRadius: 30,
        background: 'rgba(220,38,38,0.12)',
        border: '1px solid rgba(220,38,38,0.35)',
        overflow: 'hidden', userSelect: 'none' as const,
      }}
      onMouseDown={e => onStart(e.clientX - (railRef.current?.getBoundingClientRect().left || 0))}
      onMouseMove={e => onMove(e.clientX - (railRef.current?.getBoundingClientRect().left || 0))}
      onMouseUp={onEnd}
      onMouseLeave={onEnd}
      onTouchStart={e => onStart(e.touches[0].clientX - (railRef.current?.getBoundingClientRect().left || 0))}
      onTouchMove={e => onMove(e.touches[0].clientX - (railRef.current?.getBoundingClientRect().left || 0))}
      onTouchEnd={onEnd}
    >
      <div style={{
        position: 'absolute' as const, left: 0, top: 0, bottom: 0,
        width: pos + thumbW / 2,
        background: 'rgba(220,38,38,0.20)',
        transition: sliding ? 'none' : 'width 0.25s',
      }} />
      <p style={{
        position: 'absolute' as const, right: 20, top: '50%', transform: 'translateY(-50%)',
        fontSize: 13, fontWeight: 700, color: '#FCA5A5',
        pointerEvents: 'none' as const,
      }}>
        {submitting ? endingLabel : label}
      </p>
      <div style={{
        position: 'absolute' as const, left: pos + 2, top: 2,
        width: thumbW, height: thumbW, borderRadius: thumbW / 2,
        background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 12px rgba(220,38,38,0.4)',
        transition: sliding ? 'none' : 'left 0.25s cubic-bezier(0.34,1.2,0.64,1)',
        cursor: 'grab',
      }}>
        {submitting
          ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.25)', borderTopColor: '#FFFFFF', animation: 'spin 0.7s linear infinite' }} />
          : <ArrowRight style={{ width: 22, height: 22, color: '#FFFFFF' }} />
        }
      </div>
    </div>
  )
}
