'use client'
import { ListRowSkeleton, CardSkeleton } from '@/components/shared/Skeleton'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { Users, Briefcase, BookOpen, AlertTriangle, TrendingUp, Clock, UserCheck, Building2, IndianRupee, BarChart3, Star, Activity } from 'lucide-react'

const BG   = '#000000'
const S1   = '#0F0F0F'
const S2   = '#141414'
const BD   = 'rgba(255,255,255,0.08)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.4)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface DashData {
  activeShifts: number; openShifts: number; vacancyLeft: number
  todayBookings: number; pendingKyc: number
  openComplaints: number; captainsInField: number; pendingCommissions: number
  pendingCaptains: number
  totalWorkers: number; totalCaptains: number; totalEmployers: number; totalBookings: number
  todayRevenue: number; yesterdayRevenue: number; weekRevenue: number; monthRevenue: number; totalRevenue: number
  last30Days: { date: string; revenue: number }[]
  captainLeads?: { workers: number; employers: number; total: number; today: number }
  performance?: {
    todayShifts: number; todayBookings: number; weekBookings: number; monthBookings: number
    completionRate: number; cancellationRate: number
    totalBookings: number; completedBookings: number; cancelledBookings: number
    last7Days: { date: string; bookings: number; completed: number; cancelled: number }[]
    topEmployers: { id: string; name: string; totalShifts: number; rating: number }[]
    topWorkers:   { id: string; name: string; totalShifts: number; totalEarnings: number; rating: number }[]
  }
}

export default function OpsDashboard() {
  const router = useRouter()
  const [dash,    setDash]    = useState<DashData | null>(null)
  const [user,    setUser]    = useState<{ name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // cache-bust query param + no-store ensures we never get a stale response
    Promise.all([
      fetch('/api/ops/dashboard?_=' + Date.now(), { cache: 'no-store' })
        .then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
        .catch(err => { console.error('dashboard fetch failed', err); return null }),
      fetch('/api/auth/me', { cache: 'no-store' })
        .then(r => r.json())
        .catch(() => null),
    ]).then(([d, u]) => {
      // Only accept the response if it looks like a dashboard payload
      if (d && typeof d.totalWorkers === 'number') {
        setDash(d)
      } else if (d && d.error) {
        console.error('dashboard error response:', d.error)
      }
      if (u?.user) setUser(u.user)
    }).finally(() => setLoading(false))
  }, [router])

  const STATS = dash ? [
    { label: 'Open Shifts',         value: dash.openShifts,         Icon: Briefcase,    color: '#34D399', href: '/ops/bookings'    },
    { label: 'Vacancy Left',        value: dash.vacancyLeft,        Icon: Users,        color: '#FBBF24', href: '/ops/bookings'    },
    { label: 'Active Shifts',       value: dash.activeShifts,       Icon: Activity,     color: '#FFFFFF', href: '/ops/bookings'    },
    { label: 'Today Bookings',      value: dash.todayBookings,      Icon: BookOpen,     color: '#FFFFFF', href: '/ops/bookings'    },
    { label: 'Pending KYC',         value: dash.pendingKyc,         Icon: UserCheck,    color: '#FBBF24', href: '/ops/workers?kycStatus=PENDING' },
    { label: 'Open Complaints',     value: dash.openComplaints,     Icon: AlertTriangle,color: '#F87171', href: '/ops/complaints'  },
    { label: 'Captains in Field',   value: dash.captainsInField,    Icon: Users,        color: '#FFFFFF', href: '/ops/captains'    },
    { label: 'Pending Commissions', value: dash.pendingCommissions, Icon: TrendingUp,   color: '#FFFFFF', href: '/ops/commissions' },
    { label: 'Captain Leads (Today)', value: dash.captainLeads?.today ?? 0, Icon: UserCheck, color: '#34D399', href: '/ops/captains' },
    { label: 'Captain Leads (All)', value: dash.captainLeads?.total ?? 0, Icon: Users,    color: '#FFFFFF', href: '/ops/captains' },
  ] : []

  const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />

      <div style={{ padding: '20px 20px 0', marginLeft: 0 }} className="ops-content">
        {/* Header */}
        <div style={{ marginBottom: 24, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <p style={{ color: T2, fontSize: 13, margin: 0 }}>Operations</p>
          <p style={{ color: T1, fontWeight: 800, fontSize: 24, margin: '2px 0 0', letterSpacing: -0.5 }}>
            {new Date().getHours() < 12 ? 'Good morning' : 'Good evening'}, {user?.name?.split(' ')[0] || 'Ops'}
          </p>
        </div>

        {/* Totals — 4 hero tiles */}
        {dash && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Total Workers',   value: dash.totalWorkers,   Icon: Users      },
              { label: 'Total Captains',  value: dash.totalCaptains,  Icon: UserCheck  },
              { label: 'Total Employers', value: dash.totalEmployers, Icon: Building2  },
              { label: 'Total Sales',     value: fmt(dash.totalRevenue), Icon: IndianRupee, big: true },
            ].map(({ label, value, Icon, big }) => (
              <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ color: T2, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
                  <Icon style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.35)' }} />
                </div>
                <p style={{ color: T1, fontSize: big ? 22 : 26, fontWeight: 800, margin: 0, letterSpacing: -0.6 }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Revenue strip + sparkline */}
        {dash && (
          <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 14, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ color: T2, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Total Sales</p>
              <p style={{ color: T2, fontSize: 11, margin: 0 }}>Last 30 days</p>
            </div>
            <Sparkline data={dash.last30Days} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1, background: BD, borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
              {[
                { label: 'Today',     value: dash.todayRevenue     },
                { label: 'Yesterday', value: dash.yesterdayRevenue },
                { label: 'This Week', value: dash.weekRevenue      },
                { label: 'This Month',value: dash.monthRevenue     },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: S2, padding: '12px 8px', textAlign: 'center' }}>
                  <p style={{ color: T1, fontWeight: 800, fontSize: 14, margin: 0 }}>{fmt(value)}</p>
                  <p style={{ color: T2, fontSize: 10, margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending captains alert */}
        {dash && dash.pendingCaptains > 0 && (
          <a href="/ops/captains" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#141008', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 14, padding: '14px 16px', marginBottom: 18, textDecoration: 'none' }}>
            <Clock style={{ width: 18, height: 18, color: '#FBBF24', flexShrink: 0 }} />
            <div>
              <p style={{ color: '#FDE68A', fontWeight: 700, margin: 0, fontSize: 14 }}>{dash.pendingCaptains} captain{dash.pendingCaptains > 1 ? 's' : ''} awaiting activation</p>
              <p style={{ color: T2, margin: 0, fontSize: 12 }}>Tap to review</p>
            </div>
          </a>
        )}

        {/* Stats grid */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}><CardSkeleton h={92} dark /><CardSkeleton h={92} dark /><CardSkeleton h={92} dark /><CardSkeleton h={92} dark /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {STATS.map(({ label, value, Icon, color, href }) => (
              <a key={label} href={href} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px', textDecoration: 'none', display: 'block' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <Icon style={{ width: 16, height: 16, color }} />
                </div>
                <p style={{ color: T1, fontSize: 30, fontWeight: 800, margin: '0 0 3px', letterSpacing: -1 }}>{value}</p>
                <p style={{ color: T2, fontSize: 12, margin: 0 }}>{label}</p>
              </a>
            ))}
          </div>
        )}

        {/* Performance / Analytics */}
        {dash?.performance && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, margin: 0 }}>Performance · Last 7 days</p>
              <a href="/ops/analytics" style={{ color: T2, fontSize: 12, textDecoration: 'none' }}>View detailed →</a>
            </div>

            {/* Daily bar chart */}
            <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
              <DailyBars data={dash.performance.last7Days} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BD, borderRadius: 12, overflow: 'hidden', marginTop: 14 }}>
                {[
                  { label: 'Today',     value: dash.performance.todayBookings    },
                  { label: 'This Week', value: dash.performance.weekBookings     },
                  { label: 'This Month',value: dash.performance.monthBookings    },
                  { label: 'All Time',  value: dash.performance.totalBookings    },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: S2, padding: '10px 6px', textAlign: 'center' }}>
                    <p style={{ color: T1, fontWeight: 800, fontSize: 16, margin: 0 }}>{value}</p>
                    <p style={{ color: T2, fontSize: 10, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Completion / cancellation rates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Activity style={{ width: 14, height: 14, color: '#10B981' }} />
                  <p style={{ color: T2, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Completion rate</p>
                </div>
                <p style={{ color: '#10B981', fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.6 }}>{dash.performance.completionRate}%</p>
                <p style={{ color: T2, fontSize: 11, margin: '3px 0 0' }}>{dash.performance.completedBookings} of {dash.performance.totalBookings} bookings</p>
              </div>
              <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <BarChart3 style={{ width: 14, height: 14, color: '#F87171' }} />
                  <p style={{ color: T2, fontSize: 11, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Cancellation rate</p>
                </div>
                <p style={{ color: '#F87171', fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: -0.6 }}>{dash.performance.cancellationRate}%</p>
                <p style={{ color: T2, fontSize: 11, margin: '3px 0 0' }}>{dash.performance.cancelledBookings} cancelled</p>
              </div>
            </div>

            {/* Top performers */}
            {(dash.performance.topEmployers.length > 0 || dash.performance.topWorkers.length > 0) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
                <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: 14 }}>
                  <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 10px' }}>Top Employers</p>
                  {dash.performance.topEmployers.length === 0 ? (
                    <p style={{ color: T2, fontSize: 13, margin: 0 }}>No bookings yet</p>
                  ) : dash.performance.topEmployers.map((e, i) => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < dash.performance!.topEmployers.length - 1 ? `1px solid ${BD}` : 'none' }}>
                      <span style={{ color: T2, fontSize: 12, fontWeight: 700, width: 16 }}>{i + 1}.</span>
                      <span style={{ color: T1, fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                      <span style={{ color: T2, fontSize: 11 }}>{e.totalShifts} shifts</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: 14 }}>
                  <p style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 10px' }}>Top Workers</p>
                  {dash.performance.topWorkers.length === 0 ? (
                    <p style={{ color: T2, fontSize: 13, margin: 0 }}>No completed shifts yet</p>
                  ) : dash.performance.topWorkers.map((w, i) => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: i < dash.performance!.topWorkers.length - 1 ? `1px solid ${BD}` : 'none' }}>
                      <span style={{ color: T2, fontSize: 12, fontWeight: 700, width: 16 }}>{i + 1}.</span>
                      <span style={{ color: T1, fontSize: 13, fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                      {w.rating > 0 && <span style={{ color: '#F59E0B', fontSize: 11, fontWeight: 700 }}>★ {w.rating.toFixed(1)}</span>}
                      <span style={{ color: T2, fontSize: 11 }}>{w.totalShifts} jobs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Quick actions */}
        <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10 }}>Quick Actions</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { label: 'Approve KYC',      href: '/ops/workers?kycStatus=PENDING' },
            { label: 'Pay Commissions',  href: '/ops/payouts'                   },
            { label: 'Broadcast',        href: '/ops/broadcast'                 },
            { label: 'Analytics',        href: '/ops/analytics'                 },
          ].map(({ label, href }) => (
            <a key={label} href={href} style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', textDecoration: 'none', display: 'block' }}>
              <span style={{ color: T1, fontWeight: 600, fontSize: 14 }}>{label}</span>
            </a>
          ))}
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }
      `}</style>
    </div>
  )
}

function DailyBars({ data }: { data: { date: string; bookings: number; completed: number; cancelled: number }[] }) {
  if (!data?.length) return <div style={{ height: 80 }} />
  const max = Math.max(1, ...data.map(d => d.bookings))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {data.map((d, i) => {
          const totalH = (d.bookings / max) * 70
          const compH  = d.bookings > 0 ? (d.completed / d.bookings) * totalH : 0
          const remH   = totalH - compH
          return (
            <div key={d.date} title={`${d.date}: ${d.bookings} bookings, ${d.completed} completed, ${d.cancelled} cancelled`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 70 }}>
                {d.bookings === 0 ? (
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }} />
                ) : (
                  <>
                    <div style={{ height: remH, background: 'rgba(96,165,250,0.55)', borderRadius: '4px 4px 0 0' }} />
                    <div style={{ height: compH, background: '#10B981', borderRadius: compH === totalH ? 4 : '0 0 4px 4px' }} />
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {data.map(d => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 9 }}>
            {new Date(d.date).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: '#10B981', borderRadius: 2 }}/>Completed</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, background: 'rgba(96,165,250,0.55)', borderRadius: 2 }}/>Other</span>
      </div>
    </div>
  )
}

function Sparkline({ data }: { data: { date: string; revenue: number }[] }) {
  if (!data?.length) return <div style={{ height: 60 }} />
  const max = Math.max(1, ...data.map(d => d.revenue))
  const w   = 100
  const h   = 60
  const stepX = data.length > 1 ? w / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = (i * stepX).toFixed(2)
    const y = (h - (d.revenue / max) * (h - 4) - 2).toFixed(2)
    return `${x},${y}`
  }).join(' ')
  const area = `0,${h} ${points} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }}>
      <polygon points={area} fill="rgba(255,255,255,0.06)" />
      <polyline points={points} fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
