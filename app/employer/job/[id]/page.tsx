'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CardSkeleton } from '@/components/shared/Skeleton'
import { DEFAULT_MAP_CENTER } from '@/lib/config'
import RateWorkerModal from '@/components/employer/RateWorkerModal'
import CancelShiftModal from '@/components/employer/CancelShiftModal'
import RescheduleShiftModal from '@/components/employer/RescheduleShiftModal'
import { useLang } from '@/lib/lang'

const EmpMap        = dynamic(() => import('@/components/employer/EmpMap'),        { ssr: false })
const WorkerMapView = dynamic(() => import('@/components/employer/WorkerMapView'), { ssr: false })

const BG   = '#080808'
const S1   = '#111111'
const S2   = '#181818'
const BD   = 'rgba(255,255,255,0.07)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.45)'
const T3   = 'rgba(255,255,255,0.2)'
const GOLD = '#F5C518'
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

// Steps drive the timeline pill row at the top of the job page. Keys must
// match the prisma ShiftStatus enum exactly — ON_THE_WAY/ARRIVED/STARTED
// were never in the enum, so the timeline silently never advanced past
// "Assigned" for jobs that were actually IN_PROGRESS.
//
// We still want to show "On the way" / "Arrived" UX states, but those are
// derived from the booking's checkInTime / worker GPS, not stored on the
// shift itself — see workerArrived/`virtualStatus` below.
//
// SEARCHING is mapped to the same display step as OPEN (cart/verify
// writes status: 'OPEN' on shift creation). Without OPEN mapped, the
// stepper found no current step and rendered every pill as pending.
const STATUS_STEPS = [
  { key: 'SEARCHING',   label: 'Search'   },
  { key: 'ASSIGNED',    label: 'Assigned' },
  { key: 'ARRIVED',     label: 'Arrived'  },   // virtual — booking.checkInTime set
  { key: 'IN_PROGRESS', label: 'Started'  },
  { key: 'COMPLETED',   label: 'Done'     },
]
// Map raw shift.status values to a step key. OPEN treated as SEARCHING.
function toStepKey(status: string | undefined | null): string {
  if (status === 'OPEN') return 'SEARCHING'
  return status || 'SEARCHING'
}

// Live timer + earnings panel mirroring the worker's "ON SHIFT" view. Shows
// once the shift transitions to IN_PROGRESS (i.e. worker entered the OTP and
// the verify route flipped both shift.status and booking.checkInTime).
function ShiftInProgressCard({ checkInIso, hourlyRate }: { checkInIso: string; hourlyRate: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [])

  const start = new Date(checkInIso).getTime()
  const ms    = Math.max(0, Date.now() - start)
  const total = Math.floor(ms / 1000)
  const h     = Math.floor(total / 3600)
  const m     = Math.floor((total % 3600) / 60)
  const s     = total % 60
  const elapsed = h > 0 ? `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s` : `${m}:${String(s).padStart(2,'0')}`

  const minutes = ms / 60_000
  const workerEarn = Math.round(100 * minutes / 60)
  const bill       = Math.round((hourlyRate || 0) * minutes / 60)
  const startTime  = new Date(start).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ background: S1, borderRadius: 20, padding: 18, marginBottom: 12, border: '1px solid rgba(16,185,129,0.35)', boxShadow: '0 4px 20px rgba(16,185,129,0.12)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(16,185,129,0.35)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#10B981' }}>OTP Verified · Shift In Progress</div>
          <div style={{ fontSize: 12, color: T2 }}>Started at {startTime}</div>
        </div>
      </div>
      <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 10, border: '1px solid rgba(16,185,129,0.18)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(16,185,129,0.9)', textTransform: 'uppercase' as const, marginBottom: 4 }}>ON SHIFT</div>
        <div style={{ fontSize: 30, fontWeight: 900, fontFamily: 'monospace', color: T1, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' as const }}>{elapsed}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: S2, borderRadius: 12, padding: '10px 12px', border: `1px solid ${BD}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Worker earns</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#10B981', fontFamily: 'monospace', marginTop: 2 }}>₹{workerEarn.toLocaleString('en-IN')}</div>
        </div>
        <div style={{ flex: 1, background: S2, borderRadius: 12, padding: '10px 12px', border: `1px solid ${BD}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Bill so far</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: T1, fontFamily: 'monospace', marginTop: 2 }}>₹{bill.toLocaleString('en-IN')}</div>
        </div>
      </div>
    </div>
  )
}

function OTPDisplay({ jobId, bookingId }: { jobId: string; bookingId?: string }) {
  const [otp,        setOtp]        = useState('')
  const [expiry,     setExpiry]     = useState<Date | null>(null)
  const [timeLeft,   setTimeLeft]   = useState(0)
  const [generating, setGenerating] = useState(false)
  const [copied,     setCopied]     = useState(false)

  useEffect(() => {
    if (!expiry) return
    const iv = setInterval(() => {
      const diff = Math.floor((expiry.getTime() - Date.now()) / 1000)
      setTimeLeft(Math.max(0, diff))
      if (diff <= 0) { setOtp(''); setExpiry(null) }
    }, 1000)
    return () => clearInterval(iv)
  }, [expiry])

  async function generateOTP() {
    setGenerating(true)
    try {
      // Per-booking OTP — the shift-level endpoint resolves bookingId from
      // the body so each worker on a multi-worker shift gets their own code.
      const res  = await fetch(`/api/employer/jobs/${jobId}/otp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(bookingId ? { bookingId } : {}),
      })
      const data = await res.json()
      if (data.otp) {
        const exp = new Date(data.expiresAt)
        setOtp(data.otp)
        setExpiry(exp)
        // Derive initial timer from the server's expiresAt instead of a
        // hardcoded 300s. With the arrival OTP now expiring in 15 min the old
        // literal would have flashed "5:00" before the first interval tick
        // corrected it to "15:00" — visible regression for the employer.
        setTimeLeft(Math.max(0, Math.floor((exp.getTime() - Date.now()) / 1000)))
      }
    } finally { setGenerating(false) }
  }

  function copyOTP() {
    navigator.clipboard?.writeText(otp).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0')
  const secs = String(timeLeft % 60).padStart(2, '0')

  return (
    <div style={{ background: S1, borderRadius: 20, padding: 20, marginBottom: 12, border: `1px solid ${BD}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: S2, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${BD}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>Job Start OTP</div>
          <div style={{ fontSize: 12, color: T2 }}>Share with worker to begin</div>
        </div>
      </div>

      {otp ? (
        <>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 14 }}>
            {otp.split('').map((d, i) => (
              <div key={i} style={{
                width: 58, height: 66, borderRadius: 16,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900, color: T1,
                background: S2, border: `2px solid ${T1}`,
                fontFamily: 'monospace',
              }}>{d}</div>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, marginBottom: 14, color: timeLeft < 60 ? '#EF4444' : T2, fontWeight: 600 }}>
            Expires in {mins}:{secs}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyOTP} style={{
              flex: 1, padding: '12px 0', borderRadius: 12,
              border: `1.5px solid ${copied ? T1 : BD}`,
              background: copied ? T1 : 'transparent',
              color: copied ? '#000' : T1,
              fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
            }}>{copied ? '✓ Copied' : 'Copy OTP'}</button>
            <button onClick={generateOTP} style={{
              flex: 1, padding: '12px 0', borderRadius: 12, border: `1px solid ${BD}`,
              background: S2, color: T2, fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: FONT,
            }}>Regenerate</button>
          </div>
        </>
      ) : (
        <button onClick={generateOTP} disabled={generating} style={{
          width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: T1, color: '#000', fontWeight: 800, fontSize: 15,
          opacity: generating ? 0.7 : 1, fontFamily: FONT,
        }}>
          {generating ? 'Generating...' : 'Generate OTP'}
        </button>
      )}
    </div>
  )
}

export default function JobDetailPage() {
  const { id }          = useParams<{ id: string }>()
  const router          = useRouter()
  const [job,           setJob]       = useState<any>(null)
  const [worker,        setWorker]    = useState<any>(null)
  const [loading,       setLoading]   = useState(true)
  const [completing,    setCompleting] = useState(false)
  // Session user id for the rated-by comparison. The previous code used
  // job.employerId to match against rating.ratedById, but Shift has no
  // `employerId` column (only `employerProfileId`) — so the comparison
  // always failed and the rate-worker modal re-popped on every 4s poll.
  // The API now returns sessionUserId from the JWT so we can match.
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  // Bookings the employer has already submitted a rating for in THIS
  // tab. Survives the 4s poll without needing the server payload to
  // come back with the new rating row attached.
  const [ratedLocally, setRatedLocally] = useState<Set<string>>(new Set())
  const [rateForBookingId, setRateForBookingId] = useState<string | null>(null)
  const [showCancelModal,     setShowCancelModal]     = useState(false)
  const [showRescheduleModal, setShowRescheduleModal] = useState(false)
  const { t } = useLang()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const res  = await fetch(`/api/employer/jobs/${id}`)
      const data = await res.json()
      if (data.job) {
        setJob(data.job)
        if (typeof data.sessionUserId === 'string') setSessionUserId(data.sessionUserId)
        const confirmed = data.job.bookings?.find((b: any) => ['CONFIRMED','IN_PROGRESS','COMPLETED'].includes(b.status))
        const pending   = data.job.bookings?.find((b: any) => b.status === 'PENDING')
        const b = confirmed || pending
        if (b?.worker) setWorker(b.worker)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    // Fast poll while a worker is being tracked — 4s gives near-real-time
    // updates matched against the worker's 10s send-throttle. Stop polling
    // once the job reaches a terminal state so an employer who leaves the
    // page open doesn't drain their battery hitting the API every 4s for
    // hours. Capture the id in a local so StrictMode double-mount can't
    // leak the previous interval.
    const local = setInterval(load, 4000)
    pollRef.current = local
    return () => {
      clearInterval(local)
      if (pollRef.current === local) pollRef.current = null
    }
  }, [id])

  useEffect(() => {
    if (!job) return
    if (['COMPLETED', 'CANCELLED'].includes(job.status) && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [job?.status])

  // Auto-pop the rate-worker modal as soon as ANY booking on this shift
  // flips to COMPLETED and hasn't already been rated by this employer.
  // For multi-worker shifts we walk the array in order and surface one
  // modal at a time — once rated/skipped, the next unrated COMPLETED
  // booking pops on the next poll. Skip-state is held only in memory
  // (rateForBookingId reset), so a tab refresh will re-prompt — acceptable.
  useEffect(() => {
    if (!job || rateForBookingId) return
    const bookings = (job.bookings || []) as any[]
    const next = bookings.find(b => {
      if (b.status !== 'COMPLETED') return false
      if (ratedLocally.has(b.id))   return false
      const ratings = (b.ratings || []) as { ratedById?: string }[]
      // Use the session user id from the API; matching against
      // job.employerId always failed because Shift has no such field.
      if (sessionUserId && ratings.some(r => r.ratedById === sessionUserId)) return false
      return true
    })
    if (next) setRateForBookingId(next.id)
  }, [job, rateForBookingId, sessionUserId, ratedLocally])

  async function completeJob() {
    setCompleting(true)
    try {
      await fetch(`/api/employer/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'COMPLETED' }) })
      await load()
    } finally { setCompleting(false) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, padding: '20px 16px' }}>
      <CardSkeleton h={60} dark />
      <div style={{ height: 12 }} />
      <CardSkeleton h={140} dark />
      <div style={{ height: 12 }} />
      <CardSkeleton h={200} dark />
    </div>
  )

  if (!job) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: T1, fontWeight: 700, marginBottom: 16 }}>Job not found</div>
        <button onClick={() => router.replace('/employer')} style={{ padding: '12px 24px', borderRadius: 14, background: T1, color: '#000', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>Go Home</button>
      </div>
    </div>
  )

  const statusIdx   = STATUS_STEPS.findIndex(s => s.key === toStepKey(job.status))
  const currentStep = STATUS_STEPS[statusIdx] || STATUS_STEPS[0]
  const isOpen      = job.status === 'OPEN'
  const isSearching = job.status === 'SEARCHING'
  const isAssigned  = job.status === 'ASSIGNED'
  const isStarted   = job.status === 'IN_PROGRESS'
  const isCompleted = job.status === 'COMPLETED'
  const workerName  = worker?.user?.name || 'Worker'
  const workerInit  = workerName[0]?.toUpperCase() || 'W'
  const pendingBookings = job.bookings?.filter((b: any) => b.status === 'PENDING') || []
  // Multi-worker shifts: every CONFIRMED/IN_PROGRESS/COMPLETED booking is a
  // filled slot; render one card per slot. confirmedBooking (the first one)
  // is retained for the legacy single-worker map/contact/header logic that
  // expects one primary worker.
  const confirmedBookings = (job.bookings || []).filter((b: any) =>
    ['CONFIRMED','IN_PROGRESS','COMPLETED'].includes(b.status),
  )
  const confirmedBooking = confirmedBookings[0]
  const workersNeeded = Number(job.workersNeeded || 1)
  const isMultiWorker = workersNeeded > 1
  const workerArrived = !!(confirmedBooking?.checkInTime) && !isCompleted
  // Compute virtual status: use ARRIVED step when worker has marked arrival but job not yet IN_PROGRESS
  const virtualStatus = (workerArrived && job.status === 'ASSIGNED') ? 'ARRIVED' : toStepKey(job.status)
  const statusIdx2 = STATUS_STEPS.findIndex(s => s.key === virtualStatus)

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1 }}>

      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        background: BG, borderBottom: `1px solid ${BD}`,
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        paddingBottom: 14, paddingLeft: 20, paddingRight: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.replace('/employer')} style={{
            width: 40, height: 40, borderRadius: 20, border: `1px solid ${BD}`,
            background: S1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: T1 }}>{job.title}</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>{workerArrived ? 'Arrived' : currentStep.label}</div>
          </div>
          {!isCompleted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: workerArrived ? 'rgba(16,185,129,0.12)' : S1, padding: '6px 12px', borderRadius: 20, border: `1px solid ${workerArrived ? 'rgba(16,185,129,0.3)' : BD}` }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: workerArrived ? '#10B981' : isStarted ? '#10B981' : isSearching ? GOLD : '#60A5FA',
                animation: 'livePulse 1.5s ease infinite',
              }} />
              <span style={{ fontSize: 12, color: workerArrived ? '#10B981' : T1, fontWeight: 600 }}>
                {workerArrived ? 'Worker Arrived!' : isSearching ? 'Searching' : isStarted ? 'Live' : 'Active'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div style={{ position: 'fixed', top: 'calc(62px + env(safe-area-inset-top))', left: 0, right: 0, height: '28vh', zIndex: 10 }}>
        {/* Always render WorkerMapView. Previously we swapped between
            WorkerMapView and EmpMap depending on whether the worker's
            GPS was fresh — every stale-GPS tick (every 4s during poll
            when lastSeenAt aged out) re-ran the dynamic import and
            flashed the pin off the screen. Pass an empty pins array
            when no GPS so the same component just hides the pin. */}
        <WorkerMapView
          pins={(worker?.lat && worker?.lng) ? [{
            id: String(worker.id ?? 'w1'),
            name: workerName,
            lat: Number(worker.lat),
            lng: Number(worker.lng),
            job: job.title,
            status: isStarted ? 'live' : 'pending',
          }] : []}
          centerLat={Number(job.lat) || Number(worker?.lat) || DEFAULT_MAP_CENTER.lat}
          centerLng={Number(job.lng) || Number(worker?.lng) || DEFAULT_MAP_CENTER.lng}
        />
      </div>

      <div style={{ paddingTop: 'calc(62px + env(safe-area-inset-top) + 28vh)', padding: 'calc(62px + env(safe-area-inset-top) + 28vh) 16px 48px' }}>

        {/* Worker arrived banner */}
        {workerArrived && !isStarted && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 26 }}>📍</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#10B981' }}>Worker has arrived!</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>Generate an OTP below and share it to start the shift</div>
            </div>
          </div>
        )}

        {/* Progress stepper */}
        <div style={{ background: S1, borderRadius: 18, padding: '14px 12px', marginBottom: 12, overflowX: 'auto', border: `1px solid ${BD}` }}>
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 'max-content' }}>
            {STATUS_STEPS.map((s, i) => {
              const done    = i < statusIdx2
              const current = i === statusIdx2
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? '#10B981' : current ? T1 : S2,
                      border: `2px solid ${done ? '#10B981' : current ? T1 : BD}`,
                      color: (done || current) ? (current ? '#000' : '#fff') : T3,
                      fontWeight: 800, fontSize: 11,
                    }}>
                      {done ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : i + 1}
                    </div>
                    <span style={{ fontSize: 9, fontWeight: current ? 700 : 500, whiteSpace: 'nowrap' as const, color: current ? T1 : done ? '#10B981' : T3 }}>{s.label}</span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div style={{ width: 22, height: 2, background: done ? '#10B981' : BD, margin: '0 4px', marginBottom: 18, borderRadius: 1 }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Open / Searching state */}
        {(isOpen || isSearching) && pendingBookings.length === 0 && (
          <div style={{ background: S1, borderRadius: 20, padding: '24px', marginBottom: 12, textAlign: 'center', border: `1px solid ${BD}` }}>
            {job.paymentStatus === 'PAID' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)', marginBottom: 14 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', letterSpacing: 0.4 }}>PAYMENT CONFIRMED</span>
              </div>
            )}
            <div style={{ width: 56, height: 56, borderRadius: 28, background: S2, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', border: `1px solid ${BD}` }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: GOLD, animation: 'livePulse 1s ease infinite' }} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: T1, marginBottom: 6 }}>
              {job.paymentStatus === 'PAID' ? 'Assigning a worker…' : (job.isUrgent ? 'Waiting for workers to accept…' : 'Open for applications')}
            </div>
            <div style={{ fontSize: 13, color: T2 }}>
              {job.paymentStatus === 'PAID' ? 'Notifying nearby workers — first to accept gets the job' : (job.isUrgent ? 'Notifications sent to nearby workers' : 'Workers can apply — you pick who to confirm')}
            </div>
            {/* Reschedule = primary employer action while shift is OPEN
                with no accepted booking. Cancel-and-refund is reachable as
                a secondary link inside the Reschedule modal so cancelling
                isn't the easy path. Server enforces the same rule. */}
            {(isOpen || isSearching) && pendingBookings.length === 0 && !confirmedBooking && job.paymentStatus === 'PAID' && (
              <button
                onClick={() => setShowRescheduleModal(true)}
                style={{
                  marginTop: 16, padding: '10px 18px', borderRadius: 12,
                  background: 'transparent', color: T1,
                  border: `1px solid ${BD}`,
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FONT,
                }}
              >
                {t.reschedule_btn}
              </button>
            )}
          </div>
        )}

        {/* Pending acceptance — worker has accepted, waiting for them to confirm they will show up */}
        {pendingBookings.length > 0 && !confirmedBooking && (
          <div style={{ background: 'rgba(245,197,24,0.06)', borderRadius: 20, padding: 18, marginBottom: 12, border: '1px solid rgba(245,197,24,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: GOLD, animation: 'livePulse 1.5s ease infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: 0.5, textTransform: 'uppercase' as const }}>Worker accepted</span>
            </div>
            <p style={{ fontSize: 14, color: T2, margin: '0 0 12px', lineHeight: 1.4 }}>
              Waiting for the worker to confirm they will show up. You&apos;ll see their contact details once confirmed.
            </p>
            {pendingBookings.map((b: any) => {
              const wName = b.worker?.user?.name || 'Worker'
              const wInit = wName[0]?.toUpperCase() || 'W'
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: S2, border: `1.5px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T1, fontWeight: 900, fontSize: 15, flexShrink: 0 }}>{wInit}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>{wName}</div>
                    <div style={{ fontSize: 12, color: T3 }}>Awaiting show-up confirmation…</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Multi-worker slot list. Renders one card per booking + filler cards
            for unfilled slots so the employer sees the full shape of the
            shift (e.g. "2 of 5 confirmed, 3 still searching"). Per-card OTP
            generation means each worker gets their own code, which the
            server scopes via the bookingId payload. */}
        {isMultiWorker && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
                Workers · {confirmedBookings.length} of {workersNeeded} confirmed
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
              {Array.from({ length: workersNeeded }).map((_, i) => {
                const b: any = confirmedBookings[i]
                if (!b) {
                  return (
                    <div key={`empty-${i}`} style={{
                      background: S1, borderRadius: 14, padding: 14,
                      border: `1px dashed ${BD}`, display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <div style={{ width: 36, height: 36, borderRadius: 18, background: S2, border: `1.5px dashed ${BD}` }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T2 }}>Searching for worker…</div>
                        <div style={{ fontSize: 11, color: T3 }}>Slot {i + 1}</div>
                      </div>
                    </div>
                  )
                }
                const w        = b.worker || {}
                const wUser    = w.user || {}
                const wName    = wUser.name || 'Worker'
                const wInit    = (wName[0] || 'W').toUpperCase()
                const wPhone   = wUser.phone || ''
                const arrived  = !!b.checkInTime
                const started  = b.status === 'IN_PROGRESS'
                const done     = b.status === 'COMPLETED'
                const statusLabel = done ? 'Completed' : started ? 'On shift' : arrived ? 'Arrived' : 'On the way'
                const statusColor = done ? '#10B981' : started ? '#10B981' : arrived ? '#10B981' : '#60A5FA'
                return (
                  <div key={b.id} style={{
                    background: S1, borderRadius: 14, padding: 14,
                    border: `1px solid ${arrived ? 'rgba(16,185,129,0.3)' : BD}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 20, background: S2,
                        border: `1.5px solid ${arrived ? '#10B981' : BD}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, color: T1, flexShrink: 0,
                      }}>{wInit}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>{wName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <div style={{ width: 6, height: 6, borderRadius: 3, background: statusColor }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>{statusLabel}</span>
                          {wPhone && (
                            <span style={{ fontSize: 11, color: T3 }}>· +91 {wPhone}</span>
                          )}
                        </div>
                      </div>
                      {wPhone && (
                        <a href={`tel:+91${wPhone}`} style={{
                          width: 38, height: 38, borderRadius: 19, background: S2,
                          border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          textDecoration: 'none', flexShrink: 0,
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                        </a>
                      )}
                    </div>
                    {arrived && !started && !done && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BD}` }}>
                        <OTPDisplay jobId={id} bookingId={b.id} />
                      </div>
                    )}
                    {started && b.checkInTime && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BD}` }}>
                        <ShiftInProgressCard checkInIso={b.checkInTime} hourlyRate={job.hourlyRate} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Worker card — legacy single-worker layout, only rendered when the
            shift was booked for exactly one worker. Multi-worker shifts use
            the slot list above instead. */}
        {!isMultiWorker && worker && confirmedBooking && (
          <div style={{ background: S1, borderRadius: 20, padding: 20, marginBottom: 12, border: `1px solid ${BD}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, marginBottom: 14, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Assigned Worker</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 28,
                background: S2, border: `2px solid ${T1}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: T1, fontWeight: 900, fontSize: 22, flexShrink: 0,
              }}>{workerInit}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: T1 }}>{workerName}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  {Number(worker.rating) > 0 && (
                    <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>★ {Number(worker.rating).toFixed(1)}</span>
                  )}
                  <span style={{ fontSize: 12, color: T2 }}>{worker.totalShifts || 0} job{worker.totalShifts === 1 ? '' : 's'}</span>
                  {worker.kycStatus === 'APPROVED' && (
                    <span style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(16,185,129,0.2)' }}>Verified</span>
                  )}
                </div>
                {worker.user?.phone && (
                  <div style={{ fontSize: 13, color: T2, marginTop: 4, fontWeight: 600 }}>+91 {worker.user.phone}</div>
                )}
              </div>
              {worker.user?.phone && (
                <a href={`tel:+91${worker.user.phone}`} style={{
                  width: 44, height: 44, borderRadius: 22,
                  background: S2, border: `1px solid ${BD}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.59 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </a>
              )}
            </div>
            {workerArrived && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', animation: 'livePulse 1.5s ease infinite' }} />
                <span style={{ fontSize: 13, color: '#10B981', fontWeight: 700 }}>✓ Worker has arrived at your location</span>
              </div>
            )}
            {!workerArrived && job.status === 'ON_THE_WAY' && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#60A5FA', animation: 'livePulse 1.5s ease infinite' }} />
                <span style={{ fontSize: 13, color: '#60A5FA', fontWeight: 600 }}>Worker is on the way</span>
              </div>
            )}
          </div>
        )}

        {/* OTP entry + timer — single-worker layout only. Multi-worker shifts
            embed per-booking OTP/timer inside each slot card above so the
            employer sees who's at what stage. */}
        {!isMultiWorker && isAssigned && !isStarted && (
          <OTPDisplay jobId={id} bookingId={confirmedBooking?.id} />
        )}
        {!isMultiWorker && isStarted && confirmedBooking?.checkInTime && (
          <ShiftInProgressCard checkInIso={confirmedBooking.checkInTime} hourlyRate={job.hourlyRate} />
        )}

        {/* Job details */}
        <div style={{ background: S1, borderRadius: 20, padding: '2px 18px 18px', marginBottom: 12, border: `1px solid ${BD}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, padding: '14px 0 10px', textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Job Details</div>
          {[
            { label: 'Service',  value: job.title },
            { label: 'Address',  value: job.address },
            { label: 'Duration', value: `${job.duration}h` },
            { label: 'Rate',     value: `₹${job.hourlyRate}/hr` },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}`, alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 14, color: T2, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: T1, textAlign: 'right' as const }}>{value}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, marginTop: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T1 }}>Total</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: T1 }}>₹{job.hourlyRate * job.duration}</span>
          </div>
        </div>

        {isStarted && (
          <button onClick={completeJob} disabled={completing} style={{
            width: '100%', padding: '18px 0', borderRadius: 16, border: 'none', cursor: 'pointer',
            background: '#FFFFFF', color: '#000', fontWeight: 900, fontSize: 17,
            opacity: completing ? 0.7 : 1, fontFamily: FONT,
          }}>
            {completing ? 'Completing...' : 'Mark Job Complete'}
          </button>
        )}

        {isCompleted && (
          <div style={{
            width: '100%', padding: '16px 18px', borderRadius: 16,
            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONT,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#10B981' }}>Job complete · Payment already settled</span>
          </div>
        )}
      </div>

      {rateForBookingId && (() => {
        const b = (job.bookings || []).find((x: any) => x.id === rateForBookingId)
        const wName = b?.worker?.user?.name || workerName
        const closedBookingId = rateForBookingId
        return (
          <RateWorkerModal
            bookingId={closedBookingId}
            workerName={wName}
            onDone={() => {
              // Remember locally that this booking was rated so the
              // re-pop guard doesn't fire it again on the next poll —
              // the server-side ratings row may take a tick to land.
              setRatedLocally(prev => {
                const next = new Set(prev)
                next.add(closedBookingId)
                return next
              })
              setRateForBookingId(null)
            }}
          />
        )
      })()}

      {showRescheduleModal && job && (
        <RescheduleShiftModal
          shiftId={id}
          currentDate={typeof job.date === 'string' ? job.date : new Date(job.date).toISOString()}
          currentStartTime={job.startTime}
          currentEndTime={job.endTime}
          onClose={() => setShowRescheduleModal(false)}
          onRescheduled={() => {
            setShowRescheduleModal(false)
            load()
          }}
          onSwitchToCancel={() => {
            setShowRescheduleModal(false)
            setShowCancelModal(true)
          }}
        />
      )}

      {showCancelModal && (
        <CancelShiftModal
          shiftId={id}
          onClose={() => setShowCancelModal(false)}
          onCancelled={() => {
            setShowCancelModal(false)
            router.replace('/employer')
          }}
        />
      )}

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.82); }
        }
      `}</style>
    </div>
  )
}
