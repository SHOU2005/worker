'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function WelcomeCard() {
  const [show, setShow]       = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('sw_role')) return
    // Wait for splash animation to finish (2.5s first time, immediate after)
    const delay = sessionStorage.getItem('sw_splashed') ? 0 : 2500
    const t = setTimeout(() => {
      if (localStorage.getItem('sw_role')) return
      setShow(true)
      requestAnimationFrame(() => setVisible(true))
    }, delay)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col"
      style={{
        background: '#000000',
        paddingTop: 'var(--safe-t)',
        paddingBottom: 'var(--safe-b)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.4s ease',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: 280, height: 280, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', filter: 'blur(72px)' }} />
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10">

        {/* Logo */}
        <div
          style={{
            width: 100, height: 100, borderRadius: 30,
            background: '#FFFFFF',
            boxShadow: '0 24px 64px rgba(255,255,255,0.12), 0 0 0 1px rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 28,
          }}
        >
          <span style={{ fontSize: 52, fontWeight: 900, color: '#000000', lineHeight: 1 }}>S</span>
        </div>

        <p style={{ fontSize: 40, fontWeight: 900, color: '#FFFFFF', letterSpacing: -1.5, marginBottom: 6, lineHeight: 1 }}>
          Switch
        </p>
        <p style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: 44, textAlign: 'center' }}>
          Find part-time jobs near you
        </p>

        {/* Features */}
        <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { icon: '💰', title: 'Earn ₹99–₹129/hr',       sub: 'Paid daily, straight to your bank' },
            { icon: '📍', title: 'Jobs within 5 km',        sub: 'Near your home, today or tomorrow' },
            { icon: '✅', title: '50,000+ verified workers', sub: 'Safe, real employers only'         },
          ].map(f => (
            <div key={f.title} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 16, flexShrink: 0,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>{f.icon}</div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>{f.title}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{f.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="relative z-10 px-6 pb-8" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Link href="/login" style={{
          height: 60, borderRadius: 20, fontSize: 18, fontWeight: 800,
          background: '#FFFFFF',
          color: '#000000',
          boxShadow: '0 10px 36px rgba(255,255,255,0.15)',
          textDecoration: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Login <ArrowRight style={{ width: 20, height: 20 }} />
        </Link>

        <Link href="/register" style={{
          height: 58, borderRadius: 20, fontSize: 16, fontWeight: 700,
          background: 'transparent',
          color: 'rgba(255,255,255,0.7)',
          border: '1.5px solid rgba(255,255,255,0.18)',
          textDecoration: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          New to Switch? Create an account
        </Link>
      </div>
    </div>
  )
}
