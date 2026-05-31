'use client'
import { useEffect, useMemo, useState } from 'react'
import { Phone, Check, X, Star, ShieldCheck, Repeat2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import EmployerTopBar from '@/components/employer/EmployerTopBar'
import EmployerBottomNav from '@/components/employer/EmployerBottomNav'

/* eslint-disable @typescript-eslint/no-explicit-any */

const TABS = ['Working Now', 'Applied', 'All Workers'] as const
type Tab = typeof TABS[number]

export default function EmployerWorkersPage() {
  const router = useRouter()
  const [tab, setTab]         = useState<Tab>('Working Now')
  const [bookings, setBookings] = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [busyId,  setBusyId]    = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/employer/bookings')
      const d   = await res.json()
      setBookings(d.bookings ?? [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const { workingNow, applied, allWorkers } = useMemo(() => {
    const workingNow = bookings.filter(b => b.status === 'IN_PROGRESS')
    const applied    = bookings.filter(b => b.status === 'PENDING' && b.paymentStatus === 'PENDING')
    // distinct workers from completed bookings
    const seen = new Map<string, any>()
    bookings.filter(b => b.status === 'COMPLETED' && b.worker).forEach(b => {
      const k = b.worker.id
      const prev = seen.get(k)
      if (!prev) {
        seen.set(k, {
          id:         b.worker.id,
          name:       b.worker.user.name,
          phone:      b.worker.user.phone,
          rating:     b.worker.rating ?? 0,
          timesHired: 1,
          lastWorked: b.shift?.date ?? b.createdAt,
        })
      } else {
        prev.timesHired += 1
        if (b.shift?.date && new Date(b.shift.date) > new Date(prev.lastWorked)) {
          prev.lastWorked = b.shift.date
        }
      }
    })
    return { workingNow, applied, allWorkers: Array.from(seen.values()) }
  }, [bookings])

  async function confirm(b: any) {
    setBusyId(b.id)
    try {
      const r = await fetch(`/api/employer/bookings/${b.id}`, { method: 'POST' })
      if (r.status === 402) {
        // Payment required — redirect to pay
        router.push(`/employer/job/${b.shift?.id ?? b.shiftId}/payment`)
        return
      }
      if (r.ok) await load()
    } finally { setBusyId(null) }
  }

  async function reject(b: any) {
    setBusyId(b.id)
    try {
      const r = await fetch(`/api/employer/bookings/${b.id}`, { method: 'DELETE' })
      if (r.ok) {
        // Mirror the server state locally so the row falls out of the
        // Applied tab without a full refetch round-trip.
        setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'CANCELLED' } : x))
      }
    } finally { setBusyId(null) }
  }

  return (
    <div style={{ minHeight: '100vh', paddingTop: 'calc(56px + var(--safe-t))', paddingBottom: 'calc(88px + var(--safe-b))', background: 'var(--bg)' }}>
      <EmployerTopBar title="Workers" unread={applied.length} />

      <div className="sticky top-14 z-30 px-4 py-3 flex gap-1.5 overflow-x-auto"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => {
          const count = t === 'Working Now' ? workingNow.length : t === 'Applied' ? applied.length : allWorkers.length
          return (
            <button key={t} onClick={() => setTab(t)}
              className="flex-shrink-0 py-2.5 px-4 rounded-xl font-bold text-sm"
              style={{
                background: tab === t ? 'linear-gradient(135deg,#064E3B,#0D9488)' : 'var(--surface)',
                color:      tab === t ? '#fff' : 'var(--text2)',
                border:     tab === t ? 'none' : '1px solid var(--border)',
              }}>
              {t}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: tab === t ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-4 flex flex-col gap-3">
        {loading && (
          <div className="py-12 flex justify-center"><Loader2 className="animate-spin" style={{ color: 'var(--text2)' }} /></div>
        )}

        {!loading && tab === 'Working Now' && workingNow.length === 0 && (
          <Empty emoji="✅" title="No active shifts" sub="Workers will show here when shifts are in progress" />
        )}
        {!loading && tab === 'Working Now' && workingNow.map(b => {
          const w = b.worker
          if (!w) return null
          const checkIn = b.checkInTime ? new Date(b.checkInTime) : null
          const elapsedMs = checkIn ? Date.now() - checkIn.getTime() : 0
          const hrs = Math.floor(elapsedMs / 3600_000)
          const min = Math.floor((elapsedMs % 3600_000) / 60_000)
          const earned = checkIn && b.shift ? Math.round((elapsedMs / 3600_000) * (b.shift.hourlyRate ?? 0)) : 0
          return (
            <div key={b.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)' }}>
                  {w.user.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <p className="font-black text-base" style={{ color: 'var(--text1)' }}>{w.user.name}</p>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--text2)' }}>{b.shift?.title}</p>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.3)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" /> LIVE
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black" style={{ color: 'var(--text1)' }}>{hrs}h {min}m</p>
                  <p className="text-xs" style={{ color: '#5EEAD4' }}>₹{earned} earned</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a href={`tel:+91${w.user.phone}`}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'rgba(34,197,94,0.12)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <Phone style={{ width: 15, height: 15 }} /> Call
                </a>
                <button onClick={() => router.push(`/employer/jobs`)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text1)', border: '1px solid var(--border)' }}>
                  View shift
                </button>
              </div>
            </div>
          )
        })}

        {!loading && tab === 'Applied' && applied.length === 0 && (
          <Empty emoji="📨" title="No applications" sub="Worker applications appear here when posted" />
        )}
        {!loading && tab === 'Applied' && applied.map(b => {
          const w = b.worker
          if (!w) return null
          const skills = w.skills ?? []
          const aadhaar = w.aadhaarVerified || w.kycStatus === 'APPROVED'
          return (
            <div key={b.id} className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center font-black text-xl flex-shrink-0"
                  style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {w.user.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="font-bold text-sm" style={{ color: 'var(--text1)' }}>{w.user.name}</p>
                    {aadhaar && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(20,184,166,0.12)', color: '#5EEAD4' }}>
                        <ShieldCheck style={{ width: 10, height: 10 }} /> KYC ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>
                    <Star style={{ width: 11, height: 11, display: 'inline', color: '#FBBF24', fill: '#FBBF24' }} />{' '}
                    {(w.rating ?? 0).toFixed(1)} · {w.totalShifts ?? 0} jobs done
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                    Applied for: <span style={{ color: '#5EEAD4' }}>{b.shift?.title}</span>
                  </p>
                </div>
              </div>

              {skills.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {skills.slice(0, 4).map((s: string) => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ background: 'var(--sur2)', color: 'var(--text2)' }}>{s}</span>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => confirm(b)} disabled={busyId === b.id}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg,#064E3B,#0D9488)', color: '#fff', boxShadow: '0 2px 12px rgba(6,78,59,0.4)', opacity: busyId === b.id ? 0.6 : 1 }}>
                  {busyId === b.id ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} /> : <><Check style={{ width: 15, height: 15 }} /> Accept &amp; Pay</>}
                </button>
                <button onClick={() => reject(b)} disabled={busyId === b.id}
                  className="flex-1 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'transparent', color: '#EF4444', border: '2px solid rgba(239,68,68,0.4)' }}>
                  <X style={{ width: 15, height: 15 }} /> Reject
                </button>
              </div>
            </div>
          )
        })}

        {!loading && tab === 'All Workers' && allWorkers.length === 0 && (
          <Empty emoji="🤝" title="No past hires yet" sub="Workers you've hired will show here" />
        )}
        {!loading && tab === 'All Workers' && allWorkers.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {allWorkers.map((w, i) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: i < allWorkers.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="w-11 h-11 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0"
                  style={{ background: '#111111', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {w.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm" style={{ color: 'var(--text1)' }}>{w.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text2)' }}>
                    <Star style={{ width: 11, height: 11, display: 'inline', color: '#FBBF24', fill: '#FBBF24' }} /> {(w.rating ?? 0).toFixed(1)} · Hired {w.timesHired}x
                  </p>
                </div>
                <button onClick={() => router.push('/employer')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
                  style={{ background: 'rgba(20,184,166,0.1)', color: '#5EEAD4', border: '1px solid rgba(20,184,166,0.25)', cursor: 'pointer' }}>
                  <Repeat2 style={{ width: 13, height: 13 }} /> Hire Again
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <EmployerBottomNav />
    </div>
  )
}

function Empty({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-5xl mb-3">{emoji}</p>
      <p className="font-bold text-lg" style={{ color: 'var(--text1)' }}>{title}</p>
      <p className="text-sm mt-1" style={{ color: 'var(--text2)' }}>{sub}</p>
    </div>
  )
}
