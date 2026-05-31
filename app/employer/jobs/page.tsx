'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Calendar, Inbox, ChevronRight } from 'lucide-react'
import { toastError } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

const IMG = (f: string) => `/icons/services/${f}.jpg?v=4`

const ROLE_IMG: Record<string, string> = {
  'Maid':             IMG('house-cleaner'),
  'Cleaner':          IMG('house-cleaner'),
  'Cook':             IMG('cook-chef'),
  'Kitchen Helper':   IMG('kitchen-helper'),
  'Caretaker':        IMG('baby-care'),
  'Waiter':           IMG('waiter'),
  'Bartender':        IMG('bartender'),
  'Security Guard':   IMG('security-guard'),
  'Bouncer':          IMG('bouncer'),
  'Driver':           IMG('driver'),
  'Promoter':         IMG('promoter'),
  'General Helper':   IMG('general-helper'),
  'Factory Helper':   IMG('factory-helper'),
  'Store Staff':      IMG('general-helper'),
  'Delivery Rider':   IMG('delivery-rider'),
}

const STATUS_META: Record<string, { bg: string; fg: string; label: string }> = {
  SEARCHING:   { bg: 'rgba(245,158,11,0.16)', fg: '#F59E0B', label: 'Searching'   },
  ASSIGNED:    { bg: 'rgba(96,165,250,0.16)', fg: '#60A5FA', label: 'Assigned'    },
  IN_PROGRESS: { bg: 'rgba(34,197,94,0.16)',  fg: '#22C55E', label: 'Live'        },
  COMPLETED:   { bg: 'rgba(255,255,255,0.06)', fg: T1,        label: 'Completed'   },
  CANCELLED:   { bg: 'rgba(239,68,68,0.16)',  fg: '#EF4444', label: 'Cancelled'   },
}

const FILTERS = ['All', 'Active', 'Completed', 'Cancelled'] as const
type Filter = typeof FILTERS[number]

type Job = {
  id:          string
  title:       string
  date:        string
  startTime:   string
  duration:    number
  status:      keyof typeof STATUS_META | string
  workersNeeded?: number
  bookings?:   Array<{ id: string; worker?: { user?: { name?: string } } }>
}

export default function MyBookingsPage() {
  const router = useRouter()
  const [filter,   setFilter]   = useState<Filter>('All')
  const [jobs,     setJobs]     = useState<Job[] | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/employer/jobs')
        if (r.status === 401) { router.replace('/employer/login'); return }
        const ct = r.headers.get('content-type') || ''
        const d  = ct.includes('application/json') ? await r.json().catch(() => null) : null
        if (!r.ok) throw new Error(d?.error || `Could not load bookings (${r.status})`)
        if (!cancelled) setJobs(d?.jobs || [])
      } catch (err: any) {
        toastError(err?.message || 'Could not load bookings')
        if (!cancelled) setJobs([])
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const counts = useMemo(() => {
    const list = jobs || []
    return {
      All:       list.length,
      Active:    list.filter(j => ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS'].includes(j.status)).length,
      Completed: list.filter(j => j.status === 'COMPLETED').length,
      Cancelled: list.filter(j => j.status === 'CANCELLED').length,
    }
  }, [jobs])

  const visible = useMemo(() => {
    const list = jobs || []
    switch (filter) {
      case 'Active':    return list.filter(j => ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS'].includes(j.status))
      case 'Completed': return list.filter(j => j.status === 'COMPLETED')
      case 'Cancelled': return list.filter(j => j.status === 'CANCELLED')
      default:          return list
    }
  }, [jobs, filter])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrolled(e.currentTarget.scrollTop > 6)
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100dvh' as any, display: 'flex', flexDirection: 'column', color: T1 }}>
      <style>{`
        @keyframes mb-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .mb-card { animation: mb-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes mb-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        .mb-skel { background: linear-gradient(90deg, ${SURF} 0%, rgba(255,255,255,0.04) 50%, ${SURF} 100%); background-size: 400px 100%; animation: mb-shimmer 1.4s linear infinite; }
        .mb-filters { display: flex; gap: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
        .mb-filters::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(12px + env(safe-area-inset-top)) 14px 10px',
        borderBottom: `1px solid ${scrolled ? BDH : 'transparent'}`,
        background: scrolled ? 'rgba(8,9,12,0.85)' : BG,
        backdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
        position: 'sticky', top: 0, zIndex: 10,
        transition: 'border-color 200ms, background 200ms',
      }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <ArrowLeft style={{ width: 24, height: 24 }} />
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 26, fontWeight: 900, color: T1, letterSpacing: -0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>My Bookings</div>
        <button onClick={() => router.push('/employer')} aria-label="New booking"
          style={{ width: 40, height: 40, borderRadius: 20, background: T1, border: 'none', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <Plus style={{ width: 18, height: 18 }} />
        </button>
      </header>

      {/* Filter pills — horizontally scrollable on narrow phones */}
      <div className="mb-filters" style={{ padding: '14px 14px 4px' }}>
        {FILTERS.map(f => {
          const sel = f === filter
          const count = counts[f as keyof typeof counts]
          return (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                flexShrink: 0,
                padding: '10px 16px',
                borderRadius: 99,
                background: sel ? 'rgba(255,255,255,0.06)' : SURF,
                border: `1.5px solid ${sel ? T1 : BD}`,
                color: T1, fontFamily: FONT, fontSize: 13, fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 8, letterSpacing: -0.2,
              }}>
              {f}
              {count > 0 && (
                <span style={{ fontSize: 11, fontWeight: 800, color: sel ? T1 : T2, background: sel ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)', padding: '1px 8px', borderRadius: 99 }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div onScroll={onScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '12px 14px calc(28px + env(safe-area-inset-bottom))' }}>

        {jobs === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="mb-skel" style={{ height: 96, borderRadius: 18 }} />
            ))}
          </div>
        )}

        {jobs !== null && visible.length === 0 && (
          <EmptyState filter={filter} onPost={() => router.push('/employer')} />
        )}

        {jobs !== null && visible.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visible.map((j, idx) => {
              const meta = STATUS_META[j.status] || STATUS_META.SEARCHING
              const img  = ROLE_IMG[j.title] || ROLE_IMG['General Helper']
              const dateStr = formatDate(j.date, j.startTime)
              const isMulti = (j.workersNeeded || 1) > 1
              return (
                <button key={j.id}
                  className="mb-card"
                  style={{
                    animationDelay: `${Math.min(idx, 6) * 35}ms`,
                    textAlign: 'left' as const,
                    background: SURF, border: `1px solid ${BD}`, borderRadius: 20,
                    padding: 14, color: T1, fontFamily: FONT, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 12,
                    overflow: 'hidden',
                  }}
                  onClick={() => router.push(`/employer/job/${j.id}`)}>
                  {/* Top row: image + service title + status badge */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, overflow: 'hidden', background: SURF2, flexShrink: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={j.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%', display: 'block' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T1, letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {j.title}
                      </div>
                      <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>
                        {isMulti ? `${j.workersNeeded} workers` : 'Single'} · {j.duration}h
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 99, background: meta.bg, color: meta.fg, letterSpacing: -0.1, whiteSpace: 'nowrap' as const }}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Bottom row: date + chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: `1px solid ${BD}`, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T2, fontSize: 13, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                      <Calendar style={{ width: 13, height: 13, color: T3, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dateStr}</span>
                    </div>
                    <ChevronRight style={{ width: 16, height: 16, color: T3, flexShrink: 0 }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ filter, onPost }: { filter: Filter; onPost: () => void }) {
  const copy: Record<Filter, { title: string; sub: string }> = {
    'All':       { title: 'No bookings yet',         sub: 'Your bookings will appear here once you post your first job.' },
    'Active':    { title: 'No active bookings',      sub: "You're not running anything right now. Post a new job to get started." },
    'Completed': { title: 'No completed bookings',   sub: 'Completed bookings will appear here after a shift wraps up.' },
    'Cancelled': { title: 'No cancelled bookings',   sub: "Nothing cancelled — that's the way to keep it." },
  }
  const c = copy[filter]
  return (
    <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '0 24px', textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: 40, background: 'rgba(255,255,255,0.04)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Inbox style={{ width: 32, height: 32, color: T2 }} />
      </div>
      <div style={{ color: T1, fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>{c.title}</div>
      <div style={{ color: T2, fontSize: 14, maxWidth: 300, lineHeight: 1.5 }}>{c.sub}</div>
      <button onClick={onPost}
        style={{ marginTop: 6, padding: '12px 22px', borderRadius: 14, background: T1, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Calendar style={{ width: 16, height: 16 }} />
        Post a new job
      </button>
    </div>
  )
}

function formatDate(iso: string, startTime?: string): string {
  try {
    const d = new Date(iso)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
    const isTomorrow = d.toDateString() === tomorrow.toDateString()
    const day = isToday ? 'Today' : isTomorrow ? 'Tomorrow'
              : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    if (startTime) {
      const [h, m] = startTime.split(':').map(Number)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const hr12 = h === 0 ? 12 : h > 12 ? h - 12 : h
      return `${day}, ${pad(hr12)}:${pad(m)} ${ampm}`
    }
    return day
  } catch {
    return iso
  }
}

function pad(n: number) { return n.toString().padStart(2, '0') }
