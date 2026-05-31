'use client'
import { ListRowSkeleton, CardSkeleton } from '@/components/shared/Skeleton'
import { useState, useEffect } from 'react'
import { CreditCard, CheckCircle2, X, IndianRupee } from 'lucide-react'
import Script from 'next/script'
import EmployerTopBar from '@/components/employer/EmployerTopBar'
import EmployerBottomNav from '@/components/employer/EmployerBottomNav'

type Booking = {
  id: string; status: string; paymentStatus: string; totalAmount: number
  workerEarning: number; createdAt: string
  shift: { title: string; date: string; duration: number; startTime: string }
  worker: { user: { name: string } }
  payment: { status: string; razorpayOrderId?: string } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RazorpayFn = new (options: Record<string, unknown>) => { open(): void }

export default function EmployerPaymentsPage() {
  const [bookings, setBookings]   = useState<Booking[]>([])
  const [loading, setLoading]     = useState(true)
  const [paying, setPaying]       = useState<string | null>(null)
  const [paidIds, setPaidIds]     = useState<string[]>([])
  const [paySuccess, setPaySuccess] = useState(false)
  const [rzpReady, setRzpReady]   = useState(false)

  useEffect(() => {
    fetch('/api/employer/bookings').then(r => r.json()).then(d => {
      setBookings(d.bookings || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const completed = bookings.filter(b => b.status === 'COMPLETED' && (b.paymentStatus !== 'PAID' && !paidIds.includes(b.id)))
  const paid      = bookings.filter(b => b.paymentStatus === 'PAID' || paidIds.includes(b.id))
  const totalPending = completed.reduce((s, b) => s + b.totalAmount, 0)

  async function handlePay(booking: Booking) {
    setPaying(booking.id)
    try {
      const res = await fetch('/api/razorpay/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to create order'); return }

      const options = {
        key:         data.keyId,
        amount:      data.amount,
        currency:    data.currency,
        name:        'Switch Platform',
        description: `Payment for ${booking.shift.title}`,
        order_id:    data.orderId,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch('/api/razorpay/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
              return
            }
            setPaidIds(p => [...p, booking.id])
            setPaySuccess(true)
            setTimeout(() => setPaySuccess(false), 3000)
          } finally {
            setPaying(null)
          }
        },
        prefill:  { name: booking.worker?.user?.name ?? '' },
        theme:    { color: '#0D9488' },
        modal:    { ondismiss: () => setPaying(null) },
        'payment.failed': (resp: { error?: { description?: string } }) => {
          alert(`Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}. Tap "Pay" to retry.`)
          setPaying(null)
        },
      }

      const RazorpayClass = (window as any).Razorpay as RazorpayFn
      const rzp = new RazorpayClass(options as Record<string, unknown>)
      rzp.open()
      // Don't clear `paying` here — Razorpay's modal stays open after .open()
      // returns. The handler/ondismiss/payment.failed callbacks own resetting
      // state from now on.
    } catch (err) {
      console.error('Razorpay handler failed:', err)
      alert('Something went wrong. Check your connection and try again.')
      setPaying(null)
    }
  }

  const totalPaid = paid.reduce((s, b) => s + b.totalAmount, 0)

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onLoad={() => setRzpReady(true)} />

      <div style={{ minHeight: '100vh', paddingTop: 'calc(56px + var(--safe-t))', paddingBottom: 'calc(88px + var(--safe-b))', background: 'var(--bg)' }}>
        <EmployerTopBar title="Payments" />

        <div className="px-4 pt-4 flex flex-col gap-5">

          {/* Summary */}
          <div className="rounded-3xl p-5" style={{ background: 'linear-gradient(145deg,#0D1F2D,#0F2A1E)', border: '1px solid rgba(20,184,166,0.25)', boxShadow: '0 0 40px rgba(13,148,136,0.12)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#5EEAD4' }}>Payment Summary</p>
            <p className="text-4xl font-black mb-3" style={{ color: 'var(--text1)' }}>₹{totalPaid.toLocaleString('en-IN')}</p>
            <div className="flex gap-3 flex-wrap">
              <div className="px-3 py-1.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text1)' }}>{paid.length} paid</p>
                <p className="text-[10px]" style={{ color: 'var(--text3)' }}>workers</p>
              </div>
              {completed.length > 0 && (
                <div className="px-3 py-1.5 rounded-xl" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>
                  <p className="text-xs font-bold" style={{ color: '#FCD34D' }}>{completed.length} pending</p>
                  <p className="text-[10px]" style={{ color: 'var(--text3)' }}>₹{totalPending.toLocaleString('en-IN')} due</p>
                </div>
              )}
            </div>
          </div>

          {/* Pending Payments */}
          {completed.length > 0 && (
            <div>
              <p className="text-base font-black mb-3" style={{ color: 'var(--text1)' }}>Pay After Service</p>
              <div className="flex flex-col gap-3">
                {completed.map(b => (
                  <div key={b.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0"
                        style={{ background: 'rgba(251,191,36,0.12)', color: '#FCD34D' }}>
                        {b.worker?.user?.name?.[0]?.toUpperCase() ?? 'W'}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-sm" style={{ color: 'var(--text1)' }}>{b.worker?.user?.name ?? 'Worker'}</p>
                        <p className="text-xs" style={{ color: 'var(--text2)' }}>
                          {b.shift.title} · {b.shift.duration}h · {new Date(b.shift.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <p className="text-xl font-black" style={{ color: '#4ADE80' }}>₹{Math.round(b.totalAmount).toLocaleString('en-IN')}</p>
                    </div>
                    <button onClick={() => handlePay(b)} disabled={paying === b.id || !rzpReady}
                      className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                      style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff', opacity: paying === b.id ? 0.7 : 1 }}>
                      <CreditCard style={{ width: 16, height: 16 }} />
                      {paying === b.id ? 'Opening Razorpay…' : `Pay ₹${Math.round(b.totalAmount).toLocaleString('en-IN')} via Razorpay`}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading && <ListRowSkeleton count={5} />}

          {!loading && bookings.length === 0 && (
            <div className="py-12 text-center rounded-3xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-4xl mb-3">💳</p>
              <p className="font-bold" style={{ color: 'var(--text2)' }}>No payments yet</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>Payments appear after workers complete shifts</p>
            </div>
          )}

          {/* Payment History */}
          {paid.length > 0 && (
            <div>
              <p className="text-base font-black mb-3" style={{ color: 'var(--text1)' }}>Payment History</p>
              <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {paid.map((b, i) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3.5"
                    style={{ borderBottom: i < paid.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-sm"
                      style={{ background: 'rgba(20,184,166,0.12)', color: '#5EEAD4' }}>
                      {b.worker?.user?.name?.[0]?.toUpperCase() ?? 'W'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate" style={{ color: 'var(--text1)' }}>{b.worker?.user?.name ?? 'Worker'}</p>
                      <p className="text-xs" style={{ color: 'var(--text2)' }}>{b.shift.title}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-sm" style={{ color: '#5EEAD4' }}>₹{Math.round(b.totalAmount).toLocaleString('en-IN')}</p>
                      <span className="text-[10px] font-bold" style={{ color: '#4ADE80' }}>✓ Paid</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Payment success toast */}
        {paySuccess && (
          <div className="fixed inset-x-4 bottom-24 z-50 rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', boxShadow: '0 8px 32px rgba(6,78,59,0.5)' }}>
            <CheckCircle2 style={{ width: 22, height: 22, color: '#fff', flexShrink: 0 }} />
            <p className="font-bold text-white">Payment successful! 🎉</p>
          </div>
        )}

        <EmployerBottomNav />
      </div>
    </>
  )
}
