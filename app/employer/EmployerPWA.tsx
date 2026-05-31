'use client'
import { useEffect, useState } from 'react'

export default function EmployerPWA() {
  const [prompt,    setPrompt]    = useState<any>(null)
  const [show,      setShow]      = useState(false)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/employer-sw.js', { scope: '/employer/' }).catch(() => {})
    }

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setInstalled(true)
      return
    }

    if (localStorage.getItem('employer_pwa_dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler as any)
    window.addEventListener('appinstalled', () => { setInstalled(true); setShow(false) })

    return () => window.removeEventListener('beforeinstallprompt', handler as any)
  }, [])

  async function install() {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setShow(false)
    localStorage.setItem('employer_pwa_dismissed', '1')
  }

  function dismiss() {
    setShow(false)
    localStorage.setItem('employer_pwa_dismissed', '1')
  }

  if (!show || installed) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: '#111111',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      padding: '32px 24px',
      paddingTop: 'calc(32px + env(safe-area-inset-top))',
      paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
      animation: 'epwaFadeIn 0.4s ease',
    }}>
      <style>{`
        @keyframes epwaFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes epwaUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        .epwa-install:hover { background: #F0F0F0 !important; }
        .epwa-later:hover { background: rgba(255,255,255,0.08) !important; }
      `}</style>

      <div style={{
        position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ animation: 'epwaUp 0.5s ease forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 340 }}>

        <div style={{
          width: 100, height: 100, borderRadius: 28,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 28,
          boxShadow: '0 0 60px rgba(255,255,255,0.1), 0 0 120px rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontSize: 58, fontWeight: 900, color: '#111111', lineHeight: 1, letterSpacing: -3, fontFamily: '"DM Sans", sans-serif' }}>S</span>
        </div>

        <p style={{ fontSize: 28, fontWeight: 900, color: '#FFFFFF', margin: '0 0 8px', letterSpacing: -1, textAlign: 'center' }}>
          Switch
        </p>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: '0 0 32px', textAlign: 'center' }}>
          Post jobs. Hire verified workers.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 40, flexWrap: 'wrap', justifyContent: 'center' }}>
          {['⚡ Instant access', '📴 Works offline', '🔔 Job alerts'].map(f => (
            <div key={f} style={{
              padding: '6px 14px', borderRadius: 20,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
              whiteSpace: 'nowrap' as const,
            }}>{f}</div>
          ))}
        </div>

        <button
          className="epwa-install"
          onClick={install}
          style={{
            width: '100%', height: 58, borderRadius: 18,
            border: 'none', background: '#FFFFFF',
            color: '#111111', fontSize: 17, fontWeight: 800,
            cursor: 'pointer', marginBottom: 14,
            transition: 'background 0.15s',
            letterSpacing: -0.3,
          }}
        >
          Install App
        </button>

        <button
          className="epwa-later"
          onClick={dismiss}
          style={{
            width: '100%', height: 48, borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: 600,
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
