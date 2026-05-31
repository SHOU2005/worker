'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { CardSkeleton } from '@/components/shared/Skeleton'
import { ChevronLeft, MapPin, Clock, Users, Phone, Building2, Calendar, IndianRupee, Zap } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

const STATUS_COLORS: Record<string, string> = {
  OPEN:'#34D399', SEARCHING:'#34D399', ASSIGNED:'#60A5FA', IN_PROGRESS:'#FFFFFF',
  COMPLETED:'#9CA3AF', CANCELLED:'#F87171', PENDING:'#FBBF24', CONFIRMED:'#60A5FA',
}

interface Booking {
  id: string; status: string; totalAmount: number; workerEarning: number; platformFee: number
  checkInTime: string | null; checkOutTime: string | null; createdAt: string
  worker: { user: { name: string; phone: string } }
}

interface ShiftDetail {
  id: string; title: string; role: string; description: string | null
  address: string; city: string; mapLink: string | null
  date: string; startTime: string; endTime: string | null; duration: number
  hourlyRate: number; isUrgent: boolean
  status: string; paymentStatus: string; paymentAmount: number | null
  workersNeeded: number; activeBookings: number; vacancyLeft: number
  source: 'ops' | 'employer'
  createdAt: string
  employer: { id: string; companyName: string | null; user: { name: string; phone: string } } | null
  bookings: Booking[]
}

function formatElapsed(fromIso: string, toIso?: string | null): string {
  const start = new Date(fromIso).getTime()
  const end   = toIso ? new Date(toIso).getTime() : Date.now()
  const ms    = Math.max(0, end - start)
  const s     = Math.floor(ms / 1000)
  const h     = Math.floor(s / 3600)
  const m     = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function minutesElapsed(fromIso: string, toIso?: string | null): number {
  const start = new Date(fromIso).getTime()
  const end   = toIso ? new Date(toIso).getTime() : Date.now()
  return Math.max(0, Math.floor((end - start) / 60_000))
}
function workerEarnedSoFar(fromIso: string, toIso?: string | null): number {
  return Math.round(100 * minutesElapsed(fromIso, toIso) / 60)
}
function billedSoFar(fromIso: string, toIso: string | null | undefined, hourlyRate: number): number {
  return Math.round((hourlyRate || 0) * minutesElapsed(fromIso, toIso) / 60)
}

export default function OpsShiftDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [shift,  setShift]  = useState<ShiftDetail | null>(null)
  const [otp,    setOtp]    = useState<{ otp: string; expiresAt: string; verified: boolean; createdAt: string } | null>(null)
  const [loading,setLoading]= useState(true)
  const [err,    setErr]    = useState('')
  const [, setTick] = useState(0)

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(i)
  }, [])

  function reload() {
    fetch(`/api/ops/shifts/${id}`, { cache: 'no-store' })
      .then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d?.shift) { setShift(d.shift); setOtp(d.jobOtp) } else if (d?.error) setErr(d.error) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { if (id) reload() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  async function generateOtp() {
    if (!shift) return
    const r = await fetch(`/api/employer/jobs/${shift.id}/otp`, { method: 'POST' })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d?.otp) { alert(d?.error || 'Could not generate OTP'); return }
    setOtp({ otp: d.otp, expiresAt: d.expiresAt, verified: false, createdAt: new Date().toISOString() })
  }

  const [invoice, setInvoice] = useState<{ message: string; paymentLink: string | null; totalAmount: number; numWorkers: number } | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [hoursOverride, setHoursOverride] = useState<string>('')
  const [assignPhone, setAssignPhone] = useState<string>('')
  const [assignStartTime, setAssignStartTime] = useState<string>('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState<string>('')

  const [startTimerLoading, setStartTimerLoading] = useState<string | null>(null)
  const [startTimerOverride, setStartTimerOverride] = useState<string>('13:00')

  async function startBookingTimer(bookingId: string) {
    if (startTimerLoading) return
    setStartTimerLoading(bookingId)
    try {
      const r = await fetch(`/api/ops/bookings/${bookingId}/start`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(startTimerOverride ? { checkInTime: startTimerOverride } : {}),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d?.error || `Failed (${r.status})`); return }
      reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error')
    } finally {
      setStartTimerLoading(null)
    }
  }

  async function assignWorker() {
    if (!shift || assignLoading) return
    setAssignError(''); setAssignLoading(true)
    try {
      const r = await fetch(`/api/ops/shifts/${shift.id}/assign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone: assignPhone,
          ...(assignStartTime ? { startTime: assignStartTime } : {}),
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setAssignError(d?.error || `Failed (${r.status})`); return }
      setAssignPhone(''); setAssignStartTime('')
      reload()
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setAssignLoading(false)
    }
  }
  async function generateInvoice() {
    if (!shift || invoiceLoading) return
    setInvoiceLoading(true)
    try {
      const r = await fetch(`/api/ops/shifts/${shift.id}/invoice`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ hoursOverride: hoursOverride ? Number(hoursOverride) : undefined, includePaymentLink: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d?.error || 'Could not generate invoice'); return }
      setInvoice(d)
    } finally { setInvoiceLoading(false) }
  }
  async function copyMessage() {
    if (!invoice) return
    try { await navigator.clipboard.writeText(invoice.message) } catch {}
  }

  if (loading) return (
    <Frame>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <CardSkeleton h={80}  dark />
        <CardSkeleton h={120} dark />
        <CardSkeleton h={160} dark />
      </div>
    </Frame>
  )
  if (err)     return <Frame><p style={{ color: '#F87171', textAlign: 'center', paddingTop: 40 }}>{err}</p></Frame>
  if (!shift)  return <Frame><p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>Shift not found.</p></Frame>

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Frame>
      <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 0', background: 'none', border: 'none', color: T2, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
        <ChevronLeft style={{ width: 16, height: 16 }} /> Back to shifts
      </button>

      {/* Title + status */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <p style={{ color: T1, fontWeight: 800, fontSize: 20, margin: 0 }}>{shift.title}</p>
              {shift.isUrgent && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}><Zap style={{ width: 10, height: 10 }} />URGENT</span>}
            </div>
            <p style={{ color: T2, fontSize: 13, margin: 0 }}>{shift.role}</p>
            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 800, padding: '3px 8px', borderRadius: 6, background: shift.source === 'ops' ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)', color: shift.source === 'ops' ? '#60A5FA' : '#A78BFA' }}>
              {shift.source === 'ops' ? 'OPS POSTED' : 'EMPLOYER POSTED'}
            </span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${STATUS_COLORS[shift.status] || T2}20`, color: STATUS_COLORS[shift.status] || T2, flexShrink: 0 }}>{shift.status}</span>
        </div>
      </div>

      {/* Vacancy */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 14, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Users style={{ width: 16, height: 16, color: shift.vacancyLeft > 0 ? '#FBBF24' : '#34D399' }} />
          <span style={{ color: T1, fontSize: 16, fontWeight: 800 }}>{shift.activeBookings} / {shift.workersNeeded}</span>
          <span style={{ color: T2, fontSize: 13 }}>workers filled</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: shift.vacancyLeft > 0 ? '#FBBF24' : '#34D399' }}>
            {shift.vacancyLeft > 0 ? `${shift.vacancyLeft} vacancy left` : 'Full'}
          </span>
        </div>
      </div>

      {/* Key facts grid */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Fact icon={<Calendar style={{ width: 13, height: 13, color: T2 }} />} label="Date">{fmtDate(shift.date)}</Fact>
        <Fact icon={<Clock style={{ width: 13, height: 13, color: T2 }} />} label="Time">
          {shift.startTime}{shift.endTime ? `–${shift.endTime}` : ' (until done)'}
        </Fact>
        <Fact icon={<Clock style={{ width: 13, height: 13, color: T2 }} />} label="Duration">{shift.duration}h</Fact>
        <Fact icon={<IndianRupee style={{ width: 13, height: 13, color: T2 }} />} label="Payment">
          {shift.paymentStatus} · ₹{shift.paymentAmount ?? Math.round(shift.hourlyRate * shift.duration * shift.workersNeeded)}
        </Fact>
      </div>

      {/* Address */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: shift.mapLink ? 10 : 0 }}>
          <MapPin style={{ width: 14, height: 14, color: T2, marginTop: 2, flexShrink: 0 }} />
          <p style={{ color: T1, fontSize: 14, lineHeight: 1.45, margin: 0 }}>{shift.address}, {shift.city}</p>
        </div>
        {shift.mapLink && (
          <a href={shift.mapLink} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#60A5FA', textDecoration: 'none' }}>
            Open in Google Maps ↗
          </a>
        )}
      </div>

      {/* Employer */}
      {shift.employer && (
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Employer</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Building2 style={{ width: 14, height: 14, color: T2 }} />
            <span style={{ color: T1, fontSize: 14, fontWeight: 700 }}>{shift.employer.companyName || shift.employer.user.name}</span>
          </div>
          <a href={`tel:${shift.employer.user.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <Phone style={{ width: 14, height: 14, color: T2 }} />
            <span style={{ color: '#60A5FA', fontSize: 14, fontWeight: 600 }}>{shift.employer.user.phone}</span>
          </a>
        </div>
      )}

      {/* OTP */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Start-Shift OTP</p>
        {otp ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', letterSpacing: 6, color: T1 }}>{otp.otp}</span>
            <span style={{ fontSize: 11, color: T2, marginLeft: 'auto' }}>
              {otp.verified ? 'used ✓' : new Date(otp.expiresAt) > new Date() ? `valid until ${fmtTime(otp.expiresAt)}` : 'expired'}
            </span>
          </div>
        ) : (
          <button onClick={generateOtp}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60A5FA', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Generate OTP for this shift
          </button>
        )}
      </div>

      {/* Invoice / Bill */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
        <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Bill / Invoice</p>
        {invoice ? (
          <>
            <div style={{ background: '#000', border: `1px solid ${BD}`, borderRadius: 10, padding: 12, marginBottom: 10, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, color: T1 }}>
              {invoice.message}
            </div>
            {invoice.paymentLink && (
              <a href={invoice.paymentLink} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', marginBottom: 8, fontSize: 13, fontWeight: 700, color: '#60A5FA', wordBreak: 'break-all', textDecoration: 'none' }}>
                Open Razorpay link ↗ <span style={{ color: T2, fontWeight: 400 }}>{invoice.paymentLink}</span>
              </a>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={copyMessage}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Copy message
              </button>
              <button onClick={() => setInvoice(null)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T2, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Regenerate
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="number" min={0.5} step={0.5}
                value={hoursOverride}
                onChange={e => setHoursOverride(e.target.value)}
                placeholder={`Override hours (blank = bill actual minutes per worker)`}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${BD}`, background: '#000', color: T1, fontSize: 13, outline: 'none' }}
              />
            </div>
            <button onClick={generateInvoice} disabled={invoiceLoading}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#34D399', fontWeight: 700, fontSize: 13, cursor: invoiceLoading ? 'default' : 'pointer' }}>
              {invoiceLoading ? 'Generating…' : 'Generate Bill + Razorpay link'}
            </button>
          </>
        )}
      </div>

      {/* Assign worker (manual) — only show when there's still vacancy */}
      {shift.vacancyLeft > 0 && shift.status !== 'CANCELLED' && shift.status !== 'COMPLETED' && (
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
          <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>
            Assign Worker (manual)
          </p>
          <p style={{ color: T2, fontSize: 12, margin: '0 0 10px' }}>
            Attach a specific worker by phone — bypasses the swipe-accept flow. Optional start-time override is in 24-hr HH:MM.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="tel" inputMode="numeric" maxLength={10}
              value={assignPhone}
              onChange={e => setAssignPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit worker phone"
              style={{ flex: 2, padding: '10px 12px', borderRadius: 10, border: `1px solid ${BD}`, background: '#000', color: T1, fontSize: 13, outline: 'none' }}
            />
            <input
              type="text" maxLength={5}
              value={assignStartTime}
              onChange={e => setAssignStartTime(e.target.value)}
              placeholder="13:00"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1px solid ${BD}`, background: '#000', color: T1, fontSize: 13, outline: 'none' }}
            />
          </div>
          <button onClick={assignWorker} disabled={assignLoading || assignPhone.length !== 10}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60A5FA', fontWeight: 700, fontSize: 13, cursor: assignLoading || assignPhone.length !== 10 ? 'default' : 'pointer', opacity: assignLoading || assignPhone.length !== 10 ? 0.5 : 1 }}>
            {assignLoading ? 'Assigning…' : 'Assign Worker'}
          </button>
          {assignError && (
            <p style={{ color: '#F87171', fontSize: 12, fontWeight: 600, margin: '8px 0 0' }}>{assignError}</p>
          )}
        </div>
      )}

      {/* Bookings */}
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
            Bookings ({shift.bookings.length})
          </p>
          {shift.bookings.some(b => !b.checkInTime && b.status !== 'CANCELLED' && b.status !== 'COMPLETED') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: T2, fontSize: 10, fontWeight: 600 }}>Start at</span>
              <input
                type="text" maxLength={5}
                value={startTimerOverride}
                onChange={e => setStartTimerOverride(e.target.value)}
                placeholder="13:00"
                style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: `1px solid ${BD}`, background: '#000', color: T1, fontSize: 12, outline: 'none', textAlign: 'center', fontFamily: 'monospace' }}
              />
            </div>
          )}
        </div>
        {shift.bookings.length === 0
          ? <p style={{ color: T2, fontSize: 13, margin: 0 }}>No worker has accepted yet.</p>
          : shift.bookings.map(b => {
            const canStart = !b.checkInTime && b.status !== 'CANCELLED' && b.status !== 'COMPLETED'
            return (
              <div key={b.id} style={{ borderTop: `1px solid ${BD}`, paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: T1, fontWeight: 700, fontSize: 14 }}>{b.worker.user.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 16, background: `${STATUS_COLORS[b.status] || T2}20`, color: STATUS_COLORS[b.status] || T2 }}>{b.status}</span>
                </div>
                <a href={`tel:${b.worker.user.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', marginBottom: 6 }}>
                  <Phone style={{ width: 12, height: 12, color: T2 }} />
                  <span style={{ color: '#60A5FA', fontSize: 12 }}>{b.worker.user.phone}</span>
                </a>
                {b.checkInTime && (
                  <div style={{ padding: '6px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(34,197,94,0.9)' }}>ON SHIFT</span>
                      <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'monospace', color: T1 }}>{formatElapsed(b.checkInTime, b.checkOutTime)}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 10, color: T2 }}>since {fmtTime(b.checkInTime)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 10, color: T2 }}>
                      <span>Earned: <span style={{ color: '#34D399', fontWeight: 700 }}>₹{workerEarnedSoFar(b.checkInTime, b.checkOutTime).toLocaleString('en-IN')}</span></span>
                      <span>· Bill: <span style={{ color: T1, fontWeight: 700 }}>₹{billedSoFar(b.checkInTime, b.checkOutTime, shift.hourlyRate).toLocaleString('en-IN')}</span></span>
                    </div>
                  </div>
                )}
                {canStart && (
                  <button
                    onClick={() => startBookingTimer(b.id)}
                    disabled={startTimerLoading === b.id}
                    style={{
                      marginTop: 6, width: '100%', padding: '8px 12px',
                      borderRadius: 10, border: '1px solid rgba(34,197,94,0.35)',
                      background: 'rgba(34,197,94,0.10)', color: '#34D399',
                      fontWeight: 800, fontSize: 12,
                      cursor: startTimerLoading === b.id ? 'default' : 'pointer',
                      opacity: startTimerLoading === b.id ? 0.5 : 1,
                    }}>
                    {startTimerLoading === b.id ? 'Starting…' : `▶ Start timer @ ${startTimerOverride || 'now'}`}
                  </button>
                )}
              </div>
            )
          })
        }
      </div>
    </Frame>
  )
}

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {icon}
        <span style={{ color: T2, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <p style={{ color: T1, fontSize: 14, fontWeight: 700, margin: 0 }}>{children}</p>
    </div>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">{children}</div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
