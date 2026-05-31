'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, MapPin, Clock, Users, Zap, CheckCircle2 } from 'lucide-react'
import { baseRateFor } from '@/lib/slots'

const CATEGORIES = [
  { label: 'Shop Helper',     emoji: '🏪' },
  { label: 'Delivery',        emoji: '🚴' },
  { label: 'Warehouse Staff', emoji: '🏭' },
  { label: 'Security Guard',  emoji: '🔒' },
  { label: 'Kitchen Helper',  emoji: '🍳' },
  { label: 'Driver',          emoji: '🚗' },
  { label: 'Cleaning Staff',  emoji: '🧹' },
  { label: 'Office Work',     emoji: '💼' },
]

const DURATIONS = [4, 6, 8, 10, 12]

function PostJobInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [toast, setToast]   = useState(false)

  // Step 1
  const [title, setTitle]       = useState('')
  const [category, setCategory] = useState(searchParams.get('category') || '')
  const [duration, setDuration] = useState<number | null>(null)

  // Step 2
  const [date, setDate]         = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime]   = useState('17:00')
  const [workers, setWorkers]   = useState(1)
  const [address, setAddress]   = useState('')
  const [city, setCity]         = useState('')

  // Step 3
  // "Urgent" / Instant booking was retired. Force false; the toggle is
  // hidden from the UI below.
  const urgent = false
  void searchParams

  // Hourly rate must match what the server bills via lib/slots.ts
  // baseRateFor(). Hardcoding ₹99 / ₹199 here drifted from the source of
  // truth (cleaning services are ₹149/hr in SERVICE_RATES) — employers
  // saw a quote on this screen and were charged a different number on
  // Razorpay. Import the actual computation instead.
  const hourlyRate = baseRateFor(category)
  const totalCost  = hourlyRate * (duration || 0) * workers

  // Auto-fill today's date
  useEffect(() => {
    const d = new Date()
    setDate(d.toISOString().split('T')[0])
  }, [])

  // Auto-compute end time from start + duration
  useEffect(() => {
    if (!startTime || !duration) return
    const [h, m] = startTime.split(':').map(Number)
    const end = new Date(2000, 0, 1, h + duration, m)
    setEndTime(`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`)
  }, [startTime, duration])

  // Auto-fill category title
  useEffect(() => {
    if (category && !title) setTitle(category)
  }, [category])

  const catEmoji = CATEGORIES.find(c => c.label === category)?.emoji || '💼'
  const step1Valid = title.trim() && category && duration
  // Match the cart-flow gate (>= 10 chars on address) so workers actually
  // get something a router can find. "abc" passing validation here led to
  // jobs getting matched but workers failing to navigate.
  const step2Valid = !!date && !!startTime && address.trim().length >= 10 && city.trim().length > 0

  async function loadRazorpayScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).Razorpay) return true
    return new Promise<boolean>(resolve => {
      const s = document.createElement('script')
      s.src     = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload  = () => resolve(true)
      s.onerror = () => resolve(false)
      document.body.appendChild(s)
    })
  }

  async function handlePost() {
    setLoading(true); setError('')
    try {
      // Geocode the entered city. Refuse to fall back to a hardcoded
      // location — silently shipping every job to Mumbai breaks the
      // worker-search radius for everyone outside it.
      let lat: number | null = null, lng: number | null = null
      try {
        const geo = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city + ', India')}&format=json&limit=1`)
        const geoData = await geo.json()
        if (geoData[0]) {
          lat = parseFloat(geoData[0].lat)
          lng = parseFloat(geoData[0].lon)
        }
      } catch {}
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        setError(`Could not locate "${city}". Check the city name and try again.`)
        setLoading(false)
        return
      }

      // 1. Create Razorpay order with full job context. NO shift exists in DB yet.
      const orderRes = await fetch('/api/employer/cart/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category, title, address, city, lat, lng,
          duration: duration!, date, startTime, endTime,
          isInstant: urgent,
          workersNeeded: workers,
        }),
      })
      const orderData = await orderRes.json().catch(() => ({}))
      if (!orderRes.ok || !orderData.orderId) {
        setError(orderData.error || `Could not start payment (HTTP ${orderRes.status}). Try again.`)
        setLoading(false); return
      }

      // 2. Load Razorpay checkout
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        setError('Could not load Razorpay (script blocked or no internet).')
        setLoading(false); return
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Rzp = (window as any).Razorpay
      const rzp = new Rzp({
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency || 'INR',
        order_id:    orderData.orderId,
        name:        'Switch',
        description: `${title} · ${duration}h × ${workers}`,
        theme:       { color: '#0D9488' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          // 3. Verify on server. Shift is created ONLY after a valid signature.
          const verifyRes = await fetch('/api/employer/cart/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId:   response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
          const verifyData = await verifyRes.json().catch(() => ({}))
          if (!verifyRes.ok || !verifyData.shiftId) {
            setError(verifyData.error || 'Payment verified but job creation failed. Contact support.')
            setLoading(false); return
          }
          // Show toast, then redirect after it's been visible. Doing the
          // navigation immediately would unmount this component before the
          // toast renders.
          setToast(true)
          setTimeout(() => {
            router.replace(`/employer/job/${verifyData.shiftId}`)
          }, 1500)
        },
        modal: {
          ondismiss: () => {
            setError('Payment cancelled. Tap "Post Job" to retry — your job is not booked yet.')
            setLoading(false)
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'payment.failed': (resp: any) => {
          setError(`Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}. Tap "Post Job" to retry.`)
          setLoading(false)
        },
      })
      rzp.open()
    } catch (err) {
      console.error('post-job pay error:', err)
      setError('Network error')
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40" style={{ paddingTop: 'var(--safe-t)', background: '#111827', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 px-5 h-14">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-xl flex-shrink-0" style={{ background: 'var(--surface)' }}>
            <ArrowLeft style={{ width: 18, height: 18, color: 'var(--text1)' }} />
          </button>
          <p className="font-black text-lg" style={{ color: 'var(--text1)' }}>
            {step === 1 ? 'Job Details' : step === 2 ? 'Schedule & Location' : 'Review & Post'}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div style={{ marginTop: 56, paddingTop: 'var(--safe-t)' }}>
        <div className="flex gap-1.5 px-5 pt-4 pb-2">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sur2)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: step >= s ? '100%' : '0%', background: 'linear-gradient(135deg,#064E3B,#0D9488)' }} />
            </div>
          ))}
        </div>
        <p className="px-5 text-xs" style={{ color: 'var(--text3)' }}>Step {step} of 3</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">

        {/* Step 1 */}
        {step === 1 && (
          <div className="pt-4">
            <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text1)' }}>What work do you need?</h2>

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Job Title</label>
            <input type="text" placeholder="e.g. Shop Helper, Delivery Boy" value={title} onChange={e => setTitle(e.target.value)}
              className="w-full rounded-2xl px-4 py-4 outline-none text-base font-medium mb-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}
            />

            <label className="block text-xs font-semibold mb-3" style={{ color: 'var(--text2)' }}>Category</label>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              {CATEGORIES.map(c => {
                const sel = category === c.label
                return (
                  <button key={c.label} onClick={() => { setCategory(c.label); if (!title || CATEGORIES.some(x => x.label === title)) setTitle(c.label) }}
                    className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
                    style={{ background: sel ? 'rgba(20,184,166,0.12)' : 'var(--surface)', border: `2px solid ${sel ? '#14B8A6' : 'var(--border)'}` }}>
                    <span className="text-xl">{c.emoji}</span>
                    <span className="text-sm font-semibold" style={{ color: sel ? '#5EEAD4' : 'var(--text2)' }}>{c.label}</span>
                  </button>
                )
              })}
            </div>

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Shift Duration</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {DURATIONS.map(h => (
                <button key={h} onClick={() => setDuration(h)}
                  className="px-5 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: duration === h ? 'linear-gradient(135deg,#064E3B,#0D9488)' : 'var(--surface)', color: duration === h ? '#fff' : 'var(--text2)', border: `1px solid ${duration === h ? 'transparent' : 'var(--border)'}` }}>
                  {h}h
                </button>
              ))}
            </div>

            {duration && (
              <div className="rounded-2xl p-3 mb-6" style={{ background: 'rgba(20,184,166,0.08)', border: '1px solid rgba(20,184,166,0.2)' }}>
                <p className="text-sm font-bold" style={{ color: '#5EEAD4' }}>₹{hourlyRate}/hr × {duration}h × {workers} = ₹{totalCost.toLocaleString('en-IN')} total</p>
              </div>
            )}

            <button onClick={() => step1Valid && setStep(2)} disabled={!step1Valid}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2"
              style={{ background: step1Valid ? 'linear-gradient(135deg,#064E3B,#0D9488)' : 'var(--sur2)', color: step1Valid ? '#fff' : 'var(--text3)' }}>
              Continue <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="pt-4">
            <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text1)' }}>When & Where?</h2>

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-2xl px-4 py-4 outline-none text-base font-medium mb-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}
            />

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Start Time</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full rounded-2xl px-4 py-4 outline-none text-base font-medium mb-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}
            />

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Number of Workers</label>
            <div className="flex items-center gap-4 mb-4">
              <button onClick={() => setWorkers(w => Math.max(1, w - 1))}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}>−</button>
              <p className="text-2xl font-black w-8 text-center" style={{ color: 'var(--text1)' }}>{workers}</p>
              <button onClick={() => setWorkers(w => Math.min(20, w + 1))}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold"
                style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff' }}>+</button>
              <p className="text-xs ml-2" style={{ color: 'var(--text3)' }}>Max 20</p>
            </div>

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>City</label>
            <input type="text" placeholder="Gurgaon" value={city} onChange={e => setCity(e.target.value)}
              className="w-full rounded-2xl px-4 py-4 outline-none text-base font-medium mb-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}
            />

            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text2)' }}>Full Address</label>
            <textarea rows={3} placeholder="Shop No 12, Andheri West Market, Gurgaon - 400053" value={address}
              onChange={e => setAddress(e.target.value)}
              className="w-full rounded-2xl px-4 py-4 outline-none text-base font-medium resize-none mb-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text1)' }}
            />

            <button onClick={() => step2Valid && setStep(3)} disabled={!step2Valid}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2"
              style={{ background: step2Valid ? 'linear-gradient(135deg,#064E3B,#0D9488)' : 'var(--sur2)', color: step2Valid ? '#fff' : 'var(--text3)' }}>
              Review Job <ArrowRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        {/* Step 3 — Review */}
        {step === 3 && (
          <div className="pt-4">
            <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text1)' }}>Review Your Job</h2>

            <div className="rounded-2xl p-5 mb-4" style={{ background: 'var(--surface)', border: '1px solid rgba(20,184,166,0.2)' }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">{catEmoji}</span>
                <div>
                  <p className="font-black text-lg" style={{ color: 'var(--text1)' }}>{title}</p>
                  <p className="text-sm" style={{ color: '#5EEAD4' }}>₹{hourlyRate}/hr · {duration}h shift</p>
                </div>
              </div>
              {[
                { icon: Clock, label: 'Schedule', val: `${date} at ${startTime}` },
                { icon: MapPin, label: 'Location', val: `${address}, ${city}` },
                { icon: Users, label: 'Workers', val: `${workers} worker${workers > 1 ? 's' : ''}` },
              ].map(({ icon: Icon, label, val }) => (
                <div key={label} className="flex items-start gap-2.5 mb-3">
                  <Icon style={{ width: 15, height: 15, color: '#14B8A6', marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <p className="text-[11px]" style={{ color: 'var(--text3)' }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>{val}</p>
                  </div>
                </div>
              ))}
              <div className="pt-4 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>Total estimated cost</p>
                <p className="text-xl font-black" style={{ color: '#5EEAD4' }}>₹{totalCost.toLocaleString('en-IN')}</p>
              </div>
            </div>

            {/* "Mark as Urgent" toggle removed — Instant booking was
                retired; all jobs follow the scheduled flow. */}

            {error && <p className="text-sm text-center mb-4" style={{ color: '#EF4444' }}>{error}</p>}

            <button onClick={handlePost} disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff', boxShadow: '0 4px 24px rgba(6,78,59,0.5)', opacity: loading ? 0.7 : 1 }}>
              <CheckCircle2 style={{ width: 18, height: 18 }} />
              {loading ? 'Opening Razorpay…' : `Pay ₹${totalCost.toLocaleString('en-IN')} & Post Job`}
            </button>
            <p className="text-center text-xs mt-3" style={{ color: 'var(--text3)' }}>
              Secure payment via Razorpay · Workers are notified after payment is confirmed
            </p>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed inset-x-4 bottom-8 z-50 rounded-2xl px-5 py-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', boxShadow: '0 8px 32px rgba(6,78,59,0.5)' }}>
          <CheckCircle2 style={{ width: 22, height: 22, color: '#fff', flexShrink: 0 }} />
          <p className="font-bold text-white">Job posted! Workers will apply shortly 🎉</p>
        </div>
      )}
    </div>
  )
}

export default function PostJobPage() {
  return <Suspense><PostJobInner /></Suspense>
}
