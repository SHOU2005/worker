'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import { Phone, MapPin, Clock, X, Wifi, WifiOff } from 'lucide-react'
import { DEFAULT_MAP_CENTER } from '@/lib/config'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface TrackData {
  bookingId: string
  status: string
  checkInTime: string | null
  worker: {
    name: string; phone: string; avatar: string | null
    lat: number | null; lng: number | null; lastSeenAt: string | null
  }
  destination: { lat: number; lng: number; address: string; title: string; startTime: string } | null
  distanceM: number | null
  etaMinutes: number | null
}

export default function LiveWorkerTracker({ bookingId, onClose }: { bookingId: string | null; onClose: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const workerMarker = useRef<any>(null)
  const lineRef      = useRef<any>(null)
  const lastPos      = useRef<{ lat: number; lng: number } | null>(null)

  const [data,    setData]    = useState<TrackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)

  // Mount + dismount
  useEffect(() => {
    if (bookingId) requestAnimationFrame(() => setVisible(true))
    else { setVisible(false); setData(null) }
  }, [bookingId])

  // Init map once
  useEffect(() => {
    if (!visible || !containerRef.current || mapRef.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, {
        center: [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng], zoom: 13,
        zoomControl: false, attributionControl: false,
      })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      mapRef.current = map
    })()
    return () => { cancelled = true }
  }, [visible])

  // Poll the API every 30s
  useEffect(() => {
    if (!bookingId || !visible) return
    let cancelled = false
    async function load() {
      try {
        const r = await fetch(`/api/employer/booking/${bookingId}/track`)
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        setData(d)
        setLoading(false)
      } catch { /* ignore */ }
    }
    load()
    // Poll every 5 s so the employer's map matches the worker's 5 s
    // location-send cadence. Animation between fetches still smooths the
    // marker movement so it doesn't snap.
    const id = setInterval(load, 5_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [bookingId, visible])

  // Render markers + line + animate worker between polls
  useEffect(() => {
    if (!data?.worker?.lat || !data?.destination || !mapRef.current) return
    let frame: number | null = null

    ;(async () => {
      const L = (await import('leaflet')).default
      const dest = [data.destination!.lat, data.destination!.lng] as [number, number]
      const target = [data.worker.lat!, data.worker.lng!] as [number, number]

      // Destination marker (set once)
      if (!lineRef.current) {
        const destIcon = L.divIcon({
          html: `<div style="width:28px;height:28px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;">📍</div>`,
          className: '', iconSize: [28, 28], iconAnchor: [14, 14],
        })
        L.marker(dest, { icon: destIcon }).addTo(mapRef.current)
          .bindTooltip(data.destination!.title, { direction: 'top', offset: [0, -14] })
      }

      // Worker icon (re-create each refresh to keep latest avatar)
      const avatar = data.worker.avatar
      const workerIconHtml = avatar
        ? `<div style="width:42px;height:42px;border-radius:50%;border:3px solid #22C55E;background:#fff;overflow:hidden;box-shadow:0 4px 12px rgba(34,197,94,0.5);"><img src="${avatar}" style="width:100%;height:100%;object-fit:cover" /></div>`
        : `<div style="width:42px;height:42px;border-radius:50%;border:3px solid #22C55E;background:#22C55E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;box-shadow:0 4px 12px rgba(34,197,94,0.5);">${data.worker.name[0]?.toUpperCase() || 'W'}</div>`

      const wIcon = L.divIcon({ html: workerIconHtml, className: '', iconSize: [42, 42], iconAnchor: [21, 21] })

      const startPos = lastPos.current ?? { lat: target[0], lng: target[1] }
      // Animate from startPos → target
      const start = performance.now()
      const dur   = 1500

      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / dur)
        const lat = startPos.lat + (target[0] - startPos.lat) * k
        const lng = startPos.lng + (target[1] - startPos.lng) * k
        if (workerMarker.current) {
          workerMarker.current.setLatLng([lat, lng])
        } else {
          workerMarker.current = L.marker([lat, lng], { icon: wIcon, zIndexOffset: 1000 }).addTo(mapRef.current)
        }
        if (lineRef.current) lineRef.current.setLatLngs([[lat, lng], dest])
        else lineRef.current = L.polyline([[lat, lng], dest], { color: '#22C55E', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(mapRef.current)
        if (k < 1) frame = requestAnimationFrame(tick)
        else lastPos.current = { lat: target[0], lng: target[1] }
      }
      frame = requestAnimationFrame(tick)

      // Refresh icon (avatar) — set after first add
      workerMarker.current?.setIcon(wIcon)

      // Fit bounds first time only
      if (!lastPos.current || lastPos.current === undefined) {
        mapRef.current.fitBounds(L.latLngBounds([target, dest]).pad(0.4))
      }
    })()
    return () => { if (frame) cancelAnimationFrame(frame) }
  }, [data])

  if (!bookingId) return null

  function close() { setVisible(false); setTimeout(onClose, 280) }

  const lastSeenSecs = data?.worker?.lastSeenAt
    ? Math.floor((Date.now() - new Date(data.worker.lastSeenAt).getTime()) / 1000)
    : null
  const isLive = lastSeenSecs != null && lastSeenSecs < 300 // 5 min

  return (
    <>
      <div onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.55)', opacity: visible ? 1 : 0, transition: 'opacity 0.28s' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 81,
        background: '#FFFFFF', borderRadius: '24px 24px 0 0',
        height: '85vh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.15)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px 14px' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.4)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Live Tracking</p>
            <p style={{ fontSize: 18, fontWeight: 900, color: '#111111', margin: '2px 0 0' }}>
              {loading ? 'Loading…' : data?.worker?.name || 'Worker'}
            </p>
          </div>
          <button onClick={close}
            style={{ width: 36, height: 36, borderRadius: '50%', background: '#F0F0F0', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X style={{ width: 16, height: 16, color: 'rgba(0,0,0,0.55)' }} />
          </button>
        </div>

        {/* Stats strip */}
        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'rgba(0,0,0,0.06)', margin: '0 18px 12px', borderRadius: 14, overflow: 'hidden' }}>
            <Stat label="ETA" value={data.etaMinutes != null ? `${data.etaMinutes} min` : '—'} />
            <Stat label="Distance" value={data.distanceM != null ? (data.distanceM > 1000 ? `${(data.distanceM / 1000).toFixed(1)} km` : `${Math.round(data.distanceM)} m`) : '—'} />
            <Stat label="Status" value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {isLive ? <Wifi style={{ width: 11, height: 11, color: '#22C55E' }} /> : <WifiOff style={{ width: 11, height: 11, color: '#9CA3AF' }} />}
                <span style={{ color: isLive ? '#15803D' : '#6B7280' }}>{isLive ? 'Live' : 'Idle'}</span>
              </span>
            } />
          </div>
        )}

        {/* Map */}
        <div style={{ flex: 1, position: 'relative', margin: '0 18px', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {!data?.worker?.lat && !loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24, textAlign: 'center' }}>
              <MapPin style={{ width: 28, height: 28, color: 'rgba(0,0,0,0.3)' }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: '#111111', margin: 0 }}>Worker hasn't shared location yet</p>
              <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', margin: 0 }}>Live position will appear here once they're on their way.</p>
            </div>
          )}
        </div>

        {/* Action bar */}
        {data?.worker?.phone && (
          <div style={{ display: 'flex', gap: 10, padding: '14px 18px 18px' }}>
            <a href={`tel:${data.worker.phone}`}
              style={{
                flex: 1, height: 50, borderRadius: 14, background: '#111111', color: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 15, fontWeight: 800, textDecoration: 'none',
              }}>
              <Phone style={{ width: 16, height: 16 }} /> Call worker
            </a>
            {data.destination && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${data.destination.lat},${data.destination.lng}&travelmode=transit`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  background: '#F0F0F0', color: '#111111',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontSize: 15, fontWeight: 800, textDecoration: 'none', border: '1px solid rgba(0,0,0,0.08)',
                }}>
                <Clock style={{ width: 16, height: 16 }} /> Open Maps
              </a>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', padding: '12px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: '#111111', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', margin: '3px 0 0', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
    </div>
  )
}
