'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, MapPin, IndianRupee, Zap, Shield } from 'lucide-react'
import { useLang } from '@/lib/lang'

const SLIDES = [
  { Icon: MapPin,        bg:'#111111',  icon:'#FFFFFF', emoji:'📍' },
  { Icon: IndianRupee,   bg:'#111111',  icon:'#FFFFFF', emoji:'💰' },
  { Icon: Zap,           bg:'#111111',  icon:'#FFFFFF', emoji:'⚡' },
  { Icon: Shield,        bg:'#111111',  icon:'#FFFFFF', emoji:'🔒' },
]

const SLIDE_KEYS = ['onb1','onb2','onb3','onb4'] as const

export default function OnboardingPage() {
  const [idx, setIdx] = useState(0)
  const router = useRouter()
  const { t } = useLang()

  const slide  = SLIDES[idx]
  const isLast = idx === SLIDES.length - 1
  const key    = SLIDE_KEYS[idx]

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background:'#FFFFFF', paddingTop:'var(--safe-t)', paddingBottom:'var(--safe-b)' }}
    >
      {/* Skip */}
      {!isLast && (
        <div className="flex justify-end px-6 pt-4">
          <button
            onClick={() => router.push('/register')}
            style={{ fontSize:14, color:'rgba(0,0,0,0.35)', fontWeight:600 }}
          >
            Skip
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div
          className="w-28 h-28 flex items-center justify-center mb-10"
          style={{ background: slide.bg, borderRadius: 36, boxShadow:`0 20px 60px ${slide.icon}30` }}
        >
          <slide.Icon style={{ width: 56, height: 56, color: slide.icon, strokeWidth: 1.5 }} />
        </div>

        <h1 className="font-black mb-4" style={{ fontSize: 28, lineHeight: 1.15, letterSpacing: -0.5, color: '#111111' }}>
          {t[`${key}_title` as keyof typeof t] as string}
        </h1>
        <p style={{ fontSize: 16, color:'rgba(0,0,0,0.5)', lineHeight: 1.7, maxWidth: 300 }}>
          {t[`${key}_sub` as keyof typeof t] as string}
        </p>
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-2 pb-8">
        {SLIDES.map((_,i) => (
          <div
            key={i}
            onClick={() => setIdx(i)}
            style={{
              height: 6, borderRadius: 3,
              width: i === idx ? 24 : 6,
              background: i === idx ? '#111111' : 'rgba(0,0,0,0.12)',
              transition: 'all 0.3s',
            }}
          />
        ))}
      </div>

      {/* CTA */}
      <div className="px-6 pb-8 space-y-3">
        {isLast ? (
          <>
            <button
              onClick={() => router.push('/register')}
              className="btn btn-primary btn-full"
              style={{ fontSize:16, fontWeight:700, padding:'16px 24px', borderRadius:16, background:'#111111', boxShadow:'0 6px 24px rgba(0,0,0,0.15)' }}
            >
              {t.get_started}
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full text-center py-3"
              style={{ fontSize:14, color:'rgba(0,0,0,0.5)', fontWeight:600 }}
            >
              {t.already_account}
            </button>
          </>
        ) : (
          <button
            onClick={() => setIdx(i => i + 1)}
            className="btn btn-full"
            style={{ fontSize:15, fontWeight:700, padding:'16px 24px', borderRadius:16, background:'#F5F5F5', color:'#111111', border:'1px solid rgba(0,0,0,0.09)' }}
          >
            Next <ChevronRight style={{ width:18, height:18 }} />
          </button>
        )}
      </div>
    </div>
  )
}
