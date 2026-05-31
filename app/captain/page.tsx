'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Briefcase, TrendingUp, ListChecks, Award, Copy, Check } from 'lucide-react'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import CaptainCompleteProfileGate from '@/components/captain/CompleteProfileGate'
import { useLanguage } from './LanguageContext'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.45)'
const T3   = 'rgba(0,0,0,0.25)'
const BD   = 'rgba(0,0,0,0.08)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface DashData {
  status: string
  commissionThisMonth: number
  pendingPayout: number
  totalEarnings: number
  pendingTasks: number
  employersOnboarded: number
  workersOnboarded: number
  last7Days?: { date: string; amount: number }[]
}

interface CaptainProfile {
  status: string
  referralCode: string | null
  territory: string | null
}

export default function CaptainDashboard() {
  const router  = useRouter()
  const { t }   = useLanguage()
  const [user,    setUser]    = useState<{ name: string; captainProfile: CaptainProfile | null } | null>(null)
  const [dash,    setDash]    = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied,  setCopied]  = useState(false)

  useEffect(() => {
    // Both endpoints share the captain session cookie — if one returns 401,
    // so will the other. Handle it on either path so a transient profile-
    // first response doesn't leave us mid-render with bad dashboard data.
    Promise.all([
      fetch('/api/captain/profile').then(r => { if (r.status === 401) { router.replace('/captain/login'); return null } return r.json() }),
      fetch('/api/captain/dashboard').then(r => { if (r.status === 401) { router.replace('/captain/login'); return null } return r.ok ? r.json() : null }),
    ]).then(([u, d]) => {
      if (!u) return
      setUser(u.user)
      if (d) setDash(d)
    }).finally(() => setLoading(false))
  }, [router])

  function copyCode() {
    const code = user?.captainProfile?.referralCode
    if (!code) return
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (loading) return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: T2 }}>{t('loading')}</div>
    </div>
  )

  const isPending = dash?.status === 'PENDING'
  const refCode   = user?.captainProfile?.referralCode

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom, 0px))' }}>

      {/* Top Bar */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, background: '#FFFFFF', borderBottom: `1px solid ${BD}`, paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: T1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 20, fontWeight: 900, color: '#FFFFFF', lineHeight: 1, letterSpacing: -1, fontFamily: '"DM Sans", sans-serif' }}>S</span>
            </div>
            <div>
              <p style={{ fontSize: 11, color: T3, margin: 0 }}>{t('captain')}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: T1, margin: 0 }}>{user?.name || t('captain')}</p>
            </div>
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: T2, padding: '4px 10px', borderRadius: 20, border: `1px solid ${BD}` }}>
            {user?.captainProfile?.status || 'PENDING'}
          </span>
        </div>
      </header>

      <div style={{ padding: '0 20px' }}>

        {/* Pending banner */}
        {isPending && (
          <div style={{ background: '#F5F5F5', border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
            <p style={{ fontWeight: 700, color: T1, margin: 0, fontSize: 14 }}>{t('accountUnderReview')}</p>
            <p style={{ color: T2, margin: '4px 0 0', fontSize: 13 }}>{t('opsWillActivate')}</p>
          </div>
        )}

        {/* Commission Hero */}
        <div style={{ background: T1, borderRadius: 20, padding: '24px 20px', marginBottom: 20 }}>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 4px' }}>{t('commissionThisMonth')}</p>
          <p style={{ color: '#FFFFFF', fontSize: 36, fontWeight: 800, margin: 0, letterSpacing: -1 }}>₹{dash?.commissionThisMonth ?? 0}</p>
          {dash?.last7Days && dash.last7Days.length > 0 && (
            <div style={{ marginTop: 14, marginBottom: 4 }}>
              <CaptainSparkline data={dash.last7Days} />
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, margin: '6px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>Last 7 days</p>
            </div>
          )}
          <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '0 0 2px' }}>{t('pendingPayout')}</p>
              <p style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 16, margin: 0 }}>₹{dash?.pendingPayout ?? 0}</p>
            </div>
            <div>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: '0 0 2px' }}>{t('allTimeEarned')}</p>
              <p style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 16, margin: 0 }}>₹{dash?.totalEarnings ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Referral Code */}
        {refCode && (
          <div style={{ background: '#F7F7F7', border: `1px solid ${BD}`, borderRadius: 16, padding: '16px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: T2, textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 10px' }}>{t('yourReferralCode')}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 28, fontWeight: 900, color: T1, margin: 0, letterSpacing: 4, fontFamily: '"Courier New", monospace' }}>{refCode}</p>
              <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: `1px solid ${BD}`, background: copied ? T1 : '#FFFFFF', color: copied ? '#FFFFFF' : T1, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
            <p style={{ fontSize: 12, color: T2, margin: '8px 0 0' }}>{t('referralEarnDesc')}</p>
          </div>
        )}

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[
            { label: t('employers'), value: dash?.employersOnboarded ?? 0, Icon: Briefcase  },
            { label: t('workers'),   value: dash?.workersOnboarded   ?? 0, Icon: UserPlus   },
            { label: t('tasksDue'),  value: dash?.pendingTasks       ?? 0, Icon: ListChecks },
          ].map(({ label, value, Icon }) => (
            <div key={label} style={{ background: '#F7F7F7', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
              <Icon style={{ width: 20, height: 20, color: T2, margin: '0 auto 6px' }} />
              <p style={{ fontSize: 22, fontWeight: 800, color: T1, margin: 0 }}>{value}</p>
              <p style={{ fontSize: 11, color: T2, margin: 0 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Quick Actions */}
        <p style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1.2 }}>{t('quickActions')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { label: t('registerEmployer'), Icon: Briefcase,  href: '/captain/onboard-employer' },
            { label: t('registerWorker'),   Icon: UserPlus,   href: '/captain/onboard-worker'   },
            { label: t('commissions'),      Icon: TrendingUp, href: '/captain/commissions'       },
            { label: t('leaderboard'),      Icon: Award,      href: '/captain/leaderboard'       },
          ].map(({ label, Icon, href }) => (
            <a key={href} href={href} style={{ background: '#F7F7F7', borderRadius: 14, padding: '16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#EBEBEB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon style={{ width: 18, height: 18, color: T1 }} />
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: T1, margin: 0 }}>{label}</p>
            </a>
          ))}
        </div>

      </div>

      <CaptainBottomNav />
      <CaptainCompleteProfileGate
        user={user}
        captainProfile={user?.captainProfile}
        onComplete={() => fetch('/api/captain/profile').then(r => r.json()).then(d => setUser(d.user)).catch(() => {})}
      />
    </div>
  )
}

function CaptainSparkline({ data }: { data: { date: string; amount: number }[] }) {
  if (!data?.length) return null
  const max = Math.max(1, ...data.map(d => d.amount))
  const w = 100, h = 38
  const stepX = data.length > 1 ? w / (data.length - 1) : 0
  const points = data.map((d, i) => `${(i*stepX).toFixed(2)},${(h - (d.amount/max)*(h-4) - 2).toFixed(2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 38, display: 'block' }}>
      <polyline points={points} fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
