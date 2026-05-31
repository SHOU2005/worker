import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromCookies } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Reverse-geocode lat/lng → city via OpenStreetMap Nominatim. Free, no key
// required, but Nominatim asks for a real User-Agent and a max of 1 req/sec
// per IP. We accept the rate cap because this endpoint only fires when a
// worker hits "Use my location" on their profile — not in any hot loop.
//
// GET /api/geo/reverse?lat=19.07&lng=72.87 → { city, town, state, formatted }
export async function GET(req: NextRequest) {
  if (!getTokenFromCookies()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const lat = parseFloat(req.nextUrl.searchParams.get('lat') || '')
  const lng = parseFloat(req.nextUrl.searchParams.get('lng') || '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 })
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'switchlocally.com/1.0 (ops@switchlocally.com)',
        'Accept-Language': 'en',
      },
      cache: 'no-store',
    })
    if (!r.ok) {
      return NextResponse.json({ error: `geocoder ${r.status}` }, { status: 502 })
    }
    const data = await r.json()
    const a = data.address || {}
    // Fallback chain — Nominatim's "city" key is missing in many small towns,
    // so we walk the typical alternates.
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || ''
    return NextResponse.json({
      city,
      town:      a.town      ?? null,
      village:   a.village   ?? null,
      state:     a.state     ?? null,
      country:   a.country   ?? null,
      formatted: data.display_name ?? '',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    return NextResponse.json({ error: `geocoder failed: ${msg}` }, { status: 502 })
  }
}
