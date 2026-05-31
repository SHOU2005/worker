'use client'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import TopBar from '@/components/shared/TopBar'
import { useLanguage } from '../LanguageContext'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.5)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface Employer { id: string; name: string; phone: string; employerProfile: { companyName: string | null; verifiedByOpsAt: string | null; totalShifts: number } | null }
interface Worker   { id: string; name: string; phone: string; workerProfile:   { kycStatus: string; totalShifts: number; city: string | null } | null }

export default function ReferralsPage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const [tab,       setTab]       = useState<'employers' | 'workers'>('employers')
  const [employers, setEmployers] = useState<Employer[]>([])
  const [workers,   setWorkers]   = useState<Worker[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/captain/referrals').then(r => {
      if (r.status === 401) { router.replace('/captain/login'); return null }
      return r.json()
    }).then(d => {
      if (!d) return
      setEmployers(d.employers || [])
      setWorkers(d.workers || [])
    }).finally(() => setLoading(false))
  }, [router])

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('myReferrals')} />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '0 20px' }}>
        {(['employers', 'workers'] as const).map(tabKey => (
          <button key={tabKey} onClick={() => setTab(tabKey)} style={{ flex: 1, padding: '14px 0', fontWeight: 700, fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', color: tab === tabKey ? T1 : T2, borderBottom: tab === tabKey ? `2px solid ${T1}` : '2px solid transparent' }}>
            {tabKey === 'employers' ? `${t('employers')} (${employers.length})` : `${t('workers')} (${workers.length})`}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {loading ? (
          <ListRowSkeleton count={5} dark />
        ) : tab === 'employers' ? (
          employers.length === 0
            ? <p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>{t('noEmployers')}</p>
            : employers.map(e => (
              <div key={e.id} style={{ background: '#F5F5F5', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, color: T1, margin: 0, fontSize: 15 }}>{e.name}</p>
                    <p style={{ color: T2, margin: '2px 0', fontSize: 13 }}>{e.employerProfile?.companyName || '—'} · {e.phone}</p>
                    <p style={{ color: T2, margin: 0, fontSize: 12 }}>{e.employerProfile?.totalShifts ?? 0} {t('shiftsPosted')}</p>
                  </div>
                  {e.employerProfile?.verifiedByOpsAt ? (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#DCFCE7', color: '#15803D' }}>
                      {t('verified')}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#FEF3C7', color: '#92400E' }}>
                      {t('pending')}
                    </span>
                  )}
                </div>
              </div>
            ))
        ) : (
          workers.length === 0
            ? <p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>{t('noWorkers')}</p>
            : workers.map(w => (
              <div key={w.id} style={{ background: '#F5F5F5', borderRadius: 14, padding: '14px 16px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontWeight: 700, color: T1, margin: 0, fontSize: 15 }}>{w.name}</p>
                    <p style={{ color: T2, margin: '2px 0', fontSize: 13 }}>{w.phone} · {w.workerProfile?.city || '—'}</p>
                    <p style={{ color: T2, margin: 0, fontSize: 12 }}>{w.workerProfile?.totalShifts ?? 0} {t('shiftsDone')}</p>
                  </div>
                  {(() => {
                    // Normalize the raw enum (PENDING/APPROVED/REJECTED) into
                    // colour-coded badges that match the employer side. The
                    // previous render leaked the raw enum string at the user.
                    const k = w.workerProfile?.kycStatus
                    const meta = k === 'APPROVED'
                      ? { bg: '#DCFCE7', fg: '#15803D', label: t('verified') }
                      : k === 'REJECTED'
                      ? { bg: '#FEE2E2', fg: '#991B1B', label: 'Rejected' }
                      : { bg: '#FEF3C7', fg: '#92400E', label: t('pending') }
                    return (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: meta.bg, color: meta.fg }}>
                        {meta.label}
                      </span>
                    )
                  })()}
                </div>
              </div>
            ))
        )}
      </div>

      <CaptainBottomNav />
    </div>
  )
}
