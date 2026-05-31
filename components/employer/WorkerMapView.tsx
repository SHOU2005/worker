'use client'
import { useEffect, useRef } from 'react'
import { DEFAULT_MAP_CENTER } from '@/lib/config'

type WorkerPin = {
  id: string
  name: string
  lat: number
  lng: number
  job: string
  status: 'live' | 'pending'
  heading?: number  // optional bearing in degrees, 0 = north, 90 = east
}

interface Props {
  pins: WorkerPin[]
  centerLat?: number
  centerLng?: number
  destinationLat?: number    // job location — drawn as a flag pin + route line
  destinationLng?: number
  destinationLabel?: string
}

// Rapido-style worker pin: black circular badge with white motorbike icon, plus
// a heading arrow at the top. Status dot shows "live" (green) vs "pending" (blue).
function makeWorkerIcon(L: any, pin: WorkerPin) {
  const isLive = pin.status === 'live'
  const ring   = isLive ? '#10B981' : '#60A5FA'
  const dot    = isLive ? '#10B981' : '#60A5FA'
  const heading = typeof pin.heading === 'number' ? pin.heading : 0
  const html = `
    <div class="sw-worker-pin" style="position:relative;width:56px;height:64px;">
      <!-- heading arrow -->
      <div style="position:absolute;top:-6px;left:50%;transform:translateX(-50%) rotate(${heading}deg);transform-origin:50% 32px;">
        <svg width="16" height="14" viewBox="0 0 16 14"><polygon points="8,0 16,12 0,12" fill="${ring}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </div>
      <!-- ringed badge with Switch worker glyph (custom, branded) -->
      <div style="
        position:absolute;top:6px;left:50%;transform:translateX(-50%);
        width:48px;height:48px;border-radius:50%;
        background:#0F172A;border:3px solid ${ring};
        box-shadow:0 4px 14px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
      ">
        <!-- Walking-worker silhouette: head + body + tool bag -->
        <svg width="24" height="26" viewBox="0 0 24 26" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="4" r="2.4" fill="white"/>
          <path d="M12 7v8" />
          <path d="M8 11l4-2 4 2" />
          <path d="M12 15l-3 6" />
          <path d="M12 15l3 6" />
          <!-- shoulder bag (Switch toolkit) -->
          <rect x="14.5" y="9.5" width="3.5" height="3" rx="0.6" fill="${ring}" stroke="white" stroke-width="1.2"/>
        </svg>
      </div>
      <!-- live dot -->
      <div style="
        position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;
        background:${dot};border:2px solid white;
        ${isLive ? 'animation:swPulse 1.4s ease infinite;' : ''}
      "></div>
      <!-- pin tail -->
      <div style="
        position:absolute;left:50%;bottom:0;transform:translateX(-50%);
        width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid ${ring};
      "></div>
    </div>
  `
  return L.divIcon({ html, className: '', iconSize: [56, 64], iconAnchor: [28, 64], popupAnchor: [0, -56] })
}

function makeDestinationIcon(L: any) {
  const html = `
    <div style="position:relative;width:36px;height:42px;">
      <svg width="36" height="42" viewBox="0 0 36 42">
        <defs><filter id="ds"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/></filter></defs>
        <path d="M18 0 L36 18 L18 42 L0 18 Z" fill="#DC2626" stroke="white" stroke-width="2" filter="url(#ds)"/>
        <circle cx="18" cy="18" r="6" fill="white"/>
      </svg>
    </div>
  `
  return L.divIcon({ html, className: '', iconSize: [36, 42], iconAnchor: [18, 42] })
}

// Animate a marker's position from current → target over `durationMs` so the
// worker pin glides instead of teleporting on every poll. Uses easeInOutQuad.
function animateMarker(L: any, marker: any, fromLat: number, fromLng: number, toLat: number, toLng: number, durationMs = 900) {
  if (Math.abs(fromLat - toLat) < 1e-7 && Math.abs(fromLng - toLng) < 1e-7) return
  const start = performance.now()
  const ease  = (t: number) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
  function step(now: number) {
    const t = Math.min(1, (now - start) / durationMs)
    const k = ease(t)
    const lat = fromLat + (toLat - fromLat) * k
    const lng = fromLng + (toLng - fromLng) * k
    marker.setLatLng([lat, lng])
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

export default function WorkerMapView({ pins, centerLat = DEFAULT_MAP_CENTER.lat, centerLng = DEFAULT_MAP_CENTER.lng, destinationLat, destinationLng, destinationLabel }: Props) {
  const mapRef     = useRef<HTMLDivElement>(null)
  const mapInst    = useRef<any>(null)
  const markersRef = useRef<Record<string, { marker: any; lat: number; lng: number }>>({})
  const destRef    = useRef<any>(null)
  const lineRef    = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || mapInst.current) return

    import('leaflet').then(L => {
      // @ts-ignore
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapRef.current!, { center: [centerLat, centerLng], zoom: 14, zoomControl: false, attributionControl: false })

      // Light tile theme — Rapido / Uber feel
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      L.control.attribution({ prefix: '© OSM · Carto', position: 'bottomright' }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)

      // Destination flag
      if (destinationLat != null && destinationLng != null) {
        destRef.current = L.marker([destinationLat, destinationLng], { icon: makeDestinationIcon(L), zIndexOffset: 100 })
          .addTo(map)
          .bindTooltip(destinationLabel || 'Job location', { direction: 'top', offset: [0, -42] })
      }

      // Initial pins
      pins.forEach(pin => {
        const m = L.marker([pin.lat, pin.lng], { icon: makeWorkerIcon(L, pin), zIndexOffset: 200 })
          .addTo(map)
          .bindPopup(workerPopup(pin), { maxWidth: 200 })
        markersRef.current[pin.id] = { marker: m, lat: pin.lat, lng: pin.lng }
      })

      drawRoute(L, map, pins, destinationLat, destinationLng)
      mapInst.current = map
    })

    return () => {
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
      markersRef.current = {}
      destRef.current = null
      lineRef.current = null
    }
  }, [])

  // Smooth update + add/remove
  useEffect(() => {
    if (!mapInst.current) return
    import('leaflet').then(L => {
      const map = mapInst.current
      const seen = new Set<string>()
      pins.forEach(pin => {
        seen.add(pin.id)
        const existing = markersRef.current[pin.id]
        if (existing) {
          existing.marker.setIcon(makeWorkerIcon(L, pin))
          animateMarker(L, existing.marker, existing.lat, existing.lng, pin.lat, pin.lng)
          existing.lat = pin.lat
          existing.lng = pin.lng
        } else {
          const m = L.marker([pin.lat, pin.lng], { icon: makeWorkerIcon(L, pin), zIndexOffset: 200 })
            .addTo(map)
            .bindPopup(workerPopup(pin), { maxWidth: 200 })
          markersRef.current[pin.id] = { marker: m, lat: pin.lat, lng: pin.lng }
        }
      })
      Object.keys(markersRef.current).forEach(id => {
        if (!seen.has(id)) {
          markersRef.current[id].marker.remove()
          delete markersRef.current[id]
        }
      })
      drawRoute(L, map, pins, destinationLat, destinationLng)
    })
  }, [pins, destinationLat, destinationLng])

  // Re-draw destination on prop change
  useEffect(() => {
    if (!mapInst.current) return
    import('leaflet').then(L => {
      if (destRef.current) { destRef.current.remove(); destRef.current = null }
      if (destinationLat != null && destinationLng != null) {
        destRef.current = L.marker([destinationLat, destinationLng], { icon: makeDestinationIcon(L), zIndexOffset: 100 })
          .addTo(mapInst.current)
          .bindTooltip(destinationLabel || 'Job location', { direction: 'top', offset: [0, -42] })
      }
    })
  }, [destinationLat, destinationLng, destinationLabel])

  // Re-center
  useEffect(() => {
    if (mapInst.current) mapInst.current.setView([centerLat, centerLng], 14)
  }, [centerLat, centerLng])

  function drawRoute(L: any, map: any, pinsLocal: WorkerPin[], dLat?: number, dLng?: number) {
    if (lineRef.current) { lineRef.current.remove(); lineRef.current = null }
    if (dLat == null || dLng == null) return
    const live = pinsLocal.find(p => p.status === 'live') || pinsLocal[0]
    if (!live) return
    lineRef.current = L.polyline([[live.lat, live.lng], [dLat, dLng]], {
      color: '#111827', weight: 3, opacity: 0.6, dashArray: '8 8',
    }).addTo(map)
  }

  function workerPopup(pin: WorkerPin) {
    const isLive = pin.status === 'live'
    return `<div style="font-family:system-ui,sans-serif;padding:4px 2px;min-width:160px">
      <div style="font-weight:800;color:#111;margin-bottom:2px">${pin.name}</div>
      <div style="font-size:12px;color:#6B7280;margin-bottom:6px">${pin.job}</div>
      <div style="font-size:11px;color:${isLive ? '#10B981' : '#3B82F6'};font-weight:700">${isLive ? '● Live' : '● Heading over'}</div>
    </div>`
  }

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#e8e0d8' }} />
      <style>{`
        @keyframes swPulse {
          0%, 100% { transform: scale(1);   opacity: 1;   }
          50%      { transform: scale(1.4); opacity: 0.6; }
        }
      `}</style>
    </>
  )
}
