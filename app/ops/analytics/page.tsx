'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const S2='#141414';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Analytics { totalWorkers: number; totalEmployers: number; totalCaptains: number; totalBookings: number; completedBookings: number; totalRevenue: number; grossRevenue: number; dailyRevenue: { date: string; revenue: number }[] }

export default function AnalyticsPage() {
  const router = useRouter()
  const [data,    setData]    = useState<Analytics | null>(null)
  const [days,    setDays]    = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/ops/analytics?days=${days}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setData(d) }).finally(() => setLoading(false))
  }, [days, router])

  const maxRevenue = data ? Math.max(...data.dailyRevenue.map(d => d.revenue), 1) : 1

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingTop: 'env(safe-area-inset-top,0px)' }}>
          <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0 }}>Analytics</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)} style={{ padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: days === d ? T1 : 'transparent', color: days === d ? '#000' : T2 }}>{d}d</button>
            ))}
          </div>
        </div>

        {loading ? <div style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>Loading…</div> : data && (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'Total Revenue',   value: `₹${data.totalRevenue.toLocaleString('en-IN')}`,   color: '#34D399' },
                { label: 'Gross Revenue',   value: `₹${data.grossRevenue.toLocaleString('en-IN')}`,   color: '#60A5FA' },
                { label: 'Bookings',        value: data.totalBookings,                                  color: '#FFFFFF' },
                { label: 'Completed',       value: data.completedBookings,                              color: '#FBBF24' },
                { label: 'Workers',         value: data.totalWorkers,                                   color: '#F87171' },
                { label: 'Active Captains', value: data.totalCaptains,                                  color: '#FFFFFF' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ color: T2, fontSize: 12, margin: '0 0 4px' }}>{label}</p>
                  <p style={{ color, fontWeight: 800, fontSize: 20, margin: 0 }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Revenue bar chart */}
            <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px', marginBottom: 20 }}>
              <p style={{ color: T1, fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Daily Revenue (Last {days} days)</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
                {data.dailyRevenue.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ width: '100%', background: '#FFFFFF', borderRadius: '3px 3px 0 0', height: `${(d.revenue / maxRevenue) * 100}%`, minHeight: d.revenue > 0 ? 4 : 0 }} title={`${d.date}: ₹${d.revenue}`} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ color: T2, fontSize: 10 }}>{data.dailyRevenue[0]?.date?.slice(5)}</span>
                <span style={{ color: T2, fontSize: 10 }}>{data.dailyRevenue[data.dailyRevenue.length - 1]?.date?.slice(5)}</span>
              </div>
            </div>

            {/* Conversion */}
            <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '16px' }}>
              <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: '0 0 12px' }}>Completion Rate</p>
              <div style={{ background: S2, borderRadius: 8, height: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#34D399', borderRadius: 8, width: `${data.totalBookings > 0 ? (data.completedBookings / data.totalBookings * 100).toFixed(1) : 0}%`, transition: 'width 1s' }} />
              </div>
              <p style={{ color: T2, fontSize: 13, margin: '8px 0 0' }}>{data.totalBookings > 0 ? (data.completedBookings / data.totalBookings * 100).toFixed(1) : 0}% of bookings completed</p>
            </div>
          </>
        )}
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
