'use client'
import { useEffect, useState } from 'react'
import { TrendingUp, IndianRupee, ChevronRight, Wallet, CheckCircle, X, Clock, ArrowRight } from 'lucide-react'
import { track } from '@/lib/posthog'
import TopBar    from '@/components/shared/TopBar'
import BottomNav from '@/components/shared/BottomNav'
import JobIcon   from '@/components/worker/JobIcon'
import { workerEarningFromBooking } from '@/lib/pricing'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'
import { useLanguage } from '@/app/worker/LanguageContext'

const BAR_MAX_H = 68

const ROLE_EMOJI: Record<string, string> = {
  'Shop Helper': '🏪', 'Driver': '🚗', 'Security Guard': '🔒', 'Kitchen Helper': '🍳',
  'Cleaning Staff': '🧹', 'Cleaner': '🧹', 'Warehouse Staff': '🏭', 'Cook': '👨‍🍳',
  'Bouncer': '💪', 'Waiter': '🍽️', 'Promoter': '📣', 'Caretaker': '🤲',
  'Delivery Rider': '🛵', 'Factory Helper': '🏭', 'General Helper': '🙋', 'Store Staff': '🏪',
}
const emojiFor = (title: string) => ROLE_EMOJI[title] || '💼'

interface BookingHistoryItem {
  id: string
  workerEarning: number
  paymentStatus: string
  status: string
  checkInTime: string | null
  checkOutTime: string | null
  createdAt: string
  shift: {
    title: string
    duration: number
    employer?: { user?: { name?: string } }
  }
  payment?: { status?: string } | null
}

interface EarningsData {
  totalEarnings: number
  weekTotal: number
  weekData: { day: string; amt: number }[]
  history: BookingHistoryItem[]
}

// `todayLabel` / `yesterdayLabel` come from the worker translations so the
// relative-date string here matches whatever language the worker has set.
// Anything older than yesterday falls back to a locale-formatted date.
function relativeDate(iso: string, todayLabel: string, yesterdayLabel: string) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0,0,0,0)
  const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
  const start = new Date(d); start.setHours(0,0,0,0)
  if (start.getTime() === today.getTime()) return todayLabel
  if (start.getTime() === yest.getTime())  return yesterdayLabel
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

function WithdrawSheet({ balance, upi, onClose, onSubmitted }: { balance: number; upi: string; onClose: () => void; onSubmitted: () => void }) {
  const [visible, setVisible] = useState(false)
  const [stage,   setStage]   = useState<'form' | 'processing' | 'done'>('form')
  const [error,   setError]   = useState('')

  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  function close() { setVisible(false); setTimeout(onClose, 320) }

  async function confirm() {
    if (!upi || balance < 100) return
    setStage('processing'); setError('')
    try {
      const res = await fetch('/api/worker/withdraw', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: balance, upiId: upi }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Could not submit withdrawal. Try again.')
        track('withdrawal_failed', { amount: balance, reason: d.error })
        setStage('form'); return
      }
      track('withdrawal_requested', { amount: balance })
      setStage('done')
      onSubmitted()
    } catch {
      setError('Network error. Please try again.')
      setStage('form')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.4)', opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }} onClick={close} />
      <div className="fixed bottom-0 left-0 right-0 z-50" style={{
        background: '#FFFFFF', borderRadius: '24px 24px 0 0', paddingBottom: 'var(--safe-b)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.12)', border: '1px solid rgba(0,0,0,0.08)',
      }}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>
        {stage !== 'processing' && (
          <button onClick={close} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.07)' }}>
            <X style={{ width: 14, height: 14, color: 'rgba(0,0,0,0.5)' }} />
          </button>
        )}

        <div className="overflow-y-auto flex-1 px-5 pb-6">
          {stage === 'form' && (
            <>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#111111', marginTop: 10, marginBottom: 4 }}>Withdraw to UPI</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', marginBottom: 20 }}>Funds arrive in 2–4 hours</p>
              <div style={{ padding: '16px', borderRadius: 18, marginBottom: 16, background: '#111111', boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.08em', marginBottom: 6 }}>AVAILABLE BALANCE</p>
                <p style={{ fontSize: 36, fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>₹{balance.toLocaleString('en-IN')}</p>
              </div>
              {upi && (
                <div style={{ padding: '14px 16px', borderRadius: 16, marginBottom: 20, background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.09)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 20 }}>💸</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.35)', marginBottom: 3 }}>WITHDRAWING TO</p>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#111111' }}>{upi}</p>
                  </div>
                  <CheckCircle style={{ width: 18, height: 18, color: '#111111', flexShrink: 0 }} />
                </div>
              )}
              {!upi && (
                <div style={{ padding: '12px 16px', borderRadius: 14, marginBottom: 20, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>Add a UPI ID in your profile to withdraw.</p>
                </div>
              )}
              {error && (
                <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, marginBottom: 10 }}>{error}</p>
              )}
              <button onClick={confirm} disabled={!upi || balance < 100}
                style={{ width: '100%', height: 54, borderRadius: 16, fontSize: 16, fontWeight: 800,
                  background: upi && balance >= 100 ? '#111111' : 'rgba(0,0,0,0.1)',
                  color: upi && balance >= 100 ? '#FFFFFF' : 'rgba(0,0,0,0.3)', border: 'none',
                  cursor: upi && balance >= 100 ? 'pointer' : 'default',
                  boxShadow: upi && balance >= 100 ? '0 6px 24px rgba(0,0,0,0.15)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Wallet style={{ width: 18, height: 18 }} /> Withdraw ₹{balance.toLocaleString('en-IN')}
              </button>
              {balance < 100 && balance > 0 && (
                <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', textAlign: 'center', marginTop: 8 }}>Minimum withdrawal is ₹100</p>
              )}
            </>
          )}

          {stage === 'processing' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', border: '4px solid #111111', borderTopColor: 'transparent', animation: 'spin 0.9s linear infinite', marginBottom: 20 }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              <p style={{ fontSize: 18, fontWeight: 800, color: '#111111', marginBottom: 6 }}>Processing…</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>Sending ₹{balance.toLocaleString('en-IN')} to {upi}</p>
            </div>
          )}

          {stage === 'done' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 0' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#111111', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <CheckCircle style={{ width: 36, height: 36, color: '#fff' }} />
              </div>
              <p style={{ fontSize: 22, fontWeight: 900, color: '#111111', marginBottom: 6 }}>₹{balance.toLocaleString('en-IN')} Initiated!</p>
              <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', textAlign: 'center', marginBottom: 28 }}>Withdrawal sent to <strong style={{ color: '#111111' }}>{upi}</strong></p>
              <button onClick={close} style={{ width: '100%', height: 52, borderRadius: 16, fontSize: 16, fontWeight: 800, background: '#111111', color: '#FFFFFF', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Done <ArrowRight style={{ width: 18, height: 18 }} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default function EarningsPage() {
  const { t } = useLanguage()
  const [data,   setData]   = useState<EarningsData | null>(null)
  const [upi,    setUpi]    = useState<string>('')
  const [loading,setLoading]= useState(true)
  const [period, setPeriod] = useState<'week' | 'month'>('month')
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [available, setAvailable] = useState(0)

  function refresh() {
    Promise.all([
      fetch('/api/worker/earnings').then(r => r.ok ? r.json() : null),
      fetch('/api/worker/profile').then(r => r.ok ? r.json() : null),
      fetch('/api/worker/withdraw').then(r => r.ok ? r.json() : null),
    ]).then(([earn, prof, wd]) => {
      if (earn) setData(earn)
      if (prof?.user?.workerProfile?.upiId) setUpi(prof.user.workerProfile.upiId)
      if (typeof wd?.available === 'number') setAvailable(wd.available)
    }).finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // Re-fetch when the user comes back to the tab — withdrawals processed
    // server-side (or by ops) won't update the screen otherwise. Workers were
    // pulling-to-reload manually on slow connections to check status; this
    // keeps the page fresh without a polling loop that would hammer the
    // backend on slow connections.
    function onVisible() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const history       = data?.history ?? []
  const weekData      = data?.weekData ?? []
  const totalEarnings = data?.totalEarnings ?? 0
  const weekTotal     = data?.weekTotal ?? 0

  // Live earnings — every booking shows ₹100 × actual minutes worked, not the
  // amount stored at booking creation time. Hours total likewise uses real
  // minutes worked (rounded to 1 decimal).
  const liveEarning = (h: BookingHistoryItem) => workerEarningFromBooking(h.checkInTime, h.checkOutTime)
  const liveMinutes = (h: BookingHistoryItem) => {
    if (!h.checkInTime) return 0
    const start = new Date(h.checkInTime).getTime()
    const end   = h.checkOutTime ? new Date(h.checkOutTime).getTime() : Date.now()
    return Math.max(0, Math.floor((end - start) / 60_000))
  }

  // "In bank" = already withdrawn-eligible (currently available + earned). totalProcessing = pending payment from employer.
  const totalProcessing = history.filter(h => h.paymentStatus !== 'PAID' && h.payment?.status !== 'PAID').reduce((s, h) => s + liveEarning(h), 0)
  const totalPaid       = available
  const totalHours      = Math.round(history.reduce((s, h) => s + liveMinutes(h) / 60, 0) * 10) / 10
  const maxAmt          = weekData.length ? Math.max(...weekData.map(d => d.amt), 0) : 0
  const activeDays      = weekData.filter(d => d.amt > 0).length
  const avgDaily        = activeDays > 0 ? Math.round(weekTotal / activeDays) : 0

  const headlineAmount = period === 'week' ? weekTotal : totalEarnings

  return (
    <>
      <TopBar title={t('earningsTitle')} />
      {showWithdraw && <WithdrawSheet balance={available} upi={upi} onClose={() => setShowWithdraw(false)} onSubmitted={refresh} />}

      <div style={{ minHeight: '100vh', paddingTop: 'calc(56px + var(--safe-t))', paddingBottom: 'calc(80px + var(--safe-b))', background: '#FFFFFF' }}>

        {/* Total card */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div style={{ borderRadius: 24, overflow: 'hidden', background: '#111111', boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}>
            <div style={{ height: 3, background: 'linear-gradient(90deg,rgba(255,255,255,0.1),rgba(255,255,255,0.3),rgba(255,255,255,0.1))' }} />
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['week', 'month'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    style={{ padding: '5px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                      background: period === p ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                      color: period === p ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                    {p === 'week' ? t('thisWeekBtn') : t('allTimeBtn')}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 44, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: -1 }}>
                    {loading ? '—' : `₹${headlineAmount.toLocaleString('en-IN')}`}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                    <TrendingUp style={{ width: 13, height: 13, color: '#86EFAC' }} />
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                      {history.length} {t('shiftsCompletedShort')}
                    </p>
                  </div>
                </div>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IndianRupee style={{ width: 24, height: 24, color: '#fff', strokeWidth: 1.8 }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[
                  { label: t('inBankLabel'),    value: `₹${totalPaid.toLocaleString('en-IN')}`,       sub: t('settledShort') },
                  { label: t('onTheWayLabel'),  value: `₹${totalProcessing.toLocaleString('en-IN')}`, sub: t('processingShort') },
                  { label: t('hours'),          value: `${totalHours}h`,                              sub: `${history.length} ${t('shiftsCompletedShort')}` },
                ].map(s => (
                  <div key={s.label} style={{ padding: '10px 10px', borderRadius: 14, background: 'rgba(0,0,0,0.25)' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{s.label}</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{s.value}</p>
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{s.sub}</p>
                  </div>
                ))}
              </div>

              <button onClick={() => setShowWithdraw(true)} disabled={totalPaid <= 0}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: '12px 0', borderRadius: 16,
                  cursor: totalPaid > 0 ? 'pointer' : 'default',
                  background: totalPaid > 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  fontSize: 15, fontWeight: 700,
                  color: totalPaid > 0 ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                <Wallet style={{ width: 17, height: 17 }} />
                {totalPaid > 0 ? `${t('withdrawToUpiBtn')} ₹${totalPaid.toLocaleString('en-IN')}` : t('noFundsYet')}
              </button>
            </div>
          </div>
        </div>

        {/* Weekly chart */}
        <div style={{ padding: '16px 16px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#111111' }}>{t('thisWeekBtn')}</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.45)' }}>
              {avgDaily > 0 ? `${t('avgPerDay')} ₹${avgDaily.toLocaleString('en-IN')}` : t('noEarningsYetShort')}
            </p>
          </div>
          <div style={{ borderRadius: 20, padding: '16px', background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: BAR_MAX_H + 32 }}>
              {weekData.map(d => {
                const pct  = maxAmt > 0 ? d.amt / maxAmt : 0
                const barH = pct > 0 ? Math.max(Math.round(pct * BAR_MAX_H), 10) : 4
                return (
                  <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.38)', height: 16, lineHeight: '16px', textAlign: 'center', marginBottom: 3 }}>
                      {d.amt > 0 ? (d.amt >= 1000 ? `₹${(d.amt / 1000).toFixed(1)}k` : `₹${d.amt}`) : ''}
                    </p>
                    <div style={{ width: '100%', height: barH, borderRadius: '6px 6px 0 0', background: pct > 0 ? '#111111' : 'rgba(0,0,0,0.07)', transition: 'height 0.3s ease' }} />
                  </div>
                )
              })}
            </div>
            <div style={{ height: 1, background: 'rgba(0,0,0,0.07)', margin: '0 0 8px' }} />
            <div style={{ display: 'flex', gap: 6 }}>
              {weekData.map(d => (
                <div key={d.day} style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.38)' }}>{d.day}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        <div style={{ padding: '16px 16px' }}>
          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#111111' }}>{t('paymentHistoryTitle')}</p>
          </div>
          {loading ? (
            <ListRowSkeleton count={4} />
          ) : history.length === 0 ? (
            <EmptyState
              icon="💼"
              title={t('emptyEarningsTitle')}
              message={t('emptyEarningsMsg')}
            />
          ) : (
            <div style={{ borderRadius: 20, overflow: 'hidden', background: '#F5F5F5', border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
              {history.map((h, i) => {
                const company = h.shift?.employer?.user?.name || 'Employer'
                const title   = h.shift?.title || 'Shift'
                const isPaid  = h.paymentStatus === 'PAID' || h.payment?.status === 'PAID'
                return (
                  <div key={h.id}>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <JobIcon emoji={emojiFor(title)} size={42} radius={12} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#111111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.38)', marginTop: 2 }}>{company} · {relativeDate(h.createdAt, t('relativeToday'), t('relativeYesterday'))} · {h.shift?.duration ?? 0}h</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 16, fontWeight: 900, color: '#111111' }}>+₹{liveEarning(h).toLocaleString('en-IN')}</p>
                        <p style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: 'rgba(0,0,0,0.38)' }}>
                          {isPaid ? `✓ ${t('paidStatusShort')}` : `⏳ ${t('processingStatusShort')}`}
                        </p>
                      </div>
                    </div>
                    {i < history.length - 1 && <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '0 16px' }} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
      <BottomNav active="/worker/earnings" />
    </>
  )
}
