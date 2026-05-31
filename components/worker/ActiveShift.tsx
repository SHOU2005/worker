'use client'
import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Clock, X, AlertCircle, MapPin, Navigation, Mic } from 'lucide-react'
import JobIcon from './JobIcon'
import { openMaps } from '@/lib/open-maps'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ActiveShift drives the arrival → OTP → live-timer → end flow on the worker
// side. The Jyoti voice assistant mounts inside this screen via a dedicated
// slot at the bottom-right; she is the ONLY surface that may auto-mount —
// the rest of the worker app surfaces her through navigation.
type ShiftLike = {
  id: string
  title: string
  status?:    string
  hourlyRate?: number
  duration?:   number
  startTime?:  string
  endTime?:    string
  // Extended for the redesign — maps button + Jyoti's open_employer_maps tool
  // need at least one of these to find the destination.
  address?:   string
  city?:      string
  lat?:       number
  lng?:       number
  mapsUrl?:   string
  employer?: { companyName?: string; user?: { name?: string } }
}

function jobEmoji(title: string) {
  const t = (title || '').toLowerCase()
  if (t.includes('shop') || t.includes('helper'))    return '🏪'
  if (t.includes('delivery') || t.includes('rider')) return '🚴'
  if (t.includes('warehouse'))                        return '🏭'
  if (t.includes('security') || t.includes('guard')) return '🔒'
  if (t.includes('kitchen') || t.includes('cook'))   return '🍳'
  if (t.includes('driver'))                          return '🚗'
  if (t.includes('clean'))                           return '🧹'
  if (t.includes('pack'))                            return '📦'
  if (t.includes('cashier'))                         return '🛒'
  return '💼'
}

/* ─────────────────────────────────────────────────────────────────────────
   Slide button — used to end an active shift. Unchanged from the prior
   design: the gesture is well-tuned for fat-finger touch on small screens.
   ───────────────────────────────────────────────────────────────────────── */
function SlideButton({ label, doneLabel, color, onConfirm }: {
  label: string; doneLabel: string; color: string; onConfirm: () => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const startX   = useRef(0)
  const curX     = useRef(0)
  const [x, setX]   = useState(0)
  const [done, setDone] = useState(false)

  const THUMB_W = 52
  const PAD     = 5
  const maxX    = () => (trackRef.current?.offsetWidth ?? 320) - THUMB_W - PAD * 2

  function onDown(e: React.PointerEvent) {
    if (done) return
    startX.current = e.clientX - curX.current
    thumbRef.current?.setPointerCapture(e.pointerId)
  }
  function onMove(e: React.PointerEvent) {
    if (!thumbRef.current?.hasPointerCapture(e.pointerId)) return
    const nx = Math.max(0, Math.min(e.clientX - startX.current, maxX()))
    curX.current = nx; setX(nx)
  }
  function onUp() {
    if (curX.current >= maxX() * 0.82) {
      setX(maxX()); setDone(true); setTimeout(onConfirm, 400)
    } else { curX.current = 0; setX(0) }
  }

  const pct   = x / Math.max(maxX(), 1)
  const fillW = x + THUMB_W + PAD * 2

  return (
    <div ref={trackRef} className="relative select-none"
      style={{
        height: 62, borderRadius: 31, overflow: 'hidden',
        background: done ? '#111111' : `${color}14`,
        border: `1.5px solid ${done ? '#111111' : `${color}44`}`,
        transition: 'background 0.4s, border-color 0.3s',
      }}>
      {!done && (
        <div className="absolute inset-y-0 left-0 pointer-events-none"
          style={{ width: fillW, background: `linear-gradient(90deg, ${color}cc, ${color})`, borderRadius: 31 }} />
      )}
      {!done ? (
        <div className="absolute inset-0 flex items-center pointer-events-none"
          style={{ paddingLeft: THUMB_W + PAD * 2 + 14, paddingRight: 16, opacity: Math.max(0, 1 - pct * 1.8) }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.55)' }}>{label}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-2 pointer-events-none">
          <CheckCircle style={{ width: 20, height: 20, color: '#FFFFFF' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{doneLabel}</span>
        </div>
      )}
      <div ref={thumbRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        className="absolute flex items-center justify-center z-10"
        style={{
          top: PAD, bottom: PAD, width: THUMB_W,
          left: x + PAD, borderRadius: THUMB_W / 2,
          background: done ? 'rgba(255,255,255,0.2)' : '#FFFFFF',
          boxShadow: '0 3px 14px rgba(0,0,0,0.15)',
          touchAction: 'none', cursor: done ? 'default' : 'grab',
          transition: done ? 'left 0.35s ease' : 'none',
        }}>
        {done ? <CheckCircle style={{ width: 22, height: 22, color: '#FFFFFF' }} /> : <span style={{ fontSize: 20 }}>→</span>}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Employer destination card — shown at the top of the arrival screen so the
   worker knows whose location they are heading to before they tap anything.
   The "Open Maps" button is the single most-used action on this screen; it
   gets the largest tap target and a hard contrast against the surrounding
   greys. Hidden entirely when there is nothing to point at (no address +
   no lat/lng) so we never render a button that does nothing.
   ───────────────────────────────────────────────────────────────────────── */
function EmployerCard({ shift }: { shift: ShiftLike }) {
  const company = shift.employer?.companyName || shift.employer?.user?.name || 'Employer'
  const addressLine = shift.address || shift.city || ''
  const canOpenMaps = Boolean(addressLine || (shift.lat && shift.lng) || shift.mapsUrl)

  return (
    <div
      style={{
        width: '100%',
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 18,
        padding: 14,
        marginBottom: 18,
        boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
      }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <JobIcon emoji={jobEmoji(shift.title)} size={46} radius={13} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: '#111111', lineHeight: 1.2 }}>{shift.title}</p>
          <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.55)', marginTop: 2 }}>
            {company}{shift.startTime ? ` · ${shift.startTime}` : ''}
          </p>
          {addressLine && (
            <p style={{
              fontSize: 11, color: 'rgba(0,0,0,0.5)', marginTop: 6,
              display: 'flex', alignItems: 'flex-start', gap: 4, lineHeight: 1.35,
            }}>
              <MapPin style={{ width: 11, height: 11, marginTop: 2, flexShrink: 0 }} />
              <span>{addressLine}</span>
            </p>
          )}
        </div>
      </div>
      {canOpenMaps && (
        <button
          onClick={() => openMaps({
            address: shift.address,
            lat:     shift.lat,
            lng:     shift.lng,
            mapsUrl: shift.mapsUrl,
            label:   company,
          })}
          style={{
            marginTop: 12, width: '100%',
            height: 44, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: '#111111', color: '#FFFFFF',
            fontSize: 14, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
          }}>
          <Navigation style={{ width: 15, height: 15 }} />
          Open Maps
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   OTP entry — 4-digit arrival code from the employer. Server-side this is
   rate-limited (5 wrong → 10m lock), 15m expiry, one-time. The boxes are
   intentionally large so a worker squinting at the employer's screen can
   confirm digit-by-digit without misclicking, and so Jyoti can fill them
   programmatically without the user having to re-aim a tiny tap target.
   ───────────────────────────────────────────────────────────────────────── */
function OTPScreen({ shift, bookingId, onVerified }: {
  shift: ShiftLike; bookingId: string | null; onVerified: (startedAt: number) => void
}) {
  const [otp,    setOtp]    = useState(['','','',''])
  const [error,  setError]  = useState<string | null>(null)
  const [shake,  setShake]  = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(900) // 15min — matches server OTP_EXPIRY_MS
  const [verifying, setVerifying] = useState(false)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          setOtp(['','','',''])
          setError('OTP expired — ask employer for a new one')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [])

  function handleInput(i: number, val: string) {
    const digit = val.replace(/\D/, '').slice(-1)
    const next = [...otp]; next[i] = digit; setOtp(next)
    setError(null)
    if (digit && i < 3) refs[i + 1].current?.focus()
    if (!digit && i > 0) refs[i - 1].current?.focus()
  }
  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[i] && i > 0) refs[i - 1].current?.focus()
  }

  async function verify() {
    const code = otp.join('')
    if (code.length !== 4) return
    setVerifying(true)
    setError(null)
    try {
      const res = await fetch(`/api/employer/jobs/${shift.id}/otp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // Always send bookingId. Without it the server's backwards-compat
        // fallback resolves to "first CONFIRMED booking by appliedAt asc",
        // which flipped the wrong worker on multi-worker shifts.
        body: JSON.stringify({ otp: code, ...(bookingId ? { bookingId } : {}) }),
      })
      if (res.ok) {
        onVerified(Date.now())
      } else {
        // Surface server-provided message — covers rate-limit ("Try again in
        // 10 min"), validation errors, and shift-state errors.
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error || 'Wrong OTP. Ask the employer again.')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        setOtp(['','','',''])
        setTimeout(() => refs[0].current?.focus(), 50)
      }
    } catch {
      setError('Network error. Try again.')
    } finally {
      setVerifying(false)
    }
  }

  const full = otp.every(d => d !== '')
  const expired = secondsLeft === 0
  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  return (
    <div className="flex-1 flex flex-col px-5 py-5" style={{ background: '#FAFAFA' }}>
      <EmployerCard shift={shift} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 24,
          background: '#111111',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 22, boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
        }}>
          <Clock style={{ width: 32, height: 32, color: '#FFFFFF', strokeWidth: 1.8 }} />
        </div>

        <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', marginBottom: 6, letterSpacing: -0.5 }}>
          Enter Arrival OTP
        </p>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginBottom: 26, maxWidth: 280, lineHeight: 1.4 }}>
          Ask the employer for the 4-digit code. Verifying starts your shift timer.
        </p>

        {/* 4-digit boxes — 60×72 for clear touch targets and so Jyoti can
            fill them programmatically without misreads. */}
        <div
          className={shake ? 'animate-shake' : ''}
          style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          {otp.map((d, i) => (
            <input
              key={i} ref={refs[i]}
              type="tel" inputMode="numeric" maxLength={1}
              value={d}
              disabled={expired || verifying}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              style={{
                width: 60, height: 72, textAlign: 'center',
                fontSize: 30, fontWeight: 900,
                borderRadius: 16,
                border: `2px solid ${error ? '#DC2626' : d ? '#111111' : 'rgba(0,0,0,0.12)'}`,
                background: d ? '#FFFFFF' : '#F5F5F5',
                color: '#111111', outline: 'none',
                opacity: expired ? 0.5 : 1,
                boxShadow: d ? '0 4px 14px rgba(0,0,0,0.08)' : 'none',
                transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
              }} />
          ))}
        </div>

        {error
          ? <p style={{
              fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 18,
              display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
              maxWidth: 320,
            }}>
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />{error}
            </p>
          : <p style={{
              fontSize: 12, color: 'rgba(0,0,0,0.5)', marginBottom: 18,
              fontVariantNumeric: 'tabular-nums',
            }}>
              Code expires in {mins}:{String(secs).padStart(2, '0')}
            </p>
        }

        <button onClick={verify} disabled={!full || verifying || expired}
          style={{
            width: '100%', maxWidth: 340,
            height: 56, borderRadius: 16, border: 'none',
            background: full && !expired ? '#111111' : 'rgba(0,0,0,0.08)',
            color:      full && !expired ? '#FFFFFF' : 'rgba(0,0,0,0.3)',
            fontSize: 15, fontWeight: 800,
            cursor: full && !expired && !verifying ? 'pointer' : 'not-allowed',
            boxShadow: full && !expired ? '0 8px 24px rgba(0,0,0,0.16)' : 'none',
            transition: 'all 0.2s',
          }}>
          {verifying ? 'Verifying…' : expired ? 'OTP Expired' : 'Confirm Arrival'}
        </button>

        {/* Jyoti hint — workers who don't realise the mic is there for them. */}
        <p style={{
          marginTop: 22, fontSize: 11, color: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <Mic style={{ width: 11, height: 11 }} />
          Jyoti se baat karke OTP bolo
        </p>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Live shift timer — shown after OTP verifies. Layout largely preserved
   (the pulsing dot motif is well-recognised by returning workers), but the
   slide-to-end is now spaced tighter so the timer dominates the screen.
   ───────────────────────────────────────────────────────────────────────── */
function ShiftTimer({ shift, startedAt, onEnd }: {
  shift: ShiftLike; startedAt: number; onEnd: () => void
}) {
  const [secs, setSecs] = useState(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))

  useEffect(() => {
    const t = setInterval(() => setSecs(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 1000)
    return () => clearInterval(t)
  }, [startedAt])

  const hrs  = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const sec  = secs % 60
  const pad  = (n: number) => String(n).padStart(2, '0')

  // Worker take-home is a flat ₹100/hr regardless of employer rate.
  const hours       = shift.duration   ?? 0
  const totalPay    = Math.round(100 * hours)
  const earnedSoFar = ((secs / 3600) * 100).toFixed(2)

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-8">
        <div className="w-36 h-36 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.04)', border: '2px solid rgba(0,0,0,0.08)' }}>
          <div className="w-28 h-28 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.05)', border: '2px solid rgba(0,0,0,0.1)', animation: 'pulse 2s ease-in-out infinite' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: '#111111' }}>
              <span className="w-3 h-3 rounded-full" style={{ background: '#FFFFFF', animation: 'pulse 1.5s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
        <div className="absolute -top-1 -right-1 px-2 py-0.5 rounded-full"
          style={{ background: '#111111', fontSize: 10, fontWeight: 800, color: '#FFFFFF' }}>LIVE</div>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.5)', marginBottom: 8 }}>Shift in progress</p>
      <p style={{ fontSize: 48, fontWeight: 900, color: '#111111', fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 4 }}>
        {pad(hrs)}:{pad(mins)}:{pad(sec)}
      </p>
      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginBottom: 24 }}>hours : minutes : seconds</p>

      <div className="w-full p-4 rounded-2xl mb-6"
        style={{ background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)' }}>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', marginBottom: 4 }}>Earned so far</p>
        <p style={{ fontSize: 32, fontWeight: 900, color: '#111111', lineHeight: 1 }}>₹{earnedSoFar}</p>
        <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', marginTop: 4 }}>₹100/hr · Total ₹{totalPay.toLocaleString('en-IN')} after {hours}h</p>
      </div>

      <div className="w-full">
        <SlideButton label="Slide to end shift" doneLabel="Shift ended" color="#DC2626" onConfirm={onEnd} />
      </div>
      <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', marginTop: 10 }}>You&apos;ll be paid based on actual time worked</p>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────
   Main wrapper. Renders OTP screen until verified, then the live timer.
   `JyotiMic` mounts at fixed bottom-right inside the dialog regardless of
   stage — it is the single voice surface for the entire arrival flow, and
   is hidden once the shift ends so it doesn't drift over the "shift ended"
   confirmation animation.
   ───────────────────────────────────────────────────────────────────────── */
export default function ActiveShift({ job, bookingId, onClose, onDone }: {
  job: any | null; bookingId?: string | null; onClose: () => void; onDone: (j: any) => void
}) {
  const shift = job as ShiftLike | null
  const [visible,   setVisible]   = useState(false)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [ended,     setEnded]     = useState(false)

  const storageKey = shift ? `sw_shift_started_${shift.id}` : null

  useEffect(() => {
    if (!shift) { setVisible(false); return }
    const stored = storageKey ? Number(localStorage.getItem(storageKey) || 0) : 0
    let initialStart = stored && !isNaN(stored) && stored > 0 ? stored : null
    // If shift is already IN_PROGRESS server-side but we have no local timestamp, start from "now"
    if (!initialStart && shift.status === 'IN_PROGRESS') {
      initialStart = Date.now()
      if (storageKey) localStorage.setItem(storageKey, String(initialStart))
    }
    setStartedAt(initialStart)
    setEnded(false)
    requestAnimationFrame(() => setVisible(true))
  }, [shift, storageKey])

  function close() { setVisible(false); setTimeout(onClose, 320) }

  function handleVerified(ts: number) {
    if (storageKey) localStorage.setItem(storageKey, String(ts))
    setStartedAt(ts)
  }

  function endShift() {
    if (storageKey) localStorage.removeItem(storageKey)
    setEnded(true)
    setTimeout(() => { setVisible(false); setTimeout(() => onDone(shift!), 320) }, 1200)
  }

  if (!shift) return null
  const verified = startedAt !== null

  return (
    <div className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: '#FFFFFF',
        paddingTop: 'var(--safe-t)', paddingBottom: 'var(--safe-b)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(40px)',
        transition: 'opacity 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1)',
      }}>
      <div className="flex items-center justify-between px-5 pt-3 pb-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: '#111111' }}>
          {verified ? 'Active Shift' : 'Confirm Arrival'}
        </p>
        {!verified && (
          <button onClick={close} className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: '#F5F5F5' }}>
            <X style={{ width: 18, height: 18, color: 'rgba(0,0,0,0.55)' }} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {!verified
          ? <OTPScreen shift={shift} bookingId={bookingId ?? null} onVerified={handleVerified} />
          : <ShiftTimer shift={shift} startedAt={startedAt!} onEnd={endShift} />
        }
      </div>

      {/* Jyoti voice assistant — mounts as a floating orb at bottom-right of
          this dialog. The component handles its own visibility (it auto-hides
          once a shift starts unless the worker re-summons it) and owns the
          ElevenLabs session lifecycle. Implemented in Part B Phase 3 —
          imported lazily so the ElevenLabs SDK is not loaded for workers
          who aren't on an active shift. */}
      {!ended && shift && (
        <JyotiMicSlot shift={shift} bookingId={bookingId ?? null} stage={verified ? 'in_shift' : 'arrival'} />
      )}
    </div>
  )
}

/* JyotiMicSlot — placeholder that the Part B JyotiMic component will replace.
   Rendering a no-op div keeps the DOM stable and lets future hot-swap not
   disturb the surrounding layout. Real implementation in
   components/worker/JyotiMic.tsx. */
function JyotiMicSlot(_props: {
  shift: ShiftLike
  bookingId: string | null
  stage: 'arrival' | 'in_shift'
}) {
  // Intentionally renders nothing in Part D. The slot exists so Part B's
  // JyotiMic can be dropped in without touching ActiveShift again.
  return null
}
