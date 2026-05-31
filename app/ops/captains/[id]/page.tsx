'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { Phone, MessageCircle, MapPin, Calendar, IndianRupee, Briefcase, Users, CheckCircle2, Clock } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const S2='#141414';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

const STATUS_COLOR: Record<string, string> = { PENDING: '#FBBF24', ACTIVE: '#34D399', SUSPENDED: '#F87171' }
const COMM_COLOR:   Record<string, string> = { PENDING: '#FBBF24', PAID: '#34D399', CANCELLED: '#F87171' }

const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n || 0).toLocaleString('en-IN')}`
const waLink = (phone: string) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}`

export default function CaptainDetailPage() {
  const router = useRouter(); const { id } = useParams<{ id: string }>()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [task,    setTask]    = useState({ title: '', description: '', dueDate: '' })
  const [saving,  setSaving]  = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  async function refresh() {
    const d = await fetch(`/api/ops/captains/${id}`).then(r => r.json())
    if (d?.captain) setData(d.captain)
  }

  useEffect(() => {
    fetch(`/api/ops/captains/${id}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setData(d.captain) }).finally(() => setLoading(false))
  }, [id, router])

  async function assignTask() {
    if (!task.title) return
    setSaving(true)
    await fetch(`/api/ops/captains/${id}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) })
    setSaving(false); setTask({ title: '', description: '', dueDate: '' })
    await refresh()
  }

  async function setStatus(status: string) {
    setStatusBusy(true)
    await fetch(`/api/ops/captains/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    await refresh()
    setStatusBusy(false)
  }

  if (loading) return <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T2 }}>Loading…</div>
  if (!data)   return <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T2 }}>Not found</div>

  const phone = data.user?.phone || ''
  const pendingTasks = (data.tasks || []).filter((t: any) => t.status === 'OPEN').length

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0, maxWidth: 760 }} className="ops-content">
        <a href="/ops/captains" style={{ color: T2, fontSize: 13, textDecoration: 'none' }}>← Captains</a>

        {/* Header card */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 18, padding: '18px 18px', margin: '12px 0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: -0.5 }}>{data.user.name || '—'}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, color: T2, fontSize: 13 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone style={{ width: 11, height: 11 }} />{phone}</span>
                {data.territory && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin style={{ width: 11, height: 11 }} />{data.territory}</span>}
                {data.joinedAt && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar style={{ width: 11, height: 11 }} />Joined {new Date(data.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
            </div>
            <span style={{ padding: '6px 14px', borderRadius: 20, background: `${STATUS_COLOR[data.status] || T2}20`, color: STATUS_COLOR[data.status] || T2, fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{data.status}</span>
          </div>

          {/* Quick actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`tel:${phone}`} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Phone style={{ width: 13, height: 13 }} />Call</a>
            <a href={waLink(phone)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#34D399', fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><MessageCircle style={{ width: 13, height: 13 }} />WhatsApp</a>
            {data.status === 'PENDING'   && <button disabled={statusBusy} onClick={() => setStatus('ACTIVE')}    style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#34D399', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Activate</button>}
            {data.status === 'ACTIVE'    && <button disabled={statusBusy} onClick={() => setStatus('SUSPENDED')} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Suspend</button>}
            {data.status === 'SUSPENDED' && <button disabled={statusBusy} onClick={() => setStatus('ACTIVE')}    style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#34D399', color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reactivate</button>}
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Employers', value: data.employersOnboarded || 0,             Icon: Briefcase },
            { label: 'Workers',   value: data.workersOnboarded || 0,               Icon: Users },
            { label: 'Earned',    value: fmt(data.totalEarnings || 0),              Icon: IndianRupee },
            { label: 'Pending',   value: fmt(data.pendingPayout || 0),              Icon: Clock },
          ].map(({ label, value, Icon }) => (
            <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <Icon style={{ width: 13, height: 13, color: T2, marginBottom: 4 }} />
              <p style={{ color: T1, fontWeight: 800, fontSize: 16, margin: 0, letterSpacing: -0.5 }}>{value}</p>
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Tasks list */}
        {data.tasks?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Tasks</p>
              <p style={{ color: pendingTasks > 0 ? '#FBBF24' : T2, fontSize: 11, margin: 0, fontWeight: 600 }}>{pendingTasks} open · {data.tasks.length} total</p>
            </div>
            {data.tasks.map((t: any) => (
              <div key={t.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: T1, fontSize: 14, margin: 0, fontWeight: 600 }}>{t.title}</p>
                  {t.description && <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>{t.description}</p>}
                  {t.dueDate && <p style={{ color: T2, fontSize: 11, margin: '4px 0 0' }}>Due {new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>}
                </div>
                <span style={{ fontSize: 11, color: t.status === 'OPEN' ? '#FBBF24' : '#34D399', background: t.status === 'OPEN' ? '#FBBF2420' : '#34D39920', padding: '4px 10px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>{t.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Assign task */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px', marginBottom: 18 }}>
          <p style={{ color: T1, fontWeight: 700, margin: '0 0 12px' }}>Assign Task</p>
          <input style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 14px', color: T1, fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} placeholder="Task title *" value={task.title} onChange={e => setTask(p => ({ ...p, title: e.target.value }))} />
          <input style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 14px', color: T1, fontSize: 14, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} placeholder="Description (optional)" value={task.description} onChange={e => setTask(p => ({ ...p, description: e.target.value }))} />
          <input style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 14px', color: T1, fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} type="date" value={task.dueDate} onChange={e => setTask(p => ({ ...p, dueDate: e.target.value }))} />
          <button onClick={assignTask} disabled={saving || !task.title} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: T1, color: '#000000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{saving ? 'Assigning…' : 'Assign Task'}</button>
        </div>

        {/* Commissions */}
        {data.commissions?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Recent Commissions</p>
            {data.commissions.slice(0, 10).map((c: any) => (
              <div key={c.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: T1, fontSize: 14, margin: 0, fontWeight: 600 }}>{c.booking?.shift?.title || 'Booking'}</p>
                  <p style={{ color: T2, fontSize: 11, margin: '2px 0 0' }}>{c.booking?.shift?.date ? new Date(c.booking.shift.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : new Date(c.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 14, margin: 0 }}>{fmt(c.amount)}</p>
                  <span style={{ fontSize: 10, color: COMM_COLOR[c.status] || T2, fontWeight: 700 }}>{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Onboarded leads — workers */}
        {data.onboardedWorkers?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Workers onboarded</p>
              <p style={{ color: T2, fontSize: 11, margin: 0 }}>{data.onboardedWorkers.length}</p>
            </div>
            {data.onboardedWorkers.slice(0, 20).map((u: any) => (
              <div key={u.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: T1, fontSize: 14, margin: 0, fontWeight: 600 }}>{u.name || 'Worker'}</p>
                    <p style={{ color: T2, fontSize: 11, margin: '2px 0 0' }}>
                      {u.phone}{u.workerProfile?.city ? ` · ${u.workerProfile.city}` : ''} · {u.workerProfile?.totalShifts ?? 0} shift{u.workerProfile?.totalShifts === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                    background: u.workerProfile?.kycStatus === 'APPROVED' ? '#34D39920' : u.workerProfile?.kycStatus === 'REJECTED' ? '#F8717120' : '#FBBF2420',
                    color:      u.workerProfile?.kycStatus === 'APPROVED' ? '#34D399'   : u.workerProfile?.kycStatus === 'REJECTED' ? '#F87171'   : '#FBBF24' }}>
                    {u.workerProfile?.kycStatus || 'PENDING'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Onboarded leads — employers */}
        {data.onboardedEmployers?.length > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>Employers onboarded</p>
              <p style={{ color: T2, fontSize: 11, margin: 0 }}>{data.onboardedEmployers.length}</p>
            </div>
            {data.onboardedEmployers.slice(0, 20).map((u: any) => (
              <div key={u.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: T1, fontSize: 14, margin: 0, fontWeight: 600 }}>{u.employerProfile?.companyName || u.name || 'Employer'}</p>
                    <p style={{ color: T2, fontSize: 11, margin: '2px 0 0' }}>
                      {u.phone}{u.employerProfile?.city ? ` · ${u.employerProfile.city}` : ''} · {u.employerProfile?.totalShifts ?? 0} shift{u.employerProfile?.totalShifts === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                    background: u.employerProfile?.verifiedByOpsAt ? '#34D39920' : '#FBBF2420',
                    color:      u.employerProfile?.verifiedByOpsAt ? '#34D399'   : '#FBBF24' }}>
                    {u.employerProfile?.verifiedByOpsAt ? 'VERIFIED' : 'PENDING'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Attendance */}
        {data.attendances?.length > 0 && (
          <div>
            <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Attendance (Last 10)</p>
            {data.attendances.slice(0, 10).map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${BD}` }}>
                <p style={{ color: T1, fontSize: 14, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {a.checkInTime ? <CheckCircle2 style={{ width: 13, height: 13, color: '#34D399' }} /> : <Clock style={{ width: 13, height: 13, color: T2 }} />}
                  {new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </p>
                <p style={{ color: T2, fontSize: 13, margin: 0 }}>
                  {a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'} – {a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
