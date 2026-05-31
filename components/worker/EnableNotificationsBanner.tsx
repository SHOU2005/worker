'use client'
/**
 * In-app permission prompt for the worker PWA.
 *
 * Three states it surfaces:
 *   - 'default' (user hasn't decided yet) → yellow CTA, tap fires the
 *     real Notification.requestPermission() inside the click handler so
 *     Chrome treats it as a user gesture and actually shows the prompt.
 *   - 'denied'  (blocked, possibly auto-denied by Chrome's anti-spam) →
 *     red instructions panel with platform-specific unblock steps.
 *     Browsers do not let any code re-prompt once denied; only the user
 *     can flip the setting back via Chrome / Android system settings.
 *   - 'granted' → component returns null and the rest of the app handles
 *     FCM token registration.
 */
import { useEffect, useState } from 'react'
import { Bell, BellOff, X, ExternalLink } from 'lucide-react'
import { registerFCMToken } from '@/lib/fcm-client'
import { useLanguage } from '@/app/worker/LanguageContext'

const DISMISSED_KEY  = 'sw_notif_banner_dismissed'
const BLOCKED_HIDE_KEY = 'sw_notif_blocked_hidden'

type PermState = 'default' | 'granted' | 'denied'

export default function EnableNotificationsBanner() {
  const { t }              = useLanguage()
  const [perm,  setPerm]   = useState<PermState | null>(null)
  const [busy,  setBusy]   = useState(false)
  const [error, setError]  = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof Notification === 'undefined') return
    const read = () => setPerm(Notification.permission as PermState)
    read()
    // Re-check on visibility change AND poll every 1s. Chrome doesn't fire
    // a reliable event when the user flips the permission via the padlock
    // dropdown inside the same tab — and the Permissions API
    // `change` event isn't supported on Safari / older Chrome. Polling
    // closes that gap so the banner reflects reality immediately after
    // the user changes the toggle.
    const onVis = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVis)

    let permsApiCleanup: (() => void) | undefined
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'notifications' as PermissionName })
        .then(status => {
          status.onchange = read
          permsApiCleanup = () => { status.onchange = null }
        })
        .catch(() => { /* permissions API not supported */ })
    }

    const id = setInterval(read, 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(id)
      permsApiCleanup?.()
    }
  }, [])

  // When permission becomes granted (either from the in-app prompt or from
  // an external Chrome settings flip), make sure the FCM token is registered
  // — earlier in the page lifecycle this would have been skipped because
  // permission was 'default' or 'denied'.
  useEffect(() => {
    if (perm === 'granted') {
      registerFCMToken().catch(() => {})
    }
  }, [perm])

  async function enable() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const result = await Notification.requestPermission()
      setPerm(result as PermState)
      if (result === 'granted') {
        // Await the token register so we can surface real failure reasons
        // (missing VAPID key on server, scope conflict with worker-sw.js,
        // stale browser permission). Without this the user grants and
        // sees nothing — exactly the "notification allowing issue" we
        // were getting reports on.
        try {
          await registerFCMToken()
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not register device for notifications.'
          setError(msg)
        }
      } else if (result === 'denied') {
        setError('Chrome marked notifications as blocked. Use the steps below to unblock.')
      } else {
        setError('Prompt was dismissed. Tap Enable again to retry.')
      }
    } catch {
      setError('Could not request permission. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch {}
    setPerm('granted') // collapses the component
  }

  function hideBlocked() {
    try { localStorage.setItem(BLOCKED_HIDE_KEY, '1') } catch {}
    setPerm('granted')
  }

  if (perm === null) return null

  // perm === 'granted' — render nothing. The green "Notifications enabled
  // ✓ Send test" card was cluttering the worker home for users who'd
  // already granted permission. FCM token registration still happens in
  // the perm-change useEffect above.
  if (perm === 'granted') return null

  if (perm === 'default') {
    if (typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === '1') return null
    return (
      <div style={{
        margin: '12px 16px 4px',
        borderRadius: 16,
        background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
        border: '1px solid rgba(251,191,36,0.4)',
        padding: '14px 14px 16px',
        boxShadow: '0 4px 20px rgba(251,191,36,0.18)',
        position: 'relative',
      }}>
        <button onClick={dismiss} aria-label="Dismiss"
          style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X style={{ width: 12, height: 12, color: 'rgba(0,0,0,0.55)' }} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bell style={{ width: 18, height: 18, color: '#FFFFFF' }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#78350F', margin: 0 }}>{t('enableNotifTitle')}</p>
            <p style={{ fontSize: 11, color: 'rgba(120,53,15,0.7)', margin: '2px 0 0' }}>
              {t('enableNotifSub')}
            </p>
          </div>
        </div>
        {error && <p style={{ fontSize: 11, color: '#9A3412', fontWeight: 600, margin: '6px 0 8px' }}>{error}</p>}
        <button onClick={enable} disabled={busy}
          style={{ width: '100%', height: 42, borderRadius: 12, border: 'none', background: '#111111', color: '#FFFFFF', fontSize: 14, fontWeight: 800, cursor: busy ? 'default' : 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', opacity: busy ? 0.6 : 1 }}>
          {busy ? t('enableNotifAsking') : t('enableNotifBtn')}
        </button>
      </div>
    )
  }

  // perm === 'denied' — browser will not re-prompt, only manual unblock works
  if (typeof window !== 'undefined' && localStorage.getItem(BLOCKED_HIDE_KEY) === '1') return null

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  const isIOS     = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
  const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)

  return (
    <div style={{
      margin: '12px 16px 4px',
      borderRadius: 16,
      background: 'linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)',
      border: '1px solid rgba(220,38,38,0.35)',
      padding: '14px 14px 16px',
      boxShadow: '0 4px 20px rgba(220,38,38,0.18)',
      position: 'relative',
    }}>
      <button onClick={hideBlocked} aria-label="Dismiss"
        style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X style={{ width: 12, height: 12, color: 'rgba(0,0,0,0.55)' }} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <BellOff style={{ width: 18, height: 18, color: '#FFFFFF' }} />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#7F1D1D', margin: 0 }}>{t('notifBlockedTitle')}</p>
          <p style={{ fontSize: 11, color: 'rgba(127,29,29,0.75)', margin: '2px 0 0' }}>
            {t('notifBlockedSub')}
          </p>
        </div>
      </div>

      <div style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(220,38,38,0.18)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
        {isAndroid && isStandalone && (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7F1D1D', lineHeight: 1.55 }}>
            <li>Long-press the Switch app icon → <b>App info</b></li>
            <li>Tap <b>Notifications</b> → toggle <b>All Switch notifications</b> on</li>
            <li>Re-open the app and tap <b>Check again</b> below</li>
          </ol>
        )}
        {isAndroid && !isStandalone && (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7F1D1D', lineHeight: 1.55 }}>
            <li>Tap the <b>padlock 🔒</b> in Chrome&apos;s address bar (or the three-dot menu → <b>Site settings</b>)</li>
            <li>Tap <b>Permissions</b> → <b>Notifications</b> → <b>Allow</b></li>
            <li>Reload the page, then tap <b>Check again</b></li>
          </ol>
        )}
        {isIOS && (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7F1D1D', lineHeight: 1.55 }}>
            <li>Open <b>Settings → Notifications → Switch</b></li>
            <li>Toggle <b>Allow Notifications</b> on</li>
            <li>Re-open the app and tap <b>Check again</b></li>
          </ol>
        )}
        {!isAndroid && !isIOS && (
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#7F1D1D', lineHeight: 1.55 }}>
            <li>Click the <b>padlock 🔒</b> next to the URL</li>
            <li>Set <b>Notifications</b> to <b>Allow</b></li>
            <li>Reload the page, then click <b>Check again</b></li>
          </ol>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setPerm(typeof Notification !== 'undefined' ? (Notification.permission as PermState) : 'denied')}
          style={{ flex: 1, height: 40, borderRadius: 11, border: '1px solid rgba(127,29,29,0.25)', background: 'rgba(255,255,255,0.5)', color: '#7F1D1D', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          {t('notifBlockedCheck')}
        </button>
        <a href="https://support.google.com/chrome/answer/3220216" target="_blank" rel="noopener noreferrer"
          style={{ flex: 1, height: 40, borderRadius: 11, border: 'none', background: '#7F1D1D', color: '#FFFFFF', fontSize: 13, fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {t('notifBlockedHelp')} <ExternalLink style={{ width: 12, height: 12 }} />
        </a>
      </div>
    </div>
  )
}
