'use client'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import { useLanguage } from '../LanguageContext'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.5)'
const FONT = '"DM Sans", system-ui, sans-serif'

type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID'
interface Commission {
  id: string; amount: number; status: CommissionStatus; createdAt: string
  booking: { shift: { title: string; date: string }; employer: { name: string } }
}

const STATUS_COLORS: Record<CommissionStatus, { bg: string; text: string }> = {
  PENDING:  { bg: '#F5F5F5', text: '#111111' },
  APPROVED: { bg: '#F5F5F5', text: '#111111' },
  PAID:     { bg: '#F0FDF4', text: '#15803D' },
}

export default function CommissionsPage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const [tab,         setTab]         = useState<CommissionStatus>('PENDING')
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [summary,     setSummary]     = useState({ pendingPayout: 0, totalEarnings: 0, earnedThisMonth: 0 })
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    fetch(`/api/captain/commissions?status=${tab}`).then(r => {
      if (r.status === 401) { router.replace('/captain/login'); return null }
      return r.json()
    }).then(d => {
      if (!d) return
      setCommissions(d.commissions || [])
      setSummary({ pendingPayout: d.pendingPayout, totalEarnings: d.totalEarnings, earnedThisMonth: d.earnedThisMonth })
    }).finally(() => setLoading(false))
  }, [tab, router])

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('commissions')} />

      {/* Summary strip */}
      <div style={{ background: T1, padding: '16px 20px', display: 'flex', justifyContent: 'space-between' }}>
        {[
          { label: t('thisMonth'), value: `₹${summary.earnedThisMonth}` },
          { label: t('pending'),   value: `₹${summary.pendingPayout}` },
          { label: t('allTime'),   value: `₹${summary.totalEarnings}` },
        ].map(({ label, value }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, margin: 0 }}>{label}</p>
            <p style={{ color: '#FFFFFF', fontWeight: 800, fontSize: 18, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs — clear the list on switch. Without this, the previously-loaded
          tab's commissions stay rendered for the duration of the new fetch,
          and a captain glancing at "PAID" briefly sees PENDING rows
          mislabelled, which destroys trust in the page. */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '0 20px' }}>
        {(['PENDING', 'APPROVED', 'PAID'] as CommissionStatus[]).map(tab_ => (
          <button key={tab_} onClick={() => {
            if (tab === tab_) return
            setCommissions([])
            setLoading(true)
            setTab(tab_)
          }} style={{ flex: 1, padding: '12px 0', fontWeight: 700, fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: tab === tab_ ? T1 : T2, borderBottom: tab === tab_ ? `2px solid ${T1}` : '2px solid transparent' }}>
            {tab_}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px 20px' }}>
        {loading ? (
          <ListRowSkeleton count={5} dark />
        ) : commissions.length === 0 ? (
          <p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>{t('noCommissions')}</p>
        ) : commissions.map(c => {
          const sc = STATUS_COLORS[c.status]
          return (
            <div key={c.id} style={{ background: '#F5F5F5', borderRadius: 14, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontWeight: 700, color: T1, margin: 0, fontSize: 15 }}>{c.booking?.shift?.title || 'Shift'}</p>
                <p style={{ color: T2, margin: '2px 0', fontSize: 13 }}>{c.booking?.employer?.name} · {new Date(c.booking?.shift?.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                <p style={{ color: T2, margin: 0, fontSize: 12 }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontWeight: 800, color: T1, fontSize: 18, margin: '0 0 4px' }}>₹{c.amount}</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: sc.bg, color: sc.text }}>{c.status}</span>
              </div>
            </div>
          )
        })}
      </div>

      <CaptainBottomNav />
    </div>
  )
}
