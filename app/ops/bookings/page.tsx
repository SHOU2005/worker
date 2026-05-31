'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Booking { id: string; status: string; totalAmount: number; platformFee: number; createdAt: string; checkInTime: string | null; checkOutTime: string | null; shift: { id: string; title: string; date: string; city: string; hourlyRate?: number }; worker: { user: { name: string; phone: string } }; employer: { name: string; phone: string }; jobOtp?: { otp: string; expiresAt: string; verified: boolean } | null }

function minutesElapsed(fromIso: string, toIso?: string | null): number {
  const start = new Date(fromIso).getTime()
  const end   = toIso ? new Date(toIso).getTime() : Date.now()
  return Math.max(0, Math.floor((end - start) / 60_000))
}
function billedSoFar(fromIso: string, toIso: string | null | undefined, hourlyRate: number): number {
  return Math.round((hourlyRate || 0) * minutesElapsed(fromIso, toIso) / 60)
}
function earnedSoFar(fromIso: string, toIso: string | null | undefined): number {
  return Math.round(100 * minutesElapsed(fromIso, toIso) / 60)
}

function formatElapsed(fromIso: string, toIso?: string | null): string {
  const start = new Date(fromIso).getTime()
  const end   = toIso ? new Date(toIso).getTime() : Date.now()
  const ms    = Math.max(0, end - start)
  const s     = Math.floor(ms / 1000)
  const h     = Math.floor(s / 3600)
  const m     = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const STATUS_COLORS: Record<string, string> = { PENDING: '#FBBF24', CONFIRMED: '#60A5FA', IN_PROGRESS: '#FFFFFF', COMPLETED: '#34D399', CANCELLED: '#F87171' }

export default function BookingsPage() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('ALL')
  // Re-render once a minute so on-shift timers tick.
  const [, setTick]             = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const q = filter === 'ALL' ? '' : `?status=${filter}`
    fetch(`/api/ops/bookings${q}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setBookings(d.bookings || []) }).finally(() => setLoading(false))
  }, [filter, router])

  async function forceComplete(id: string) {
    if (!confirm('Force complete this booking?')) return
    await fetch(`/api/ops/bookings/${id}/force-complete`, { method: 'PATCH' })
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'COMPLETED' } : b))
  }

  async function generateOtp(bookingId: string, shiftId: string) {
    const r = await fetch(`/api/employer/jobs/${shiftId}/otp`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d?.otp) { alert(d?.error || 'Could not generate OTP'); return }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, jobOtp: { otp: d.otp, expiresAt: d.expiresAt, verified: false } } : b))
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Bookings</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['ALL', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(f => (
            <button key={f} onClick={() => { setLoading(true); setFilter(f) }} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2, whiteSpace: 'nowrap', flexShrink: 0 }}>{f}</button>
          ))}
        </div>
        {loading ? <ListRowSkeleton count={6} dark /> :
          bookings.map(b => (
            <div key={b.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: 0 }}>{b.shift?.title}</p>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{b.worker?.user?.name} @ {b.employer?.name}</p>
                  <p style={{ color: T2, fontSize: 12, margin: 0 }}>{new Date(b.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · ₹{b.totalAmount} · Fee: ₹{b.platformFee}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${STATUS_COLORS[b.status] || T2}20`, color: STATUS_COLORS[b.status] || T2, flexShrink: 0 }}>{b.status}</span>
              </div>
              {/* On-shift timer — counts up from when the worker entered the OTP (checkInTime).
                  Stops at checkOutTime once the shift completes. */}
              {b.checkInTime && (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(34,197,94,0.9)' }}>ON SHIFT</span>
                    <span style={{ fontSize: 16, fontWeight: 900, fontFamily: 'monospace', color: T1 }}>{formatElapsed(b.checkInTime, b.checkOutTime)}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: T2 }}>since {new Date(b.checkInTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}{b.checkOutTime ? ` → ${new Date(b.checkOutTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, fontSize: 11, color: T2 }}>
                    <span>Worker earned: <span style={{ color: '#34D399', fontWeight: 700 }}>₹{earnedSoFar(b.checkInTime, b.checkOutTime).toLocaleString('en-IN')}</span></span>
                    {(b.shift?.hourlyRate || 0) > 0 && <span>· Bill: <span style={{ color: T1, fontWeight: 700 }}>₹{billedSoFar(b.checkInTime, b.checkOutTime, b.shift.hourlyRate || 0).toLocaleString('en-IN')}</span></span>}
                  </div>
                </div>
              )}
              {/* Job OTP — visible to OPS so they can help workers/employers when the in-app share fails */}
              {b.jobOtp ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.25)', marginBottom: ['IN_PROGRESS', 'CONFIRMED'].includes(b.status) ? 10 : 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(96,165,250,0.85)' }}>OTP</span>
                  <span style={{ fontSize: 18, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 4, color: T1 }}>{b.jobOtp.otp}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: T2 }}>
                    {b.jobOtp.verified ? 'used' : new Date(b.jobOtp.expiresAt) > new Date() ? `valid until ${new Date(b.jobOtp.expiresAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}` : 'expired'}
                  </span>
                </div>
              ) : ['CONFIRMED', 'IN_PROGRESS'].includes(b.status) ? (
                <button onClick={() => generateOtp(b.id, b.shift.id)}
                  style={{ width: '100%', padding: '8px', borderRadius: 10, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60A5FA', fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: ['IN_PROGRESS', 'CONFIRMED'].includes(b.status) ? 8 : 0 }}>
                  Generate OTP
                </button>
              ) : null}
              {['IN_PROGRESS', 'CONFIRMED'].includes(b.status) && (
                <button onClick={() => forceComplete(b.id)} style={{ width: '100%', padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#34D399', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Force Complete
                </button>
              )}
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
