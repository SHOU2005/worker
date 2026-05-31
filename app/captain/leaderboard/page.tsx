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

interface Leader { rank: number; name: string; territory: string | null; totalEarnings: number; earnedThisMonth: number; isMe: boolean }

export default function LeaderboardPage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const [list,    setList]    = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    function load() {
      fetch('/api/captain/leaderboard').then(r => {
        if (r.status === 401) { router.replace('/captain/login'); return null }
        return r.json()
      }).then(d => { if (!cancelled && d) setList(d.leaderboard || []) })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(load, 60_000) // refresh every minute
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [router])

  const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('leaderboard')} />
      <div style={{ padding: '8px 0 0' }}>
        <p style={{ fontSize: 13, color: T2, textAlign: 'center', marginBottom: 16 }}>{t('thisMonthTopCaptains')}</p>
        {loading ? (
          <ListRowSkeleton count={5} dark />
        ) : list.map(c => (
          <div key={c.rank} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: c.isMe ? '#EFF6FF' : '#FFFFFF', borderLeft: c.isMe ? `3px solid ${T1}` : '3px solid transparent', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <span style={{ fontSize: c.rank <= 3 ? 26 : 15, fontWeight: 800, color: T1, width: 32, textAlign: 'center', flexShrink: 0 }}>{medal(c.rank)}</span>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: c.isMe ? T1 : '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.isMe ? '#fff' : T1, fontWeight: 800, fontSize: 16, flexShrink: 0 }}>
              {c.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700, color: T1, margin: 0, fontSize: 15 }}>{c.name} {c.isMe ? `(${t('you')})` : ''}</p>
              <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>{c.territory || t('allIndia')}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontWeight: 800, color: T1, fontSize: 16, margin: 0 }}>₹{c.earnedThisMonth}</p>
              <p style={{ color: T2, fontSize: 11, margin: 0 }}>{t('thisMonthEarned')}</p>
            </div>
          </div>
        ))}
      </div>
      <CaptainBottomNav />
    </div>
  )
}
