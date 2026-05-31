'use client'
import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { useLang } from '@/lib/lang'

// Brief confirmation interstitial shown right after Razorpay verify
// succeeds. Auto-redirects to /employer/job/[id] after 3 seconds so the
// employer lands on the live status page automatically; the explicit
// button is there for the impatient (and for screen readers).
//
// Lives at /employer/job/[id]/booked. cart/verify success redirects here
// instead of straight to the live page, so the employer has a moment of
// closure between payment and the job-tracking UI.
export default function BookedPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { t } = useLang()

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(`/employer/job/${id}`)
    }, 3000)
    return () => clearTimeout(timer)
  }, [id, router])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A0A0A', color: '#FFFFFF',
      display: 'flex', flexDirection: 'column' as const,
      alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      paddingTop: 'calc(48px + env(safe-area-inset-top))',
      paddingBottom: 'calc(48px + env(safe-area-inset-bottom))',
      fontFamily: '"DM Sans", system-ui, sans-serif',
      textAlign: 'center' as const,
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: 48,
        background: 'rgba(34,197,94,0.12)',
        border: '2px solid #22C55E',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
        animation: 'pop 0.5s cubic-bezier(0.34,1.56,0.64,1)',
      }}>
        <CheckCircle style={{ width: 48, height: 48, color: '#22C55E', strokeWidth: 2 }} />
      </div>

      <p style={{ fontSize: 28, fontWeight: 900, margin: '0 0 8px', letterSpacing: -0.5 }}>
        {t.booked_title}
      </p>
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', margin: '0 0 24px', maxWidth: 320, lineHeight: 1.5 }}>
        {t.booked_sub}
      </p>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 18px', borderRadius: 32,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
        marginBottom: 32,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: 4,
          background: '#FCD34D',
          animation: 'livePulse 1.2s ease infinite',
        }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>
          {t.booked_searching}
        </span>
      </div>

      <button
        onClick={() => router.replace(`/employer/job/${id}`)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 24px', borderRadius: 14, border: 'none',
          background: '#FFFFFF', color: '#000000',
          fontSize: 15, fontWeight: 800, cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {t.booked_view_job}
        <ArrowRight style={{ width: 18, height: 18 }} />
      </button>

      <style>{`
        @keyframes pop {
          0%   { transform: scale(0); opacity: 0; }
          65%  { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </div>
  )
}
