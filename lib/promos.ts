import { prisma } from './prisma'

export type Promo = {
  code:        string
  // 'fixed_total' is an admin-testing helper: the final cart total is forced
  // to `amount` (e.g. ₹1) regardless of the line-item cost. Use it for
  // walkthroughs without burning real money through Razorpay.
  type:        'flat' | 'percent' | 'fixed_total'
  amount:      number
  minSpend?:   number | null
  maxDiscount?: number | null
  description: string
  active:      boolean
  // When true, only users with DB role=ADMIN can apply this code. The
  // promo apply + cart pay endpoints both enforce this server-side; the
  // cart UI never reveals admin-only codes in the SAVE50 quick-tap hint.
  adminOnly?:  boolean
}

// Defaults used when OPS hasn't customised the list yet.
const DEFAULT_PROMOS: Promo[] = [
  { code: 'SAVE50',      type: 'flat',    amount: 50,  minSpend: 0,                     description: '₹50 off any booking',             active: true },
  // Bigger-cart promo aimed at multi-day or multi-worker bookings. Flat
  // ₹150 unlocks at ₹999 so a short single shift can't redeem it.
  { code: 'BIGBOOK150',  type: 'flat',    amount: 150, minSpend: 999,                    description: '₹150 off on ₹999+ bookings',      active: true },
  { code: 'CLEAN50',     type: 'flat',    amount: 50,  minSpend: 400,                    description: '₹50 off cleaning bookings',       active: true },
  { code: 'WELCOME10',   type: 'percent', amount: 10,  minSpend: 300, maxDiscount: 200,  description: '10% off for returning customers', active: true },
  // Admin-only ₹1 booking — for end-to-end testing without Razorpay
  // refunds. Gated on DB role=ADMIN; type=fixed_total clamps the final
  // total to amount (₹1).
  { code: 'SWITCH99',    type: 'fixed_total', amount: 1, minSpend: 0,                   description: 'Admin: book at ₹1',                active: true, adminOnly: true },
]

// Promo codes are stored as a single JSON blob in PlatformSetting.value at
// key='promos'. OPS edits them via /ops/promos.
export async function getActivePromos(): Promise<Promo[]> {
  try {
    const row = await prisma.platformSetting.findUnique({ where: { key: 'promos' } })
    if (!row) return DEFAULT_PROMOS
    const parsed = JSON.parse(row.value) as Promo[]
    return Array.isArray(parsed) ? parsed : DEFAULT_PROMOS
  } catch {
    return DEFAULT_PROMOS
  }
}

export async function setActivePromos(promos: Promo[]): Promise<void> {
  await prisma.platformSetting.upsert({
    where:  { key: 'promos' },
    create: { key: 'promos', value: JSON.stringify(promos) },
    update: { value: JSON.stringify(promos) },
  })
}
