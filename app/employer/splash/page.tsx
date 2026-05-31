'use client'
import { useEffect } from 'react'

const FONT = '"DM Sans", -apple-system, "system-ui", Roboto, sans-serif'

export default function EmployerSplash() {
  useEffect(() => {
    sessionStorage.setItem('emp_splashed', '1')
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/employer/profile', { credentials: 'include' })
        if (res.ok) {
          window.location.replace('/employer')
          return
        }
        // 401/403 → not signed in; redirect to login.
        // 5xx (DB down etc.) → user IS likely authenticated; bouncing them to
        // login would log them out. Send to /employer and let the page show
        // its own error state.
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          window.location.replace('/employer/login')
        } else {
          window.location.replace('/employer')
        }
      } catch {
        // Network error — also retry at /employer rather than forcing logout.
        window.location.replace('/employer')
      }
    }, 2400)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      background: '#080808',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      overflow: 'hidden', position: 'relative',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>

      {/* Subtle grid */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.03, pointerEvents: 'none' }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" x="0" y="0" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Logo + text */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp 0.6s ease forwards' }}>
        <div style={{
          width: 96, height: 96, borderRadius: 28,
          background: '#111111', border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 24px 64px rgba(0,0,0,0.9)', marginBottom: 28,
        }}>
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: '#000000', border: '1.5px solid rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 34, fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1, fontFamily: '"DM Sans", system-ui, sans-serif' }}>S</span>
          </div>
        </div>

        <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', letterSpacing: -2, lineHeight: 1 }}>Switch</div>
        <div style={{
          marginTop: 12, marginBottom: 32,
          background: 'rgba(255,255,255,0.07)',
          borderRadius: 24, padding: '6px 18px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 2, textTransform: 'uppercase' as const }}>
            For Employers
          </span>
        </div>

        <div style={{ textAlign: 'center', maxWidth: 280 }}>
          <div style={{ fontSize: 22, color: '#fff', fontWeight: 700, lineHeight: '30px', marginBottom: 10 }}>
            Hire Smarter.<br/>Pay Faster.
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: '22px' }}>
            Verified workers · Auto-match · Secure payments
          </div>
        </div>
      </div>

      {/* Bottom progress */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(48px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        animation: 'fadeIn 0.5s ease 0.4s both',
      }}>
        <div style={{ width: 120, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: '#FFFFFF',
            animation: 'loadBar 2.2s ease-in-out forwards',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Instant Hire', 'OTP Verified', 'Pay After'].map(tag => (
            <div key={tag} style={{
              fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
              background: 'rgba(255,255,255,0.04)', borderRadius: 20,
              padding: '5px 10px', border: '1px solid rgba(255,255,255,0.06)',
              whiteSpace: 'nowrap' as const,
            }}>{tag}</div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes loadBar {
          0%   { width: 0% }
          20%  { width: 18% }
          55%  { width: 62% }
          85%  { width: 88% }
          100% { width: 100% }
        }
      `}</style>
    </div>
  )
}
