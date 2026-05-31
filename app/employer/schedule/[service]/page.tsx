'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ChevronDown, ArrowRight, MapPin, Minus, Plus, Check, Crosshair, X, Tag, Sparkles } from 'lucide-react'
import { toastError, toastSuccess } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

// Multi-day shifts are billed at 12 hours/day so 2-day = 24h, 7-day = 84h.
// Keep this multiplier in sync with the cart/Razorpay total calculation.
const DURATIONS = [
  { id: '1h',  label: '1 hr',   hours: 1,  discount: 0  },
  { id: '2h',  label: '2 hrs',  hours: 2,  discount: 0  },
  { id: '4h',  label: '4 hrs',  hours: 4,  discount: 0  },
  { id: '8h',  label: '8 hrs',  hours: 8,  discount: 0  },
  { id: '12h', label: '12 hrs', hours: 12, discount: 5  },
  { id: '2d',  label: '2 Days', hours: 24, discount: 10 },
  { id: '7d',  label: '7 Days', hours: 84, discount: 15 },
] as const
type DurId = typeof DURATIONS[number]['id']

// Long shifts (12h, 2 days, 7 days) are scheduled multi-day commitments so
// the start time can be picked freely across the day.
const FREE_START_DURATIONS: ReadonlyArray<DurId> = ['12h', '2d', '7d']

const TODS = ['Morning', 'Afternoon', 'Evening'] as const
type Tod = typeof TODS[number]

// Latest acceptable START hour for a short shift of N hours so the shift
// finishes by ~8 PM.  Long shifts (12h+) bypass this entirely and allow
// any start time of day.
//   1 hr  → 20:00
//   2 hr  → 18:00
//   4 hr  → 16:00
//   8 hr  → 12:00
function shortMaxStartHour(hours: number): number {
  if (hours <= 1) return 20
  return Math.max(6, 20 - hours)
}

function buildSlots(tod: Tod, durId: DurId, durHours: number): string[] {
  const ranges: Record<Tod, number[]> = {
    Morning:   [6, 7, 8, 9, 10, 11],
    Afternoon: [12, 13, 14, 15, 16],
    Evening:   [17, 18, 19, 20, 21],
  }
  const isFree = (FREE_START_DURATIONS as readonly string[]).includes(durId)
  const cap = isFree ? 23 : shortMaxStartHour(durHours)
  const out: string[] = []
  for (const h of ranges[tod]) {
    if (h > cap) continue
    out.push(`${pad(h)}:00`, `${pad(h)}:30`)
  }
  return out
}

function pad(n: number) { return n.toString().padStart(2, '0') }

function fmtAmPm(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${pad(hr12)}:${pad(m)} ${ampm}`
}

function dayLabel(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
}

function dayKey(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

interface AddressOption {
  id:    string
  label: string
  full:  string
  lat?:  number
  lng?:  number
}

type AddressForm = { flat: string; tower: string; address: string; city: string }

export default function SchedulePage({ params }: { params: { service: string } }) {
  const router  = useRouter()
  const search  = useSearchParams()
  const service = decodeURIComponent(params.service)
  const mode    = (search.get('mode') as 'home' | 'business') || 'home'
  const slotParam = search.get('slot') || '8h'

  const [dayOffset, setDayOffset] = useState(0)
  const [duration,  setDuration]  = useState<DurId>(
    DURATIONS.some(d => d.id === slotParam) ? (slotParam as DurId) : '8h',
  )
  const [tod, setTod]   = useState<Tod>('Afternoon')
  const [time, setTime] = useState<string>('')
  const [workers, setWorkers] = useState(1)
  const [addresses, setAddresses] = useState<AddressOption[]>([])
  const [addrId, setAddrId] = useState<string | null>(null)
  const [addrSheetOpen, setAddrSheetOpen] = useState(false)
  const [addrFormOpen, setAddrFormOpen]   = useState(false)
  const [addrForm, setAddrForm] = useState<AddressForm>({ flat: '', tower: '', address: '', city: '' })
  const [savingAddr, setSavingAddr] = useState(false)
  const [locating, setLocating]   = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [paying,  setPaying]      = useState(false)
  const [profile, setProfile]     = useState<{ name: string; phone: string; email?: string } | null>(null)
  // Coupon state — applied promo persists across slot/duration changes; we
  // re-validate at pay time anyway via the server.
  const [couponOpen,  setCouponOpen]  = useState(false)
  const [coupon,      setCoupon]      = useState<{ code: string; discount: number; description: string } | null>(null)
  const rate = 199  // dashboard's typical rate; cart re-validates exact

  useEffect(() => {
    fetch('/api/employer/profile').then(r => r.ok ? r.json() : null).then(d => {
      const u = d?.user || d?.profile
      setProfileLoaded(true)
      if (!u) return
      setProfile({ name: u.name || '', phone: u.phone || '', email: u.email || undefined })
      const ep = u.employerProfile
      if (!ep) {
        // No employer profile at all → still need an address.
        setAddrFormOpen(true)
        return
      }
      const isHome = (ep.businessType || '').trim() === 'Personal / Individual'
      const full = [ep.flat, ep.tower, ep.address, ep.city].filter(Boolean).join(', ')
      if (full) {
        const opt: AddressOption = {
          id:    'profile',
          label: isHome ? 'Home' : (ep.companyName || 'Business'),
          full,
        }
        setAddresses([opt])
        setAddrId(opt.id)
      } else {
        // No address yet — open the form sheet on mount so the user can
        // capture one before they pick a time slot.
        setAddrFormOpen(true)
      }
    }).catch(() => { setProfileLoaded(true) })
  }, [])

  const dur     = DURATIONS.find(d => d.id === duration)!
  const regular = Math.round(rate * dur.hours * 2 * workers)
  const subtotal = Math.round(rate * dur.hours * (1 - dur.discount / 100) * workers)
  const final   = Math.max(0, subtotal - (coupon?.discount || 0))

  const slots = useMemo(() => buildSlots(tod, dur.id, dur.hours), [tod, dur.id, dur.hours])

  function isPast(hhmm: string): boolean {
    if (dayOffset !== 0) return false
    const [h, m] = hhmm.split(':').map(Number)
    const slotDate = new Date()
    slotDate.setHours(h, m, 0, 0)
    return slotDate.getTime() < Date.now()
  }

  // Disable a time-of-day tab when all its slots are either past or beyond
  // the per-duration cap.
  function todHasSlots(t: Tod): boolean {
    const list = buildSlots(t, dur.id, dur.hours)
    return list.some(s => !isPast(s))
  }

  // Reset selected time if it goes invalid after duration changes.
  useEffect(() => {
    if (time && !slots.includes(time)) setTime('')
  }, [slots, time])

  const selectedAddr = addresses.find(a => a.id === addrId) || null
  const canPay = Boolean(time) && Boolean(selectedAddr) && workers >= 1 && !paying

  async function loadRzp(): Promise<boolean> {
    if ((window as any).Razorpay) return true
    return new Promise(res => {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload = () => res(true)
      s.onerror = () => res(false)
      document.body.appendChild(s)
    })
  }

  async function payNow() {
    if (!selectedAddr) { toastError('Add an address first'); setAddrFormOpen(true); return }
    if (!time)         { toastError('Pick a time slot'); return }
    if (!canPay) return

    setPaying(true)
    const startTime = time
    const endH      = Number(startTime.split(':')[0]) + dur.hours
    const endTime   = `${pad(endH % 24)}:${startTime.split(':')[1]}`
    const date      = dayKey(dayOffset)

    try {
      const orderRes = await fetch('/api/employer/cart/pay', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          category:      service,
          duration:      dur.hours,
          workersNeeded: workers,
          address:       selectedAddr!.full,
          ...(selectedAddr!.lat != null && selectedAddr!.lng != null
            ? { lat: selectedAddr!.lat, lng: selectedAddr!.lng } : {}),
          date,
          startTime,
          endTime,
          isInstant:     false,
          ...(coupon?.code ? { promoCode: coupon.code } : {}),
        }),
      })
      const orderData = await orderRes.json().catch(() => ({}))
      if (!orderRes.ok || !orderData.orderId) {
        throw new Error(orderData?.error || `Could not start payment (HTTP ${orderRes.status})`)
      }

      const loaded = await loadRzp()
      if (!loaded) throw new Error('Could not load Razorpay (script blocked or no internet)')

      const Rzp = (window as any).Razorpay
      if (typeof Rzp !== 'function') throw new Error('Razorpay loaded but is not callable. Reload the page.')

      const rzp = new Rzp({
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency || 'INR',
        order_id:    orderData.orderId,
        name:        'Switch',
        description: `${service} · ${dur.hours}h × ${workers}`,
        theme:       { color: '#000000' },
        // Pre-fill name + contact + email so the Razorpay sheet skips the
        // contact-collection step entirely. `readonly` locks the fields so
        // employers can't accidentally pay under a different identity.
        prefill: {
          name:    profile?.name  || '',
          contact: profile?.phone ? `+91${profile.phone.replace(/\D/g, '').slice(-10)}` : '',
          email:   profile?.email || '',
        },
        readonly: {
          contact: Boolean(profile?.phone),
          email:   Boolean(profile?.email),
        },
        notes: {
          service,
          duration:      `${dur.hours}h`,
          workersNeeded: String(workers),
          source:        'schedule_page',
        },
        handler: async (response: any) => {
          const verifyRes = await fetch('/api/employer/cart/verify', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId:   response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
          const verifyData = await verifyRes.json().catch(() => ({}))
          if (!verifyRes.ok || !verifyData.shiftId) {
            toastError(verifyData?.error || 'Payment verified but booking failed. Contact support.')
            setPaying(false); return
          }
          router.replace(`/employer/job/${verifyData.shiftId}/booked`)
        },
        modal: { ondismiss: () => { setPaying(false) } },
        'payment.failed': (resp: any) => {
          toastError(`Payment failed${resp?.error?.description ? `: ${resp.error.description}` : ''}`)
          setPaying(false)
        },
      })
      rzp.open()
    } catch (err: any) {
      toastError(err?.message || 'Network error. Please try again.')
      setPaying(false)
    }
  }

  // Address form handlers
  function useCurrentLocation() {
    if (!navigator.geolocation) { toastError('Location not available'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`)
          const data = await res.json()
          const a    = data.address || {}
          const parts = [a.road || a.pedestrian, a.suburb || a.neighbourhood].filter(Boolean)
          setAddrForm(f => ({
            ...f,
            address: parts.join(', ') || f.address,
            city:    a.city || a.town || a.village || f.city,
          }))
          toastSuccess('Location filled — add flat/tower then save')
        } catch {
          toastError('Could not resolve location')
        } finally {
          setLocating(false)
        }
      },
      err => {
        setLocating(false)
        toastError(err.code === err.PERMISSION_DENIED
          ? 'Permission denied — enable location to autofill'
          : 'Could not get your location')
      },
      { timeout: 10000, enableHighAccuracy: false },
    )
  }

  async function saveAddressToProfile() {
    if (!addrForm.address.trim() || !addrForm.city.trim()) {
      toastError('Address line and city are required')
      return
    }
    setSavingAddr(true)
    try {
      const res = await fetch('/api/employer/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(addrForm),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error || 'Could not save address')
      }
      const full = [addrForm.flat, addrForm.tower, addrForm.address, addrForm.city].filter(Boolean).join(', ')
      const opt: AddressOption = { id: 'profile', label: mode === 'business' ? 'Business' : 'Home', full }
      setAddresses([opt])
      setAddrId(opt.id)
      setAddrFormOpen(false)
      toastSuccess('Address saved to your profile')
    } catch (err: any) {
      toastError(err?.message || 'Could not save address')
    } finally {
      setSavingAddr(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh' as any, background: BG, fontFamily: FONT, color: T1, display: 'flex', flexDirection: 'column' }}>

      <div style={{ padding: 'calc(14px + env(safe-area-inset-top)) 14px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 22, height: 22 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.6, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{service}</div>
          <div style={{ fontSize: 13, color: T2, marginTop: 4 }}>Schedule a verified worker</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px 130px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Address — opens the form sheet when empty */}
        <Card>
          <SectionTitle>Service address</SectionTitle>
          {selectedAddr ? (
            <button onClick={() => setAddrSheetOpen(true)}
              style={{ width: '100%', background: SURF2, border: `1px solid ${BD}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' as const, color: T1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MapPin style={{ width: 16, height: 16, color: T1 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>{selectedAddr.label}</div>
                <div style={{ fontSize: 12, color: T2, marginTop: 2, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{selectedAddr.full}</div>
              </div>
              <ChevronDown style={{ width: 16, height: 16, color: T3, flexShrink: 0 }} />
            </button>
          ) : (
            <button onClick={() => setAddrFormOpen(true)}
              style={{ width: '100%', background: SURF2, border: `1px dashed ${BDH}`, borderRadius: 14, padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', fontFamily: FONT, color: T1, fontSize: 14, fontWeight: 700 }}>
              <Plus style={{ width: 16, height: 16 }} /> Add an address
            </button>
          )}
        </Card>

        {/* Select Date */}
        <Card>
          <SectionTitle>Select Date</SectionTitle>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[0, 1, 2].map(off => (
              <button key={off} onClick={() => { setDayOffset(off); setTime('') }} style={chip(off === dayOffset, true)}>
                {dayLabel(off)}
              </button>
            ))}
          </div>
        </Card>

        {/* Workers */}
        <Card>
          <SectionTitle>Number of workers</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button onClick={() => setWorkers(w => Math.max(1, w - 1))} disabled={workers <= 1}
              aria-label="Decrease" style={countBtn(workers > 1)}>
              <Minus style={{ width: 18, height: 18 }} />
            </button>
            <div style={{ minWidth: 48, textAlign: 'center', fontSize: 26, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>
              {workers}
            </div>
            <button onClick={() => setWorkers(w => Math.min(10, w + 1))} disabled={workers >= 10}
              aria-label="Increase" style={countBtn(workers < 10)}>
              <Plus style={{ width: 18, height: 18 }} />
            </button>
            <div style={{ flex: 1, fontSize: 12, color: T2, textAlign: 'right' as const, lineHeight: 1.3 }}>
              {workers === 1 ? 'Solo booking' : `${workers} workers at the same time`}
            </div>
          </div>
        </Card>

        {/* Duration */}
        <Card>
          <SectionTitle>Duration</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            {DURATIONS.map(d => {
              const sel = d.id === duration
              const r   = Math.round(rate * d.hours * 2 * workers)
              const f   = Math.round(rate * d.hours * (1 - d.discount / 100) * workers)
              return (
                <button key={d.id} onClick={() => setDuration(d.id)}
                  style={{
                    background: sel ? 'rgba(255,255,255,0.06)' : SURF2,
                    border: `1.5px solid ${sel ? T1 : BD}`,
                    borderRadius: 14, padding: '12px 12px',
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                    color: T1, fontFamily: FONT, cursor: 'pointer', textAlign: 'left' as const,
                    minWidth: 0,
                  }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T1 }}>{d.label}</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' as const }}>
                    <span style={{ fontSize: 15, fontWeight: 900, color: T1 }}>₹{f.toLocaleString('en-IN')}</span>
                    <span style={{ fontSize: 11, color: T3, textDecoration: 'line-through' }}>₹{r.toLocaleString('en-IN')}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        {/* Start Time */}
        <Card>
          <SectionTitle>Start Time</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
            {TODS.map(t => {
              const hasSlots = todHasSlots(t)
              const sel = t === tod
              return (
                <button key={t} onClick={() => hasSlots && (setTod(t), setTime(''))} disabled={!hasSlots}
                  style={{ ...chip(sel, false), opacity: hasSlots ? 1 : 0.35, cursor: hasSlots ? 'pointer' : 'not-allowed' }}>
                  {t}
                </button>
              )
            })}
          </div>

          {slots.length === 0 ? (
            <div style={{ padding: '20px 8px', textAlign: 'center', color: T2, fontSize: 13 }}>
              No {tod.toLowerCase()} slots for a {dur.label} shift. Try a different time of day.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {slots.map(s => {
                const disabled = isPast(s)
                const sel = s === time
                return (
                  <button key={s} onClick={() => !disabled && setTime(s)} disabled={disabled}
                    style={{
                      background: sel ? 'rgba(255,255,255,0.06)' : SURF2,
                      border: `1.5px solid ${sel ? T1 : BD}`,
                      borderRadius: 12, padding: '11px 4px',
                      color: disabled ? T3 : T1, fontFamily: FONT, fontSize: 13, fontWeight: 700,
                      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
                      minWidth: 0,
                    }}>
                    {fmtAmPm(s)}
                  </button>
                )
              })}
            </div>
          )}
          {/* Coupon row — sits below time slots so the running total at the
              footer reflects the discount immediately. */}
          {time && (
            <button onClick={() => setCouponOpen(true)}
              style={{ width: '100%', marginTop: 14, padding: '12px 14px', background: SURF2, border: `1px dashed ${coupon ? T1 : BDH}`, borderRadius: 12, color: T1, fontFamily: FONT, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' as const }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Tag style={{ width: 15, height: 15, color: T1 }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {coupon ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T1, letterSpacing: -0.2 }}>{coupon.code} applied · −₹{coupon.discount.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 11, color: T2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{coupon.description}</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T1, letterSpacing: -0.2 }}>Apply coupon or view offers</div>
                    <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>See all eligible offers for this booking</div>
                  </>
                )}
              </div>
              {coupon ? (
                <span onClick={e => { e.stopPropagation(); setCoupon(null) }} role="button" aria-label="Remove coupon"
                  style={{ width: 28, height: 28, borderRadius: 14, background: SURF, border: `1px solid ${BD}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer', color: T1 }}>
                  <X style={{ width: 13, height: 13 }} />
                </span>
              ) : (
                <ChevronDown style={{ width: 14, height: 14, color: T3, flexShrink: 0 }} />
              )}
            </button>
          )}

          {time && (
            <div style={{ marginTop: 12, padding: '12px 14px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, borderRadius: 12, fontSize: 13, color: T2, lineHeight: 1.5 }}>
              Starts <span style={{ color: T1, fontWeight: 800 }}>{fmtAmPm(time)}</span>
              {dur.hours <= 12 ? (
                <>
                  {' '}→{' '}
                  <span style={{ color: T1, fontWeight: 800 }}>
                    {fmtAmPm(`${pad((Number(time.split(':')[0]) + dur.hours) % 24)}:${time.split(':')[1]}`)}
                  </span>
                </>
              ) : (
                <>{' '}· runs for <span style={{ color: T1, fontWeight: 800 }}>{dur.label} ({dur.hours}h total)</span></>
              )}
              {dur.hours <= 12 && <> · {dur.label}</>}
            </div>
          )}
        </Card>
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        background: BG, borderTop: `1px solid ${BD}`,
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', gap: 12,
        zIndex: 5,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>Total</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: T1 }}>₹{final.toLocaleString('en-IN')}</span>
            <span style={{ fontSize: 12, color: T3, textDecoration: 'line-through' }}>₹{regular.toLocaleString('en-IN')}</span>
            {coupon && (
              <span style={{ fontSize: 11, color: '#22C55E', fontWeight: 800 }}>−₹{coupon.discount.toLocaleString('en-IN')} ({coupon.code})</span>
            )}
          </div>
        </div>
        <button onClick={payNow} disabled={!canPay}
          style={{
            padding: '14px 22px', borderRadius: 14, border: 'none',
            background: canPay ? T1 : SURF2, color: canPay ? '#000' : T3,
            fontWeight: 800, fontSize: 14,
            cursor: canPay ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT,
            flexShrink: 0,
            boxShadow: canPay ? '0 10px 24px rgba(255,255,255,0.08)' : 'none',
          }}>
          {paying ? 'Opening Razorpay…' : <>Pay Now <ArrowRight style={{ width: 16, height: 16 }} /></>}
        </button>
      </div>

      {/* Address picker sheet */}
      {addrSheetOpen && (
        <Sheet onClose={() => setAddrSheetOpen(false)} title="Choose address">
          {addresses.map(a => {
            const sel = a.id === addrId
            return (
              <button key={a.id} onClick={() => { setAddrId(a.id); setAddrSheetOpen(false) }}
                style={{ width: '100%', background: sel ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${sel ? BDH : BD}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' as const, color: T1, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin style={{ width: 16, height: 16, color: T1 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T1 }}>{a.label}</div>
                  <div style={{ fontSize: 12, color: T2, marginTop: 2, lineHeight: 1.4 }}>{a.full}</div>
                </div>
                {sel && <Check style={{ width: 18, height: 18, color: T1, flexShrink: 0 }} />}
              </button>
            )
          })}
          <button onClick={() => { setAddrSheetOpen(false); setAddrFormOpen(true) }}
            style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'transparent', border: `1px dashed ${BDH}`, color: T1, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Plus style={{ width: 14, height: 14 }} />
            Add new address
          </button>
        </Sheet>
      )}

      {/* Coupon sheet */}
      {couponOpen && (
        <CouponSheet
          total={subtotal}
          onClose={() => setCouponOpen(false)}
          onApply={(code, discount, description) => { setCoupon({ code, discount, description }); setCouponOpen(false) }}
        />
      )}

      {/* Address form sheet */}
      {addrFormOpen && (
        <Sheet onClose={() => setAddrFormOpen(false)} title="Add address" subtitle="We'll save this to your profile so you don't have to type it again.">
          <button onClick={useCurrentLocation} disabled={locating}
            style={{ width: '100%', padding: '11px', borderRadius: 12, background: SURF2, border: `1px solid ${BD}`, color: T1, fontWeight: 700, fontSize: 13, cursor: locating ? 'default' : 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14, opacity: locating ? 0.7 : 1 }}>
            <Crosshair style={{ width: 14, height: 14 }} />
            {locating ? 'Locating…' : 'Use current location'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Field label="Flat / House No."   value={addrForm.flat}    onChange={v => setAddrForm(f => ({ ...f, flat: v }))} />
            <Field label="Tower / Building"   value={addrForm.tower}   onChange={v => setAddrForm(f => ({ ...f, tower: v }))} />
            <Field label="Street address"     value={addrForm.address} onChange={v => setAddrForm(f => ({ ...f, address: v }))} required multiline />
            <Field label="City"               value={addrForm.city}    onChange={v => setAddrForm(f => ({ ...f, city: v }))} required />
          </div>
          <button onClick={saveAddressToProfile} disabled={savingAddr}
            style={{ width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, background: T1, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: savingAddr ? 'default' : 'pointer', fontFamily: FONT, opacity: savingAddr ? 0.7 : 1 }}>
            {savingAddr ? 'Saving…' : 'Save & use this address'}
          </button>
        </Sheet>
      )}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, padding: 14 }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 17, fontWeight: 800, color: T1, marginBottom: 14, letterSpacing: -0.3 }}>{children}</div>
  )
}

function chip(selected: boolean, padded: boolean): React.CSSProperties {
  return {
    padding: padded ? '10px 18px' : '9px 10px',
    borderRadius: 12,
    background: selected ? 'rgba(255,255,255,0.06)' : SURF2,
    border: `1.5px solid ${selected ? T1 : BD}`,
    color: T1, fontFamily: FONT, fontSize: 13, fontWeight: 700,
    cursor: 'pointer',
    minWidth: 0,
  }
}

function countBtn(enabled: boolean): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: 20,
    background: enabled ? SURF2 : 'transparent',
    border: `1px solid ${BD}`,
    color: enabled ? T1 : T3,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: enabled ? 'pointer' : 'not-allowed', flexShrink: 0,
  }
}

function Field({ label, value, onChange, multiline, required }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean; required?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </div>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
          style={{ width: '100%', background: SURF2, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 13px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: FONT, minHeight: 56 }} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', background: SURF2, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 13px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: FONT }} />
      )}
    </div>
  )
}

interface PromoOption {
  code:        string
  description: string
  type:        'flat' | 'percent' | 'fixed_total'
  amount:      number
  minSpend:    number | null
  maxDiscount: number | null
  eligible:    boolean
  reason:      string
  preview:     number | null
}

function CouponSheet({ total, onClose, onApply }: { total: number; onClose: () => void; onApply: (code: string, discount: number, description: string) => void }) {
  const [promos, setPromos] = useState<PromoOption[] | null>(null)
  const [code,   setCode]   = useState('')
  const [busy,   setBusy]   = useState(false)
  const [err,    setErr]    = useState('')

  useEffect(() => {
    fetch(`/api/employer/promo?total=${encodeURIComponent(total)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setPromos(d.promos || []))
      .catch(() => setPromos([]))
  }, [total])

  async function apply(c: string) {
    const clean = c.trim().toUpperCase()
    if (!clean) { setErr('Enter a coupon code'); return }
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/employer/promo', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code: clean, total }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.valid) {
        setErr(data?.error || 'Could not apply coupon')
        return
      }
      onApply(data.code, Number(data.discount) || 0, data.description || 'Discount applied')
    } catch {
      setErr('Could not reach server')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: BG, borderRadius: '24px 24px 0 0', padding: '18px 18px calc(28px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, border: `1px solid ${BD}`, borderBottom: 'none', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: BD, margin: '0 auto 16px' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: T1, letterSpacing: -0.4 }}>Apply coupon</div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 16, background: SURF2, border: `1px solid ${BD}`, color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: T2, marginBottom: 18 }}>Enter a code or pick from the offers below.</div>

        {/* Manual code input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text" value={code}
            onChange={e => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)); setErr('') }}
            placeholder="Enter coupon code"
            style={{ flex: 1, background: SURF2, border: `1.5px solid ${code ? T1 : BD}`, borderRadius: 14, padding: '12px 14px', color: T1, fontSize: 15, fontWeight: 800, letterSpacing: 1, outline: 'none', fontFamily: FONT, minWidth: 0 }}
          />
          <button onClick={() => apply(code)} disabled={!code || busy}
            style={{ padding: '12px 18px', borderRadius: 14, border: 'none', background: code && !busy ? T1 : SURF2, color: code && !busy ? '#000' : T3, fontWeight: 800, fontSize: 14, fontFamily: FONT, cursor: code && !busy ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
            {busy ? '…' : 'Apply'}
          </button>
        </div>
        {err && (
          <div style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#FCA5A5' }}>
            {err}
          </div>
        )}

        <div style={{ fontSize: 11, fontWeight: 800, color: T2, marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>Available offers</div>

        {promos === null && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: T2, fontSize: 13 }}>Loading offers…</div>
        )}

        {promos && promos.length === 0 && (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: T2, fontSize: 13 }}>No offers available right now.</div>
        )}

        {promos && promos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {promos.map(p => (
              <div key={p.code}
                style={{ background: SURF, border: `1px solid ${p.eligible ? BDH : BD}`, borderRadius: 16, padding: 14, opacity: p.eligible ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles style={{ width: 16, height: 16, color: T1 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: T1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: 1, background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 6, border: `1px dashed ${BDH}` }}>
                        {p.code}
                      </span>
                      {p.eligible && p.preview != null && p.preview > 0 && (
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#22C55E' }}>Save ₹{p.preview.toLocaleString('en-IN')}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: T1, marginTop: 6, fontWeight: 600 }}>{p.description}</div>
                    {!p.eligible && p.reason && (
                      <div style={{ fontSize: 11, color: T3, marginTop: 4 }}>{p.reason}</div>
                    )}
                    {p.eligible && p.minSpend && (
                      <div style={{ fontSize: 11, color: T2, marginTop: 4 }}>Min cart ₹{p.minSpend.toLocaleString('en-IN')}</div>
                    )}
                  </div>
                  {p.eligible && (
                    <button onClick={() => apply(p.code)} disabled={busy}
                      style={{ padding: '8px 14px', borderRadius: 10, border: 'none', background: T1, color: '#000', fontWeight: 800, fontSize: 12, fontFamily: FONT, cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}>
                      Apply
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Sheet({ children, onClose, title, subtitle }: { children: React.ReactNode; onClose: () => void; title: string; subtitle?: string }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: BG, borderRadius: '24px 24px 0 0', padding: '18px 18px calc(28px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, border: `1px solid ${BD}`, borderBottom: 'none', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: T1 }}>{title}</div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 15, background: SURF2, border: `1px solid ${BD}`, color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>
        {subtitle && <div style={{ fontSize: 12, color: T2, marginBottom: 14, lineHeight: 1.4 }}>{subtitle}</div>}
        {!subtitle && <div style={{ marginBottom: 14 }} />}
        {children}
      </div>
    </div>
  )
}
