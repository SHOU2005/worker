'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

const BG   = '#080808'
const S1   = '#111111'
const S2   = '#181818'
const BD   = 'rgba(255,255,255,0.07)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.45)'
const T3   = 'rgba(255,255,255,0.2)'
const GRN  = '#10B981'
const GOLD = '#F5C518'
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

type Screen = 'summary' | 'processing' | 'confirmed'

const CARD: React.CSSProperties = {
  background: S1, borderRadius: 20, padding: 20, marginBottom: 12, border: `1px solid ${BD}`,
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function JobPaymentPage() {
  const { id }      = useParams<{ id: string }>()
  const [job,       setJob]       = useState<any>(null)
  const [booking,   setBooking]   = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [screen,    setScreen]    = useState<Screen>('summary')
  const [payMethod, setPayMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [statusMsg, setStatusMsg] = useState('Initiating secure payment…')
  const [payRef,    setPayRef]    = useState('')
  const [rating,    setRating]    = useState(0)

  useEffect(() => {
    fetch(`/api/employer/jobs/${id}`).then(r => r.json()).then(d => {
      if (d.job) {
        setJob(d.job)
        // Pick the *current* payable booking, not index 0. The jobs API
        // returns bookings ordered by createdAt desc, which on
        // multi-worker shifts and after cancel/reapply can put a stale
        // or unrelated booking at [0]. Prefer the booking that's still
        // unpaid and live (PENDING/CONFIRMED), falling back to the
        // first PAID/COMPLETED for confirmation rendering.
        const bs = (d.job.bookings || []) as any[]
        const payable = bs.find(b => b.paymentStatus !== 'PAID' && ['PENDING','CONFIRMED'].includes(b.status))
          || bs.find(b => b.paymentStatus === 'PAID')
          || bs[0]
          || null
        setBooking(payable)
        if (payable?.paymentStatus === 'PAID') setScreen('confirmed')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [id])

  /* ── Load Razorpay checkout.js ───────────────────────────── */
  async function loadRazorpay(): Promise<boolean> {
    if ((window as any).Razorpay) return true
    return new Promise(resolve => {
      const s    = document.createElement('script')
      s.src      = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload   = () => resolve(true)
      s.onerror  = () => resolve(false)
      document.body.appendChild(s)
    })
  }

  /* ── Main pay handler ────────────────────────────────────── */
  async function handlePay() {
    if (!booking?.id) {
      alert('No worker has accepted this job yet. Payment can only be made after a worker is assigned.')
      return
    }
    if (booking.paymentStatus === 'PAID') {
      setScreen('confirmed')
      return
    }
    setScreen('processing')
    setStatusMsg('Creating secure order…')

    try {
      /* 1. Create Razorpay order */
      const orderRes  = await fetch('/api/razorpay/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const orderData = await orderRes.json()

      if (!orderRes.ok || !orderData.orderId || !orderData.keyId) {
        const msg = orderData.code === 'RAZORPAY_NOT_CONFIGURED'
          ? 'Payment gateway is not configured. Contact support.'
          : orderData.error || 'Failed to create payment order. Please try again.'
        alert(msg)
        setScreen('summary')
        return
      }

      /* 2. Open Razorpay checkout — no fallback. Real payment is the only path. */
      const loaded = await loadRazorpay()
      if (!loaded) {
        alert('Could not load Razorpay. Check your internet and try again.')
        setScreen('summary')
        return
      }

      setStatusMsg('Opening Razorpay…')
      await new Promise<void>((resolve) => {
        const rzp = new (window as any).Razorpay({
          key:         orderData.keyId,
          amount:      orderData.amount,
          currency:    'INR',
          order_id:    orderData.orderId,
          name:        'Switch',
          description: `${job?.title} · ${job?.duration}h`,
          theme:       { color: '#000000' },
          handler: async (response: any) => {
            setScreen('processing')
            setStatusMsg('Verifying payment with Razorpay…')
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId:   response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
                bookingId:         booking.id,
              }),
            })
            if (!verifyRes.ok) {
              const d = await verifyRes.json().catch(() => ({}))
              alert(d.error || 'Payment could not be verified. Please retry.')
              setScreen('summary')
              resolve()
              return
            }
            // Re-fetch booking to confirm paymentStatus is actually PAID before showing confirmation
            const recheck = await fetch(`/api/employer/jobs/${id}`).then(r => r.json()).catch(() => null)
            const updated = recheck?.job?.bookings?.[0]
            if (updated?.paymentStatus !== 'PAID') {
              alert('Payment was not confirmed by the server. Please retry.')
              setScreen('summary')
              resolve()
              return
            }
            setBooking(updated)
            setPayRef(response.razorpay_payment_id)
            setScreen('confirmed')
            resolve()
          },
          modal: {
            ondismiss: () => {
              alert('Payment cancelled. Your booking is not confirmed yet — tap "Pay" to retry.')
              setScreen('summary')
              resolve()
            },
          },
          'payment.failed': (resp: any) => {
            alert(`Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}. Tap "Pay" to retry.`)
            setScreen('summary')
            resolve()
          },
        })
        rzp.open()
      })

    } catch (err) {
      console.error('Payment error:', err)
      alert('Network error. Please check your connection and try again.')
      setScreen('summary')
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ color: T2, fontSize: 16 }}>Loading…</div>
    </div>
  )

  const total    = job ? job.hourlyRate * job.duration : 0
  // GST is treated as INCLUSIVE: the displayed `total` is the all-in
  // amount Razorpay charges, of which 18% (i.e. 18/118 of the total) is
  // GST and the rest is the service component. Both the bill summary
  // (line ~290) and the receipt (line ~388) now use this same split, so
  // the numbers on the pay screen and the receipt agree.
  const gst      = Math.round(total * 18 / 118)
  const serviceAmt = total - gst
  const workerName  = booking?.worker?.user?.name || 'Worker'
  const workerInit  = workerName[0]?.toUpperCase() || 'W'
  const dateStr     = job ? new Date(job.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const bookingRef  = `SWN${(booking?.id || job?.id || '').slice(-6).toUpperCase()}`

  /* ── PROCESSING ─────────────────────────────────────────── */
  if (screen === 'processing') return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 40 }}>
      <div style={{
        width: 84, height: 84, borderRadius: 42, background: S1, border: `1px solid ${BD}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, border: `3px solid rgba(255,255,255,0.07)`, borderTop: `3px solid ${T1}`, animation: 'spin 0.8s linear infinite' }} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.5, marginBottom: 10 }}>Processing Payment</div>
        <div style={{ fontSize: 15, color: T2, marginBottom: 6 }}>{statusMsg}</div>
        <div style={{ fontSize: 13, color: T3 }}>Do not close the app</div>
      </div>
      <div style={{ background: S1, borderRadius: 16, padding: '14px 20px', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span style={{ fontSize: 13, color: T1, fontWeight: 600 }}>256-bit SSL secured</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  /* ── CONFIRMED ───────────────────────────────────────────── */
  if (screen === 'confirmed') return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, overflowX: 'hidden' }}>
      {/* Confetti */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10, overflow: 'hidden' }}>
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i} style={{
            position: 'absolute', top: '-16px',
            left: `${4 + (i * 3.2) % 92}%`,
            width: i % 3 === 0 ? 9 : i % 3 === 1 ? 6 : 4,
            height: i % 3 === 0 ? 9 : i % 3 === 1 ? 6 : 4,
            background: ['#FFFFFF','#10B981','#F5C518','#60A5FA','#A78BFA','#F87171'][i % 6],
            borderRadius: i % 2 === 0 ? '50%' : 2,
            animation: `cFall ${1.6 + (i % 7) * 0.18}s ease-in ${(i * 0.07) % 0.9}s forwards`,
          }} />
        ))}
      </div>

      <div style={{ position: 'relative', zIndex: 20, padding: 'calc(48px + env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom))' }}>
        {/* Check icon */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, margin: '0 auto 18px', background: 'rgba(16,185,129,0.1)', border: `2px solid ${GRN}`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'sPop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: T1, letterSpacing: -0.5, marginBottom: 6 }}>Booking Confirmed!</div>
          <div style={{ fontSize: 15, color: T2 }}>Payment successful · Worker is on the way</div>
        </div>

        {/* Booking ref */}
        <div style={{ ...CARD, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRN, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 4 }}>Booking Reference</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: 2.5, fontFamily: 'monospace' }}>{bookingRef}</div>
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
          </div>
        </div>

        {/* Worker */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>Worker Assigned</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: S2, border: `2px solid ${T1}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T1, fontWeight: 900, fontSize: 22, flexShrink: 0 }}>{workerInit}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T1, marginBottom: 2 }}>{workerName}</div>
              {booking?.worker?.user?.phone && (
                <div style={{ fontSize: 13, color: T2 }}>+91 {booking.worker.user.phone}</div>
              )}
            </div>
            {booking?.worker?.rating > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: T3 }}>Rating</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: GOLD }}>{Number(booking.worker.rating).toFixed(1)} ★</div>
              </div>
            )}
          </div>
        </div>

        {/* Job details */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>Job Details</div>
          {[
            { label: 'Service',   value: job?.title || '—'         },
            { label: 'Date',      value: dateStr                    },
            { label: 'Time',      value: job?.startTime || '—'      },
            { label: 'Duration',  value: `${job?.duration} hours`   },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
              <span style={{ fontSize: 14, color: T2 }}>{label}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Receipt */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>Payment Receipt</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
            <span style={{ fontSize: 14, color: T2 }}>{job?.title || 'Service'} ({job?.duration}h × ₹{job?.hourlyRate}/hr)</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>₹{serviceAmt}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
            <span style={{ fontSize: 14, color: T2 }}>GST (18% incl.)</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>₹{gst}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T1 }}>Total paid</div>
              {payRef && <div style={{ fontSize: 11, color: T3, marginTop: 2, fontFamily: 'monospace' }}>{payRef.slice(0, 20)}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: T1 }}>₹{total}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: GRN }}>✓ Paid</div>
            </div>
          </div>
        </div>

        {/* Rate worker */}
        <div style={CARD}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T1, marginBottom: 3 }}>Rate {workerName.split(' ')[0]}</div>
          <div style={{ fontSize: 13, color: T2, marginBottom: 18 }}>Help others find the best workers</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[1, 2, 3, 4, 5].map(star => (
              <button key={star} onClick={() => setRating(star)} style={{ fontSize: 42, background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, filter: rating >= star ? 'none' : 'grayscale(1) opacity(0.18)', transform: rating === star ? 'scale(1.25)' : 'scale(1)', transition: 'all 0.15s', color: GOLD }}>★</button>
            ))}
          </div>
          {rating > 0 && <div style={{ textAlign: 'center', marginTop: 14, fontSize: 15, fontWeight: 700, color: T1 }}>{['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent!'][rating]}</div>}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => window.location.replace(`/employer/job/${id}`)} style={{ flex: 1, padding: '16px 0', borderRadius: 16, border: `1px solid ${BD}`, cursor: 'pointer', background: S1, color: T1, fontWeight: 700, fontSize: 15, fontFamily: FONT }}>View Booking</button>
          <button onClick={() => window.location.replace('/employer')} style={{ flex: 2, padding: '16px 0', borderRadius: 16, border: 'none', cursor: 'pointer', background: T1, color: '#000', fontWeight: 900, fontSize: 16, fontFamily: FONT }}>Back to Home</button>
        </div>
      </div>

      <style>{`
        @keyframes cFall{0%{transform:translateY(-16px) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}
        @keyframes sPop{0%{transform:scale(0)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
      `}</style>
    </div>
  )

  /* ── SUMMARY ─────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1 }}>
      {/* Fixed header */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40, background: BG, borderBottom: `1px solid ${BD}`, paddingTop: 'calc(12px + env(safe-area-inset-top))', paddingBottom: 14, paddingLeft: 20, paddingRight: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => window.location.replace(`/employer/job/${id}`)} style={{ width: 40, height: 40, borderRadius: 20, border: `1px solid ${BD}`, background: S1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: T1 }}>Complete Payment</div>
            <div style={{ fontSize: 13, color: T2 }}>Secure checkout · {workerName}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: 'calc(72px + env(safe-area-inset-top)) 16px 140px' }}>

        {/* Worker / status card */}
        <div style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: S2, border: `2px solid ${booking ? T1 : BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: booking ? T1 : T3, fontWeight: 900, fontSize: 22, flexShrink: 0 }}>{booking ? workerInit : '?'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: T1 }}>{booking ? workerName : 'Awaiting worker'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                {booking ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="6" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16.01"/></svg>
                    <span style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>Payment pending — confirm to book</span>
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>
                    <span style={{ fontSize: 13, color: T3, fontWeight: 600 }}>No worker assigned yet</span>
                  </>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: T3 }}>Total</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: T1 }}>₹{total}</div>
            </div>
          </div>
        </div>

        {/* Bill breakdown */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>Bill Summary</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
            <span style={{ fontSize: 14, color: T2 }}>{job?.title || 'Service'}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>{job?.duration}h × ₹{job?.hourlyRate}/hr</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
            <span style={{ fontSize: 14, color: T2 }}>GST (18% incl.)</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>₹{gst}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: T1 }}>Total</span>
            <span style={{ fontSize: 32, fontWeight: 900, color: T1 }}>₹{total}</span>
          </div>
        </div>

        {/* Payment method */}
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>Payment Method</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { id: 'upi',        label: 'UPI',     sub: 'GPay · PhonePe' },
              { id: 'card',       label: 'Card',    sub: 'Debit / Credit' },
              { id: 'netbanking', label: 'NetBank', sub: 'All banks'      },
            ] as const).map(m => (
              <button key={m.id} onClick={() => setPayMethod(m.id)} style={{
                flex: 1, padding: '12px 4px', borderRadius: 14, cursor: 'pointer',
                border: `1.5px solid ${payMethod === m.id ? T1 : BD}`,
                background: payMethod === m.id ? T1 : 'transparent',
                fontFamily: FONT, textAlign: 'center' as const,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: payMethod === m.id ? '#000' : T1, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: payMethod === m.id ? 'rgba(0,0,0,0.5)' : T3 }}>{m.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Razorpay badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(16,185,129,0.06)', borderRadius: 14, border: '1px solid rgba(16,185,129,0.15)', marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T1 }}>100% Secure · Powered by Razorpay</div>
            <div style={{ fontSize: 11, color: T2 }}>256-bit SSL encryption on all transactions</div>
          </div>
        </div>

        {!booking && (
          <div style={{ padding: '12px 16px', background: 'rgba(245,197,24,0.06)', borderRadius: 14, border: `1px solid rgba(245,197,24,0.2)`, marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: GOLD, fontWeight: 600 }}>⚠ No worker assigned yet — payment will be recorded once a worker accepts this job.</div>
          </div>
        )}
      </div>

      {/* Fixed CTA */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: BG, borderTop: `1px solid ${BD}`, padding: '14px 16px', paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
        <button onClick={handlePay} disabled={!booking} style={{
          width: '100%', padding: '0', borderRadius: 16, border: 'none',
          cursor: booking ? 'pointer' : 'default',
          background: booking ? T1 : S1,
          color: booking ? '#000' : T2,
          overflow: 'hidden', fontFamily: FONT,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '17px 0' }}>
            <svg width="20" height="20" viewBox="0 0 30 30" fill="none">
              <path d="M15 2L4 27h8L15 18l3 9h8L15 2z" fill={booking ? '#000' : T2}/>
              <path d="M15 2L8 22h4l3-4z" fill={booking ? 'rgba(0,0,0,0.4)' : T3}/>
            </svg>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 0.2 }}>
              {booking ? `Pay ₹${total} via Razorpay` : 'Waiting for worker to accept'}
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
