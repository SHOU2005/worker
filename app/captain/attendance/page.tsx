'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import { useLanguage } from '../LanguageContext'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.5)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface AttendanceRecord { id: string; date: string; checkInTime: string | null; checkOutTime: string | null }

export default function AttendancePage() {
  const router   = useRouter()
  const { t }    = useLanguage()
  const [today,   setToday]   = useState<AttendanceRecord | null>(null)
  const [history, setHistory] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy,    setBusy]    = useState(false)

  async function load() {
    const res = await fetch('/api/captain/attendance')
    if (res.status === 401) { router.replace('/captain/login'); return }
    const d = await res.json()
    setToday(d.today || null)
    setHistory(d.history || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function getLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        reject,
        { timeout: 8000 }
      )
    })
  }

  async function checkIn() {
    setBusy(true)
    try {
      const loc = await getLocation()
      await fetch('/api/captain/attendance/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loc) })
      await load()
    } catch { alert(t('locationError')) }
    setBusy(false)
  }

  async function checkOut() {
    setBusy(true)
    try {
      const loc = await getLocation()
      await fetch('/api/captain/attendance/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loc) })
      await load()
    } catch { alert(t('locationError')) }
    setBusy(false)
  }

  const fmt = (dt: string | null) => dt ? new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('attendance')} />
      <div style={{ padding: '20px' }}>

        {/* Today card */}
        <div style={{ background: '#F7F7F7', border: '1px solid #BAE6FD', borderRadius: 20, padding: '24px', marginBottom: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: T2, marginBottom: 4 }}>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 24 }}>
            <div>
              <p style={{ fontSize: 11, color: T2, margin: '0 0 4px' }}>{t('checkIn')}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: T1, margin: 0 }}>{loading ? '…' : fmt(today?.checkInTime || null)}</p>
            </div>
            <div style={{ width: 1, background: 'rgba(0,0,0,0.1)' }} />
            <div>
              <p style={{ fontSize: 11, color: T2, margin: '0 0 4px' }}>{t('checkOut')}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: T1, margin: 0 }}>{loading ? '…' : fmt(today?.checkOutTime || null)}</p>
            </div>
          </div>

          {!loading && (
            !today?.checkInTime ? (
              <button onClick={checkIn} disabled={busy} style={{ padding: '14px 40px', borderRadius: 14, background: T1, color: '#fff', fontWeight: 800, fontSize: 16, border: 'none', cursor: 'pointer', width: '100%' }}>
                {busy ? t('gettingLocation') : t('checkInBtn')}
              </button>
            ) : !today?.checkOutTime ? (
              <button onClick={checkOut} disabled={busy} style={{ padding: '14px 40px', borderRadius: 14, background: '#111111', color: '#fff', fontWeight: 800, fontSize: 16, border: 'none', cursor: 'pointer', width: '100%' }}>
                {busy ? t('gettingLocation') : t('checkOutBtn')}
              </button>
            ) : (
              <p style={{ color: '#111111', fontWeight: 700, fontSize: 15, margin: 0 }}>{t('dayComplete')}</p>
            )
          )}
        </div>

        {/* History */}
        <p style={{ fontSize: 13, fontWeight: 700, color: T2, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{t('recentHistory')}</p>
        {history.slice(1).map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <p style={{ color: T1, fontWeight: 600, fontSize: 14, margin: 0 }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: T2, fontSize: 13, margin: 0 }}>{fmt(r.checkInTime)} – {fmt(r.checkOutTime)}</p>
              {!r.checkInTime && <p style={{ color: '#111111', fontSize: 12, margin: 0, fontWeight: 600 }}>{t('absent')}</p>}
            </div>
          </div>
        ))}
      </div>
      <CaptainBottomNav />
    </div>
  )
}
