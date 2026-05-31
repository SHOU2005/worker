'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const STORAGE_KEY = 'sw_permissions_asked'

export default function PermissionGate() {
  const pathname  = usePathname()
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [locStatus,  setLocStatus]  = useState<'idle' | 'granted' | 'denied'>('idle')
  const [notifStatus, setNotifStatus] = useState<'idle' | 'granted' | 'denied'>('idle')

  // Skip ops portal entirely
  const isOps = pathname?.startsWith('/ops')

  useEffect(() => {
    if (isOps) return
    if (typeof window === 'undefined') return
    // Only show once per device
    if (localStorage.getItem(STORAGE_KEY)) return
    setVisible(true)
  }, [isOps])

  async function handleAllow() {
    setLoading(true)

    // Request location
    let locGranted = false
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            locGranted = true
            setLocStatus('granted')
            resolve()
          },
          () => {
            setLocStatus('denied')
            resolve()
          },
          { timeout: 10000 }
        )
      })
    } catch {
      setLocStatus('denied')
    }

    // Request notifications
    let notifGranted = false
    try {
      if ('Notification' in window) {
        const result = await Notification.requestPermission()
        notifGranted = result === 'granted'
        setNotifStatus(result === 'granted' ? 'granted' : 'denied')
      } else {
        setNotifStatus('denied')
      }
    } catch {
      setNotifStatus('denied')
    }

    setLoading(false)
    localStorage.setItem(STORAGE_KEY, '1')

    // Short pause so user sees the status, then dismiss
    setTimeout(() => setVisible(false), 800)
  }

  function handleSkip() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  const bothIdle   = locStatus === 'idle' && notifStatus === 'idle'
  const anyGranted = locStatus === 'granted' || notifStatus === 'granted'
  const done       = locStatus !== 'idle' && notifStatus !== 'idle'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#000000',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
      paddingTop:    'calc(32px + env(safe-area-inset-top))',
      paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
      fontFamily: '"DM Sans", system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Logo */}
      <div style={{ animation: 'fadeUp 0.45s ease forwards', marginBottom: 28 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 40px rgba(255,255,255,0.1)',
        }}>
          <span style={{ fontSize: 40, fontWeight: 900, color: '#000', lineHeight: 1, letterSpacing: -2 }}>S</span>
        </div>
      </div>

      {/* Title */}
      <div style={{ animation: 'fadeUp 0.45s ease 0.08s both', textAlign: 'center', marginBottom: 32 }}>
        <p style={{ fontSize: 24, fontWeight: 900, color: '#FFFFFF', margin: '0 0 8px', letterSpacing: -0.5 }}>
          Enable Permissions
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>
          Switch needs these to show nearby jobs{'\n'}and keep you updated
        </p>
      </div>

      {/* Permission cards */}
      <div style={{ width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32, animation: 'fadeUp 0.45s ease 0.16s both' }}>

        {/* Location */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '18px 20px', borderRadius: 18,
          background: locStatus === 'granted' ? 'rgba(34,197,94,0.1)' : locStatus === 'denied' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.06)',
          border: `1.5px solid ${locStatus === 'granted' ? 'rgba(34,197,94,0.4)' : locStatus === 'denied' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          transition: 'all 0.3s',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: locStatus === 'granted' ? 'rgba(34,197,94,0.2)' : locStatus === 'denied' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>
            📍
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', margin: '0 0 2px' }}>Location</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>To find jobs & shifts near you</p>
          </div>
          <StatusBadge status={locStatus} loading={loading} />
        </div>

        {/* Notifications */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '18px 20px', borderRadius: 18,
          background: notifStatus === 'granted' ? 'rgba(34,197,94,0.1)' : notifStatus === 'denied' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.06)',
          border: `1.5px solid ${notifStatus === 'granted' ? 'rgba(34,197,94,0.4)' : notifStatus === 'denied' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          transition: 'all 0.3s',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, flexShrink: 0,
            background: notifStatus === 'granted' ? 'rgba(34,197,94,0.2)' : notifStatus === 'denied' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
          }}>
            🔔
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#FFFFFF', margin: '0 0 2px' }}>Notifications</p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>For job alerts & shift updates</p>
          </div>
          <StatusBadge status={notifStatus} loading={loading} />
        </div>
      </div>

      {/* CTA */}
      <div style={{ width: '100%', maxWidth: 360, animation: 'fadeUp 0.45s ease 0.24s both' }}>
        {!done ? (
          <button
            onClick={handleAllow}
            disabled={loading}
            style={{
              width: '100%', height: 58, borderRadius: 18, border: 'none',
              background: loading ? 'rgba(255,255,255,0.15)' : '#FFFFFF',
              color: loading ? 'rgba(255,255,255,0.5)' : '#000000',
              fontSize: 17, fontWeight: 900, cursor: loading ? 'default' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: loading ? 'none' : '0 8px 32px rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 14,
            }}
          >
            {loading
              ? <><Spinner />Requesting…</>
              : '🔓 Allow Permissions'
            }
          </button>
        ) : (
          <button
            onClick={() => setVisible(false)}
            style={{
              width: '100%', height: 58, borderRadius: 18, border: 'none',
              background: '#FFFFFF', color: '#000000',
              fontSize: 17, fontWeight: 900, cursor: 'pointer',
              boxShadow: '0 8px 32px rgba(255,255,255,0.15)',
              marginBottom: 14,
            }}
          >
            Continue →
          </button>
        )}

        {!loading && !done && (
          <button
            onClick={handleSkip}
            style={{
              width: '100%', height: 44, background: 'none', border: 'none',
              cursor: 'pointer', color: 'rgba(255,255,255,0.3)', fontSize: 13,
              fontFamily: 'inherit',
            }}
          >
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status, loading }: { status: 'idle' | 'granted' | 'denied'; loading: boolean }) {
  if (loading && status === 'idle') {
    return (
      <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.15)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite', flexShrink: 0 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }
  if (status === 'granted') return <span style={{ fontSize: 20 }}>✅</span>
  if (status === 'denied')  return <span style={{ fontSize: 20 }}>❌</span>
  return (
    <div style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', flexShrink: 0 }} />
  )
}

function Spinner() {
  return (
    <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(0,0,0,0.15)', borderTopColor: '#000', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
  )
}
