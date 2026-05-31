'use client'
import { useState, useEffect, useCallback } from 'react'
import { Bell, Zap, CheckCircle, IndianRupee, MapPin, BellOff, RefreshCw } from 'lucide-react'
import TopBar    from '@/components/shared/TopBar'
import BottomNav from '@/components/shared/BottomNav'

type Notif = {
  id: string; title: string; body: string; data?: string; read: boolean; createdAt: string
}

function notifIcon(n: Notif) {
  const d = n.data ? JSON.parse(n.data) : {}
  switch (d.type) {
    case 'URGENT_JOB':       return { Icon: Zap,          color: '#DC2626', bg: 'rgba(220,38,38,0.08)' }
    case 'JOB_COMPLETED':    return { Icon: CheckCircle,  color: '#111111', bg: 'rgba(0,0,0,0.07)' }
    case 'PAYMENT_RECEIVED': return { Icon: IndianRupee,  color: '#111111', bg: 'rgba(0,0,0,0.07)' }
    case 'NEW_JOB':          return { Icon: MapPin,       color: '#111111', bg: 'rgba(0,0,0,0.07)' }
    case 'JOB_STARTED':      return { Icon: CheckCircle,  color: '#111111', bg: 'rgba(0,0,0,0.07)' }
    default:                 return { Icon: Bell,         color: '#111111', bg: 'rgba(0,0,0,0.07)' }
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function NotificationsPage() {
  const [notifs,  setNotifs]  = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [unread,  setUnread]  = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/notifications', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      setNotifs(data.notifications || [])
      setUnread(data.unread || 0)
    } catch (err) {
      console.error('[notifications] fetch failed:', err)
      setNotifs([]); setUnread(0)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function markRead(id: string) {
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: true } : n))
    setUnread(u => Math.max(0, u - 1))
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    })
  }

  async function markAllRead() {
    setNotifs(ns => ns.map(n => ({ ...n, read: true })))
    setUnread(0)
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
  }

  return (
    <>
      <TopBar title="Notifications" unread={0} />

      <div className="page">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid rgba(0,0,0,0.1)', borderTopColor: '#111', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : (
          <>
            {unread > 0 && (
              <div className="flex items-center justify-between px-4 pt-2 pb-3">
                <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>
                  <span style={{ fontWeight: 700, color: '#111111' }}>{unread}</span> unread
                </p>
                <button onClick={markAllRead}
                  style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.5)' }}>
                  Mark all read
                </button>
              </div>
            )}

            <div className={`px-4 ${unread > 0 ? 'pt-0' : 'pt-2'} pb-4 space-y-2.5`}>
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.09)' }}>
                    <BellOff style={{ width: 24, height: 24, color: 'rgba(0,0,0,0.3)' }} />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(0,0,0,0.38)' }}>No notifications yet</p>
                </div>
              ) : notifs.map(n => {
                const { Icon, color, bg } = notifIcon(n)
                const isUnread = !n.read
                return (
                  <button key={n.id} onClick={() => isUnread && markRead(n.id)}
                    className="w-full text-left overflow-hidden"
                    style={{
                      background: '#F5F5F5',
                      border: `1px solid ${isUnread ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.07)'}`,
                      borderLeft: isUnread ? '3px solid #111111' : '1px solid rgba(0,0,0,0.07)',
                      borderRadius: 20, padding: 16,
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      boxShadow: isUnread ? '0 4px 16px rgba(0,0,0,0.08)' : '0 2px 6px rgba(0,0,0,0.05)',
                      transition: 'all 0.2s',
                    }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: bg }}>
                      <Icon style={{ width: 18, height: 18, color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p style={{ fontSize: 15, fontWeight: isUnread ? 800 : 600, color: '#111111' }}>{n.title}</p>
                        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>{timeAgo(n.createdAt)}</p>
                      </div>
                      <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.48)', marginTop: 3, lineHeight: 1.4 }}>{n.body}</p>
                    </div>
                    {isUnread && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#111111' }} />
                    )}
                  </button>
                )
              })}

              {notifs.length > 0 && (
                <button onClick={load}
                  style={{ width: '100%', padding: '12px 0', background: 'none', border: '1px dashed rgba(0,0,0,0.15)', borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <RefreshCw style={{ width: 14, height: 14, color: 'rgba(0,0,0,0.35)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.35)' }}>Refresh</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <BottomNav active="/worker/notifications" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  )
}
