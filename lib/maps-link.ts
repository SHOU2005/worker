// Parse lat/lng out of a pasted Google Maps URL. Supports the most common formats:
//   https://www.google.com/maps/place/Name/@19.07,72.87,17z
//   https://www.google.com/maps?q=19.07,72.87
//   https://maps.google.com/?ll=19.07,72.87
//   https://maps.app.goo.gl/...     ← short links: not parseable client-side, return null
// Always returns null instead of throwing, since the link is also stored verbatim
// for the worker to tap (parsing is just a best-effort to populate lat/lng).
export function extractLatLng(url: string | null | undefined): { lat: number; lng: number } | null {
  if (!url || typeof url !== 'string') return null

  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,                // /@lat,lng
    /[?&](?:q|ll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/, // ?q=lat,lng / ?ll=lat,lng
    /\/place\/[^/]+\/(-?\d+\.\d+),(-?\d+\.\d+)/,                 // /place/Name/lat,lng
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng }
      }
    }
  }
  return null
}
