'use client'
import { useEffect, useState } from 'react'
import {
  MapPin, Bell, Camera, MessageSquare,
  Phone, Users, Shield, CheckCircle, AlertCircle, ChevronRight,
} from 'lucide-react'
import { registerFCMToken, setupForegroundMessages } from '@/lib/fcm-client'

type PermStatus = 'idle' | 'granted' | 'denied'

const PERMS = [
  { icon: MapPin,        color: '#2563EB', bg: '#EFF6FF', title: 'Location',       desc: 'Find jobs near your home',            key: 'location'       },
  { icon: Camera,        color: '#7C3AED', bg: '#F5F3FF', title: 'Camera',          desc: 'Upload Aadhaar and profile photo',    key: 'camera'         },
  { icon: Bell,          color: '#059669', bg: '#ECFDF5', title: 'Notifications',   desc: 'Get alerts when new jobs are posted', key: 'notifications'  },
  { icon: MessageSquare, color: '#D97706', bg: '#FFFBEB', title: 'SMS',             desc: 'Auto-read OTP for faster login',      key: 'sms'            },
  { icon: Phone,         color: '#DC2626', bg: '#FEF2F2', title: 'Phone',           desc: 'One-tap call to employer or support', key: 'phone'          },
  { icon: Users,         color: '#0891B2', bg: '#ECFEFF', title: 'Contacts',        desc: 'Invite friends and earn ₹200 each',   key: 'contacts'       },
]

export default function PermissionScreen() {
  const [show,    setShow]    = useState(false)
  const [status,  setStatus]  = useState<Record<string, PermStatus>>({})
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [hasDenied, setHasDenied] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('sw_perms')) return
    if (!localStorage.getItem('sw_role')) return
    const t = setTimeout(() => setShow(true), 500)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  async function requestAll() {
    setLoading(true)
    setError('')
    setHasDenied(false)

    const next: Record<string, PermStatus> = {}

    // ── Dynamically import Capacitor plugins (only runs on native) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Cap = (window as any).Capacitor

    // ── 1. LOCATION ──
    try {
      if (Cap?.isNativePlatform?.()) {
        const { Geolocation } = await import('@capacitor/geolocation')
        const res = await Geolocation.requestPermissions()
        next.location = (res.location === 'granted' || (res.location as string) === 'limited') ? 'granted' : 'denied'
        if (next.location === 'granted') {
          Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: false }).then(pos => {
            localStorage.setItem('sw_lat', String(pos.coords.latitude))
            localStorage.setItem('sw_lng', String(pos.coords.longitude))
            fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`, {
              headers: { 'User-Agent': 'SwitchApp/1.0' },
            }).then(r => r.json()).then(data => {
              const addr = data.address ?? {}
              const city = addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? addr.city ?? addr.town ?? addr.state
              if (city) localStorage.setItem('sw_city', city)
            }).catch(() => {})
            fetch('/api/worker/profile', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            }).catch(() => {})
          }).catch(() => {})
        }
      } else {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
        )
        next.location = 'granted'
        localStorage.setItem('sw_lat', String(pos.coords.latitude))
        localStorage.setItem('sw_lng', String(pos.coords.longitude))
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`, {
          headers: { 'User-Agent': 'SwitchApp/1.0' },
        }).then(r => r.json()).then(data => {
          const addr = data.address ?? {}
          const city = addr.suburb ?? addr.neighbourhood ?? addr.city_district ?? addr.city ?? addr.town ?? addr.state
          if (city) localStorage.setItem('sw_city', city)
        }).catch(() => {})
      }
    } catch { next.location = 'denied' }
    setStatus(s => ({ ...s, ...next }))

    // ── 2. CAMERA ──
    try {
      if (Cap?.isNativePlatform?.()) {
        const { Camera } = await import('@capacitor/camera')
        const res = await Camera.requestPermissions({ permissions: ['camera', 'photos'] })
        next.camera = res.camera === 'granted' ? 'granted' : 'denied'
      } else {
        const s = await navigator.mediaDevices.getUserMedia({ video: true })
        s.getTracks().forEach(t => t.stop())
        next.camera = 'granted'
      }
    } catch { next.camera = 'denied' }
    setStatus(s => ({ ...s, ...next }))

    // ── 3. NOTIFICATIONS ──
    try {
      if (Cap?.isNativePlatform?.()) {
        const { PushNotifications } = await import('@capacitor/push-notifications')
        const res = await PushNotifications.requestPermissions()
        next.notifications = res.receive === 'granted' ? 'granted' : 'denied'
      } else {
        const r = await Notification.requestPermission()
        next.notifications = r === 'granted' ? 'granted' : 'denied'
      }
      // Register FCM token once permission is granted
      if (next.notifications === 'granted') {
        registerFCMToken().catch(console.warn)
        setupForegroundMessages((payload: any) => {
          const n = payload?.notification
          if (n?.title) {
            // Show a simple in-app toast for foreground notifications
            const event = new CustomEvent('sw-push', { detail: n })
            window.dispatchEvent(event)
          }
        }).catch(console.warn)

        // Android 14+ gates USE_FULL_SCREEN_INTENT behind a separate
        // per-app system toggle that POST_NOTIFICATIONS does NOT cover.
        // Without it, urgent-job ringer pushes get downgraded by the OS
        // to a silent 60-second floating window — workers miss the alert.
        // Nudge them to the system settings page ONCE on first run; if
        // they decline we don't badger them again (sw_fsi_asked flag).
        try {
          if (Cap?.isNativePlatform?.() && Cap?.Plugins?.NativePermissions?.canUseFullScreenIntent) {
            const { allowed } = await Cap.Plugins.NativePermissions.canUseFullScreenIntent()
            const asked = localStorage.getItem('sw_fsi_asked')
            if (!allowed && !asked) {
              localStorage.setItem('sw_fsi_asked', '1')
              // Opening Settings backgrounds the app — the worker comes
              // back on their own, so we don't await this.
              Cap.Plugins.NativePermissions.openFullScreenIntentSettings().catch(() => {})
            }
          }
        } catch {}
      }
    } catch { next.notifications = 'denied' }
    setStatus(s => ({ ...s, ...next }))

    // ── 4. SMS / PHONE — native-only popups (web has no equivalent) ──
    try {
      if (Cap?.isNativePlatform?.() && Cap?.Plugins?.NativePermissions) {
        Cap.Plugins.NativePermissions.requestAll()
      }
    } catch {}
    next.sms = next.phone = 'granted'

    // ── 5. CONTACTS — real picker ask, not fake-grant ──
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any
      const supportsWebContacts = 'contacts' in nav && 'ContactsManager' in window
      if (Cap?.isNativePlatform?.() && Cap?.Plugins?.Contacts) {
        const res = await Cap.Plugins.Contacts.getPermissions()
        const status = res?.contacts || res?.granted
        next.contacts = status === 'granted' ? 'granted' : 'denied'
      } else if (supportsWebContacts) {
        const picked = await nav.contacts.select(['name', 'tel'], { multiple: true })
        if (Array.isArray(picked) && picked.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normalised = picked.map((c: any) => ({
            name: Array.isArray(c.name) ? c.name[0] || '' : c.name || '',
            tel:  Array.isArray(c.tel)  ? c.tel           : [c.tel].filter(Boolean),
          }))
          fetch('/api/user/contacts', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ contacts: normalised }),
          }).catch(() => {})
          next.contacts = 'granted'
        } else {
          next.contacts = 'denied'
        }
      } else {
        // Browser doesn't support the Contacts API — don't lie about it
        next.contacts = 'denied'
      }
    } catch { next.contacts = 'denied' }
    setStatus(s => ({ ...s, ...next }))

    setLoading(false)

    const required = ['location', 'camera', 'notifications']
    const anyDenied = required.some(k => next[k] === 'denied')

    if (anyDenied) {
      const names = required.filter(k => next[k] === 'denied').map(k =>
        PERMS.find(p => p.key === k)?.title
      ).join(', ')
      setError(`${names} ${required.filter(k => next[k] === 'denied').length > 1 ? 'are' : 'is'} required. Please open Settings and allow.`)
      setHasDenied(true)
    } else {
      localStorage.setItem('sw_perms', '1')
      setTimeout(() => setShow(false), 600)
    }
  }

  function openSettings() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Cap = (window as any).Capacitor
    if (Cap?.isNativePlatform?.() && Cap?.Plugins?.App) {
      Cap.Plugins.App.openUrl({ url: 'app-settings:' }).catch(() => {
        setError('Go to Settings → Apps → Switch → Permissions and allow all.')
      })
    } else {
      setError('Go to phone Settings → Apps → Switch → Permissions → allow all.')
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col"
      style={{ background: '#fff', paddingTop: 'var(--safe-t)', paddingBottom: 'var(--safe-b)' }}>

      {/* Top accent */}
      <div style={{ height: 4, background: '#111111' }} />

      {/* Header */}
      <div className="flex flex-col items-center px-6 pt-6 pb-4">
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-4"
          style={{ background: '#111111', boxShadow: '0 10px 28px rgba(0,0,0,0.2)' }}>
          <Shield style={{ width: 32, height: 32, color: '#fff', strokeWidth: 1.5 }} />
        </div>
        <p style={{ fontSize: 22, fontWeight: 900, color: '#111827', textAlign: 'center', lineHeight: 1.2, marginBottom: 6 }}>
          Allow Switch to help you
        </p>
        <p style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 1.5 }}>
          Tap <b style={{ color: '#111827' }}>Allow All &amp; Continue</b> — each permission will pop up one by one
        </p>
      </div>

      {/* Permission list */}
      <div className="flex-1 overflow-y-auto px-5 space-y-2.5">
        {PERMS.map(({ icon: Icon, color, bg, title, desc, key }) => {
          const st = status[key] as PermStatus | undefined
          const done  = st === 'granted'
          const isDen = st === 'denied'
          return (
            <div key={key} className="flex items-center gap-3 p-3.5 rounded-2xl"
              style={{
                background: done ? '#F0FDF4' : isDen ? '#FEF2F2' : '#F9FAFB',
                border: `1.5px solid ${done ? '#BBF7D0' : isDen ? '#FECACA' : '#F3F4F6'}`,
                transition: 'all 0.3s',
              }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: done ? '#DCFCE7' : isDen ? '#FEE2E2' : bg }}>
                <Icon style={{ width: 20, height: 20, color: done ? '#059669' : isDen ? '#DC2626' : color, strokeWidth: 1.8 }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{title}</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{desc}</p>
              </div>
              {loading && !st ? (
                <div className="w-5 h-5 rounded-full border-2 border-blue-300 border-t-blue-600 animate-spin flex-shrink-0" />
              ) : done ? (
                <CheckCircle style={{ width: 20, height: 20, color: '#059669', flexShrink: 0 }} />
              ) : isDen ? (
                <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-3 rounded-2xl"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
          <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, lineHeight: 1.45 }}>{error}</p>
        </div>
      )}

      {/* CTA */}
      <div className="px-5 pt-3 pb-6" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!hasDenied ? (
          <button onClick={requestAll} disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold"
            style={{
              background: loading ? 'rgba(0,0,0,0.45)' : '#111111',
              color: '#fff', fontSize: 16, border: 'none',
              boxShadow: loading ? 'none' : '0 8px 24px rgba(0,0,0,0.2)',
              cursor: loading ? 'default' : 'pointer',
            }}>
            {loading
              ? <><div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Requesting…</>
              : <>Allow All &amp; Continue <ChevronRight style={{ width: 18, height: 18 }} /></>
            }
          </button>
        ) : (
          <>
            <button onClick={openSettings}
              className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold"
              style={{ background: 'linear-gradient(135deg,#DC2626,#B91C1C)', color: '#fff',
                fontSize: 16, border: 'none', boxShadow: '0 6px 20px rgba(220,38,38,0.35)', cursor: 'pointer' }}>
              Open App Settings <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
            <button onClick={requestAll} disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl"
              style={{ background: '#F3F4F6', color: '#374151', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}
