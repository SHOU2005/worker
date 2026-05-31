'use client'
import { useEffect, useState } from 'react'

export default function SplashScreen({ onDone }: { onDone?: () => void } = {}) {
  const [phase, setPhase] = useState<'enter' | 'show' | 'exit' | 'gone'>('enter')

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('sw_splashed')) {
      setPhase('gone')
      return
    }
    sessionStorage.setItem('sw_splashed', '1')
    const t0 = requestAnimationFrame(() => setPhase('show'))
    const t1 = setTimeout(() => setPhase('exit'), 2000)
    const t2 = setTimeout(() => { setPhase('gone'); onDone?.() }, 2700)
    return () => { cancelAnimationFrame(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (phase === 'gone') return null

  const entering = phase === 'enter'
  const exiting  = phase === 'exit'

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: '#000000',
        opacity: exiting ? 0 : 1,
        transition: exiting ? 'opacity 0.6s ease' : 'none',
        paddingTop: 'var(--safe-t)',
        paddingBottom: 'var(--safe-b)',
      }}
    >
      {/* Subtle glow */}
      <div style={{
        position: 'absolute',
        width: 300, height: 300, borderRadius: '50%',
        background: 'rgba(255,255,255,0.02)',
        filter: 'blur(80px)',
        transform: entering ? 'scale(0.3)' : exiting ? 'scale(2.5)' : 'scale(1)',
        transition: entering ? 'none' : exiting
          ? 'transform 0.7s ease-in'
          : 'transform 0.7s cubic-bezier(0.34,1.56,0.64,1)',
      }} />

      {/* Logo block */}
      <div style={{
        transform: entering ? 'scale(0.5) translateY(20px)' : exiting ? 'scale(1.4) translateY(-10px)' : 'scale(1) translateY(0)',
        opacity:   entering ? 0 : exiting ? 0 : 1,
        transition: entering ? 'none' : exiting
          ? 'transform 0.6s ease-in, opacity 0.45s ease'
          : 'transform 0.6s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Logo mark */}
        <div style={{
          width: 96, height: 96, borderRadius: 28, marginBottom: 24,
          background: '#111111',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(255,255,255,0.06)',
        }}>
          <span style={{ fontSize: 52, fontWeight: 900, color: '#FFFFFF', lineHeight: 1 }}>S</span>
        </div>

        <p style={{ fontSize: 32, fontWeight: 900, color: '#FFFFFF', letterSpacing: -1, marginBottom: 6 }}>Switch</p>
        <p style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.2, marginBottom: 4 }}>
          Earn daily. Work freely.
        </p>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:6 }}>
          {['₹99–₹129/hr', '·', 'Jobs near you', '·', 'Daily pay'].map((t,i) => (
            <span key={i} style={{ fontSize:12, color: i===1||i===3 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.35)', fontWeight:600 }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Bottom "Made in India" */}
      <div style={{
        position: 'absolute', bottom: 'calc(var(--safe-b) + 28px)',
        opacity: entering ? 0 : exiting ? 0 : 1,
        transition: entering ? 'none' : 'opacity 0.4s ease 0.3s',
      }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontWeight: 600, letterSpacing: '0.08em', textAlign: 'center' }}>
          MADE IN INDIA
        </p>
      </div>
    </div>
  )
}
