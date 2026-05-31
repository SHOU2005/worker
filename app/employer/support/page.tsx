'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, ChevronDown, Calendar, User, CreditCard, MessageSquare, Shield, MessageCircle, ListOrdered, Sparkles } from 'lucide-react'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

type Faq    = { q: string; a: string }
type Cat    = { id: string; title: string; sub: string; icon: React.ComponentType<{ style?: React.CSSProperties }>; color: string; faqs: Faq[] }

const CATEGORIES: Cat[] = [
  {
    id:    'booking',
    title: 'Booking related',
    sub:   'Posting jobs, cancellations, rescheduling',
    icon:  Calendar,
    color: '#60A5FA',
    faqs:  [
      { q: 'How do I post a job?',           a: 'Tap any service tile on the home screen, pick a slot (4h / 8h / 12h / 24h), set your address and date, then pay. Workers start applying within minutes.' },
      { q: 'How do I cancel a booking?',     a: 'Open the booking from the Jobs tab and tap "Cancel & refund". Full refund if no worker has accepted yet, partial refund otherwise.' },
      { q: 'Can I reschedule a booking?',    a: 'Yes — open the booking and tap "Reschedule". Allowed up to 2 hours before the original start time.' },
      { q: 'My worker hasn\'t arrived yet.', a: 'Workers are usually within 10–15 min of the start time. Open the Working Now tab and tap "Call worker". Still no response after 30 min? Raise a ticket from this page.' },
    ],
  },
  {
    id:    'account',
    title: 'Account related',
    sub:   'Profile, login, business details',
    icon:  User,
    color: T1,
    faqs:  [
      { q: 'How do I change my business name or address?', a: 'Profile → tap your name → edit any field → Save.' },
      { q: 'I\'m not receiving the OTP.',                  a: 'Check that you have signal and that the number entered is correct. Tap "Resend OTP" after the 60-second cooldown.' },
      { q: 'How do I delete my account?',                  a: 'Raise a support ticket from this page — DPDP §12 requires a verified request before we hard-delete after a 30-day grace window.' },
    ],
  },
  {
    id:    'payment',
    title: 'Payment related',
    sub:   'Refunds, failures, wallet, statements',
    icon:  CreditCard,
    color: '#22C55E',
    faqs:  [
      { q: 'When will I get my refund?',                   a: 'Refunds settle in 3–5 working days back to the original payment method. If it\'s been longer, raise a ticket.' },
      { q: 'Payment failed but money was deducted.',       a: 'Razorpay auto-reverses failed payments within 5–7 working days. If the booking didn\'t appear in your Workers tab, your money is on its way back.' },
      { q: 'How do I top up my wallet?',                   a: 'Profile → My Wallet → tap "Add money" → choose amount → pay via UPI / card / netbanking.' },
      { q: 'What\'s the platform fee?',                    a: 'Switch charges a small platform fee on each booking (typically 8–12%). It\'s already included in the price at checkout.' },
    ],
  },
  {
    id:    'feedback',
    title: 'Feedback',
    sub:   'Ratings, reviews, suggestions',
    icon:  MessageSquare,
    color: '#F59E0B',
    faqs:  [
      { q: 'How do I rate a worker?',          a: 'After shift completion, open the Workers tab → Completed sub-tab → tap the worker → rate 1–5 stars and leave a note.' },
      { q: 'I have a suggestion for Switch.',  a: 'Raise a ticket with category "Feedback" — our product team reads every one and replies within 48 hours.' },
    ],
  },
  {
    id:    'safety',
    title: 'Safety related',
    sub:   'Concerns about a worker or shift',
    icon:  Shield,
    color: '#EF4444',
    faqs:  [
      { q: 'A worker behaved inappropriately.',          a: 'This needs immediate ops attention. Raise a safety ticket now — we triage these within 30 minutes and may involve local authorities if needed.' },
      { q: 'I think a worker stole something.',          a: 'Raise a safety ticket and call your local police if items are valuable. Switch will cooperate with any investigation and review CCTV / GPS evidence with our support team.' },
      { q: 'I felt unsafe during a shift. What now?',    a: 'Tap "Talk to a human" below — our support team will call you back. We never charge for safety-related cancellations.' },
    ],
  },
]

export default function EmployerSupportLandingPage() {
  const router = useRouter()
  const [query, setQuery]   = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<string | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return CATEGORIES
    return CATEGORIES
      .map(c => ({ ...c, faqs: c.faqs.filter(f => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q)) }))
      .filter(c => c.faqs.length > 0 || c.title.toLowerCase().includes(q))
  }, [query])

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(16px + env(safe-area-inset-top)) 18px 8px' }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 24, height: 24 }} />
        </button>
        <button onClick={() => router.push('/employer/support/tickets')}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 99, background: SURF, border: `1px solid ${BD}`, color: T1, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
          <ListOrdered style={{ width: 14, height: 14 }} />
          My Tickets
        </button>
      </div>

      <div style={{ padding: '8px 18px 16px' }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: T1, letterSpacing: -0.8, lineHeight: 1.1 }}>Help & Support</div>
        <div style={{ fontSize: 14, color: T2, marginTop: 8 }}>Get help with bookings, payments and other queries</div>
      </div>

      {/* Search */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: SURF, border: `1px solid ${query ? BDH : BD}`, borderRadius: 14, padding: '12px 14px' }}>
          <Search style={{ width: 16, height: 16, color: T2, flexShrink: 0 }} />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search for help"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: T1, fontSize: 14, fontFamily: FONT }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', color: T2, fontSize: 18, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      {/* FAQ section */}
      <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T2, padding: '4px 4px', textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>
          Browse by topic
        </div>

        {visible.length === 0 && (
          <div style={{ padding: '32px 12px', textAlign: 'center', color: T2, fontSize: 14, background: SURF, border: `1px solid ${BD}`, borderRadius: 14 }}>
            No results. Try different keywords or chat with our team below.
          </div>
        )}

        {visible.map(cat => {
          const Icon = cat.icon
          const open = openId === cat.id
          return (
            <div key={cat.id} style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, overflow: 'hidden' }}>
              <button onClick={() => setOpenId(open ? null : cat.id)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 16, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: `${cat.color}24`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 20, height: 20, color: cat.color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: T1, letterSpacing: -0.3 }}>{cat.title}</div>
                  <div style={{ fontSize: 13, color: T2, marginTop: 3 }}>{cat.sub}</div>
                </div>
                <ChevronDown style={{ width: 18, height: 18, color: T3, transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
              </button>

              {open && (
                <div style={{ borderTop: `1px solid ${BD}`, padding: '4px 0' }}>
                  {cat.faqs.map((f, i) => {
                    const id = `${cat.id}-${i}`
                    const isOpen = openFaq === id
                    return (
                      <div key={id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${BD}` }}>
                        <button onClick={() => setOpenFaq(isOpen ? null : id)}
                          style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T1, lineHeight: 1.4 }}>{f.q}</span>
                          <ChevronDown style={{ width: 16, height: 16, color: T3, flexShrink: 0, transition: 'transform 200ms', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }} />
                        </button>
                        {isOpen && (
                          <div style={{ padding: '0 16px 14px', fontSize: 13, color: T2, lineHeight: 1.55 }}>
                            {f.a}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Still need help? */}
      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)', border: '1px solid rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              <Sparkles style={{ width: 18, height: 18, color: T1 }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T1 }}>Still need help?</div>
              <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>Chat with Jyoti — escalates to ops if needed</div>
            </div>
          </div>
          <button onClick={() => router.push('/employer/support/chat')}
            style={{ width: '100%', padding: '13px', borderRadius: 14, background: T1, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <MessageCircle style={{ width: 16, height: 16 }} />
            Chat with us
          </button>
        </div>
      </div>
    </div>
  )
}
