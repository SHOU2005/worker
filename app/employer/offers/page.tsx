'use client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BadgePercent, Sparkles, Tag } from 'lucide-react'

const BG    = '#08090C'
const SURF  = '#13151B'
const BD    = 'rgba(255,255,255,0.07)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

// First-party promos. Keep this list small and only surface coupons the
// employer can actually redeem at checkout — the cart accepts `SAVE50`.
const PROMOS = [
  {
    code:  'SAVE50',
    title: '₹50 off your first booking',
    sub:   'Auto-applied at checkout for new accounts',
    color: '#22C55E',
  },
]

export default function EmployerOffersPage() {
  const router = useRouter()

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(16px + env(safe-area-inset-top)) 18px 8px' }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 24, height: 24 }} />
        </button>
        <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>All Offers</div>
      </div>

      <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PROMOS.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <BadgePercent style={{ width: 28, height: 28, color: T1 }} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T1 }}>No active offers</div>
            <div style={{ fontSize: 13, color: T2, marginTop: 6 }}>Check back soon — we run promos for new bookings every month.</div>
          </div>
        ) : (
          PROMOS.map(p => (
            <div key={p.code} style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, padding: 18, display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: `${p.color}26`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Tag style={{ width: 22, height: 22, color: p.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: T1 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>{p.sub}</div>
                <div style={{ marginTop: 8, display: 'inline-block', padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: `1px dashed ${T3}`, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
                  {p.code}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Refer banner — always-on green prompt, even when there are coupons */}
        <button onClick={() => router.push('/employer/refer')}
          style={{ marginTop: 18, background: SURF, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT, color: T1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(34,197,94,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles style={{ width: 20, height: 20, color: '#22C55E' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T1 }}>Earn ₹150 per referral</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>Better than any coupon — credit hits your wallet</div>
          </div>
        </button>
      </div>
    </div>
  )
}
