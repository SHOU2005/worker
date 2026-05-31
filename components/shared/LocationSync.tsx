'use client'
import { useEffect } from 'react'

export default function LocationSync({ onCity }: { onCity?: (city: string) => void }) {
  useEffect(() => {
    if (sessionStorage.getItem('sw_loc_synced')) {
      const saved = localStorage.getItem('sw_city')
      if (saved) onCity?.(saved)
      return
    }

    async function sync() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Cap = (window as any).Capacitor
        let lat: number, lng: number

        if (Cap?.isNativePlatform?.()) {
          const { Geolocation } = await import('@capacitor/geolocation')
          const pos = await Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: false })
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } else {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
          )
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        }

        localStorage.setItem('sw_lat', String(lat))
        localStorage.setItem('sw_lng', String(lng))

        // Reverse geocode via Nominatim
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'User-Agent': 'SwitchApp/1.0' } }
          )
          const data = await r.json()
          const addr = data.address ?? {}
          const city =
            addr.suburb ?? addr.neighbourhood ?? addr.city_district ??
            addr.city ?? addr.town ?? addr.village ?? addr.state_district ?? addr.state
          if (city) {
            localStorage.setItem('sw_city', city)
            onCity?.(city)
          }
        } catch {}

        // Update server silently
        fetch('/api/worker/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng }),
        }).catch(() => {})

        sessionStorage.setItem('sw_loc_synced', '1')
      } catch {}
    }

    sync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
