'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, MessageSquare, Inbox, AlertCircle, Clock, CheckCircle2, Sparkles, Plus } from 'lucide-react'
import { toastError } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151A'
const BD    = 'rgba(255,255,255,0.07)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

type Ticket = {
  id: string
  type: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  source?: string | null
  resolution?: string | null
  createdAt: string
  resolvedAt?: string | null
}

const STATUS_META: Record<string, { bg: string; fg: string; label: string; Icon: any }> = {
  OPEN:        { bg: 'rgba(245,158,11,0.14)', fg: '#F59E0B', label: 'Open',        Icon: AlertCircle },
  IN_PROGRESS: { bg: 'rgba(96,165,250,0.14)', fg: '#60A5FA', label: 'In progress', Icon: Clock },
  RESOLVED:    { bg: 'rgba(34,197,94,0.14)',  fg: '#22C55E', label: 'Resolved',    Icon: CheckCircle2 },
  CLOSED:      { bg: 'rgba(255,255,255,0.06)', fg: T2,        label: 'Closed',      Icon: CheckCircle2 },
}

export default function MyTicketsPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/complaints')
        if (res.status === 401) { router.replace('/employer/login'); return }
        const ct = res.headers.get('content-type') || ''
        const data = ct.includes('application/json') ? await res.json().catch(() => null) : null
        if (!res.ok) throw new Error(data?.error || `Could not load tickets (${res.status})`)
        if (!cancelled) setTickets(data?.complaints || [])
      } catch (err: any) {
        toastError(err?.message || 'Could not load tickets')
        if (!cancelled) setTickets([])
      }
    })()
    return () => { cancelled = true }
  }, [router])

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    setScrolled(e.currentTarget.scrollTop > 6)
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes ticket-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .ticket-card { animation: ticket-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes skel-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
        .ticket-skel { background: linear-gradient(90deg, ${SURF} 0%, rgba(255,255,255,0.04) 50%, ${SURF} 100%); background-size: 400px 100%; animation: skel-shimmer 1.4s linear infinite; }
      `}</style>

      <header style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderBottom: `1px solid ${scrolled ? 'rgba(255,255,255,0.10)' : 'transparent'}`,
        background: scrolled ? 'rgba(8,9,12,0.85)' : BG,
        backdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'saturate(180%) blur(14px)' : 'none',
        position: 'sticky', top: 0, zIndex: 10,
        transition: 'border-color 200ms, background 200ms',
      }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 38, height: 38, borderRadius: 19, background: SURF, border: `1px solid ${BD}`, color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: T1, fontWeight: 800, fontSize: 16, lineHeight: '20px' }}>My Tickets</div>
          {tickets && (
            <div style={{ color: T2, fontSize: 12, marginTop: 2 }}>{tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}</div>
          )}
        </div>
        <button onClick={() => router.push('/employer/support')} aria-label="New chat"
          style={{ width: 38, height: 38, borderRadius: 19, background: T1, border: 'none', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 6px 16px rgba(255,255,255,0.08)' }}>
          <Plus style={{ width: 18, height: 18 }} />
        </button>
      </header>

      <div onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {tickets === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="ticket-skel" style={{ height: 96, borderRadius: 16 }} />
            ))}
          </div>
        )}

        {tickets && tickets.length === 0 && <EmptyState onOpenChat={() => router.push('/employer/support')} />}

        {tickets && tickets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tickets.map((t, i) => {
              const meta = STATUS_META[t.status] || STATUS_META.OPEN
              const short = t.description.length > 110 ? t.description.slice(0, 107) + '…' : t.description
              const StatusIcon = meta.Icon
              return (
                <button key={t.id}
                  className="ticket-card"
                  style={{
                    animationDelay: `${Math.min(i, 6) * 35}ms`,
                    textAlign: 'left', background: SURF, border: `1px solid ${BD}`, borderRadius: 18, padding: 16,
                    color: T1, fontFamily: FONT, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                  onClick={() => router.push(`/employer/support/tickets/${t.id}`)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, background: meta.bg, color: meta.fg, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <StatusIcon style={{ width: 11, height: 11 }} />
                      {meta.label}
                    </span>
                    {t.source === 'bot_escalation' && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99, background: 'rgba(255,255,255,0.06)', color: T2, border: `1px solid ${BD}`, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Sparkles style={{ width: 10, height: 10 }} /> via Jyoti
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: T3, marginLeft: 'auto' }}>{relativeTime(t.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.45 }}>{short}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T3, fontSize: 11 }}>
                    <MessageSquare style={{ width: 12, height: 12 }} />
                    <span style={{ textTransform: 'capitalize' as const }}>{t.type}</span>
                    <span>·</span>
                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>#{t.id.slice(-6).toUpperCase()}</span>
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

function EmptyState({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <div style={{ marginTop: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '0 24px', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 84, height: 84, borderRadius: 42, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Inbox style={{ width: 36, height: 36, color: T1 }} />
      </div>
      <div style={{ color: T1, fontWeight: 800, fontSize: 18 }}>No tickets yet</div>
      <div style={{ color: T2, fontSize: 14, maxWidth: 300, lineHeight: 1.5 }}>
        Jyoti answers most questions instantly. If she can't help, she'll connect you with our human team — and the ticket appears here.
      </div>
      <button onClick={onOpenChat}
        style={{ marginTop: 6, padding: '12px 24px', borderRadius: 14, background: T1, color: '#000', fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <MessageSquare style={{ width: 16, height: 16 }} />
        Chat with Jyoti
      </button>
    </div>
  )
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000)            return 'just now'
  if (diff < 60 * 60_000)       return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 24 * 60 * 60_000)  return `${Math.floor(diff / (60 * 60_000))}h ago`
  if (diff < 7 * 24 * 60 * 60_000) return `${Math.floor(diff / (24 * 60 * 60_000))}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
