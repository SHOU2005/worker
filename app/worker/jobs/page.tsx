'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { MapPin, Clock, Zap, CheckCircle, X, ChevronRight, Star, Calendar, IndianRupee, Briefcase } from 'lucide-react'
import TopBar    from '@/components/shared/TopBar'
import BottomNav from '@/components/shared/BottomNav'
import CancelJobSheet from '@/components/worker/CancelJobSheet'
import { useLanguage } from '@/app/worker/LanguageContext'
import { getMilestone } from '@/lib/milestones'

type Shift = {
  id: string; title: string; role: string; address: string; city: string
  date: string; startTime: string; endTime: string; duration: number
  hourlyRate: number; isUrgent: boolean; status: string
  employer: { companyName?: string; rating?: number; totalShifts?: number; user: { name: string; avatar?: string } }
}

const FONT    = '"DM Sans", system-ui, sans-serif'
const ROLE_EMOJI: Record<string, string> = {
  'Driver': '🚗', 'Security Guard': '🔒', 'Kitchen Helper': '🍳',
  'Cleaning Staff': '🧹', 'Delivery': '🚴', 'Warehouse Staff': '🏭',
  'Shop Helper': '🏪', 'Office Work': '💼', 'Construction': '🏗️',
  'Packing Staff': '📦', 'Cashier': '🛒',
}

function playSwipeSound(accepted: boolean) {
  try {
    const ctx  = new AudioContext()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    if (accepted) {
      osc.frequency.setValueAtTime(523, ctx.currentTime)
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08)
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.16)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime)
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    }
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
  } catch { /* AudioContext not available */ }
}

function JobsInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const urgentId     = searchParams.get('urgent')
  const { t } = useLanguage()

  const [shifts,    setShifts]    = useState<Shift[]>([])
  const [kycStatus, setKycStatus] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | null>(null)
  const [feedMessage, setFeedMessage] = useState<string>('')
  const [index,     setIndex]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [confirmed, setConfirmed] = useState<Shift | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null)
  const [showUpLoading, setShowUpLoading] = useState(false)
  // Cancel-reason sheet visibility. Disposed once cancellation succeeds —
  // the post-accept screen is then replaced by goNext() so the worker
  // sees the next job card immediately, matching the "shift cancelled"
  // graceful UX rather than leaving them on a stale "locked in" screen.
  const [showCancelSheet, setShowCancelSheet] = useState(false)
  const [showUpDone,    setShowUpDone]    = useState(false)
  const [error,     setError]     = useState('')
  const [listMode,  setListMode]  = useState(false)
  const [totalShifts, setTotalShifts] = useState(0)

  // Drag state
  const startX  = useRef(0)
  const startY  = useRef(0)
  const moved   = useRef(false)
  const [dragX, setDragX]     = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flinging, setFlinging] = useState(false)
  const [detailShift, setDetailShift] = useState<Shift | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [shiftsRes, meRes] = await Promise.all([
        fetch('/api/shifts'),
        fetch('/api/auth/me'),
      ])
      const [sd, md] = await Promise.all([shiftsRes.json(), meRes.json()])
      let list: Shift[] = sd.shifts || []
      if (urgentId) list = [...list.filter(s => s.id === urgentId), ...list.filter(s => s.id !== urgentId)]
      setShifts(list)
      setKycStatus(sd.kycStatus ?? null)
      setFeedMessage(sd.message ?? '')
      setTotalShifts(md.user?.workerProfile?.totalShifts ?? 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [urgentId])

  // Reload whenever `load` changes — `load` depends on `urgentId`, so
  // an FCM deep-link arriving while the page is mounted (which mutates
  // the URL via router.push) re-runs the fetch and surfaces the urgent
  // shift at the top of the stack.
  useEffect(() => { load() }, [load])

  const current   = shifts[index]
  const milestone = getMilestone(totalShifts)
  // Worker take-home is a flat ₹100/hr — see lib/pricing.ts (single source
  // of truth). Milestone tier is a recognition badge only; it does NOT
  // multiply the per-shift payout. Previously this multiplied earn by
  // tierMul, which over-promised by up to +20% on the swipe card while
  // the booking row, dashboard, and live timer all still showed ₹100/hr.
  const earn      = current ? Math.round(100 * current.duration) : 0

  // Returns true if the caller should advance to the next card; false if
  // accept() already handled navigation (or moved to the post-accept
  // screen). Previous version called goNext() internally AND then the
  // swipe handler called it again, which silently consumed the next job
  // every time the worker race-lost an urgent shift.
  async function accept(shift: Shift): Promise<boolean> {
    if (accepting) return false
    setAccepting(true); setError('')
    playSwipeSound(true)
    try {
      const res  = await fetch(`/api/shifts/${shift.id}/accept`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(res.status === 409 ? '⚡ Just taken by another worker — try the next one!' : (data.error || 'Failed'))
        // Race-loss: caller advances to the next card exactly once.
        return true
      }
      setConfirmed(shift)
      setConfirmedBooking(data.booking)
      setTotalShifts(t => t + 1)
      // Successful accept transitions to the post-accept screen — don't
      // advance the underlying card stack underneath it.
      return false
    } catch {
      setError('Network error')
      return false
    } finally {
      setAccepting(false)
    }
  }

  async function confirmShowUp() {
    if (!confirmed || showUpLoading) return
    setShowUpLoading(true)
    try {
      const res = await fetch(`/api/shifts/${confirmed.id}/confirm`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not confirm. Try again.')
        setShowUpLoading(false)
        return
      }
      setConfirmedBooking(data.booking)
      setShowUpDone(true)
      // After "Haan main jaungi" confirm, route the worker into the
      // dedicated full-screen active-shift page where slide-to-arrive →
      // selfie → OTP → countdown → end → rate all happen.
      const bookingId = data.booking?.id
      if (bookingId) router.push(`/worker/active/${bookingId}`)
    } catch { setError('Network error') }
    setShowUpLoading(false)
  }

  function goNext() {
    setDragX(0)
    setFlingDir(null)
    setIndex(i => i + 1)
    setError('')
  }

  const [flingDir, setFlingDir] = useState<'left' | 'right' | null>(null)

  function onStart(x: number, y: number) {
    startX.current = x; startY.current = y; moved.current = false; setDragging(true)
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
    const dx = dragX
    if (!moved.current && current) {
      // Tap (no real drag) → open detail sheet
      setDragX(0)
      setDetailShift(current)
      return
    }
    if (dx > 90 && current) {
      setFlingDir('right')
      setFlinging(true)
      const shouldAdvance = await accept(current)
      setFlinging(false)
      // Only advance if accept() didn't already (race-loss path). When
      // accept succeeds it takes the worker to the post-accept screen,
      // so the card stack stays parked underneath.
      if (shouldAdvance) goNext()
      else setDragX(0)
    } else if (dx < -90) {
      setFlingDir('left')
      setFlinging(true)
      playSwipeSound(false)
      setTimeout(() => { setFlinging(false); goNext() }, 300)
    } else {
      setDragX(0)
    }
  }

  const rot     = dragging ? dragX * 0.07 : flingDir === 'right' ? 20 : flingDir === 'left' ? -20 : 0
  const tx      = flinging ? (flingDir === 'right' ? 500 : -500) : dragging ? dragX : 0
  const opa     = dragging ? Math.max(0.4, 1 - Math.abs(dragX) / 250) : flinging ? 0 : 1
  const isRight = dragX > 50
  const isLeft  = dragX < -50

  if (loading) return (
    <>
      <TopBar title="Find Jobs" />
      <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F8F8F8', paddingTop: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(0,0,0,0.08)', borderTopColor: '#111', animation: 'spin 0.7s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.35)', fontFamily: FONT }}>Finding jobs near you…</p>
        </div>
      </div>
      <BottomNav active="/worker/jobs" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )

  if (confirmed) {
    const employerName  = confirmedBooking?.shift?.employer?.user?.name  || confirmed.employer?.user?.name || 'Employer'
    const employerPhone = confirmedBooking?.shift?.employer?.user?.phone || ''
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 100,
        fontFamily: FONT, background: '#111111',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        paddingTop:    'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          padding: '32px 20px 28px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
            <div style={{
              width: 96, height: 96, borderRadius: '50%',
              background: 'rgba(34,197,94,0.12)', border: '2px solid #22C55E',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 22, animation: 'pop 0.45s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <CheckCircle style={{ width: 48, height: 48, color: '#22C55E' }} />
            </div>
            <p style={{ fontSize: 30, fontWeight: 900, color: '#FFFFFF', margin: 0, textAlign: 'center', letterSpacing: -1 }}>
              {showUpDone ? t('shiftLockedInTitle') : t('shiftAcceptedTitle')}
            </p>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#22C55E', margin: '8px 0 0', textAlign: 'center' }}>{confirmed.title}</p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', margin: '6px 0 0', textAlign: 'center' }}>
              {t('postAcceptYouEarn')} <span style={{ fontWeight: 800, color: '#FFFFFF' }}>₹{Math.round(100 * confirmed.duration).toLocaleString('en-IN')}</span>
            </p>
          </div>

          {/* Show-up confirmation card. The cancel-with-reason path runs in
              parallel — both "Haan main jaungi" (confirm) and "Cancel job"
              are reachable BEFORE the worker has been shown employer details.
              After confirming, the employer's contact info is revealed. */}
          {!showUpDone ? (
            <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 20, padding: 20, marginBottom: 16, width: '100%' }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#FCD34D', margin: '0 0 6px', letterSpacing: '0.04em' }}>
                {t('postAcceptOneMore')}
              </p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: '0 0 14px', lineHeight: 1.4 }}>
                {t('postAcceptConfirmSub')}
              </p>
              <button onClick={confirmShowUp} disabled={showUpLoading}
                style={{ width: '100%', height: 54, borderRadius: 14, background: '#FCD34D', color: '#111', fontWeight: 900, fontSize: 16, border: 'none', cursor: showUpLoading ? 'default' : 'pointer', opacity: showUpLoading ? 0.7 : 1, marginBottom: 10 }}>
                {showUpLoading ? t('confirmingBtn') : t('willGoBtn')}
              </button>
              <button
                onClick={() => setShowCancelSheet(true)}
                disabled={showUpLoading}
                style={{
                  width: '100%', height: 46, borderRadius: 14,
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.6)',
                  fontWeight: 700, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.15)',
                  cursor: showUpLoading ? 'default' : 'pointer',
                }}
              >
                {t('cancelJobBtn')}
              </button>
            </div>
          ) : (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 20, padding: 20, marginBottom: 16, width: '100%' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#22C55E', margin: '0 0 10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {t('employerContactLabel')}
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>{employerName}</p>
              {employerPhone && (
                <a href={`tel:+91${employerPhone}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, padding: '14px 16px', background: 'rgba(255,255,255,0.06)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none' }}>
                  <span style={{ fontSize: 18 }}>📞</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF' }}>+91 {employerPhone}</span>
                </a>
              )}
              {confirmed.address && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(confirmed.address)}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '14px 16px', background: 'rgba(255,255,255,0.06)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none' }}>
                  <MapPin style={{ width: 16, height: 16, color: '#FCD34D', marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{confirmed.address}</span>
                </a>
              )}
            </div>
          )}

          {error && (
            <p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{error}</p>
          )}

          <div style={{ flex: 1 }} />

          <button onClick={() => router.push('/worker/shifts')}
            style={{ width: '100%', height: 56, borderRadius: 16, background: '#FFFFFF', color: '#111111', fontWeight: 900, fontSize: 16, border: 'none', cursor: 'pointer', marginBottom: 10 }}>
            {t('goToMyShifts')}
          </button>
          <button onClick={() => { setConfirmed(null); setConfirmedBooking(null); setShowUpDone(false); goNext() }}
            style={{ width: '100%', height: 48, borderRadius: 16, background: 'transparent', color: 'rgba(255,255,255,0.5)', fontWeight: 700, fontSize: 14, border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }}>
            {t('browseMoreJobs')}
          </button>
        </div>

        {showCancelSheet && confirmedBooking?.id && (
          <CancelJobSheet
            bookingId={confirmedBooking.id}
            onClose={() => setShowCancelSheet(false)}
            onCancelled={() => {
              setShowCancelSheet(false)
              setConfirmed(null)
              setConfirmedBooking(null)
              setShowUpDone(false)
              goNext()
            }}
          />
        )}

        <style>{`@keyframes pop{0%{transform:scale(0)}65%{transform:scale(1.22)}100%{transform:scale(1)}}`}</style>
      </div>
    )
  }

  return (
    <>
      <TopBar title="Find Jobs" unread={0} />
      <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#F0F0F0', paddingTop: 64, paddingBottom: 80 }}>

        {/* Milestone bar */}
        <div style={{ background: '#111111', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{milestone.emoji}</span>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{milestone.label}</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>{totalShifts} jobs</p>
            </div>
          </div>
          <button onClick={() => setListMode(m => !m)}
            style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, padding: '6px 12px', cursor: 'pointer' }}>
            {listMode ? 'Swipe' : 'List'} Mode
          </button>
        </div>

        {/* Count pill */}
        {!loading && (
          <div style={{ padding: '12px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 999, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <Briefcase style={{ width: 14, height: 14, color: '#111111' }} />
              <p style={{ fontSize: 13, fontWeight: 800, color: '#111111', margin: 0 }}>
                {Math.max(0, shifts.length - index)} jobs near you
              </p>
            </div>
            {!listMode && shifts.length > index && (
              <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.4)', margin: 0 }}>
                Tap card for details
              </p>
            )}
          </div>
        )}

        {error && (
          <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Empty / all done */}
        {index >= shifts.length && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px', textAlign: 'center' }}>
            {kycStatus && kycStatus !== 'APPROVED' ? (
              <>
                <div style={{ fontSize: 56, marginBottom: 16 }}>{kycStatus === 'REJECTED' ? '⚠️' : '⏳'}</div>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', marginBottom: 8 }}>
                  {kycStatus === 'REJECTED' ? 'Verification rejected' : 'Verification pending'}
                </p>
                <p style={{ fontSize: 15, color: 'rgba(0,0,0,0.55)', marginBottom: 32, maxWidth: 320, lineHeight: 1.4 }}>
                  {feedMessage || 'Once your ID is approved you\'ll see jobs here.'}
                </p>
                <button onClick={() => router.push(kycStatus === 'REJECTED' ? '/worker/onboarding' : '/worker/profile')}
                  style={{ padding: '14px 32px', borderRadius: 16, background: '#111111', color: '#FFFFFF', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                  {kycStatus === 'REJECTED' ? 'Re-submit documents' : 'Check verification status'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 64, marginBottom: 16 }}>✨</div>
                <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', marginBottom: 8 }}>{t('allCaughtUp')}</p>
                <p style={{ fontSize: 15, color: 'rgba(0,0,0,0.4)', marginBottom: 32 }}>{t('checkBackSoon')}</p>
                <button onClick={() => { setIndex(0); load() }}
                  style={{ padding: '14px 36px', borderRadius: 16, background: '#111111', color: '#FFFFFF', fontWeight: 800, fontSize: 16, border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>
                  Refresh Jobs
                </button>
              </>
            )}
          </div>
        )}

        {/* ─── SWIPE MODE ─── */}
        {!listMode && index < shifts.length && current && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 16px 0' }}>

            {/* Stack: cards behind */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 420, height: 'calc(100dvh - 220px)', minHeight: 420 }}>

              {/* Card behind -2 */}
              {shifts[index + 2] && (
                <div style={{ position: 'absolute', top: 20, left: 16, right: 16, bottom: 0, borderRadius: 28, background: '#D8D8D8', transform: 'scale(0.92)', transformOrigin: 'bottom center' }} />
              )}

              {/* Card behind -1 */}
              {shifts[index + 1] && (
                <div style={{ position: 'absolute', top: 10, left: 8, right: 8, bottom: 0, borderRadius: 28, background: '#E4E4E4', transform: 'scale(0.96)', transformOrigin: 'bottom center' }} />
              )}

              {/* Main card */}
              <div
                onMouseDown={e => onStart(e.clientX, e.clientY)}
                onMouseMove={e => { if (dragging) onMove(e.clientX) }}
                onMouseUp={onEnd}
                onMouseLeave={onEnd}
                onTouchStart={e => onStart(e.touches[0].clientX, e.touches[0].clientY)}
                onTouchMove={e => { e.preventDefault(); if (dragging) onMove(e.touches[0].clientX) }}
                onTouchEnd={onEnd}
                style={{
                  position: 'absolute', inset: 0, zIndex: 10,
                  background: '#FFFFFF', borderRadius: 28,
                  boxShadow: `0 12px 48px rgba(0,0,0,${0.1 + Math.abs(dragX) / 3000})`,
                  border: isRight ? '2px solid #22C55E' : isLeft ? '2px solid #EF4444' : '2px solid transparent',
                  transform: `translateX(${tx}px) rotate(${rot}deg)`,
                  opacity:  opa,
                  transition: dragging ? 'none' : flinging ? 'transform 0.3s ease-in, opacity 0.3s' : 'transform 0.35s cubic-bezier(0.34,1.2,0.64,1), border-color 0.1s',
                  cursor: 'grab', userSelect: 'none', overflow: 'hidden',
                }}>

                {/* Accept/Skip overlays */}
                <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 20, opacity: Math.min(1, Math.max(0, dragX / 70)), transform: `rotate(-${Math.min(15, dragX / 6)}deg)` }}>
                  <div style={{ background: '#22C55E', borderRadius: 12, padding: '8px 18px', border: '3px solid #16A34A' }}>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>ACCEPT ✓</p>
                  </div>
                </div>
                <div style={{ position: 'absolute', top: 24, right: 24, zIndex: 20, opacity: Math.min(1, Math.max(0, -dragX / 70)), transform: `rotate(${Math.min(15, -dragX / 6)}deg)` }}>
                  <div style={{ background: '#EF4444', borderRadius: 12, padding: '8px 18px', border: '3px solid #DC2626' }}>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#FFFFFF', margin: 0 }}>SKIP ✗</p>
                  </div>
                </div>

                {/* Urgent banner */}
                {current.isUrgent && (
                  <div style={{ background: 'linear-gradient(90deg,#111 0%,#1a1a1a 100%)', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FCD34D', animation: 'pulse 1s ease infinite' }} />
                    <span style={{ fontSize: 11, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.1em' }}>⚡ URGENT · FIRST TO ACCEPT WINS</span>
                  </div>
                )}

                {/* Card body */}
                <div style={{ padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', height: current.isUrgent ? 'calc(100% - 44px)' : '100%', boxSizing: 'border-box' }}>

                  {/* Header: icon + title */}
                  <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'flex-start' }}>
                    <div style={{ width: 70, height: 70, borderRadius: 20, background: current.isUrgent ? '#111111' : '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 32 }}>{ROLE_EMOJI[current.role] || ROLE_EMOJI[current.title] || '💼'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 24, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1.15 }}>{current.title}</p>
                      <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
                        {current.employer?.companyName || current.employer?.user?.name || 'Employer'}
                      </p>
                      {/* Trust signals — rating + shift count, or "New employer"
                          tag for first-timers. Bayesian-biased (api/ratings) so
                          a single 1-star rating doesn't drop a 5.0 to 1.0. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {current.employer?.rating && current.employer.rating > 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Star style={{ width: 12, height: 12, color: '#F59E0B', fill: '#F59E0B' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.6)' }}>{current.employer.rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', background: 'rgba(13,148,136,0.1)', padding: '2px 8px', borderRadius: 6 }}>
                            New employer
                          </span>
                        )}
                        {current.employer?.totalShifts != null && current.employer.totalShifts > 0 && (
                          <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>
                            · {current.employer.totalShifts} shift{current.employer.totalShifts === 1 ? '' : 's'} posted
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Earnings highlight — show only what the worker takes home */}
                  <div style={{ background: '#111111', borderRadius: 20, padding: '18px 22px', marginBottom: 18 }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('youEarnCaps')}</p>
                    <p style={{ fontSize: 42, fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: -2 }}>₹{earn.toLocaleString('en-IN')}</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>{current.duration}h shift · ₹100/hr</p>
                  </div>

                  {/* Details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MapPin style={{ width: 15, height: 15, color: 'rgba(0,0,0,0.5)' }} />
                      </div>
                      <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', margin: 0, lineHeight: 1.35 }}>{current.address || current.city}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Clock style={{ width: 15, height: 15, color: 'rgba(0,0,0,0.5)' }} />
                      </div>
                      <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.65)', margin: 0 }}>
                        {new Date(current.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {current.startTime} – {current.endTime}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Hint + action buttons */}
            <div style={{ width: '100%', maxWidth: 420, padding: '0 4px' }}>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'rgba(0,0,0,0.3)', margin: '14px 0 14px' }}>← swipe to skip · swipe to accept →</p>
              <div style={{ display: 'flex', gap: 14 }}>
                <button onClick={() => { playSwipeSound(false); setFlingDir('left'); setFlinging(true); setTimeout(() => { setFlinging(false); goNext() }, 300) }}
                  style={{ flex: 1, height: 64, borderRadius: 20, background: '#FFFFFF', border: '1.5px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <X style={{ width: 30, height: 30, color: '#EF4444' }} />
                </button>
                <button onClick={() => { if (!accepting && current) accept(current) }} disabled={accepting}
                  style={{ flex: 2, height: 64, borderRadius: 20, background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: accepting ? 'default' : 'pointer', opacity: accepting ? 0.7 : 1, boxShadow: '0 4px 24px rgba(0,0,0,0.25)' }}>
                  {accepting
                    ? <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                    : <>
                        <CheckCircle style={{ width: 24, height: 24, color: '#FFFFFF' }} />
                        <span style={{ fontSize: 17, fontWeight: 900, color: '#FFFFFF' }}>{t('acceptJobBtn')}</span>
                      </>
                  }
                </button>
              </div>

              {/* Milestone progress */}
              {(() => {
                const next = MILESTONES.find(m => m.minJobs > totalShifts)
                if (!next) return null
                const prev = getMilestone(totalShifts)
                const pct = Math.round(((totalShifts - prev.minJobs) / (next.minJobs - prev.minJobs)) * 100)
                return (
                  <div style={{ background: '#FFFFFF', borderRadius: 16, padding: '14px 16px', marginTop: 14, border: '1px solid rgba(0,0,0,0.07)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: 0 }}>
                        {next.emoji} {next.minJobs - totalShifts} more to {next.label}
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.4)', margin: 0 }}>{next.label} tier</p>
                    </div>
                    <div style={{ height: 8, background: '#F0F0F0', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 8, background: '#111111', width: `${pct}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        )}

        {/* ─── LIST MODE ─── */}
        {listMode && index < shifts.length && (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shifts.slice(index).map(shift => {
              const w = Math.round(100 * shift.duration)
              return (
                <div key={shift.id}
                  onClick={() => setDetailShift(shift)}
                  style={{ background: '#FFFFFF', borderRadius: 20, border: `1px solid ${shift.isUrgent ? 'rgba(252,211,77,0.3)' : 'rgba(0,0,0,0.07)'}`, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', cursor: 'pointer' }}>
                  {shift.isUrgent && (
                    <div style={{ background: '#111111', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCD34D', animation: 'pulse 1s ease infinite' }} />
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.06em' }}>URGENT</span>
                    </div>
                  )}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 24 }}>{ROLE_EMOJI[shift.role] || '💼'}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 16, fontWeight: 800, color: '#111111', margin: 0 }}>{shift.title}</p>
                      <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', marginTop: 2 }}>{shift.city} · {shift.duration}h</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 19, fontWeight: 900, color: '#111111', margin: '0 0 6px' }}>₹{w.toLocaleString('en-IN')}</p>
                      <button onClick={e => { e.stopPropagation(); accept(shift) }}
                        style={{ padding: '7px 16px', borderRadius: 12, background: '#111111', color: '#FFFFFF', fontWeight: 800, fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                        Accept <ChevronRight style={{ width: 14, height: 14 }} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <BottomNav active="/worker/jobs" />

      <ShiftDetailSheet
        shift={detailShift}
        accepting={accepting}
        onClose={() => setDetailShift(null)}
        onAccept={async s => { setDetailShift(null); await accept(s) }}
      />

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
      `}</style>
    </>
  )
}

function ShiftDetailSheet({ shift, accepting, onClose, onAccept }: {
  shift: Shift | null
  accepting: boolean
  onClose: () => void
  onAccept: (s: Shift) => void
}) {
  const { t } = useLanguage()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (shift) requestAnimationFrame(() => setVisible(true))
    else setVisible(false)
  }, [shift])

  if (!shift) return null
  const earn   = Math.round(100 * shift.duration)
  const emoji  = ROLE_EMOJI[shift.role] || ROLE_EMOJI[shift.title] || '💼'
  const date   = new Date(shift.date)
  const isToday = new Date().toDateString() === date.toDateString()
  const dateLabel = isToday ? 'Today' : date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const company = shift.employer?.companyName || shift.employer?.user?.name || 'Employer'
  // Prefer OPS-provided map link (precise pin) over a text-search lookup.
  const mapsUrl = (shift as Record<string, unknown>).mapLink as string ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.address || shift.city || '')}`

  function close() { setVisible(false); setTimeout(onClose, 280) }

  return (
    <>
      <div onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81,
        background: '#FFFFFF', borderRadius: '24px 24px 0 0',
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'var(--safe-b)', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 16px' }}>
          {shift.isUrgent && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: '#111111', marginBottom: 12 }}>
              <Zap style={{ width: 12, height: 12, color: '#FCD34D' }} />
              <span style={{ fontSize: 11, fontWeight: 900, color: '#FCD34D', letterSpacing: '0.08em' }}>URGENT</span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 30 }}>{emoji}</span>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', margin: 0, lineHeight: 1.15 }}>{shift.title}</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>{company}</p>
              {shift.employer?.rating && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Star style={{ width: 12, height: 12, color: '#F59E0B', fill: '#F59E0B' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)' }}>{shift.employer.rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            <button onClick={close}
              style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <X style={{ width: 16, height: 16, color: 'rgba(0,0,0,0.55)' }} />
            </button>
          </div>

          <div style={{ background: '#111111', borderRadius: 18, padding: '16px 18px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('youEarnCaps')}</p>
            <p style={{ fontSize: 36, fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: -1 }}>₹{earn.toLocaleString('en-IN')}</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>₹100/hr × {shift.duration}h</p>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)', marginBottom: 14 }}>
            {[
              { Icon: Calendar, label: 'When', value: `${dateLabel} · ${shift.startTime} – ${shift.endTime}` },
              { Icon: Clock,    label: 'Duration', value: `${shift.duration} hours` },
              // Workers always take home ₹100/hr (flat — platform absorbs
              // the difference between employer rate and worker rate).
              // Showing the employer's hourly rate here misled workers
              // into expecting a higher payout than they get.
              { Icon: IndianRupee, label: 'Pay', value: '₹100/hr' },
              { Icon: MapPin,   label: 'Location', value: shift.address || shift.city },
            ].map(({ Icon, label, value }, i, arr) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: '#F8F8F8', borderBottom: i < arr.length - 1 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 15, height: 15, color: 'rgba(0,0,0,0.55)' }} />
                </div>
                <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', flex: 1, margin: 0 }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#111111', margin: 0, textAlign: 'right' }}>{value}</p>
              </div>
            ))}
          </div>

          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.08)', textDecoration: 'none', color: '#111111', fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
            <MapPin style={{ width: 15, height: 15 }} />
            Open in Maps
          </a>
        </div>

        <div style={{ flexShrink: 0, padding: '12px 20px 20px', borderTop: '1px solid rgba(0,0,0,0.08)', background: '#FFFFFF' }}>
          <button onClick={() => onAccept(shift)} disabled={accepting}
            style={{ width: '100%', height: 56, borderRadius: 16, background: '#111111', color: '#FFFFFF', fontWeight: 900, fontSize: 16, border: 'none', cursor: accepting ? 'default' : 'pointer', opacity: accepting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
            {accepting
              ? <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
              : <>
                  <CheckCircle style={{ width: 20, height: 20 }} />
                  Accept Job · ₹{earn.toLocaleString('en-IN')}
                </>
            }
          </button>
        </div>
      </div>
    </>
  )
}

const MILESTONES = [
  { level: 0, label: 'Starter',  emoji: '🌱', minJobs: 0,  bonusPct: 0  },
  { level: 1, label: 'Bronze',   emoji: '🥉', minJobs: 5,  bonusPct: 5  },
  { level: 2, label: 'Silver',   emoji: '🥈', minJobs: 10, bonusPct: 10 },
  { level: 3, label: 'Gold',     emoji: '🥇', minJobs: 25, bonusPct: 15 },
  { level: 4, label: 'Platinum', emoji: '💎', minJobs: 50, bonusPct: 20 },
]

export default function BrowsePage() {
  return <Suspense><JobsInner /></Suspense>
}
