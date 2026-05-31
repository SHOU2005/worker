'use client'
import { useEffect, useRef, useState } from 'react'

const SLIDES = [
  {
    bg:    'linear-gradient(160deg, #060D1F 0%, #0C1B3A 60%, #111827 100%)',
    glow:  'rgba(27,63,154,0.3)',
    icon:  '📍',
    color: '#7EB3F5',
    title: 'Find Jobs Near You',
    sub:   'See verified shifts within 5 km of your home. Choose work that fits your time — today or tomorrow.',
  },
  {
    bg:    'linear-gradient(160deg, #071A0F 0%, #0C2918 60%, #111827 100%)',
    glow:  'rgba(16,185,129,0.25)',
    icon:  '💰',
    color: '#10B981',
    title: 'Earn ₹99–₹129 Per Hour',
    sub:   'Fixed hourly rates. Zero agent cuts. No hidden fees. Money goes straight to your bank after every shift.',
  },
  {
    bg:    'linear-gradient(160deg, #0A0A1A 0%, #18103A 60%, #111827 100%)',
    glow:  'rgba(139,92,246,0.25)',
    icon:  '🛡️',
    color: '#A78BFA',
    title: 'Safe & 100% Verified',
    sub:   'Every employer is background-checked. Every job is real. Your Aadhaar protects your identity.',
  },
]

export default function OnboardingScreen() {
  const [show,  setShow]  = useState(false)
  const [step,  setStep]  = useState(0)
  const [anim,  setAnim]  = useState<'idle'|'exit-left'|'exit-right'|'enter-left'|'enter-right'>('idle')

  const touchStartX = useRef(0)
  const touchEndX   = useRef(0)

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('sw_onboarded')) {
      const t = setTimeout(() => setShow(true), 2450)
      return () => clearTimeout(t)
    }
  }, [])

  if (!show) return null

  function goTo(next: number) {
    if (anim !== 'idle') return
    const dir = next > step ? 'left' : 'right'
    setAnim(`exit-${dir}`)
    setTimeout(() => {
      setStep(next)
      setAnim(`enter-${dir === 'left' ? 'right' : 'left'}`)
      setTimeout(() => setAnim('idle'), 30)
    }, 200)
  }

  function finish() {
    localStorage.setItem('sw_onboarded', '1')
    setShow(false)
  }

  function onTouchStart(e: React.TouchEvent) { touchStartX.current = e.targetTouches[0].clientX }
  function onTouchEnd(e: React.TouchEvent) {
    touchEndX.current = e.changedTouches[0].clientX
    const delta = touchStartX.current - touchEndX.current
    if (Math.abs(delta) < 40) return
    if (delta > 0 && step < SLIDES.length - 1) goTo(step + 1)
    if (delta < 0 && step > 0) goTo(step - 1)
  }

  const slide = SLIDES[step]

  const slideStyle: React.CSSProperties = {
    transition: anim === 'idle' ? 'none' : 'transform 0.22s ease, opacity 0.22s ease',
    transform:
      anim === 'exit-left'   ? 'translateX(-60px)' :
      anim === 'exit-right'  ? 'translateX(60px)'  :
      anim === 'enter-left'  ? 'translateX(60px)'  :
      anim === 'enter-right' ? 'translateX(-60px)'  : 'translateX(0)',
    opacity: anim.startsWith('exit') ? 0 : 1,
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: slide.bg, transition: 'background 0.5s ease', paddingTop: 'var(--safe-t)', paddingBottom: 'var(--safe-b)' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Glow orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ width:280, height:280, borderRadius:'50%', background:slide.glow, filter:'blur(72px)', transition:'background 0.5s' }} />

      {/* Skip */}
      <div className="flex justify-end px-6 pt-4 flex-shrink-0">
        <button onClick={finish} style={{ fontSize:14, fontWeight:600, color:'rgba(255,255,255,0.35)', padding:'8px 4px' }}>
          Skip
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center" style={slideStyle}>
        {/* Icon */}
        <div className="mb-8 flex items-center justify-center"
          style={{ width:120, height:120, borderRadius:34, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:`0 20px 60px ${slide.glow}` }}>
          <span style={{ fontSize:52 }}>{slide.icon}</span>
        </div>

        <h1 className="font-black text-white mb-4" style={{ fontSize:28, lineHeight:1.2 }}>
          {slide.title}
        </h1>
        <p style={{ fontSize:16, color:'rgba(255,255,255,0.55)', lineHeight:1.65, maxWidth:300 }}>
          {slide.sub}
        </p>
      </div>

      {/* Bottom controls */}
      <div className="flex-shrink-0 px-6 pb-8">
        {/* Dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              style={{
                height: 6,
                width: i === step ? 28 : 8,
                borderRadius: 3,
                background: i === step ? slide.color : 'rgba(255,255,255,0.2)',
                transition: 'width 0.3s ease, background 0.3s ease',
              }}
            />
          ))}
        </div>

        {step < SLIDES.length - 1 ? (
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={() => goTo(step - 1)}
                className="w-14 h-14 flex items-center justify-center rounded-2xl flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize:20 }}>←</span>
              </button>
            )}
            <button
              onClick={() => goTo(step + 1)}
              className="flex-1 h-14 flex items-center justify-center gap-2 rounded-2xl font-bold text-white"
              style={{ background:`linear-gradient(135deg, #0B1D4A, #1B3F9A)`, boxShadow:'0 8px 28px rgba(11,29,74,0.6)', fontSize:16 }}>
              Next
              <span style={{ fontSize:18 }}>→</span>
            </button>
          </div>
        ) : (
          <button
            onClick={finish}
            className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl font-bold text-white"
            style={{ background:`linear-gradient(135deg, #0B1D4A, #1B3F9A)`, boxShadow:'0 8px 28px rgba(11,29,74,0.6)', fontSize:16 }}>
            Get Started →
          </button>
        )}

        <p className="text-center mt-5" style={{ fontSize:14, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>
          Already have an account?{' '}
          <button onClick={finish} style={{ color:'#7EB3F5', fontWeight:700 }}>Log in</button>
        </p>
      </div>
    </div>
  )
}
