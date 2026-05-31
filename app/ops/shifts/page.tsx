'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Briefcase, Users, MapPin, Clock, Plus } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface ShiftRow {
  id: string; title: string; role: string; address: string; city: string
  mapLink: string | null
  date: string; startTime: string; endTime: string | null; duration: number
  hourlyRate: number; isUrgent: boolean
  status: string; paymentStatus: string; paymentAmount: number | null
  workersNeeded: number; activeBookings: number; vacancyLeft: number
  employer: { name: string | null; phone: string | null; company: string | null }
  source: 'ops' | 'employer'
  createdAt: string
}

const STATUS_COLORS: Record<string, string> = {
  OPEN:        '#34D399',
  SEARCHING:   '#34D399',
  ASSIGNED:    '#60A5FA',
  IN_PROGRESS: '#FFFFFF',
  COMPLETED:   '#9CA3AF',
  CANCELLED:   '#F87171',
}

export default function OpsShiftsPage() {
  const router = useRouter()
  const [shifts,  setShifts]  = useState<ShiftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('ALL')

  useEffect(() => {
    const q = filter === 'ALL' ? '' : `?status=${filter}`
    fetch(`/api/ops/shifts${q}`, { cache: 'no-store' })
      .then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setShifts(d.shifts || []) })
      .finally(() => setLoading(false))
  }, [filter, router])

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: 'env(safe-area-inset-top,0px)' }}>
          <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0 }}>Shifts</p>
          <button onClick={() => router.push('/ops/jobs/new')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: T1, color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Plus style={{ width: 14, height: 14 }} /> Post Job
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
          {['ALL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(f => (
            <button key={f} onClick={() => { setLoading(true); setFilter(f) }}
              style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {f}
            </button>
          ))}
        </div>

        {loading ? <ListRowSkeleton count={6} dark />
          : shifts.length === 0 ? <div style={{ color: T2, textAlign: 'center', paddingTop: 40, fontSize: 14 }}>No shifts in this view.</div>
          : shifts.map(s => (
            <div key={s.id}
              onClick={() => router.push(`/ops/shifts/${s.id}`)}
              role="button"
              style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', transition: 'border-color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = BD)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: 0 }}>{s.title}</p>
                    {s.isUrgent && <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'rgba(251,191,36,0.15)', color: '#FBBF24' }}>URGENT</span>}
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: s.source === 'ops' ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)', color: s.source === 'ops' ? '#60A5FA' : '#A78BFA' }}>
                      {s.source === 'ops' ? 'OPS POSTED' : 'EMPLOYER POSTED'}
                    </span>
                  </div>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{s.employer.company || s.employer.name} · {s.employer.phone}</p>
                  <p style={{ color: T2, fontSize: 12, margin: 0 }}>{new Date(s.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · {s.startTime}{s.endTime ? `–${s.endTime}` : ' (until done)'} · ₹{s.paymentAmount ?? Math.round(s.hourlyRate * s.duration * s.workersNeeded)}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${STATUS_COLORS[s.status] || T2}20`, color: STATUS_COLORS[s.status] || T2, flexShrink: 0 }}>{s.status}</span>
              </div>

              {/* Vacancy strip */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 10, background: s.vacancyLeft > 0 ? 'rgba(251,191,36,0.08)' : 'rgba(34,197,94,0.08)', border: `1px solid ${s.vacancyLeft > 0 ? 'rgba(251,191,36,0.25)' : 'rgba(34,197,94,0.25)'}`, marginBottom: 8 }}>
                <Users style={{ width: 14, height: 14, color: s.vacancyLeft > 0 ? '#FBBF24' : '#34D399' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T1 }}>
                  {s.activeBookings} / {s.workersNeeded} filled
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: s.vacancyLeft > 0 ? '#FBBF24' : '#34D399' }}>
                  {s.vacancyLeft > 0 ? `${s.vacancyLeft} left` : 'Full'}
                </span>
              </div>

              {/* Address + map */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <MapPin style={{ width: 13, height: 13, color: T2, marginTop: 2, flexShrink: 0 }} />
                <p style={{ color: T2, fontSize: 12, lineHeight: 1.4, margin: 0, flex: 1 }}>{s.address}, {s.city}</p>
                {s.mapLink && (
                  <a href={s.mapLink} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 700, color: '#60A5FA', textDecoration: 'none', flexShrink: 0 }}>
                    Open Map ↗
                  </a>
                )}
              </div>
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
