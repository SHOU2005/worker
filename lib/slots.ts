// Single source of truth for cart pricing. Both `app/employer/cart/page.tsx`
// (UI bill) and `app/api/employer/cart/pay/route.ts` (Razorpay order amount)
// MUST go through the same SLOTS array + computeBill() — otherwise the user sees
// one number and gets charged another.

import { workerEarning as workerEarningForHours } from './pricing'

export type SlotId = '1h' | '2h' | '4h' | '8h' | '12h' | '3d' | '7d'

export interface SlotDef {
  id:        SlotId
  label:     string
  hours:     number
  /** % off the gross amount (before promo). 0 = no discount. */
  discount:  number
  badge:     string
}

export const SLOTS: readonly SlotDef[] = [
  { id: '1h',  label: '1 hr',   hours: 1,  discount: 0,  badge: ''           },
  { id: '2h',  label: '2 hrs',  hours: 2,  discount: 0,  badge: ''           },
  { id: '4h',  label: '4 hrs',  hours: 4,  discount: 0,  badge: ''           },
  { id: '8h',  label: '8 hrs',  hours: 8,  discount: 5,  badge: '5% off'     },
  { id: '12h', label: '1 Day',  hours: 12, discount: 5,  badge: '5% off'     },
  { id: '3d',  label: '3 Days', hours: 36, discount: 15, badge: '15% off'    },
  { id: '7d',  label: '7 Days', hours: 84, discount: 15, badge: 'Best Value' },
]

export function getSlotByHours(hours: number): SlotDef | null {
  return SLOTS.find(s => s.hours === hours) ?? null
}

export function getSlotById(id: string): SlotDef | null {
  return SLOTS.find(s => s.id === id) ?? null
}

/** Default schedule rate. The base employer pays per worker per hour
 *  for any service not listed in SERVICE_RATES. */
export const SCHEDULE_RATE   = 199
/** Per-hour surcharge for instant ("urgent") jobs. Stored separately on Shift.urgentFee for analytics. */
export const URGENT_RATE_FEE = 50
/** Effective per-hour employer rate for instant jobs (uses default rate). */
export const INSTANT_RATE    = SCHEDULE_RATE + URGENT_RATE_FEE

/**
 * Per-service hourly rate overrides. Anything not listed falls back to
 * SCHEDULE_RATE. Worker take-home is still a flat ₹100/hr (lib/pricing.ts) —
 * if the employer rate drops below that, the platform absorbs the
 * difference (promo / acquisition pricing). platformFee in computeBill
 * is floored at 0 so the books stay consistent.
 */
// Main displayed price is ₹149/hr for everyone — no intro/repeat split.
// First-booking discounts are delivered via the SAVE50 promo code (and
// similar one-time-per-user coupons) so the headline price stays
// consistent across the catalog. Per-bathroom package is billed at the
// same ₹149 rate, just per-bathroom instead of per-hour.
export const MAID_REPEAT_RATE = 149

// Empty — intro-offer logic is retired. Kept exported so baseRateFor()
// can reference it without conditionals; deleting it would require
// touching every caller.
export const INTRO_OFFER_SERVICES = new Set<string>()

// SERVICE_RATES is the displayed/repeat rate for non-intro contexts. The
// effective rate for the cart goes through baseRateFor(service, hasPriorBooking).
export const SERVICE_RATES: Record<string, number> = {
  Maid:              MAID_REPEAT_RATE,
  Cleaner:           MAID_REPEAT_RATE,  // legacy alias
  Cleaning:          MAID_REPEAT_RATE,
  'Cleaning Staff':  MAID_REPEAT_RATE,  // matches CATEGORIES label in post-job UI
  'House Cleaner':   MAID_REPEAT_RATE,
  'Office Cleaner':  MAID_REPEAT_RATE,
  'Deep Cleaner':    MAID_REPEAT_RATE,
  'Bathroom Cleaner':MAID_REPEAT_RATE,
  'Kitchen Helper':  MAID_REPEAT_RATE,
  // Cook charges the same ₹149/hr as the cleaning services; the headline
  // service card in app/employer/page.tsx displays it that way too.
  'Cook':            MAID_REPEAT_RATE,
  // Per-bathroom package — billed at ₹149 per bathroom (the cart re-uses
  // the workersNeeded field as the bathroom count). Slot is locked to
  // 1 hr so total = 149 × bathrooms.
  'Bathroom Package':MAID_REPEAT_RATE,
}

/**
 * Services exempt from the instant/urgent surcharge — flat rate whether
 * the employer picks Schedule or Instant. Used to keep promo categories
 * (like Cleaning at ₹99/hr) advertised at a single price.
 */
export const FLAT_RATE_SERVICES = new Set<string>([
  'Maid', 'Cleaner', 'Cleaning',
  'House Cleaner', 'Office Cleaner', 'Deep Cleaner', 'Bathroom Cleaner',
  'Bathroom Package',
  'Kitchen Helper',
])

/** Per-service base rate (no instant surcharge). hasPriorBooking is
 * still part of the signature for back-compat but no longer affects the
 * displayed/charged price — first-time discounts come from one-time
 * promo codes (SAVE50 etc.), not a per-service intro rate. */
export function baseRateFor(service?: string | null, hasPriorBooking?: boolean): number {
  void hasPriorBooking
  if (!service) return SCHEDULE_RATE
  return SERVICE_RATES[service] ?? SCHEDULE_RATE
}

export interface BillInput {
  hours:         number
  workersNeeded: number
  isInstant:     boolean
  /** Server-computed promo discount in rupees. UI passes 0; server fills it in. */
  promoDiscount?: number
  /** Service / category name — pulls a per-service rate from SERVICE_RATES
   *  if there's an override (e.g. Cleaner = ₹99/hr). Optional; falls back
   *  to SCHEDULE_RATE. */
  service?:      string | null
  /** Has the booking employer already made a paid booking? Determines the
   *  intro vs repeat rate for Maid/Cleaning services. UI fetches this
   *  on cart mount; server re-derives from prisma to prevent tampering. */
  hasPriorBooking?: boolean
}

export interface Bill {
  hourlyRate:    number    // what the employer pays per hour
  baseSubtotal:  number    // SCHEDULE_RATE × hours × workers (before urgent surcharge)
  urgentSurcharge: number  // URGENT_RATE_FEE × hours × workers, or 0 if not instant
  gross:         number    // baseSubtotal + urgentSurcharge
  slotDiscount:  number    // gross × slot.discount%
  slotDiscountPct: number  // for display
  promoDiscount: number
  total:         number    // what Razorpay charges, in ₹
  workerPay:     number    // total worker take-home (single shift × workers)
  platformFee:   number    // total - workerPay
  platformFeePct: number   // (platformFee / total) × 100, for honest display
}

/**
 * Compute every line of the bill. Called identically on the client (to render)
 * and on the server (to set the Razorpay order amount). Pure function — no I/O.
 */
export function computeBill(input: BillInput): Bill {
  const hours         = Math.max(0, Number(input.hours) || 0)
  const workers       = Math.max(1, Math.min(20, Number(input.workersNeeded) || 1))
  // input.isInstant is accepted on the type for back-compat but ignored —
  // the urgent surcharge was removed when the Instant booking flow was
  // retired. URGENT_RATE_FEE / FLAT_RATE_SERVICES are no longer applied.
  void input.isInstant
  void FLAT_RATE_SERVICES
  void URGENT_RATE_FEE
  const promoDiscount = Math.max(0, Math.round(Number(input.promoDiscount) || 0))

  const slot = getSlotByHours(hours)
  const slotDiscountPct = slot ? slot.discount : 0

  const baseRate       = baseRateFor(input.service, input.hasPriorBooking)
  const hourlyRate     = baseRate
  const baseSubtotal   = baseRate * hours * workers
  const urgentSurcharge = 0
  const gross          = baseSubtotal
  const slotDiscount   = Math.round(gross * slotDiscountPct / 100)
  const total          = Math.max(1, gross - slotDiscount - promoDiscount)
  const workerPay      = workerEarningForHours(hours) * workers
  const platformFee    = Math.max(0, total - workerPay)
  const platformFeePct = total > 0 ? Math.round((platformFee / total) * 100) : 0

  return {
    hourlyRate,
    baseSubtotal,
    urgentSurcharge,
    gross,
    slotDiscount,
    slotDiscountPct,
    promoDiscount,
    total,
    workerPay,
    platformFee,
    platformFeePct,
  }
}
