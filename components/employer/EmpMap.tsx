'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_MAP_CENTER } from '@/lib/config'

interface EmpMapProps {
  showWorker?: boolean
  workerInitial?: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function EmpMap(_props: EmpMapProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const [count,   setCount]   = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false

    async function init() {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return

      let lat = DEFAULT_MAP_CENTER.lat, lng = DEFAULT_MAP_CENTER.lng
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000, maximumAge: 60000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch {}

      if (cancelled || !containerRef.current) return

      const map = L.map(containerRef.current, {
        center:           [lat, lng],
        zoom:             14,
        zoomControl:      false,
        attributionControl: false,
      })

      // Free light tiles — CartoDB Positron, no key required
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
      setLoading(false)

      // Employer pin — shrunk to 38×44 (was 48×56). Still slightly larger
      // than the worker pins so the user's own location reads as the
      // anchor, but no longer dominates the viewport.
      const employerIcon = L.divIcon({
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="38" height="44" viewBox="0 0 48 56">
          <defs><filter id="es"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.5)"/></filter></defs>
          <circle cx="24" cy="24" r="22" fill="#FFFFFF" stroke="#111827" stroke-width="3" filter="url(#es)"/>
          <circle cx="24" cy="24" r="8" fill="#111827"/>
          <circle cx="24" cy="24" r="4" fill="#FFFFFF"/>
          <polygon points="24,46 30,36 18,36" fill="#FFFFFF" stroke="#111827" stroke-width="2.5" stroke-linejoin="round"/>
        </svg>`,
        className:  '',
        iconSize:   [38, 44],
        iconAnchor: [19, 36],
      })

      L.marker([lat, lng], { icon: employerIcon, zIndexOffset: 1000 })
        .addTo(map)
        .bindTooltip('Your Location', { direction: 'top', offset: [0, -46] })

      L.circle([lat, lng], {
        radius:      400,
        color:       '#6366f1',
        weight:      1.5,
        opacity:     0.35,
        fillColor:   '#6366f1',
        fillOpacity: 0.07,
      }).addTo(map)

      // Track workers across refreshes so we can update + animate movement
      const workerMarkers: Record<string, { marker: any; lat: number; lng: number }> = {}

      function makeRapidoIcon(rating: number) {
        // Premium B&W marker: small worker silhouette in a dark capsule with
        // a subtle ring that pulses. Top-right green availability dot
        // remains so the employer can still distinguish "online" at a
        // glance. Rating tier no longer drives the marker colour — every
        // online worker now reads as one consistent partner badge.
        return L.divIcon({
          html: `<div style="position:relative;width:40px;height:46px;">
            <div style="position:absolute;left:50%;top:5px;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:#0A0B0E;border:1.5px solid rgba(255,255,255,0.55);box-shadow:0 6px 14px rgba(0,0,0,0.45),0 0 0 4px rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="7" r="3.2" fill="#FFFFFF" stroke="none"/>
                <path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" fill="#FFFFFF" stroke="none"/>
              </svg>
            </div>
            <div style="position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;background:#22C55E;border:2px solid #0A0B0E;box-shadow:0 0 6px rgba(34,197,94,0.7);animation:empPulse 1.8s ease infinite;"></div>
            <div style="position:absolute;left:50%;bottom:1px;transform:translateX(-50%);width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid rgba(10,11,14,0.95);filter:drop-shadow(0 2px 2px rgba(0,0,0,0.35));"></div>
          </div>`,
          className: '', iconSize: [40, 46], iconAnchor: [20, 46],
        })
      }

      function animate(marker: any, fromLat: number, fromLng: number, toLat: number, toLng: number) {
        const start = performance.now()
        const ease  = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
        const step  = (now: number) => {
          const t = Math.min(1, (now - start) / 800)
          const k = ease(t)
          marker.setLatLng([fromLat + (toLat - fromLat) * k, fromLng + (toLng - fromLng) * k])
          if (t < 1) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }

      async function refreshNearbyWorkers() {
        if (cancelled) return
        try {
          // all=1 → server returns every worker with a known location
          // (ignoring radius), so the employer map shows the full
          // Switch partner network instead of a tight 8 km circle.
          const res  = await fetch(`/api/employer/nearby-workers?all=1`)
          const data = await res.json()
          if (cancelled) return
          const workers: Array<{ id: string; name: string; lat: number; lng: number; rating: number; skills: string[] }> = data.workers || []
          if (cancelled) return
          setCount(workers.length)

          const seen = new Set<string>()
          workers.forEach(w => {
            if (!w.lat || !w.lng) return
            seen.add(w.id)
            const skill = w.skills?.[0] || 'Worker'
            const popupHtml = `<div style="font-family:system-ui,sans-serif;padding:4px 2px;min-width:140px">
              <div style="font-size:15px;font-weight:800;color:#111827;margin-bottom:2px">${w.name}</div>
              <div style="font-size:12px;color:#6B7280;margin-bottom:6px">${skill}</div>
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:13px;color:#F59E0B;font-weight:700">★ ${(w.rating || 0).toFixed(1)}</span>
                <span style="font-size:11px;color:#10B981;font-weight:700;background:rgba(16,185,129,0.1);padding:2px 7px;border-radius:20px">● Available</span>
              </div>
            </div>`
            const existing = workerMarkers[w.id]
            if (existing) {
              existing.marker.setIcon(makeRapidoIcon(w.rating || 0))
              animate(existing.marker, existing.lat, existing.lng, w.lat, w.lng)
              existing.lat = w.lat; existing.lng = w.lng
            } else {
              const m = L.marker([w.lat, w.lng], { icon: makeRapidoIcon(w.rating || 0) })
                .addTo(map)
                .bindPopup(popupHtml, { maxWidth: 200 })
              workerMarkers[w.id] = { marker: m, lat: w.lat, lng: w.lng }
            }
          })
          // Drop workers that are no longer nearby
          Object.keys(workerMarkers).forEach(id => {
            if (!seen.has(id)) {
              workerMarkers[id].marker.remove()
              delete workerMarkers[id]
            }
          })
        } catch {
          if (cancelled) return
          setCount(0)
        }
      }

      await refreshNearbyWorkers()
      // Auto-refresh every 5 s so the map feels alive — matches the worker
      // location-tracker heartbeat, so a worker moving on the road appears
      // to glide on the employer's map instead of teleporting every 30 s.
      const iv = setInterval(refreshNearbyWorkers, 5_000)
      // Clean up on unmount via the outer return
      ;(map as any)._sw_refreshInterval = iv
    }

    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        const iv = (mapRef.current as any)._sw_refreshInterval
        if (iv) clearInterval(iv)
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <style>{`@keyframes empPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.4); opacity: 0.55 } }`}</style>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, background: '#f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.07)',
            borderTop: '3px solid #6366f1',
            animation: 'spin 0.8s linear infinite',
          }}/>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {count !== null && (
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 1000,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(10px)',
          borderRadius: 20, padding: '5px 12px',
          display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 2px 16px rgba(0,0,0,0.5)',
          border: '1px solid rgba(0,0,0,0.08)',
          pointerEvents: 'none',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#22C55E',
            boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
            display: 'inline-block', flexShrink: 0,
          }}/>
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#111827',
            fontFamily: '"DM Sans", system-ui, sans-serif',
          }}>
            {count > 0 ? `${count} worker${count !== 1 ? 's' : ''} online` : 'No workers online'}
          </span>
        </div>
      )}
    </div>
  )
}
