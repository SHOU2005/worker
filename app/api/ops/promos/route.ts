import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/session'
import { getActivePromos as readPromos, setActivePromos as writePromos, type Promo } from '@/lib/promos'

export const dynamic = 'force-dynamic'

function sanitize(input: unknown): Promo | { error: string } {
  const p = input as Partial<Promo>
  const code = String(p.code || '').toUpperCase().trim()
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return { error: 'Code must be 3–20 letters/numbers' }
  if (p.type !== 'flat' && p.type !== 'percent') return { error: 'Type must be "flat" or "percent"' }
  const amount = Number(p.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be > 0' }
  if (p.type === 'percent' && amount > 100) return { error: 'Percent must be 1–100' }
  const minSpend    = p.minSpend != null ? Number(p.minSpend) : undefined
  const maxDiscount = p.maxDiscount != null ? Number(p.maxDiscount) : undefined
  if (minSpend != null && (!Number.isFinite(minSpend) || minSpend < 0)) return { error: 'minSpend must be ≥ 0' }
  if (maxDiscount != null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return { error: 'maxDiscount must be > 0' }
  return {
    code,
    type:        p.type,
    amount,
    ...(minSpend != null    ? { minSpend }    : {}),
    ...(maxDiscount != null ? { maxDiscount } : {}),
    description: String(p.description || '').trim().slice(0, 120) || `${amount}${p.type === 'percent' ? '%' : '₹'} off`,
    active:      p.active !== false,
  }
}

export async function GET() {
  try {
    const sess = await requireSession(['OPS', 'ADMIN'])
    if (sess instanceof NextResponse) return sess
    const promos = await readPromos()
    return NextResponse.json({ promos })
  } catch (err) {
    console.error('[ops/promos GET] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ promos: [], error: err instanceof Error ? err.message : 'unknown' }, { status: 200 })
  }
}

// Replace the entire promos list (UI sends back the whole array — simple + safe)
export async function PUT(req: NextRequest) {
  try {
    const sess = await requireSession(['OPS', 'ADMIN'])
    if (sess instanceof NextResponse) return sess

    const body = await req.json().catch(() => ({}))
    if (!Array.isArray(body.promos)) {
      return NextResponse.json({ error: 'Body must be { promos: [...] }' }, { status: 400 })
    }

    const cleaned: Promo[] = []
    const seen = new Set<string>()
    for (const raw of body.promos) {
      const r = sanitize(raw)
      if ('error' in r) return NextResponse.json({ error: r.error, badItem: raw }, { status: 400 })
      if (seen.has(r.code)) return NextResponse.json({ error: `Duplicate code: ${r.code}` }, { status: 400 })
      seen.add(r.code)
      cleaned.push(r)
    }

    await writePromos(cleaned)
    return NextResponse.json({ promos: cleaned })
  } catch (err) {
    console.error('[ops/promos PUT] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

// Convenience: append/upsert a single promo
export async function POST(req: NextRequest) {
  try {
    const sess = await requireSession(['OPS', 'ADMIN'])
    if (sess instanceof NextResponse) return sess

    const body = await req.json().catch(() => ({}))
    const r = sanitize(body)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })

    const existing = await readPromos()
    const idx = existing.findIndex(p => p.code === r.code)
    if (idx >= 0) existing[idx] = r
    else existing.push(r)
    await writePromos(existing)
    return NextResponse.json({ promo: r, promos: existing })
  } catch (err) {
    console.error('[ops/promos POST] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}

// DELETE ?code=XYZ
export async function DELETE(req: NextRequest) {
  try {
    const sess = await requireSession(['OPS', 'ADMIN'])
    if (sess instanceof NextResponse) return sess

    const code = (req.nextUrl.searchParams.get('code') || '').toUpperCase().trim()
    if (!code) return NextResponse.json({ error: 'code query param required' }, { status: 400 })

    const existing = await readPromos()
    const next = existing.filter(p => p.code !== code)
    await writePromos(next)
    return NextResponse.json({ promos: next })
  } catch (err) {
    console.error('[ops/promos DELETE] failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 500 })
  }
}
