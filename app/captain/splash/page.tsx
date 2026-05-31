'use client'
import { useEffect } from 'react'
import { useLanguage } from '../LanguageContext'

const FONT = '"DM Sans", -apple-system, "system-ui", Roboto, sans-serif'

export default function CaptainSplash() {
  const { t } = useLanguage()

  useEffect(() => {
    sessionStorage.setItem('captain_splashed', '1')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/captain/profile', { credentials: 'include' })
        window.location.replace(res.ok ? '/captain' : '/captain/login')
      } catch {
        window.location.replace('/captain/login')
      }
    }, 2400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      background: '#111111',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      overflow: 'hidden', position: 'relative',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>

      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute', top: '25%', left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Logo + text */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'fadeUp 0.6s ease forwards', zIndex: 1 }}>
        {/* S Logo */}
        <div style={{
          width: 96, height: 96, borderRadius: 28,
          background: '#FFFFFF',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(255,255,255,0.1)', marginBottom: 28,
        }}>
          <span style={{ fontSize: 56, fontWeight: 900, color: '#111111', lineHeight: 1, letterSpacing: -3, fontFamily: '"DM Sans", sans-serif' }}>S</span>
        </div>

        <div style={{ fontSize: 48, fontWeight: 900, color: '#FFFFFF', letterSpacing: -2, lineHeight: 1 }}>Switch</div>
        <div style={{
          marginTop: 10, marginBottom: 32,
          background: 'rgba(255,255,255,0.1)',
          borderRadius: 24, padding: '6px 18px',
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: 2, textTransform: 'uppercase' as const }}>
            Captain
          </span>
        </div>

        <div style={{ textAlign: 'center', maxWidth: 280 }}>
          <div style={{ fontSize: 22, color: '#FFFFFF', fontWeight: 700, lineHeight: '30px', marginBottom: 10, whiteSpace: 'pre-line' }}>
            {t('splashTagline')}
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: '22px' }}>
            {t('splashSubtitle')}
          </div>
        </div>
      </div>

      {/* Bottom progress */}
      <div style={{
        position: 'absolute',
        bottom: 'calc(48px + env(safe-area-inset-bottom))',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        animation: 'fadeIn 0.5s ease 0.4s both',
        zIndex: 1,
      }}>
        <div style={{ width: 120, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: '#FFFFFF',
            animation: 'loadBar 2.2s ease-in-out forwards',
          }} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {[t('perBooking'), t('gpsCheckIn'), t('liveLeaderboard')].map(tag => (
            <div key={tag} style={{
              fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)',
              background: 'rgba(255,255,255,0.06)', borderRadius: 20,
              padding: '5px 10px', border: '1px solid rgba(255,255,255,0.1)',
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
