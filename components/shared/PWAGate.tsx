'use client'
/**
 * First-screen install gate. Wraps an app's content; on the user's first
 * visit it shows a full-screen "Install App" prompt instead of the page,
 * until they either install (via beforeinstallprompt on Chrome/Android,
 * or manual Add-to-Home-Screen on iOS) or tap "Continue in Browser".
 *
 * Once installed (display-mode: standalone) or dismissed, the gate gets
 * out of the way permanently for that user/device. State is local —
 * each role app has its own dismissal key.
 */
import { useEffect, useState, ReactNode } from 'react'

interface Props {
  children:     ReactNode
  appName:      string      // "Switch", "Switch Captain", "Switch Ops"
  tagline:      string      // one-liner under the app name
  swPath:       string      // "/employer-sw.js", "/worker-sw.js", etc.
  swScope:      string      // "/employer/", "/", "/captain/"
  dismissalKey: string      // "employer_pwa_dismissed", etc. — unique per app
  bg?:          string      // background color, defaults to #111111
  features?:    string[]    // pill-shaped feature list shown above the buttons
}

type Stage = 'checking' | 'show-install' | 'show-ios' | 'pass-through'

// Heuristic — works for iOS Safari + Chrome iOS. Both can install PWAs
// via the manual "Share → Add to Home Screen" flow but neither fires
// the beforeinstallprompt event. We need to show them dedicated copy.
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPad on iOS 13+ reports MacIntel; check for touch as fallback.
  const isIPad = /MacIntel/.test(navigator.platform) && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || isIPad
}

// Rough Android Chrome detection — for the manual-install instructions
// fallback when beforeinstallprompt never fires (already installed once
// on the device, browser doesn't support it, etc.).
function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}

export default function PWAGate({ children, appName, tagline, swPath, swScope, dismissalKey, bg = '#111111', features = ['⚡ Instant access', '📴 Works offline', '🔔 Job alerts'] }: Props) {
  const [stage,      setStage]      = useState<Stage>('checking')
  const [prompt,     setPrompt]     = useState<any>(null)
  // Fallback when `beforeinstallprompt` never fires (Chrome remembers
  // user already dismissed install for ~90 days; Firefox doesn't
  // support it at all; some embedded WebViews don't either). After a
  // short wait we surface manual install steps so the user isn't
  // stuck on a disabled "Preparing install…" button forever.
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    // Listen for `beforeinstallprompt` BEFORE doing anything else — the
    // event can fire as early as the document parses if criteria are
    // met, and missing it means we'd never get a native install dialog.
    const handler = (e: Event) => {
      e.preventDefault()
      // Stash on window so the click handler can grab the captured event
      // even if React state hasn't rerendered yet — eliminates the race
      // where the user taps Install the same tick the event fires.
      try { (window as any).__switchPwaPrompt = e } catch {}
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as any)
    const onInstalled = () => {
      try { localStorage.setItem(dismissalKey, '1') } catch {}
      setStage('pass-through')
    }
    window.addEventListener('appinstalled', onInstalled)

    // Register the role-specific service worker so the manifest's
    // start_url / scope works once the user installs. Chrome needs an
    // ACTIVE SW before `beforeinstallprompt` can fire, so we also wait
    // on navigator.serviceWorker.ready — without that wait, fast users
    // could tap Install before the SW activated and Chrome would never
    // surface the prompt (we band-aided this with a 1.2s timeout, but
    // ready-then-show is more deterministic).
    let swReady: Promise<void> = Promise.resolve()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(swPath, { scope: swScope }).catch(() => {})
      swReady = navigator.serviceWorker.ready.then(() => undefined).catch(() => undefined)
    }

    // Running inside the Capacitor WebView (signed AAB / iOS native build)?
    // The install gate makes no sense there — the user already has the app.
    // Capacitor exposes `Capacitor.isNativePlatform()` on window when it's
    // bootstrapped, so a truthy result means we're in the native shell.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) {
      setStage('pass-through')
      return () => {
        window.removeEventListener('beforeinstallprompt', handler as any)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    // Already installed? Skip the gate forever.
    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true) {
      setStage('pass-through')
      return () => {
        window.removeEventListener('beforeinstallprompt', handler as any)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    // Previously dismissed? Skip.
    if (localStorage.getItem(dismissalKey)) {
      setStage('pass-through')
      return () => {
        window.removeEventListener('beforeinstallprompt', handler as any)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    // Wait for the SW to actually activate (Chrome's install criteria
    // require an active SW) AND give beforeinstallprompt a tick to
    // fire after activation. Race between swReady and a 1.5s safety
    // timeout so we still show the gate eventually on browsers that
    // don't ship beforeinstallprompt (Firefox / Safari fallback).
    //
    // iOS gets shown immediately — Safari NEVER fires the event so
    // there's nothing to wait for; we go straight to manual steps.
    if (isIOS()) {
      setStage('show-ios')
    } else {
      const timeout = setTimeout(() => setStage('show-install'), 1500)
      let done = false
      void swReady.then(() => {
        if (done) return
        // SW is active — give Chrome a brief tick to push beforeinstallprompt
        // before we render so the click handler can fire it natively.
        setTimeout(() => { if (!done) setStage('show-install') }, 300)
      })
      return () => {
        done = true
        clearTimeout(timeout)
        window.removeEventListener('beforeinstallprompt', handler as any)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler as any)
      window.removeEventListener('appinstalled', onInstalled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for `beforeinstallprompt` to land for up to `timeoutMs`, then
  // resolve with whatever's captured (or null). Chrome sometimes fires the
  // event a tick or two after page load, so if the user taps Install
  // before that, we wait briefly instead of immediately surrendering to
  // the manual-instructions panel.
  function waitForPrompt(timeoutMs = 3000): Promise<any> {
    if (prompt) return Promise.resolve(prompt)
    return new Promise(resolve => {
      const start = Date.now()
      const id = setInterval(() => {
        if (prompt) { clearInterval(id); resolve(prompt); return }
        // Also peek at the latest captured value via the handler — React
        // state updates lag, so the closure here might still see `null`.
        const latest = (window as any).__switchPwaPrompt
        if (latest)  { clearInterval(id); resolve(latest); return }
        if (Date.now() - start > timeoutMs) { clearInterval(id); resolve(null) }
      }, 150)
    })
  }

  async function install() {
    // Always try the native prompt first — even if state says null, the
    // event may have just fired but state hasn't rerendered yet.
    const p = prompt || (window as any).__switchPwaPrompt || await waitForPrompt()
    if (p) {
      try {
        p.prompt()
        const { outcome } = await p.userChoice
        if (outcome === 'accepted') {
          try { localStorage.setItem(dismissalKey, '1') } catch {}
          setStage('pass-through')
        }
      } catch { /* user cancelled */ }
      return
    }
    // No native prompt available (browser dismissed it earlier, Firefox,
    // embedded WebView, etc.). The browser is the only thing that can
    // actually trigger an install — surface the shortest possible path.
    setShowManual(true)
  }

  function dismiss() {
    try { localStorage.setItem(dismissalKey, '1') } catch {}
    setStage('pass-through')
  }

  if (stage === 'checking')      return null
  if (stage === 'pass-through')  return <>{children}</>

  // Install screen — covers the whole viewport so it really is the
  // first thing the user sees.
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '32px 24px',
      paddingTop: 'calc(32px + env(safe-area-inset-top))',
      paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
      animation: 'pwaFadeIn 0.3s ease',
      overflowY: 'auto',
    }}>
      <style>{`
        @keyframes pwaFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pwaUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        .pwa-cta-primary:hover    { background: #F0F0F0 !important; }
        .pwa-cta-secondary:hover  { background: rgba(255,255,255,0.08) !important; }
      `}</style>

      <div style={{ animation: 'pwaUp 0.45s ease forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 360 }}>

        <div style={{
          width: 96, height: 96, borderRadius: 26,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 22,
          boxShadow: '0 0 60px rgba(255,255,255,0.10), 0 0 140px rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontSize: 54, fontWeight: 900, color: '#111111', lineHeight: 1, letterSpacing: -3, fontFamily: '"DM Sans", sans-serif' }}>S</span>
        </div>

        <p style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', margin: '0 0 6px', letterSpacing: -1, textAlign: 'center' }}>
          {appName}
        </p>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px', textAlign: 'center', lineHeight: '20px' }}>
          {tagline}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          {features.map(f => (
            <div key={f} style={{
              padding: '6px 14px', borderRadius: 20,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
              fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap' as const,
            }}>{f}</div>
          ))}
        </div>

        {stage === 'show-ios' ? (
          // iOS Safari can't auto-prompt — show the 3-step Add to Home Screen
          // flow visually so the user knows exactly which buttons to tap.
          <div style={{ width: '100%', marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginBottom: 14 }}>
              Install on iPhone
            </div>
            {[
              { n: '1', t: 'Tap the Share button',          s: 'The square-with-up-arrow icon at the bottom of Safari' },
              { n: '2', t: 'Scroll → Add to Home Screen',   s: 'Find the option in the share sheet' },
              { n: '3', t: 'Tap Add',                       s: 'Switch will appear on your home screen like a real app' },
            ].map(s => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 13,
                  background: 'rgba(255,255,255,0.10)', color: '#FFFFFF',
                  fontSize: 13, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  {s.n}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{s.t}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1, lineHeight: '17px' }}>{s.s}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Always-enabled CTA. With a native `beforeinstallprompt`
                handle we fire it directly; without one we open the
                manual-instructions panel below so the user is never
                stuck on a dead "Preparing install…" button. */}
            <button
              className="pwa-cta-primary"
              onClick={install}
              style={{
                width: '100%', height: 58, borderRadius: 18,
                border: 'none',
                background: '#FFFFFF',
                color: '#111111',
                fontSize: 17, fontWeight: 800,
                cursor: 'pointer', marginBottom: 14,
                transition: 'background 0.15s',
                letterSpacing: -0.3,
              }}
            >
              Install App
            </button>

            {showManual && (
              <div style={{ width: '100%', marginBottom: 14, padding: 16, borderRadius: 16,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.75)', marginBottom: 10 }}>
                  {isAndroid() ? 'Install on Android' : 'Install on this device'}
                </div>
                {(isAndroid()
                  ? [
                      { n: '1', t: 'Tap the ⋮ menu',            s: 'Top-right corner of Chrome' },
                      { n: '2', t: 'Choose "Install app"',      s: 'Or "Add to Home screen" on older Chrome' },
                      { n: '3', t: 'Confirm install',           s: 'Switch will appear on your home screen' },
                    ]
                  : [
                      { n: '1', t: 'Open the browser menu',     s: 'Usually a ⋮ or three-line icon near the URL bar' },
                      { n: '2', t: 'Pick "Install" / "Add"',    s: 'Wording varies — look for an install option' },
                      { n: '3', t: 'Confirm',                   s: 'The app icon will appear on your home screen / dock' },
                    ]
                ).map(s => (
                  <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12,
                      background: 'rgba(255,255,255,0.10)', color: '#FFFFFF',
                      fontSize: 12, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                      {s.n}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{s.t}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 1, lineHeight: '17px' }}>{s.s}</div>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
                  Don&apos;t see an install option? Your browser may not support PWA installs. Tap &ldquo;Continue in Browser&rdquo; below.
                </div>
              </div>
            )}
          </>
        )}

        <button
          className="pwa-cta-secondary"
          onClick={dismiss}
          style={{
            width: '100%', height: 48, borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          Continue in Browser
        </button>
      </div>
    </div>
  )
}
