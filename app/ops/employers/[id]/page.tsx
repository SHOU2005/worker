'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

const SHIFT_COLOR: Record<string, string> = { OPEN: '#34D399', CLOSED: '#F87171', IN_PROGRESS: '#60A5FA', COMPLETED: '#FBBF24' }

interface Shift {
  id: string; title: string; status: string; startTime: string; workersNeeded: number
  bookings: { id: string; status: string }[]
}
interface Employer {
  id: string; companyName: string | null; businessType: string | null; city: string | null
  address: string | null; gstNumber: string | null; totalShifts: number; rating: number
  verifiedByOpsAt: string | null; captainReferralId: string | null
  user: { id: string; name: string; phone: string; isActive: boolean; createdAt: string }
  shifts: Shift[]
}

export default function EmployerDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [employer,  setEmployer]  = useState<Employer | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [toggling,  setToggling]  = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    fetch(`/api/ops/employers/${id}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d?.employer) setEmployer(d.employer) }).finally(() => setLoading(false))
  }, [id, router])

  async function verify() {
    setVerifying(true)
    await fetch(`/api/ops/employers/${id}/verify`, { method: 'PATCH' })
    setEmployer(prev => prev ? { ...prev, verifiedByOpsAt: new Date().toISOString() } : prev)
    setVerifying(false)
  }

  async function toggleSuspend() {
    if (!employer) return
    setToggling(true)
    await fetch(`/api/ops/employers/${id}/suspend`, { method: 'PATCH' })
    setEmployer(prev => prev ? { ...prev, user: { ...prev.user, isActive: !prev.user.isActive } } : prev)
    setToggling(false)
  }

  if (loading) return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ color: T2, textAlign: 'center', paddingTop: 60 }}>Loading…</div>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )

  if (!employer) return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T2, textAlign: 'center', paddingTop: 60 }}>Employer not found</p>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0, maxWidth: 700 }} className="ops-content">

        {/* Back */}
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: T1, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16, paddingTop: 'env(safe-area-inset-top,0px)' }}>← Back</button>

        {/* Header card */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <p style={{ color: T1, fontWeight: 800, fontSize: 20, margin: 0 }}>{employer.companyName || employer.user.name}</p>
              <p style={{ color: T2, fontSize: 14, margin: '4px 0 0' }}>{employer.user.phone} · {employer.city || '—'}</p>
              {employer.businessType && <p style={{ color: T2, fontSize: 13, margin: '2px 0 0' }}>{employer.businessType}</p>}
            </div>
            {employer.verifiedByOpsAt
              ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#34D39920', color: '#34D399' }}>Verified</span>
              : <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#FBBF2420', color: '#FBBF24' }}>Unverified</span>
            }
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Shifts', value: employer.totalShifts },
              { label: 'Rating', value: employer.rating > 0 ? `${employer.rating.toFixed(1)} ★` : '—' },
              { label: 'Status', value: employer.user.isActive ? 'Active' : 'Suspended' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#1A1A1A', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <p style={{ color: T2, fontSize: 11, margin: '0 0 2px' }}>{label}</p>
                <p style={{ color: T1, fontWeight: 700, fontSize: 16, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Extra info */}
          {employer.address && <p style={{ color: T2, fontSize: 13, margin: '0 0 6px' }}>📍 {employer.address}</p>}
          {employer.gstNumber && <p style={{ color: T2, fontSize: 13, margin: '0 0 6px' }}>GST: {employer.gstNumber}</p>}
          {employer.captainReferralId && (
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#2563EB20', color: '#2563EB', display: 'inline-block', marginBottom: 12 }}>Captain Referred</span>
          )}
          {employer.verifiedByOpsAt && <p style={{ color: T2, fontSize: 12, margin: '0 0 12px' }}>Verified on {new Date(employer.verifiedByOpsAt).toLocaleDateString('en-IN')}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            {!employer.verifiedByOpsAt && (
              <button onClick={verify} disabled={verifying} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {verifying ? '…' : 'Verify Business ✓'}
              </button>
            )}
            <button onClick={toggleSuspend} disabled={toggling} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${employer.user.isActive ? '#F87171' : '#34D399'}`, background: 'transparent', color: employer.user.isActive ? '#F87171' : '#34D399', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {toggling ? '…' : employer.user.isActive ? 'Suspend' : 'Unsuspend'}
            </button>
          </div>
        </div>

        {/* Shift history */}
        <p style={{ color: T1, fontWeight: 700, fontSize: 16, margin: '0 0 12px' }}>Shift History</p>
        {employer.shifts.length === 0
          ? <p style={{ color: T2, fontSize: 14, textAlign: 'center', paddingTop: 20 }}>No shifts posted yet</p>
          : employer.shifts.map(s => {
            const filled = s.bookings.filter(b => ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(b.status)).length
            return (
              <div key={s.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ color: T1, fontWeight: 600, fontSize: 14, margin: 0 }}>{s.title}</p>
                    <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>{s.startTime} · {filled}/{s.workersNeeded} filled</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${SHIFT_COLOR[s.status] || T2}20`, color: SHIFT_COLOR[s.status] || T2 }}>{s.status}</span>
                </div>
              </div>
            )
          })
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
