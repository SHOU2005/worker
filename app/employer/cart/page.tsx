'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { track } from '@/lib/posthog'
import { toastError } from '@/lib/toast'
import { SLOTS, getSlotById, computeBill } from '@/lib/slots'

const BG   = '#080808'
const S1   = '#111111'
const S2   = '#181818'
const BD   = 'rgba(255,255,255,0.07)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.45)'
const T3   = 'rgba(255,255,255,0.2)'
const GRN  = '#10B981'
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

const IMG = (f: string) => `/icons/services/${f}.jpg?v=4`

type RoleInfo = { img: string; emoji: string; includes: string[]; excludes: string[] }

// Twelve services — must match the home-page ROLES list exactly so the
// service URL ?service=… always resolves. Each role has its own dedicated
// branded photo card.
const ROLES: Record<string, RoleInfo> = {
  'Maid': {
    img: IMG('house-cleaner'), emoji: '🧹',
    includes: ['Floor sweeping & mopping', 'Dusting all surfaces', 'Bathroom & toilet light wipe', 'Kitchen surface wipe-down', 'Trash removal'],
    excludes: ['Carpet / sofa deep-clean', 'Pest control', 'Lifting heavy furniture', 'Window or facade exterior work'],
  },
  'Bathroom Package': {
    img: IMG('bathroom-package'), emoji: '🛁',
    includes: [
      'Standard bathroom cleaning (one visit)',
      'Toilet bowl scrub & disinfectant wipe',
      'Sink, faucet & mirror wipe-down',
      'Floor wash & quick dry',
      'Trash removal & odour freshening',
    ],
    excludes: ['Deep cleaning / hard-water descaling', 'Tile grout scrubbing', 'Plumbing / leakage repair', 'Tile replacement', 'Pest control'],
  },
  'Cook': {
    img: IMG('cook-chef'), emoji: '👨‍🍳',
    includes: ['Meal preparation (up to 3 dishes)', 'Grocery list assistance', 'Kitchen cleaning after cooking', 'Serving if required'],
    excludes: ['Grocery shopping outside the home', 'Hosting / waiting on guests', 'Specialty / dietary recipes not agreed in advance'],
  },
  'Kitchen Helper': {
    img: IMG('kitchen-helper'), emoji: '🍳',
    includes: ['Vegetable cutting & prep', 'Utensil washing & drying', 'Counter & stove cleaning', 'Assisting the main cook'],
    excludes: ['Independent meal planning', 'Heavy cooking lead role', 'Bar / beverage service'],
  },
  'Caretaker': {
    img: IMG('baby-care'), emoji: '🤲',
    includes: ['Patient assistance & mobility', 'Medicine reminders', 'Companionship & basic care', 'Light personal hygiene help'],
    excludes: ['Medical / nursing procedures', 'Administering injections', 'Driving the patient', 'Overnight stay (unless booked)'],
  },
  'Waiter': {
    img: IMG('waiter'), emoji: '🍽️',
    includes: ['Table setting & clearing', 'Order taking & serving', 'Food & beverage delivery', 'Guest assistance'],
    excludes: ['Cooking / kitchen duties', 'Bartending', 'Cash handling unless agreed', 'Heavy cleaning'],
  },
  'Bartender': {
    img: IMG('bartender'), emoji: '🍸',
    includes: ['Mix & serve cocktails', 'Maintain bar inventory', 'Engage and host guests', 'Keep bar area clean'],
    excludes: ['Provision of liquor / glassware', 'Waiting tables', 'Cooking food', 'End-of-night security'],
  },
  'Security Guard': {
    img: IMG('security-guard'), emoji: '🛡️',
    includes: ['Premises patrolling', 'Visitor log & access control', 'Emergency response', 'Night watch duty'],
    excludes: ['Armed protection (no weapons)', 'Door-to-door deliveries', 'Personal bodyguarding outside premises'],
  },
  'Bouncer': {
    img: IMG('bouncer'), emoji: '💪',
    includes: ['Entry screening & frisking', 'Crowd management', 'Conflict resolution', 'Venue security & perimeter check'],
    excludes: ['Armed protection', 'Travel with guests off-site', 'Cleaning or stock duties'],
  },
  'Driver': {
    img: IMG('driver'), emoji: '🚗',
    includes: ['Safe vehicle operation', 'Route navigation', 'Pick-up & drop service', 'Fuel-level monitoring'],
    excludes: ['Vehicle fuel cost (employer pays)', 'Toll / parking fees', 'Long-distance overnight trips unless booked', 'Vehicle repairs'],
  },
  'Promoter': {
    img: IMG('promoter'), emoji: '📣',
    includes: ['Brand & product promotion', 'Lead & contact collection', 'Handout & sample distribution', 'Event & stall support'],
    excludes: ['Travel beyond city limits', 'Stall setup / dismantling', 'Cash sales / billing'],
  },
  'General Helper': {
    img: IMG('general-helper'), emoji: '🙋',
    includes: ['Loading & unloading goods', 'Carrying & shifting items', 'Running errands', 'Basic task execution on request'],
    excludes: ['Skilled trade work (electrical, plumbing)', 'Driving the employer\'s vehicle', 'Cash handling unless agreed'],
  },
  'Factory Helper': {
    img: IMG('factory-helper'), emoji: '🏭',
    includes: ['Assembly line support', 'Material handling & shifting', 'Sorting & packing goods', 'Basic quality checking'],
    excludes: ['Machinery operation without training', 'Supervisory role', 'Welding / hazardous chemical work'],
  },
}

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

function CartInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const serviceName = searchParams.get('service') || ''
  // Instant booking was retired. Cart only renders the scheduled flow.
  // mode is kept as a const so downstream references compile; any
  // ?mode=instant URLs land in the same schedule UI.
  const mode = 'schedule' as const
  const slotParam   = searchParams.get('slot') || '4h'

  const role = ROLES[serviceName]

  // For Bathroom Package the price is flat per-bathroom; force the slot to
  // 1 hr so `total = 149 × bathrooms`. Any URL ?slot=… is ignored for the
  // package because mixing hours and quantity would double-charge.
  const initSlot = (searchParams.get('service') === 'Bathroom Package'
    ? (getSlotById('1h') ?? SLOTS[0])
    : (getSlotById(slotParam) || SLOTS[0]))
  const [slot,      setSlot]      = useState(initSlot)
  const [workers,   setWorkers]   = useState<number>(1)
  // Bathroom Package re-uses `workers` as the bathroom count — both
  // multiply the rate the same way. The UI relabels the stepper but the
  // bill math stays identical.
  const isBathroomPkg = serviceName === 'Bathroom Package'
  const [flat,      setFlat]      = useState('')
  const [tower,     setTower]     = useState('')
  const [address,   setAddress]   = useState('')
  const [addrFocus, setAddrFocus] = useState(false)
  const [dateIdx,   setDateIdx]   = useState(0)
  const [timeSlot,  setTimeSlot]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [locLoad,   setLocLoad]   = useState(false)
  const [error,     setError]     = useState('')
  // Captured by fillAddress() so the booking lands with real coordinates
  // (not the Gurgaon default placeholder). Without this the worker's 100m
  // arrival geofence has no anchor and slide-to-arrive unlocks anywhere.
  const [coords,    setCoords]    = useState<{ lat: number; lng: number } | null>(null)
  const [locError,  setLocError]  = useState('')

  // If the user picks Today after selecting a time slot that's now in
  // the past (e.g. selected 10 AM yesterday, opens the cart at 3 PM
  // today), clear the stale selection so the Pay button stays correct.
  useEffect(() => {
    if (dateIdx !== 0 || !timeSlot) return
    const slotHour = parseInt(timeSlot.split(':')[0], 10)
    if (slotHour <= new Date().getHours()) setTimeSlot('')
  }, [dateIdx, timeSlot])

  // Promo code state
  const [promoCode,    setPromoCode]    = useState('')
  const [promoApplied, setPromoApplied] = useState<{ code: string; discount: number; description: string } | null>(null)
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError,   setPromoError]   = useState('')

  // Intro-offer state. Server is the source of truth for the actual charged
  // rate; this fetch is purely for rendering the right number in the bill
  // before the user taps Pay. /api/employer/cart/pay re-derives independently.
  const [hasPriorBooking, setHasPriorBooking] = useState<boolean>(false)
  useEffect(() => {
    fetch('/api/employer/has-prior-booking', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && typeof d.hasPriorBooking === 'boolean') {
          setHasPriorBooking(d.hasPriorBooking)
          // If the user has already booked once, drop any stale promo state
          // — the UI hides the input but a leftover applied promo from a
          // previous flow would still show in the bill summary.
          if (d.hasPriorBooking) {
            setPromoApplied(null)
            setPromoCode('')
          }
        }
      })
      .catch(() => {})

    // Prefill saved address from the employer profile so repeat
    // customers don't re-enter flat / tower / road every time. The GET
    // endpoint returns { user, profile } — profile is the alias for
    // user.employerProfile; read either to be defensive.
    // Only sets each field if it's still empty, so an in-progress edit
    // never gets clobbered by the async response.
    fetch('/api/employer/profile', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const ep = d?.profile || d?.user?.employerProfile
        if (!ep) return
        setFlat(prev    => prev    || ep.flat    || '')
        setTower(prev   => prev   || ep.tower   || '')
        setAddress(prev => prev || ep.address || '')
      })
      .catch(() => {})
  }, [])

  // Single source of truth for the bill — same function runs on the server in
  // /api/employer/cart/pay so the user can never see one number and be charged another.
  const bill = computeBill({
    hours:         slot.hours,
    workersNeeded: workers,
    isInstant:     false,
    promoDiscount: promoApplied?.discount ?? 0,
    service:       serviceName,
    hasPriorBooking,
  })
  const baseRate           = bill.hourlyRate
  const baseTotal          = bill.baseSubtotal
  const urgentSurcharge    = bill.urgentSurcharge
  const slotDiscount       = bill.slotDiscount
  const promoDiscount      = bill.promoDiscount
  const total              = bill.total

  async function applyPromo() {
    const code = promoCode.trim().toUpperCase()
    if (!code) return
    setPromoLoading(true); setPromoError('')
    try {
      const res = await fetch('/api/employer/promo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code, total: bill.gross - bill.slotDiscount }),
      })
      const d = await res.json()
      if (!res.ok || !d.valid) {
        setPromoError(d.error || 'Invalid code')
        setPromoApplied(null)
      } else {
        setPromoApplied({ code: d.code, discount: d.discount, description: d.description })
        setPromoError('')
      }
    } catch {
      setPromoError('Network error — check your connection and try again.')
    }
    setPromoLoading(false)
  }
  function clearPromo() {
    setPromoApplied(null); setPromoCode(''); setPromoError('')
  }

  const now        = new Date()
  const dateLabels = [0, 1, 2].map(i => {
    const d = new Date(now); d.setDate(d.getDate() + i)
    return {
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : 'Day After',
      date:  d.toISOString().split('T')[0],
      short: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    }
  })

  // Address needs to be a real address, not "aaa". Ten characters is the
  // bar — same gate the post-job and signup flows use. Schedule mode also
  // requires a time slot. Flat number is mandatory so the worker can
  // actually find the door (we got "couldn't find the house" complaints
  // when only the building address was filled).
  const fullAddress = [
    flat   && `Flat ${flat}`,
    tower  && `${tower}`,
    address.trim(),
  ].filter(Boolean).join(', ')
  // Scheduled-only: address + flat + a picked time slot are all required.
  const canPay = flat.trim().length > 0 && address.trim().length >= 6 && timeSlot !== ''

  async function fillAddress() {
    if (!navigator.geolocation) {
      setLocError('Location is not available on this device')
      return
    }
    setLocLoad(true); setLocError('')
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        try {
          // Persist coordinates so cart/pay can stamp them on the Shift.
          // Without this the worker's 100m arrival geofence has no real
          // target — slide-to-arrive would unlock anywhere.
          setCoords({ lat: c.latitude, lng: c.longitude })
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${c.latitude}&lon=${c.longitude}&format=json`)
          const data = await res.json()
          const a    = data.address || {}
          const parts = [a.house_number, a.road || a.pedestrian, a.suburb || a.neighbourhood, a.city || a.town || a.village, a.state].filter(Boolean)
          if (parts.length === 0) {
            setLocError('Could not resolve street address — type it manually below')
          } else {
            setAddress(parts.join(', '))
          }
        } catch {
          setLocError('Could not look up your address — type it manually below')
        } finally { setLocLoad(false) }
      },
      err => {
        setLocLoad(false)
        // Surface why GPS failed — workers were tapping the button
        // and seeing nothing happen when permission was denied.
        if (err.code === 1) setLocError('Allow location access to auto-fill your address')
        else if (err.code === 3) setLocError('Location request timed out — try again')
        else                     setLocError('Could not get your location')
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

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

  async function handlePay() {
    if (!canPay) {
      toastError('Please enter the address first.')
      return
    }
    setLoading(true); setError('')
    try {
      // Persist the address components to the employer profile so the
      // next booking prefills cleanly. Fire-and-forget — never block the
      // payment flow on this write.
      fetch('/api/employer/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          flat:    flat.trim(),
          tower:   tower.trim(),
          address: address.trim(),
        }),
      }).catch(() => {})

      // Scheduled-only path — startTime always comes from the picked slot.
      const startTime = timeSlot
      const endH      = Number(startTime.split(':')[0]) + slot.hours
      const endTime   = `${String(endH % 24).padStart(2, '0')}:${startTime.split(':')[1]}`

      // 1. Create Razorpay order on server with cart context (no DB shift created yet)
      const orderRes = await fetch('/api/employer/cart/pay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category:      serviceName,
          duration:      slot.hours,
          workersNeeded: workers,
          address:       fullAddress,
          // Pass through GPS coords captured by fillAddress() so the
          // Shift gets real lat/lng instead of the Gurgaon default. The
          // worker's 100m arrival geofence relies on this — without it
          // the slide-to-arrive button unlocks anywhere.
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
          date:           dateLabels[dateIdx].date,
          startTime,
          endTime,
          isInstant:      false,
          // Promo discount — server re-validates and recomputes the actual order amount
          ...(promoApplied ? { promoCode: promoApplied.code } : {}),
        }),
      })
      const orderData = await orderRes.json().catch(() => ({}))
      if (!orderRes.ok || !orderData.orderId) {
        const msg = orderData.error || `Could not start payment (HTTP ${orderRes.status}). Try again.`
        setError(msg); toastError(msg); setLoading(false)
        console.error('cart/pay failed', orderRes.status, orderData)
        track('payment_order_failed', { service: serviceName, total, status: orderRes.status })
        return
      }
      track('payment_order_created', { service: serviceName, duration: slot.hours, total, mode })

      // 2. Load Razorpay checkout script
      const loaded = await loadRazorpayScript()
      if (!loaded) {
        const msg = 'Could not load Razorpay (script blocked or no internet).'
        setError(msg); toastError(msg); setLoading(false); return
      }

      // 3. Open Razorpay
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Rzp = (window as any).Razorpay
      if (typeof Rzp !== 'function') {
        const msg = 'Razorpay loaded but is not callable. Reload the page.'
        setError(msg); toastError(msg); setLoading(false); return
      }
      const rzp = new Rzp({
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency || 'INR',
        order_id:    orderData.orderId,
        name:        'Switch',
        description: `${serviceName} · ${slot.hours}h`,
        theme:       { color: '#000000' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/employer/cart/verify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId:   response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
          const verifyData = await verifyRes.json()
          if (!verifyRes.ok || !verifyData.shiftId) {
            setError(verifyData.error || 'Payment verified but booking failed. Contact support.')
            track('payment_verify_failed', { service: serviceName, total })
            setLoading(false); return
          }
          track('payment_succeeded', { service: serviceName, total, shiftId: verifyData.shiftId })
          // Land on the brief "Booking placed" confirmation screen, which
          // auto-redirects to the live status page after 3 seconds. Gives
          // the employer a moment of closure between payment and the
          // realtime job UI.
          router.replace(`/employer/job/${verifyData.shiftId}/booked`)
        },
        modal: {
          ondismiss: () => {
            setError('Payment cancelled. Tap Pay to retry.')
            setLoading(false)
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'payment.failed': (resp: any) => {
          setError(`Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}. Tap Pay to retry.`)
          setLoading(false)
        },
      })
      rzp.open()
    } catch (err) {
      console.error('cart handlePay error:', err)
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  if (!role) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>😕</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T1, marginBottom: 8 }}>Service not available</div>
        <div style={{ fontSize: 14, color: T2, marginBottom: 24 }}>"{serviceName}" is not in our list</div>
        <button onClick={() => router.back()} style={{ padding: '13px 32px', borderRadius: 14, background: T1, color: '#000', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: FONT, fontSize: 15 }}>Go Back</button>
      </div>
    </div>
  )

  const card: React.CSSProperties = { background: S1, borderRadius: 20, padding: 20, marginBottom: 12, border: `1px solid ${BD}` }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1 }}>

      {/* Header */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, background: BG,
        borderBottom: `1px solid ${BD}`,
        paddingTop: 'calc(12px + env(safe-area-inset-top))',
        paddingBottom: 14, paddingLeft: 20, paddingRight: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="emp-iconbtn" onClick={() => router.back()} style={{
            width: 40, height: 40, borderRadius: 20, border: `1px solid ${BD}`, background: S1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: T1 }}>{serviceName}</div>
            <div style={{ fontSize: 13, color: T2 }}>
              {isBathroomPkg
                ? `🗓 ₹${bill.hourlyRate}/bathroom`
                : `🗓 Scheduled · ₹${bill.hourlyRate}/hr`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T1, textAlign: 'right' }}>₹{total.toLocaleString('en-IN')}</div>
            {(slotDiscount + promoDiscount) > 0 && (
              <div style={{ fontSize: 11, color: T3, textDecoration: 'line-through', textAlign: 'right' }}>₹{bill.gross.toLocaleString('en-IN')}</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom padding has to clear the sticky pay bar PLUS the optional
          savings banner above it (~26px). With only 90px, the "100% Secured
          by Razorpay" trust line sat hidden under the CTA — the user
          reported it as missing. Bump to 130px so it's always visible. */}
      <div style={{ padding: 'calc(70px + env(safe-area-inset-top)) 16px calc(130px + env(safe-area-inset-bottom))' }}>

        {/* Service hero — show the full square branded card. The previous
            layout cropped the 1:1 photo into a 160px-tall strip and dimmed
            most of it under a black gradient so an overlaid title would
            read; that produced the "blurry / too small" look. New version:
            render the image at native 1:1 aspect, no gradient, no overlay
            (the image already contains the title + trust badges). Service
            meta sits in a clean strip below. */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ width: '100%', aspectRatio: '1/1', background: '#fff' }}>
            <img src={role.img} alt={serviceName}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
          </div>

          <div style={{ padding: '14px 18px 16px', borderTop: `1px solid ${BD}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T1 }}>{role.emoji} {serviceName}</div>
            <div style={{ fontSize: 13, color: T2, marginTop: 4 }}>
              🗓 Scheduled booking
            </div>
          </div>

          {/* What's included */}
          <div style={{ padding: '0 18px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 12 }}>What's included</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {role.includes.map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <span style={{ fontSize: 14, color: T2, lineHeight: '20px' }}>{item}</span>
                </div>
              ))}
            </div>

            {/* What's NOT included — sets expectations so the worker isn't
                pulled into tasks outside the booked scope. */}
            {role.excludes?.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, margin: '18px 0 12px' }}>Not included</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {role.excludes.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </div>
                      <span style={{ fontSize: 14, color: T2, lineHeight: '20px' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Duration — hidden for the Bathroom Package which is priced
            per-bathroom on a fixed visit, not per hour. */}
        {!isBathroomPkg && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 14 }}>Choose Duration</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, gridTemplateRows: 'auto auto' }}>
            {SLOTS.map(s => {
              const price    = Math.round(baseRate * s.hours * (1 - s.discount / 100))
              const selected = slot.id === s.id
              return (
                <button key={s.id} className="emp-press" onClick={() => setSlot(s)} style={{
                  padding: '12px 8px', borderRadius: 14, cursor: 'pointer', fontFamily: FONT,
                  border: `1.5px solid ${selected ? T1 : BD}`,
                  background: selected ? T1 : S2,
                  textAlign: 'center' as const, position: 'relative' as const,
                  boxShadow: selected ? '0 4px 16px rgba(255,255,255,0.10)' : 'none',
                  transition: 'background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                }}>
                  {s.badge && (
                    <div style={{
                      position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
                      background: selected ? '#111' : GRN,
                      color: selected ? '#fff' : '#000', fontSize: 9, fontWeight: 800,
                      padding: '2px 7px', borderRadius: 20, whiteSpace: 'nowrap' as const,
                    }}>{s.badge}</div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 900, color: selected ? '#000' : T1, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: selected ? '#000' : T2 }}>₹{price}</div>
                  {s.discount > 0 && (
                    <div style={{ fontSize: 10, color: selected ? 'rgba(0,0,0,0.45)' : T3, textDecoration: 'line-through', marginTop: 1 }}>₹{baseRate * s.hours}</div>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 14, padding: '10px 14px', background: S2, borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: T2 }}>{slot.label} × ₹{baseRate}/hr{slot.discount > 0 ? ` − ${slot.discount}%` : ''}{workers > 1 ? ` × ${workers} workers` : ''}</span>
            <span style={{ fontSize: 16, fontWeight: 900, color: T1 }}>₹{total.toLocaleString('en-IN')}</span>
          </div>
        </div>
        )}

        {/* Number of workers — server already supports up to 20 per shift,
            UI used to silently cap at 1. Stepper here multiplies the price
            (and the broadcast splits earnings per worker). For the Bathroom
            Package the same stepper counts bathrooms — same rate × qty math. */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 14 }}>{isBathroomPkg ? 'How many bathrooms?' : 'How many workers?'}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <button onClick={() => setWorkers(w => Math.max(1, w - 1))} disabled={workers <= 1}
              style={{
                width: 56, height: 56, borderRadius: 16, fontSize: 26, fontWeight: 800,
                border: `1.5px solid ${BD}`, background: workers <= 1 ? S2 : 'transparent',
                color: workers <= 1 ? T3 : T1,
                cursor: workers <= 1 ? 'default' : 'pointer', fontFamily: FONT,
              }}>−</button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: T1, lineHeight: 1, fontFamily: 'monospace' }}>{workers}</div>
              <div style={{ fontSize: 11, color: T3, marginTop: 4, letterSpacing: 0.5 }}>
                {isBathroomPkg
                  ? (workers === 1 ? 'bathroom' : 'bathrooms')
                  : (workers === 1 ? 'worker' : 'workers')}
              </div>
            </div>
            <button onClick={() => setWorkers(w => Math.min(20, w + 1))} disabled={workers >= 20}
              style={{
                width: 56, height: 56, borderRadius: 16, fontSize: 26, fontWeight: 800,
                border: `1.5px solid ${workers >= 20 ? BD : T1}`,
                background: workers >= 20 ? S2 : T1,
                color: workers >= 20 ? T3 : '#000',
                cursor: workers >= 20 ? 'default' : 'pointer', fontFamily: FONT,
              }}>+</button>
          </div>
          {workers > 1 && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(16,185,129,0.08)', borderRadius: 12, border: '1px solid rgba(16,185,129,0.2)' }}>
              <span style={{ fontSize: 12, color: GRN, fontWeight: 600 }}>
                ₹{((baseTotal + urgentSurcharge) / workers).toLocaleString('en-IN')}/{isBathroomPkg ? 'bathroom' : 'worker'} × {workers} = ₹{(baseTotal + urgentSurcharge).toLocaleString('en-IN')}
              </span>
            </div>
          )}
        </div>

        {/* Date / Time — always required now that instant is gone. */}
        <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 14 }}>Date</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {dateLabels.map((d, i) => (
                <button key={i} className="emp-press" onClick={() => setDateIdx(i)} style={{
                  flex: 1, padding: '11px 6px', borderRadius: 12, cursor: 'pointer', fontFamily: FONT,
                  border: `1.5px solid ${dateIdx === i ? T1 : BD}`,
                  background: dateIdx === i ? T1 : 'transparent', textAlign: 'center' as const,
                  transition: 'background 0.18s ease, border-color 0.18s ease',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: dateIdx === i ? '#000' : T1 }}>{d.label}</div>
                  <div style={{ fontSize: 12, color: dateIdx === i ? 'rgba(0,0,0,0.5)' : T3, marginTop: 2 }}>{d.short}</div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 14 }}>Start Time</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {/* When the user picks Today, hide any slot whose hour is in
                  the past — booking 8 AM at 3 PM doesn't make sense.
                  A buffer of +1h on top of the current hour gives the
                  worker enough time to actually arrive. For tomorrow / day-
                  after, show the full slot list. */}
              {TIME_SLOTS.filter(ts => {
                if (dateIdx !== 0) return true
                const slotHour = parseInt(ts.split(':')[0], 10)
                return slotHour > new Date().getHours()
              }).map(ts => (
                <button key={ts} className="emp-press" onClick={() => setTimeSlot(ts)} style={{
                  padding: '10px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: FONT,
                  border: `1.5px solid ${timeSlot === ts ? T1 : BD}`,
                  background: timeSlot === ts ? T1 : 'transparent',
                  color: timeSlot === ts ? '#000' : T1,
                  fontSize: 12, fontWeight: 700, textAlign: 'center' as const,
                  transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
                }}>
                  {ts}
                </button>
              ))}
            </div>
            {/* When all of today's slots are in the past, prompt the user
                to pick a different date instead of showing an empty row. */}
            {dateIdx === 0 && TIME_SLOTS.every(ts => parseInt(ts.split(':')[0], 10) <= new Date().getHours()) && (
              <p style={{ fontSize: 12, color: T2, marginTop: 12, textAlign: 'center' as const }}>
                No more slots today. Pick Tomorrow or Day After.
              </p>
            )}
          </div>

        {/* Address */}
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>Job Location</div>
            <button onClick={fillAddress} disabled={locLoad} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8,
              border: `1px solid ${BD}`, background: S2, cursor: 'pointer', fontFamily: FONT,
              fontSize: 11, fontWeight: 700, color: T2, opacity: locLoad ? 0.5 : 1,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T2} strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
              {locLoad ? 'Getting…' : 'Use my location'}
            </button>
          </div>
          {locError && (
            <p style={{
              fontSize: 12, color: '#DC2626', fontWeight: 600,
              margin: '0 0 10px',
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
            }}>
              {locError}
            </p>
          )}
          {coords && !locError && (
            <p style={{
              fontSize: 12, color: '#10B981', fontWeight: 600,
              margin: '0 0 10px',
            }}>
              ✓ Location captured — the worker will arrive at this exact spot
            </p>
          )}
          {/* Structured fields so workers reach the door, not just the
              building gate. Flat + tower are required; the rest goes in
              the freeform Street / Landmark field below. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input value={flat} onChange={e => setFlat(e.target.value.slice(0, 24))}
              placeholder="Flat / House no."
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1.5px solid ${BD}`, background: S2, color: T1,
                fontSize: 14, fontWeight: 600, fontFamily: FONT, outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
            <input value={tower} onChange={e => setTower(e.target.value.slice(0, 32))}
              placeholder="Tower / Building"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1.5px solid ${BD}`, background: S2, color: T1,
                fontSize: 14, fontWeight: 600, fontFamily: FONT, outline: 'none',
                boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <textarea rows={3} placeholder="Street, area, landmark…"
            value={address} onChange={e => setAddress(e.target.value)}
            onFocus={() => setAddrFocus(true)} onBlur={() => setAddrFocus(false)}
            style={{
              width: '100%', padding: '14px', borderRadius: 14,
              border: `1.5px solid ${addrFocus ? T1 : BD}`,
              fontSize: 14, color: T1, background: S2, outline: 'none', resize: 'none',
              boxSizing: 'border-box' as const, fontFamily: FONT, lineHeight: '22px',
              transition: 'border-color 0.15s',
            }}
          />
        </div>

        {/* Promo code — first-booking only. Hide the entire card for repeat
            employers; the server also ignores any promo code they send. */}
        {!hasPriorBooking && (
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 12 }}>Promo Code</div>
          {promoApplied ? (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🎉</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: GRN }}>{promoApplied.code}</div>
                <div style={{ fontSize: 12, color: T2 }}>{promoApplied.description} · saving ₹{promoApplied.discount}</div>
              </div>
              <button onClick={clearPromo} style={{ background: 'none', border: 'none', color: T2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Remove</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="ENTER CODE" maxLength={20}
                  style={{ flex: 1, background: S2, border: `1.5px solid ${BD}`, borderRadius: 12, padding: '12px 14px', color: T1, fontSize: 14, fontWeight: 700, letterSpacing: 1, outline: 'none' }} />
                <button onClick={applyPromo} disabled={!promoCode.trim() || promoLoading}
                  style={{ padding: '0 18px', borderRadius: 12, background: promoCode.trim() ? T1 : S2, color: promoCode.trim() ? '#000' : T3, fontWeight: 800, fontSize: 14, border: 'none', cursor: promoCode.trim() && !promoLoading ? 'pointer' : 'default' }}>
                  {promoLoading ? '…' : 'Apply'}
                </button>
              </div>
              {/* Tap-to-apply hint for the active SAVE50 launch promo. One
                  tap fills the input + fires applyPromo so users don't have
                  to retype the code. */}
              <button
                onClick={() => { setPromoCode('SAVE50'); setTimeout(() => applyPromo(), 0) }}
                style={{
                  marginTop: 10, width: '100%',
                  padding: '10px 14px', borderRadius: 12,
                  border: '1px dashed rgba(16,185,129,0.45)',
                  background: 'rgba(16,185,129,0.08)',
                  color: GRN, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                }}>
                <span>🎁 Use <strong>SAVE50</strong> for ₹50 off</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>Apply →</span>
              </button>
            </>
          )}
          {promoError && <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8 }}>{promoError}</div>}
        </div>
        )}

        {/* Bill */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T3, textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 14 }}>Bill Summary</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
            <span style={{ fontSize: 14, color: T2 }}>
              {serviceName} · {slot.label}{workers > 1 ? ` × ${workers}` : ''}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>₹{baseTotal.toLocaleString('en-IN')}</span>
          </div>
          {urgentSurcharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
              <span style={{ fontSize: 14, color: T2 }}>⚡ Instant surcharge (₹50/hr)</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: T1 }}>+₹{urgentSurcharge.toLocaleString('en-IN')}</span>
            </div>
          )}
          {slot.discount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
              <span style={{ fontSize: 14, color: GRN }}>Slot discount ({slot.discount}%)</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: GRN }}>−₹{slotDiscount.toLocaleString('en-IN')}</span>
            </div>
          )}
          {promoApplied && promoDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${BD}` }}>
              <span style={{ fontSize: 14, color: GRN }}>Promo {promoApplied.code}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: GRN }}>−₹{promoDiscount.toLocaleString('en-IN')}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: T1 }}>You pay</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: T1 }}>₹{total.toLocaleString('en-IN')}</span>
              {(slotDiscount + promoDiscount) > 0 && <div style={{ fontSize: 12, color: GRN, fontWeight: 700 }}>You save ₹{(slotDiscount + promoDiscount).toLocaleString('en-IN')}</div>}
            </div>
          </div>
          <p style={{ fontSize: 11, color: T3, marginTop: 8 }}>All-inclusive price. No taxes added at checkout.</p>
        </div>

        {/* Trust */}
        <div style={{ background: 'rgba(16,185,129,0.07)', borderRadius: 14, padding: '12px 16px', border: '1px solid rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GRN} strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: GRN }}>100% Secured by Razorpay</span>
        </div>

        {error && <div style={{ fontSize: 14, color: '#EF4444', marginTop: 12, textAlign: 'center' }}>{error}</div>}
        {/* In schedule mode, the inline yellow note above the time-slot grid
            already prompts the user. The Pay button below is also disabled
            until a slot is picked, so this duplicate warning was just noise. */}
      </div>

      {/* Sticky CTA */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, background: BG,
        borderTop: `1px solid ${BD}`, padding: '14px 16px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
      }}>
        {(slotDiscount + promoDiscount) > 0 && (
          <div style={{ textAlign: 'center', fontSize: 12, color: GRN, fontWeight: 700, marginBottom: 8 }}>
            🎉 Saving ₹{slotDiscount + promoDiscount}{promoApplied ? ` with ${promoApplied.code}` : ` with ${slot.discount}% off`}
          </div>
        )}
        <button onClick={handlePay} disabled={!canPay || loading} style={{
          width: '100%', padding: '17px 0', borderRadius: 16, border: 'none',
          cursor: canPay && !loading ? 'pointer' : 'default',
          background: canPay ? T1 : S1, color: canPay ? '#000' : T2,
          fontWeight: 900, fontSize: 17, fontFamily: FONT,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          opacity: loading ? 0.7 : 1, transition: 'all 0.15s',
        }}>
          {loading ? 'Opening Razorpay…'
            : !canPay
              ? (!timeSlot
                  ? 'Pick a start time'
                  : address.trim().length < 6
                    ? 'Enter address to continue'
                    : flat.trim().length === 0
                      ? 'Enter flat number'
                      : 'Complete details to continue')
              : (
            <>
              <svg width="20" height="20" viewBox="0 0 30 30" fill="none">
                <path d="M15 2L4 27h8L15 18l3 9h8L15 2z" fill="#000"/>
              </svg>
              Pay ₹{total.toLocaleString('en-IN')} via Razorpay
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default function CartPage() {
  return <Suspense><CartInner /></Suspense>
}
