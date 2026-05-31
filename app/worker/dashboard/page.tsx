'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowRight, Zap, MapPin, Clock, ChevronRight, Briefcase,
  TrendingUp, AlertTriangle, Star,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import BottomNav from '@/components/shared/BottomNav'
import CompleteProfileGate from '@/components/worker/CompleteProfileGate'
import IncentiveModal from '@/components/worker/IncentiveModal'
import EnableNotificationsBanner from '@/components/worker/EnableNotificationsBanner'
import ActiveShiftCard from '@/components/worker/ActiveShiftCard'
import JyotiArrivalFlow from '@/components/worker/JyotiArrivalFlow'
import { useLanguage } from '@/app/worker/LanguageContext'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Type alias for the `t` translator returned by useLanguage — exposing it
// lets the small helper components below accept t as a prop without
// hand-rolling the (long, generated) key union type each time.
type T = ReturnType<typeof useLanguage>['t']

export default function WorkerDashboard() {
  const { t }     = useLanguage()
  const router    = useRouter()
  const [user,     setUser]     = useState<any>(null)
  const [bookings, setBookings] = useState<any[]>([])
  const [nearby,   setNearby]   = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [isOnline,    setIsOnline]    = useState(true)
  const [savingOnline, setSavingOnline] = useState(false)

  useEffect(() => {
    // Each fetch wrapped so one network blip doesn't reject the whole Promise.all.
    const safe = <T,>(p: Promise<Response>): Promise<T | null> =>
      p.then(r => r.ok ? r.json() : null).catch(() => null)

    let cancelled = false
    async function loadAll() {
      const [u, b, s] = await Promise.all([
        safe<{ user?: any }>(fetch('/api/auth/me')),
        safe<{ bookings?: any[] }>(fetch('/api/bookings')),
        safe<{ shifts?: any[] }>(fetch('/api/shifts')),
      ])
      if (cancelled) return
      if (u?.user) {
        setUser(u.user)
        setIsOnline(u.user?.workerProfile?.isAvailable ?? true)
      }
      if (b?.bookings) setBookings(b.bookings)
      if (s?.shifts)   setNearby(s.shifts.slice(0, 10))
      setLoading(false)
    }
    loadAll()

    // Refresh on tab focus/visibility — returning from a completed shift or
    // a new accept used to show stale rows until a hard refresh.
    const onFocus = () => loadAll()
    const onVisibility = () => { if (document.visibilityState === 'visible') loadAll() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router])

  async function toggleOnline() {
    if (savingOnline) return
    const next = !isOnline
    setIsOnline(next); setSavingOnline(true)
    try {
      const r = await fetch('/api/worker/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isAvailable: next }),
      })
      if (!r.ok) setIsOnline(!next)
    } catch { setIsOnline(!next) }
    setSavingOnline(false)
  }

  // Workers can browse the dashboard regardless of KYC status. Only the
  // accept-shift action checks for APPROVED — see /api/shifts/[id]/accept.
  if (loading) return <Skeleton />

  const profile     = user?.workerProfile
  const earnings    = profile?.totalEarnings  ?? 0
  const totalShifts = profile?.totalShifts    ?? 0
  const rating      = profile?.rating         ?? 0
  const kycOk       = profile?.kycStatus      === 'APPROVED'
  const kycPending  = profile?.kycStatus      === 'PENDING'
  const active      = bookings.filter((b: any) => ['CONFIRMED','IN_PROGRESS'].includes(b.status))
  const firstName   = user?.name?.split(' ')[0] ?? 'Worker'

  const h = new Date().getHours()
  const greeting = h < 12 ? t('goodMorning') : h < 17 ? t('goodAfternoon') : t('goodEvening')

  return (
    <div className="min-h-screen" style={{ background: '#FAFAFA', paddingBottom: 'calc(96px + var(--safe-b))' }}>

      {/* ── HERO ─────────────────────────────────────────────
          Single dark card stacks greeting + online pill + total earnings +
          a compact 3-stat strip. Replaces the prior 3-block sequence
          (greeting / large online pill / earnings card) — same data, half
          the vertical real estate, single focal point at the top. */}
      <div style={{ paddingTop: 'calc(20px + var(--safe-t))', paddingLeft: 16, paddingRight: 16, paddingBottom: 14 }}>
        <div
          style={{
            background: 'linear-gradient(155deg, #0A0A0A 0%, #1A1A1A 100%)',
            borderRadius: 24, padding: 22, color: '#FFF',
            position: 'relative', overflow: 'hidden',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}
        >
          {/* Decorative glow circles — subtle texture, no semantic meaning */}
          <div style={{ position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.025)' }} />
          <div style={{ position: 'absolute', bottom: -70, left: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />

          {/* Row 1 — greeting + online pill */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.3 }}>{greeting}</p>
              <p style={{ fontSize: 22, fontWeight: 900, marginTop: 3, letterSpacing: -0.4 }}>{firstName}</p>
            </div>
            <button
              onClick={toggleOnline}
              disabled={savingOnline}
              aria-pressed={isOnline}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: isOnline ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isOnline ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.10)'}`,
                borderRadius: 999, padding: '7px 13px',
                cursor: savingOnline ? 'default' : 'pointer',
                transition: 'background 0.18s, border-color 0.18s',
              }}>
              <span
                className={isOnline ? 'live-pulse-dot' : ''}
                style={{
                  width: 8, height: 8, borderRadius: 4,
                  background: isOnline ? '#22C55E' : 'rgba(255,255,255,0.4)',
                }} />
              <span style={{ fontSize: 11, fontWeight: 800, color: isOnline ? '#4ADE80' : 'rgba(255,255,255,0.5)', letterSpacing: 0.8 }}>
                {isOnline ? t('switchOnline') : t('switchOffline')}
              </span>
            </button>
          </div>

          {/* Row 2 — total earnings + stat strip */}
          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              {t('totalEarned')}
            </p>
            <p style={{ fontSize: 38, fontWeight: 900, marginTop: 4, letterSpacing: -1.4, lineHeight: 1.05 }}>
              {formatCurrency(earnings)}
            </p>

            <div style={{ display: 'flex', gap: 18, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <Stat icon={<Briefcase size={11} />} label={t('shiftsDone')}  value={totalShifts} />
              <Stat icon={<Star size={11} />}      label={t('rating')}      value={rating > 0 ? rating.toFixed(1) : '—'} />
              <Stat icon={<Zap size={11} />}       label={t('activeJobs')}  value={active.length} />
            </div>
          </div>
        </div>
      </div>

      <EnableNotificationsBanner />

      {/* ── BODY ─────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-6 flex flex-col gap-4">

        {/* Active shift card — promoted to top so an in-progress shift is
            the first thing a worker sees, not buried under stats. */}
        {active.length > 0 && (
          <ActiveShiftCard
            booking={active[0]}
            onArrived={() => {
              setBookings(bs => bs.map((b: any) =>
                b.id === active[0].id ? { ...b, status: 'IN_PROGRESS' } : b
              ))
            }}
          />
        )}

        {/* KYC nudge — only shown when KYC is not APPROVED. Pending = amber
            tone (informational), missing/rejected = solid black (call-to-act). */}
        {!kycOk && <KycNudge pending={kycPending} t={t} />}

        {/* Nearby jobs — primary browse UX on the dashboard. We keep this
            Tinder-style stack because it is the proven engagement loop for
            workers; redundancy with /worker/jobs is acceptable since this is
            the at-a-glance "what should I do now" surface. */}
        {nearby.length > 0 && (
          <section className="animate-fade-up">
            <SectionHeader title={t('shiftsNearYou')} link="/worker/jobs" linkLabel={t('seeAll')} />
            <HomeJobSwipeStack
              shifts={nearby}
              onConsumed={(id) => setNearby(prev => prev.filter((x: any) => x.id !== id))}
            />
            {/* Floating Accept/Skip buttons hang -bottom-16 from the stack — leave room. */}
            <div style={{ height: 72 }} />
          </section>
        )}

        {/* Recent bookings — 3 max, compact rows. Previously 4 rows + thicker
            spacing pushed the empty space below the fold. */}
        {bookings.length > 0 && (
          <section className="animate-fade-up">
            <SectionHeader title={t('recentShifts')} link="/worker/earnings" linkLabel={t('viewHistory')} />
            <div style={{ background: '#FFFFFF', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
              {bookings.slice(0, 3).map((b: any, i: number) => (
                <RecentRow key={b.id} booking={b} isLast={i === Math.min(2, bookings.length - 1)} t={t} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state — only when there is genuinely nothing. The earlier
            gate (bookings.length===0 && nearby.length===0) is preserved so
            we don't tell a worker "no shifts" while live ones sit above. */}
        {bookings.length === 0 && nearby.length === 0 && (
          <div
            className="animate-fade-up"
            style={{
              padding: 36, textAlign: 'center',
              background: '#FFFFFF', borderRadius: 20,
              border: '1px solid rgba(0,0,0,0.06)',
            }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 4 }}>{t('noShiftsYet')}</p>
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', marginBottom: 18 }}>{t('acceptFirstJob')}</p>
            <Link href="/worker/jobs" className="btn btn-primary btn-md inline-flex">
              {t('browseJobs')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Quick actions — demoted below recent. Browse + Earnings tiles are
            still useful but no longer compete with the swipe stack for
            attention; they're a backup nav, not the headline. */}
        <div className="grid grid-cols-2 gap-3 animate-fade-up">
          <QuickAction
            href="/worker/jobs"
            icon={<Briefcase className="w-4 h-4" />}
            title={t('findJobs')}
            sub={`${nearby.length} ${t('shiftsNearby')}`}
          />
          <QuickAction
            href="/worker/earnings"
            icon={<TrendingUp className="w-4 h-4" />}
            title={t('myEarnings')}
            sub={t('viewHistory')}
          />
        </div>
      </div>

      <BottomNav active="/worker/dashboard" />
      <CompleteProfileGate
        workerProfile={user?.workerProfile}
        onComplete={() => fetch('/api/auth/me').then(r => r.json()).then(u => setUser(u.user)).catch(() => {})}
      />
      {user?.workerProfile?.profilePhoto && user?.workerProfile?.lat != null && (
        <IncentiveModal totalShifts={totalShifts} />
      )}

      {/* Jyoti voice assistant — always reachable from the dashboard so she's
          there whenever a worker needs a friend, not only mid-shift. When the
          worker has an active shift we hand her the full shift context (maps,
          OTP, call-Sahab all light up); with no active shift she still opens
          as a general companion — greets by name, recalls past calls from her
          memory, and can help find work or just talk. JyotiArrivalFlow + the
          client tools already handle a null shift gracefully (shift-specific
          tools return "koi active shift nahi hai" and the Maps/Call chips hide). */}
      <JyotiArrivalFlow
        shift={active.length > 0 ? (active[0].shift ?? null) : null}
        bookingId={active.length > 0 ? active[0].id : null}
        onShiftStarted={() => {
          if (active.length === 0) return
          setBookings(bs => bs.map((b: any) =>
            b.id === active[0].id ? { ...b, status: 'IN_PROGRESS' } : b
          ))
        }}
      />

      <style>{`
        @keyframes liveDotPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0);   }
        }
        .live-pulse-dot { animation: liveDotPulse 1.6s ease-out infinite; }
      `}</style>
    </div>
  )
}

/* ── Hero stat ───────────────────────────── */
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {icon}
        <span>{label}</span>
      </div>
      <p style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF', marginTop: 4, letterSpacing: -0.3 }}>{value}</p>
    </div>
  )
}

/* ── Section header ──────────────────────── */
function SectionHeader({ title, link, linkLabel }: { title: string; link: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <p style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>{title}</p>
      <Link href={link} className="flex items-center gap-0.5" style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)' }}>
        {linkLabel} <ChevronRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}

/* ── KYC nudge ───────────────────────────── */
function KycNudge({ pending, t }: { pending: boolean; t: T }) {
  return (
    <Link
      href="/worker/onboarding"
      className="animate-fade-up active:scale-[0.98] transition-transform"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 16,
        background: pending ? 'rgba(245,158,11,0.08)' : '#111111',
        border:     pending ? '1px solid rgba(245,158,11,0.25)' : '1px solid #111',
        boxShadow:  pending ? 'none' : '0 4px 18px rgba(0,0,0,0.12)',
        textDecoration: 'none',
      }}>
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: pending ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.16)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {pending
          ? <Clock style={{ width: 18, height: 18, color: '#D97706' }} />
          : <AlertTriangle style={{ width: 18, height: 18, color: '#FFFFFF' }} />
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: pending ? '#D97706' : '#FFFFFF' }}>
          {pending ? t('verificationInProgress') : t('verifyAadhaar')}
        </p>
        <p style={{ fontSize: 11, color: pending ? 'rgba(217,119,6,0.7)' : 'rgba(255,255,255,0.55)', marginTop: 2 }}>
          {pending ? t('usuallyDone24h') : t('takes2Min')}
        </p>
      </div>
      {!pending && <ArrowRight className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.55)' }} />}
    </Link>
  )
}

/* ── Recent shift row ────────────────────── */
function RecentRow({ booking: b, isLast, t }: { booking: any; isLast: boolean; t: T }) {
  const shift   = b.shift as Record<string, any> | undefined
  const status  = b.status as string
  const statusColor = status === 'CANCELLED' ? '#DC2626'
                    : status === 'COMPLETED' ? '#10B981'
                    : 'rgba(0,0,0,0.5)'
  const statusLabel: Record<string, string> = {
    COMPLETED: t('statusDone'),     CONFIRMED: t('statusConfirmed'), IN_PROGRESS: t('statusInProgress'),
    PENDING:   t('statusPending'),  CANCELLED: t('statusCancelled'),
  }
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px',
        borderBottom: isLast ? 'none' : '1px solid rgba(0,0,0,0.05)',
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(0,0,0,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Clock style={{ width: 15, height: 15, color: 'rgba(0,0,0,0.4)' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shift?.title}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>
          {formatDate(shift?.date)}
        </p>
      </div>
      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 900, color: '#111' }}>{formatCurrency(b.workerEarning)}</p>
        <p style={{ fontSize: 10, fontWeight: 700, color: statusColor, marginTop: 2 }}>{statusLabel[status] ?? status}</p>
      </div>
    </div>
  )
}

/* ── Quick action tile ───────────────────── */
function QuickAction({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="active:scale-[0.97] transition-transform"
      style={{
        background: '#FFFFFF', borderRadius: 14, padding: 14,
        border: '1px solid rgba(0,0,0,0.06)', textDecoration: 'none',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ color: '#111111', display: 'flex' }}>{icon}</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: '#111111' }}>{title}</p>
        <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>{sub}</p>
      </div>
    </Link>
  )
}

/* ───────────────────────────────────────────────────────────────────────
   Tinder-style swipe stack for nearby shifts. Preserved as-is from the
   prior dashboard — works well, is the proven engagement loop, and the
   redesign focuses on the surrounding chrome rather than this primitive.
   ─────────────────────────────────────────────────────────────────────── */
function HomeJobSwipeStack({ shifts, onConsumed }: { shifts: any[]; onConsumed: (id: string) => void }) {
  const { t }  = useLanguage()
  const router = useRouter()
  const [index,    setIndex]    = useState(0)
  const [dragX,    setDragX]    = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flinging, setFlinging] = useState<'left' | 'right' | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const startX  = useRef(0)
  const moved   = useRef(false)

  const current = shifts[index]
  if (!current) {
    return (
      <div style={{ padding: 24, textAlign: 'center', background: '#FFFFFF', borderRadius: 16, border: '1px solid rgba(0,0,0,0.06)' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.4)' }}>{t('noMoreShiftsToShow')}</p>
        <Link href="/worker/jobs" className="inline-block mt-2 text-xs font-bold" style={{ color: '#111' }}>Browse all jobs →</Link>
      </div>
    )
  }

  // Worker take-home is a flat ₹100/hr regardless of employer rate.
  const earn = Math.round(100 * (current.duration as number))
  const rot  = dragging ? dragX * 0.05 : flinging === 'right' ? 18 : flinging === 'left' ? -18 : 0
  const tx   = flinging ? (flinging === 'right' ? 400 : -400) : dragging ? dragX : 0
  const opa  = dragging ? Math.max(0.5, 1 - Math.abs(dragX) / 250) : flinging ? 0 : 1

  function onStart(x: number) {
    if (accepting) return
    startX.current = x; moved.current = false; setDragging(true)
  }
  function onMove(x: number) {
    if (!dragging) return
    const dx = x - startX.current
    if (Math.abs(dx) > 6) moved.current = true
    setDragX(dx)
  }
  async function onEnd() {
    if (!dragging) return
    setDragging(false)
    if (!moved.current) { setDragX(0); return }
    if (dragX > 80) {
      setFlinging('right')
      await accept()
    } else if (dragX < -80) {
      setFlinging('left')
      setTimeout(() => goNext(), 240)
    } else {
      setDragX(0)
    }
  }

  async function accept() {
    if (accepting) return
    setAccepting(true); setError('')
    try {
      const res  = await fetch(`/api/shifts/${current.id}/accept`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(res.status === 409 ? 'Just taken — next!' : (data.error || 'Failed'))
        setFlinging(null); setDragX(0); setAccepting(false)
        setTimeout(() => { onConsumed(current.id as string); goNext() }, 600)
        return
      }
      onConsumed(current.id as string)
      // Drop straight into active-shift — no dashboard noise between accept
      // and slide-to-arrive. Fall back to /worker/jobs if response malformed.
      const bookingId = data?.booking?.id as string | undefined
      // ?confirm=1 triggers Jyoti's post-accept opener on the active-shift
      // page: "Aapki shift confirm hai, aap jaoge na?" instead of waiting
      // for the worker to tap the orb.
      if (bookingId) setTimeout(() => router.push(`/worker/active/${bookingId}?confirm=1`), 350)
      else           setTimeout(() => router.push('/worker/jobs'), 350)
    } catch {
      setError('Network error')
      setFlinging(null); setDragX(0); setAccepting(false)
    }
  }

  function goNext() {
    setDragX(0); setFlinging(null); setError('')
    setIndex(i => i + 1)
  }

  const shiftDate = current.date ? new Date(current.date as string) : null
  const isToday   = shiftDate && new Date().toDateString() === shiftDate.toDateString()
  const dateLabel = !shiftDate ? '—'
                  : isToday ? 'Today'
                  : shiftDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeLabel = `${current.startTime || '—'} – ${current.endTime || '—'}`

  const fullAddress  = (current.address as string) || (current.city as string) || ''
  const employerName = ((current.employer as Record<string, unknown> | undefined)?.user as Record<string, unknown> | undefined)?.name as string | undefined

  return (
    <div className="relative" style={{ height: 360 }}>
      {shifts[index + 1] && (
        <div className="absolute inset-x-2 rounded-2xl"
          style={{ top: 10, bottom: -10, background: '#E4E4E4', transform: 'scale(0.96)', zIndex: 1 }} />
      )}
      {shifts[index + 2] && (
        <div className="absolute inset-x-4 rounded-2xl"
          style={{ top: 18, bottom: -18, background: '#D8D8D8', transform: 'scale(0.92)', zIndex: 0 }} />
      )}

      <div
        onMouseDown={e => onStart(e.clientX)}
        onMouseMove={e => onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={() => { if (dragging) onEnd() }}
        onTouchStart={e => onStart(e.touches[0].clientX)}
        onTouchMove={e => { e.preventDefault(); onMove(e.touches[0].clientX) }}
        onTouchEnd={onEnd}
        className="absolute inset-0 rounded-2xl"
        style={{
          background: '#FFFFFF',
          border: dragX > 50 ? '2px solid #22C55E' : dragX < -50 ? '2px solid #EF4444' : '1px solid rgba(0,0,0,0.09)',
          boxShadow: '0 6px 24px rgba(0,0,0,0.08)',
          transform: `translateX(${tx}px) rotate(${rot}deg)`,
          opacity: opa,
          transition: dragging ? 'none' : 'transform 0.28s cubic-bezier(0.34,1.2,0.64,1), opacity 0.28s, border-color 0.1s',
          touchAction: 'pan-y',
          cursor: 'grab',
          zIndex: 5,
          padding: 16,
          userSelect: 'none',
        }}
      >
        {/* Accept / Skip overlays */}
        <div className="absolute top-3 left-3 z-20 transition-opacity"
          style={{ opacity: Math.max(0, dragX / 80), transform: `rotate(-${Math.min(12, dragX / 8)}deg)` }}>
          <div className="px-3 py-1 rounded-lg" style={{ background: '#22C55E', border: '2px solid #16A34A' }}>
            <p className="text-base font-black" style={{ color: '#FFF', margin: 0 }}>ACCEPT ✓</p>
          </div>
        </div>
        <div className="absolute top-3 right-3 z-20 transition-opacity"
          style={{ opacity: Math.max(0, -dragX / 80), transform: `rotate(${Math.min(12, -dragX / 8)}deg)` }}>
          <div className="px-3 py-1 rounded-lg" style={{ background: '#EF4444', border: '2px solid #DC2626' }}>
            <p className="text-base font-black" style={{ color: '#FFF', margin: 0 }}>SKIP ✗</p>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              background: (current.isUrgent as boolean) ? 'linear-gradient(135deg,#111,#333)' : 'linear-gradient(135deg,#F5F5F5,#E8E8E8)',
              boxShadow: (current.isUrgent as boolean) ? '0 4px 12px rgba(0,0,0,0.25)' : '0 2px 8px rgba(0,0,0,0.06)',
            }}>
            <Briefcase className="w-6 h-6" style={{ color: (current.isUrgent as boolean) ? '#FFF' : 'rgba(0,0,0,0.6)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-base font-black truncate" style={{ color: '#111111' }}>{current.title as string}</p>
              {(current.isUrgent as boolean) && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md flex-shrink-0"
                  style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)' }}>
                  <Zap className="w-2.5 h-2.5" style={{ color: '#DC2626' }} />
                  <span className="text-[9px] font-bold" style={{ color: '#DC2626' }}>URGENT</span>
                </span>
              )}
            </div>
            <p className="text-[11px] truncate" style={{ color: 'rgba(0,0,0,0.5)' }}>
              {employerName ? employerName + ' · ' : ''}{current.role as string}
            </p>
          </div>
        </div>

        {/* Earnings — worker take-home only */}
        <div className="rounded-xl p-3 mb-3" style={{ background: '#111111' }}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>{t('youEarn')}</p>
              <p className="text-2xl font-black mt-0.5" style={{ color: '#FFF', letterSpacing: -1 }}>{formatCurrency(earn)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{t('durationLabel')}</p>
              <p className="text-sm font-bold" style={{ color: '#FFF' }}>{current.duration as number}h</p>
            </div>
          </div>
        </div>

        {/* Details — date / duration / address */}
        <div className="rounded-xl p-2.5 mb-2.5" style={{ background: '#FAFAFA', border: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
                <Clock className="w-3.5 h-3.5" style={{ color: 'rgba(0,0,0,0.55)' }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase font-bold" style={{ color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em' }}>{t('whenLabel')}</p>
                <p className="text-[11px] font-bold truncate" style={{ color: '#111' }}>{dateLabel}</p>
                <p className="text-[10px] truncate" style={{ color: 'rgba(0,0,0,0.55)' }}>{timeLabel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
                <span style={{ fontSize: 14 }}>⏱</span>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase font-bold" style={{ color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em' }}>{t('durationLabel')}</p>
                <p className="text-[11px] font-bold" style={{ color: '#111' }}>{current.duration as number} hours</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 mt-2 pt-2" style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(0,0,0,0.06)' }}>
              <MapPin className="w-3.5 h-3.5" style={{ color: 'rgba(0,0,0,0.55)' }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase font-bold" style={{ color: 'rgba(0,0,0,0.4)', letterSpacing: '0.04em' }}>{t('locationLabel')}</p>
              <p className="text-[11px] font-semibold leading-snug" style={{ color: '#111' }}>{fullAddress}</p>
              {fullAddress && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="inline-block text-[10px] font-bold mt-0.5"
                  style={{ color: '#0D9488' }}>
                  Open in maps →
                </a>
              )}
            </div>
          </div>
        </div>

        <p className="text-center text-[10px]" style={{ color: 'rgba(0,0,0,0.32)' }}>
          ← swipe to skip · swipe to accept →
        </p>

        {error && <p className="text-[11px] text-center mt-1 font-bold" style={{ color: '#DC2626' }}>{error}</p>}
      </div>

      {/* Tap-friendly fallback for Accept/Skip — ~52px tall, weighted toward
          Accept since that's the primary intent. */}
      <div className="absolute -bottom-16 left-0 right-0 flex gap-3 px-2 z-10">
        <button onClick={() => { setFlinging('left'); setTimeout(goNext, 240) }} disabled={accepting}
          className="rounded-2xl font-bold"
          style={{
            flex: 1, height: 52, fontSize: 15,
            background: '#FFF', color: '#EF4444',
            border: '1.5px solid rgba(239,68,68,0.3)',
            cursor: accepting ? 'default' : 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
          Skip
        </button>
        <button onClick={accept} disabled={accepting}
          className="rounded-2xl font-bold"
          style={{
            flex: 1.4, height: 52, fontSize: 16,
            background: '#111', color: '#FFF', border: 'none',
            cursor: accepting ? 'default' : 'pointer',
            opacity: accepting ? 0.7 : 1,
            boxShadow: '0 4px 16px rgba(0,0,0,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
          {accepting ? 'Accepting…' : <>{t('acceptJobBtn')} <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ background: '#FAFAFA', minHeight: '100vh' }}>
      <div style={{ paddingTop: 'calc(20px + var(--safe-t))', paddingLeft: 16, paddingRight: 16 }}>
        <div className="skel" style={{ height: 196, borderRadius: 24 }} />
      </div>
      <div className="px-4 pt-4 space-y-3">
        {[120, 80, 200, 120].map((h, i) => (
          <div key={i} className="skel" style={{ height: `${h}px`, borderRadius: 16 }} />
        ))}
      </div>
    </div>
  )
}
