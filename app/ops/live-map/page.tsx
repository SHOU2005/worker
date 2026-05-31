'use client'
import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import OpsNav from '@/components/ops/OpsNav'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LiveLoc {
  id: string; name: string; phone: string;
  lat: number; lng: number; lastSeenAt: string | null; online: boolean
  city?: string | null; territory?: string | null; status?: string
}

const FONT = '"DM Sans", system-ui, sans-serif'

export default function OpsLiveMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<any>(null)
  const layersRef    = useRef<{ workers: any; captains: any } | null>(null)
  const [workers,  setWorkers]  = useState<LiveLoc[]>([])
  const [captains, setCaptains] = useState<LiveLoc[]>([])
  const [filter,   setFilter]   = useState<'all' | 'workers' | 'captains' | 'online'>('all')
  const [loading,  setLoading]  = useState(true)

  // Map init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !containerRef.current) return
      const map = L.map(containerRef.current, {
        center: [19.076, 72.877], zoom: 11,
        zoomControl: false, attributionControl: false,
      })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map)
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      mapRef.current = map
      layersRef.current = { workers: L.layerGroup().addTo(map), captains: L.layerGroup().addTo(map) }
    })()
    return () => { cancelled = true }
  }, [])

  // Load + auto-refresh every 60s (locations refresh on the ping side every 2 min)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const r = await fetch('/api/ops/live-locations')
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        setWorkers(d.workers || [])
        setCaptains(d.captains || [])
      } catch { /* ignore */ }
      finally { if (!cancelled) setLoading(false) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  // Render markers
  useEffect(() => {
    if (!mapRef.current || !layersRef.current) return
    ;(async () => {
      const L = (await import('leaflet')).default
      const { workers: wLayer, captains: cLayer } = layersRef.current!
      wLayer.clearLayers()
      cLayer.clearLayers()

      const showWorkers  = filter === 'all' || filter === 'workers' || filter === 'online'
      const showCaptains = filter === 'all' || filter === 'captains' || filter === 'online'

      const dot = (color: string, online: boolean) => L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.4);${online?'animation:pulseDot 2s infinite;':'opacity:0.55;'}"></div>`,
        className: '', iconSize: [18, 18], iconAnchor: [9, 9],
      })

      const all: LiveLoc[] = []
      if (showWorkers)  workers.forEach(w => { if (filter !== 'online' || w.online) all.push(w) })
      if (showCaptains) captains.forEach(c => { if (filter !== 'online' || c.online) all.push(c) })

      workers.forEach(w => {
        if (filter === 'online' && !w.online) return
        if (!showWorkers) return
        L.marker([w.lat, w.lng], { icon: dot(w.online ? '#3B82F6' : '#3B82F6', w.online) })
          .addTo(wLayer)
          .bindTooltip(`👷 ${w.name}${w.online ? ' · live' : ' · idle'}`, { direction: 'top' })
      })
      captains.forEach(c => {
        if (filter === 'online' && !c.online) return
        if (!showCaptains) return
        L.marker([c.lat, c.lng], { icon: dot(c.online ? '#22C55E' : '#22C55E', c.online) })
          .addTo(cLayer)
          .bindTooltip(`🧭 ${c.name}${c.online ? ' · live' : ' · idle'}${c.territory ? ` · ${c.territory}` : ''}`, { direction: 'top' })
      })

      if (all.length > 0) {
        const bounds = L.latLngBounds(all.map(p => [p.lat, p.lng] as [number, number]))
        mapRef.current.fitBounds(bounds.pad(0.2))
      }
    })()
  }, [workers, captains, filter])

  const onlineWorkers  = workers.filter(w => w.online).length
  const onlineCaptains = captains.filter(c => c.online).length

  return (
    <div style={{ fontFamily: FONT, background: '#000', minHeight: '100vh', color: '#FFF' }}>
      <OpsNav />

      <div style={{ padding: '20px 20px 0', marginLeft: 0 }} className="ops-content">
        <div style={{ marginBottom: 14 }}>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: 0 }}>Operations</p>
          <p style={{ color: '#FFF', fontWeight: 800, fontSize: 24, margin: '2px 0 0', letterSpacing: -0.5 }}>Live Map</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>
            {loading ? 'Loading…' : `${workers.length} workers · ${captains.length} captains · ${onlineWorkers + onlineCaptains} online now`}
          </p>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {([
            { k: 'all',      label: `All (${workers.length + captains.length})` },
            { k: 'online',   label: `Online (${onlineWorkers + onlineCaptains})` },
            { k: 'workers',  label: `👷 Workers (${workers.length})` },
            { k: 'captains', label: `🧭 Captains (${captains.length})` },
          ] as const).map(({ k, label }) => (
            <button key={k} onClick={() => setFilter(k as any)}
              style={{
                flexShrink: 0, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: filter === k ? '#FFF' : 'rgba(255,255,255,0.08)',
                color: filter === k ? '#000' : 'rgba(255,255,255,0.7)',
                border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
              }}>{label}</button>
          ))}
        </div>

        {/* Map */}
        <div style={{
          width: '100%', height: 'calc(100vh - 220px)', minHeight: 420, borderRadius: 16,
          overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative',
        }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          {loading && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Loading live locations…</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }
        @keyframes pulseDot { 0%,100% { box-shadow: 0 0 0 0 currentColor; } 50% { box-shadow: 0 0 0 6px rgba(255,255,255,0); } }
      `}</style>
    </div>
  )
}
