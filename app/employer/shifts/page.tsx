'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, CheckCircle2, X, ShieldCheck, Loader2 } from 'lucide-react'
import EmployerTopBar from '@/components/employer/EmployerTopBar'
import EmployerBottomNav from '@/components/employer/EmployerBottomNav'

/* eslint-disable @typescript-eslint/no-explicit-any */

function formatSecs(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
}

export default function EmployerShiftsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [otpModal, setOtpModal] = useState<{ name: string; code: string; expiresAt: number } | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/bookings')
      const d = await r.json()
      setBookings(d.bookings ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  // Tick once a second so live shift timers update
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { active, past } = useMemo(() => {
    const active = bookings.filter(b => b.status === 'IN_PROGRESS' || b.status === 'CONFIRMED')
    const past   = bookings.filter(b => ['COMPLETED','CANCELLED'].includes(b.status))
    return { active, past }
  }, [bookings])

  async function generateOTP(b: any) {
    setOtpLoading(true)
    try {
      const r = await fetch(`/api/employer/jobs/${b.shift?.id ?? b.shiftId}/otp`, { method: 'POST' })
      const d = await r.json()
      if (r.ok && d.otp) {
        setOtpModal({
          name:      b.worker?.user?.name ?? 'Worker',
          code:      d.otp,
          expiresAt: new Date(d.expiresAt).getTime(),
        })
      }
    } finally { setOtpLoading(false) }
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const otpSecondsLeft = otpModal ? Math.max(0, Math.floor((otpModal.expiresAt - Date.now()) / 1000)) : 0

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'calc(56px + var(--safe-t))', paddingBottom: 'calc(88px + var(--safe-b))', background: 'var(--bg)' }}>
      <EmployerTopBar title="Shifts" unread={0} />

      <div className="px-4 pt-4 flex flex-col gap-4">
        {loading && (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--text2)' }} /></div>
        )}

        {/* Active */}
        <div>
          <p className="text-base font-black mb-3" style={{ color: 'var(--text1)' }}>Active Shifts</p>
          <div className="flex flex-col gap-3">
            {!loading && active.length === 0 && (
              <div className="py-8 text-center rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-3xl mb-2">✅</p>
                <p className="font-bold" style={{ color: 'var(--text2)' }}>No active shifts right now</p>
              </div>
            )}
            {active.map(b => {
              const w = b.worker
              const checkIn = b.checkInTime ? new Date(b.checkInTime).getTime() : null
              // Re-evaluate every tick
              void tick
              const elapsed = checkIn ? Math.floor((Date.now() - checkIn) / 1000) : 0
              const earned = b.shift && checkIn ? ((b.shift.hourlyRate / 3600) * elapsed).toFixed(2) : '0.00'
              const isLive = b.status === 'IN_PROGRESS'
              return (
                <div key={b.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid rgba(20,184,166,0.2)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff' }}>
                        {w?.user?.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: 'var(--text1)' }}>{w?.user?.name ?? 'Worker'}</p>
                        <p className="text-xs" style={{ color: 'var(--text2)' }}>{b.shift?.title}</p>
                        <p className="text-xs" style={{ color: 'var(--text3)' }}>{b.shift?.address ?? b.shift?.city}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5"
                      style={isLive
                        ? { background: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.3)' }
                        : { background: 'rgba(245,158,11,0.15)', color: '#FCD34D', border: '1px solid rgba(245,158,11,0.3)' }
                      }>
                      {isLive
                        ? <><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" /> LIVE</>
                        : <>CONFIRMED</>
                      }
                    </span>
                  </div>

                  {checkIn && (
                    <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.15)' }}>
                      <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>Started at {new Date(checkIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                      <p className="text-3xl font-black font-mono tracking-wider" style={{ color: '#5EEAD4' }}>{formatSecs(elapsed)}</p>
                      <p className="text-sm font-bold mt-1" style={{ color: '#4ADE80' }}>₹{earned} accrued</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => generateOTP(b)} disabled={otpLoading}
                      className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5"
                      style={{ background: 'rgba(20,184,166,0.12)', color: '#5EEAD4', border: '1px solid rgba(20,184,166,0.3)' }}>
                      {otpLoading ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <><ShieldCheck style={{ width: 15, height: 15 }} /> Generate OTP</>}
                    </button>
                    <button onClick={() => router.push(`/employer/job/${b.shift?.id ?? b.shiftId}`)}
                      className="flex-1 py-3 rounded-xl font-bold text-sm"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text1)', border: '1px solid var(--border)' }}>
                      View shift
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Past */}
        <div>
          <p className="text-base font-black mb-3" style={{ color: 'var(--text1)' }}>Past Shifts</p>
          {!loading && past.length === 0 && (
            <div className="py-8 text-center rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="font-bold" style={{ color: 'var(--text2)' }}>No past shifts yet</p>
            </div>
          )}
          {past.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {past.map((b, i) => {
                const isPaid = b.paymentStatus === 'PAID'
                const w = b.worker
                return (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3.5"
                    style={{ borderBottom: i < past.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0"
                      style={{ background: isPaid ? 'rgba(20,184,166,0.15)' : 'rgba(251,191,36,0.12)', color: isPaid ? '#5EEAD4' : '#FCD34D' }}>
                      {w?.user?.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text1)' }}>{w?.user?.name ?? 'Worker'}</p>
                      <p className="text-xs" style={{ color: 'var(--text2)' }}>
                        {b.shift?.title} · {b.shift?.duration}h · {new Date(b.shift?.date ?? b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-bold text-sm" style={{ color: '#5EEAD4' }}>₹{Math.round(b.totalAmount ?? 0)}</p>
                      {isPaid ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(20,184,166,0.15)', color: '#5EEAD4', border: '1px solid rgba(20,184,166,0.3)' }}>
                          ✓ Paid
                        </span>
                      ) : b.status === 'COMPLETED' ? (
                        <button onClick={() => router.push(`/employer/job/${b.shift?.id ?? b.shiftId}/payment`)}
                          className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                          style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff' }}>
                          Pay Now
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text2)' }}>
                          {b.status}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* OTP Modal */}
      {otpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: 'var(--surface)', border: '1px solid rgba(20,184,166,0.25)' }}>
            <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(20,184,166,0.12)' }}>
              <ShieldCheck style={{ width: 24, height: 24, color: '#14B8A6' }} />
            </div>
            <p className="text-lg font-black mb-1" style={{ color: 'var(--text1)' }}>Arrival OTP</p>
            <p className="text-xs mb-5" style={{ color: 'var(--text2)' }}>Share with {otpModal.name} to start their shift</p>
            <div className="flex gap-2 justify-center mb-3">
              {otpModal.code.split('').map((d, i) => (
                <div key={i} className="w-14 h-16 rounded-2xl flex items-center justify-center text-3xl font-black"
                  style={{ background: 'rgba(20,184,166,0.1)', border: '2px solid #14B8A6', color: '#5EEAD4' }}>
                  {d}
                </div>
              ))}
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--text3)' }}>
              {otpSecondsLeft > 0 ? `Expires in ${Math.floor(otpSecondsLeft/60)}:${String(otpSecondsLeft%60).padStart(2,'0')}` : 'Expired — generate a new one'}
            </p>
            <button onClick={() => copy(otpModal.code)}
              className="w-full py-3 rounded-2xl font-bold text-sm mb-2 flex items-center justify-center gap-2"
              style={{ background: 'rgba(20,184,166,0.12)', color: '#5EEAD4', border: '1px solid rgba(20,184,166,0.3)' }}>
              {copied ? <CheckCircle2 style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <button onClick={() => setOtpModal(null)}
              className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'var(--sur2)', color: 'var(--text2)' }}>
              <X style={{ width: 14, height: 14 }} /> Close
            </button>
          </div>
        </div>
      )}

      <EmployerBottomNav />
    </div>
  )
}
