'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Employer { id: string; companyName: string | null; businessType: string | null; city: string | null; totalShifts: number; verifiedByOpsAt: string | null; user: { name: string; phone: string; isActive: boolean } }

export default function EmployersPage() {
  const router = useRouter()
  const [employers, setEmployers] = useState<Employer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('ALL')

  useEffect(() => {
    const q = filter === 'VERIFIED' ? '?verified=true' : filter === 'UNVERIFIED' ? '?verified=false' : ''
    fetch(`/api/ops/employers${q}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setEmployers(d.employers || []) }).finally(() => setLoading(false))
  }, [filter, router])

  async function verify(id: string) {
    await fetch(`/api/ops/employers/${id}/verify`, { method: 'PATCH' })
    setEmployers(prev => prev.map(e => e.id === id ? { ...e, verifiedByOpsAt: new Date().toISOString() } : e))
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Employers</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['ALL', 'UNVERIFIED', 'VERIFIED'].map(f => (
            <button key={f} onClick={() => { setLoading(true); setFilter(f) }} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2 }}>{f}</button>
          ))}
        </div>
        {loading ? <ListRowSkeleton count={6} dark /> :
          employers.map(e => (
            <div key={e.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
              <div onClick={() => router.push(`/ops/employers/${e.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: !e.verifiedByOpsAt ? 10 : 0, cursor: 'pointer' }}>
                <div>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: 0 }}>{e.companyName || e.user.name}</p>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{e.user.phone} · {e.city || '—'} · {e.businessType || '—'}</p>
                  <p style={{ color: T2, fontSize: 12, margin: 0 }}>{e.totalShifts} shifts posted</p>
                </div>
                {e.verifiedByOpsAt
                  ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#34D39920', color: '#34D399' }}>Verified</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#FBBF2420', color: '#FBBF24' }}>Pending</span>
                }
              </div>
              {!e.verifiedByOpsAt && (
                <button onClick={() => verify(e.id)} style={{ width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Verify Business ✓
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
