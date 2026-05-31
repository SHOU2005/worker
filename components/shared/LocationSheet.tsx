'use client'
import { useEffect, useState } from 'react'
import { Loader2, Navigation2 } from 'lucide-react'

export default function LocationSheet({ visible, cityLabel, onSave, onClose }: {
  visible: boolean
  cityLabel: string
  onSave: (city: string) => void
  onClose: () => void
}) {
  const [input,   setInput]   = useState(cityLabel)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (visible) setInput(cityLabel) }, [visible, cityLabel])

  async function useCurrentLocation() {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Cap = (window as any).Capacitor
      let lat: number, lng: number
      if (Cap?.isNativePlatform?.()) {
        const { Geolocation } = await import('@capacitor/geolocation')
        const pos = await Geolocation.getCurrentPosition({ timeout: 10000, enableHighAccuracy: false })
        lat = pos.coords.latitude; lng = pos.coords.longitude
      } else {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 })
        )
        lat = pos.coords.latitude; lng = pos.coords.longitude
      }
      localStorage.setItem('sw_lat', String(lat))
      localStorage.setItem('sw_lng', String(lng))
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'User-Agent': 'SwitchApp/1.0' } }
      )
      const data = await r.json()
      const addr = data.address ?? {}
      const city =
        addr.suburb ?? addr.neighbourhood ?? addr.city_district ??
        addr.city ?? addr.town ?? addr.state ?? ''
      if (city) setInput(city)
      fetch('/api/worker/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      }).catch(() => {})
    } catch {}
    setLoading(false)
  }

  function save() {
    if (!input.trim()) return
    localStorage.setItem('sw_city', input.trim())
    onSave(input.trim())
  }

  if (!visible) return null
  return (
    <>
      <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-[61]" style={{
        background: '#fff', borderRadius: '22px 22px 0 0',
        paddingBottom: 'var(--safe-b)',
        animation: 'slideUp 0.28s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E5E7EB' }} />
        </div>
        <div className="px-5 pt-2 pb-6">
          <p style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 16 }}>Your Location</p>

          <button onClick={useCurrentLocation} disabled={loading}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 14, marginBottom: 14,
              border: '1.5px solid #2563EB', background: '#EFF6FF',
              cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#2563EB',
            }}>
            {loading
              ? <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
              : <Navigation2 style={{ width: 16, height: 16 }} />
            }
            {loading ? 'Fetching location…' : 'Use My Current Location'}
          </button>

          <p style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', marginBottom: 10 }}>or type your area</p>

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g. Andheri West, Gurgaon"
            style={{
              width: '100%', background: '#F9FAFB', border: '1.5px solid #E5E7EB',
              borderRadius: 14, padding: '12px 14px', fontSize: 15, color: '#111827',
              outline: 'none', marginBottom: 14,
            }}
          />

          <button onClick={save}
            style={{
              width: '100%', height: 50, borderRadius: 14, fontSize: 15, fontWeight: 700,
              color: '#fff', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,#2563EB,#1D4ED8)',
              boxShadow: '0 4px 14px rgba(37,99,235,0.35)',
            }}>
            Save Location
          </button>
        </div>
      </div>
    </>
  )
}
