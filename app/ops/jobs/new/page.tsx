'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { Briefcase, Zap, CheckCircle, Loader2 } from 'lucide-react'

const FONT = '"DM Sans", system-ui, sans-serif'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.45)'
const BD   = 'rgba(255,255,255,0.08)'
const S1   = '#0F0F0F'

interface EmployerOpt {
  id: string
  user: { name: string; phone: string }
  companyName: string | null
  city: string | null
}

const ROLES = [
  'Shop Helper', 'Delivery', 'Security Guard', 'Kitchen Helper',
  'Warehouse Staff', 'Cleaning Staff', 'Driver', 'Construction',
  'Packing Staff', 'Cashier', 'Office Work',
]

export default function OpsPostJobPage() {
  const router = useRouter()
  const [employers, setEmployers] = useState<EmployerOpt[]>([])
  const [loadingEmployers, setLoadingEmployers] = useState(true)

  // Form — choose between picking an existing employer or creating a new one inline
  const [employerMode, setEmployerMode] = useState<'existing' | 'new'>('existing')
  const [employerProfileId, setEmployerProfileId] = useState('')
  const [newEmpName,  setNewEmpName]  = useState('')
  const [newEmpPhone, setNewEmpPhone] = useState('')
  const [newEmpCity,  setNewEmpCity]  = useState('')
  const [newEmpCompany, setNewEmpCompany] = useState('')
  const [title,    setTitle]    = useState('')
  const [role,     setRole]     = useState(ROLES[0])
  const [address,  setAddress]  = useState('')
  const [mapLink,  setMapLink]  = useState('')
  const [city,     setCity]     = useState('Gurgaon')
  const [date,     setDate]     = useState(() => new Date().toISOString().slice(0, 10))
  const [startTime,setStartTime]= useState('09:00')
  // Empty string = open-ended shift, runs until the worker checks out.
  const [endTime,  setEndTime]  = useState('')
  const [duration, setDuration] = useState(8)
  const [needed,   setNeeded]   = useState(1)
  const [rate,     setRate]     = useState(200)
  const [urgent,   setUrgent]   = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    fetch('/api/ops/employers').then(r => r.json()).then(d => {
      setEmployers(d.employers || [])
      if (d.employers?.[0]) setEmployerProfileId(d.employers[0].id)
    }).catch(() => setError('Failed to load employers'))
      .finally(() => setLoadingEmployers(false))
  }, [])

  // Auto-compute duration from start/end time
  useEffect(() => {
    if (!startTime || !endTime) return
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    if (mins > 0) setDuration(Math.round(mins / 60))
  }, [startTime, endTime])

  const employerOk = employerMode === 'existing'
    ? employerProfileId.length > 0
    : (newEmpName.trim().length >= 2 && /^\d{10}$/.test(newEmpPhone))
  const ok =
    employerOk && title.trim().length >= 3 && address.trim().length >= 3 &&
    city.trim().length >= 2 && duration > 0 && rate >= 50 && needed >= 1

  async function submit() {
    if (!ok) return
    setSubmitting(true); setError('')
    try {
      // We use a fixed Gurgaon default lat/lng since ops typically posts before exact geocode
      const lat = 19.076, lng = 72.877
      const res = await fetch('/api/ops/shifts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          ...(employerMode === 'existing'
            ? { employerProfileId }
            : {
                newEmployerName:    newEmpName.trim(),
                newEmployerPhone:   newEmpPhone.trim(),
                newEmployerCity:    newEmpCity.trim() || city.trim(),
                newEmployerCompany: newEmpCompany.trim() || undefined,
              }),
          title: title.trim(), role,
          address: address.trim(), city: city.trim(), lat, lng,
          ...(mapLink.trim() ? { mapLink: mapLink.trim() } : {}),
          date, startTime, endTime: endTime || null, duration, workersNeeded: needed,
          hourlyRate: rate, isUrgent: urgent,
          markPaid: true,  // OPS-posted jobs go live immediately
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Failed to post job'); return }
      setDone(true)
      setTimeout(() => router.push('/ops/bookings'), 1400)
    } catch { setError('Network error') }
    setSubmitting(false)
  }

  return (
    <div style={{ fontFamily: FONT, background: '#000', minHeight: '100vh', color: T1, paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />

      <div style={{ padding: '20px 20px 0' }} className="ops-content">
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: T2, fontSize: 13, margin: 0 }}>Operations</p>
          <p style={{ color: T1, fontWeight: 800, fontSize: 24, margin: '2px 0 0', letterSpacing: -0.5 }}>Post a Job</p>
          <p style={{ color: T2, fontSize: 12, marginTop: 2 }}>Create a shift on behalf of an employer</p>
        </div>

        {done ? (
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 16, padding: '20px 24px', textAlign: 'center' }}>
            <CheckCircle style={{ width: 32, height: 32, color: '#22C55E', margin: '0 auto 8px', display: 'block' }} />
            <p style={{ fontSize: 18, fontWeight: 800, color: '#FFF', margin: '0 0 4px' }}>Job posted</p>
            <p style={{ fontSize: 13, color: T2 }}>Redirecting to bookings…</p>
          </div>
        ) : (
          <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 18, padding: 18, maxWidth: 720 }}>

            <div style={{ marginBottom: 14 }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>Employer</p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {(['existing', 'new'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setEmployerMode(m)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                      border: `1px solid ${employerMode === m ? T1 : BD}`,
                      background: employerMode === m ? T1 : 'transparent',
                      color: employerMode === m ? '#000' : T2, cursor: 'pointer',
                    }}>
                    {m === 'existing' ? 'Existing employer' : 'New employer (name + phone)'}
                  </button>
                ))}
              </div>
              {employerMode === 'existing' ? (
                loadingEmployers
                  ? <p style={{ color: T2, fontSize: 14 }}>Loading employers…</p>
                  : employers.length === 0
                    ? <p style={{ color: T2, fontSize: 13 }}>No employers yet — switch to &quot;New employer&quot; to create one inline.</p>
                    : <select value={employerProfileId} onChange={e => setEmployerProfileId(e.target.value)} style={selectStyle}>
                        <option value="" style={{ color: '#000' }}>— Select employer —</option>
                        {employers.map(e => (
                          <option key={e.id} value={e.id} style={{ color: '#000' }}>
                            {e.companyName ?? e.user.name} · {e.city ?? '—'} · {e.user.phone}
                          </option>
                        ))}
                      </select>
              ) : (
                <div>
                  <Row>
                    <Field label="Employer name *">
                      <input value={newEmpName} onChange={e => setNewEmpName(e.target.value)} placeholder="Owner / contact person" style={inputStyle} />
                    </Field>
                    <Field label="Phone (10-digit) *">
                      <input value={newEmpPhone} onChange={e => setNewEmpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" style={inputStyle} inputMode="numeric" />
                    </Field>
                  </Row>
                  <Row>
                    <Field label="Company name (optional)">
                      <input value={newEmpCompany} onChange={e => setNewEmpCompany(e.target.value)} placeholder="Shop / business name" style={inputStyle} />
                    </Field>
                    <Field label="Employer city (optional)">
                      <input value={newEmpCity} onChange={e => setNewEmpCity(e.target.value)} placeholder="Defaults to job city" style={inputStyle} />
                    </Field>
                  </Row>
                  <p style={{ fontSize: 11, color: T2, marginTop: 6 }}>
                    A new employer account will be created. They can later log in via OTP using the phone you enter here.
                  </p>
                </div>
              )}
            </div>

            <Row>
              <Field label="Job Title">
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Warehouse Packer"
                  style={inputStyle} />
              </Field>
              <Field label="Role">
                <select value={role} onChange={e => setRole(e.target.value)} style={selectStyle}>
                  {ROLES.map(r => <option key={r} value={r} style={{ color: '#000' }}>{r}</option>)}
                </select>
              </Field>
            </Row>

            <Field label="Address">
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address with landmark"
                style={inputStyle} />
            </Field>

            <Field label="Map Link (optional — paste a Google Maps share link for exact location)">
              <input value={mapLink} onChange={e => setMapLink(e.target.value)} placeholder="https://maps.app.goo.gl/… or https://www.google.com/maps/place/…"
                style={inputStyle} />
            </Field>

            <Row>
              <Field label="City">
                <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Date">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </Field>
            </Row>

            <Row>
              <Field label="Start time">
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="End time (optional — leave blank for open-ended)">
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Hours">
                <input type="number" min={1} max={24} value={duration} onChange={e => setDuration(parseInt(e.target.value || '0'))} style={inputStyle} />
              </Field>
            </Row>

            <Row>
              <Field label="Workers needed">
                <input type="number" min={1} max={50} value={needed} onChange={e => setNeeded(parseInt(e.target.value || '1'))} style={inputStyle} />
              </Field>
              <Field label="Hourly rate (₹)">
                <input type="number" min={50} max={2000} value={rate} onChange={e => setRate(parseInt(e.target.value || '200'))} style={inputStyle} />
              </Field>
            </Row>

            <button onClick={() => setUrgent(u => !u)}
              style={{
                width: '100%', height: 48, borderRadius: 12,
                background: urgent ? 'rgba(245,197,24,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${urgent ? 'rgba(245,197,24,0.4)' : BD}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                color: urgent ? '#F5C518' : T2, fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16,
              }}>
              <Zap style={{ width: 16, height: 16 }} />
              {urgent ? 'Urgent (broadcast to all eligible workers)' : 'Mark as urgent'}
            </button>

            {error && (
              <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#FCA5A5', margin: 0 }}>{error}</p>
              </div>
            )}

            <button onClick={submit} disabled={!ok || submitting}
              style={{
                width: '100%', height: 52, borderRadius: 14, fontSize: 15, fontWeight: 800, border: 'none',
                background: ok ? '#FFFFFF' : 'rgba(255,255,255,0.1)',
                color: ok ? '#000000' : 'rgba(255,255,255,0.3)',
                cursor: ok && !submitting ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {submitting ? <><Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Posting…</> : <><Briefcase style={{ width: 16, height: 16 }} /> Post Job</>}
            </button>
          </div>
        )}
      </div>

      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, flex: 1 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', gap: 10 }}>{children}</div>
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`,
  color: T1, fontSize: 14, fontWeight: 500, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none', backgroundImage: 'linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.4) 50%), linear-gradient(135deg, rgba(255,255,255,0.4) 50%, transparent 50%)',
  backgroundPosition: 'right 14px top 18px, right 9px top 18px',
  backgroundSize: '5px 5px, 5px 5px',
  backgroundRepeat: 'no-repeat',
  paddingRight: 28,
}
