'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Sparkles, User } from 'lucide-react'
import { toastError } from '@/lib/toast'

const BG   = '#080808'
const S1   = '#111111'
const BD   = 'rgba(255,255,255,0.07)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.45)'
const ACC  = '#FFFFFF'
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

type TranscriptMsg = { role: 'user' | 'bot'; text: string; ts?: number }
type Ticket = {
  id: string
  type: string
  description: string
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  source?: string
  resolution?: string | null
  transcript?: TranscriptMsg[] | null
  createdAt: string
  resolvedAt?: string | null
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  OPEN:        { bg: 'rgba(245,197,24,0.12)', fg: '#F5C518', label: 'Open' },
  IN_PROGRESS: { bg: 'rgba(96,165,250,0.12)', fg: '#60A5FA', label: 'In progress' },
  RESOLVED:    { bg: 'rgba(34,197,94,0.12)',  fg: '#22C55E', label: 'Resolved' },
  CLOSED:      { bg: 'rgba(255,255,255,0.08)', fg: T2,        label: 'Closed' },
}

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null | 'notfound'>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch(`/api/complaints/${params.id}`)
        if (r.status === 401) { router.replace('/employer/login'); return }
        if (r.status === 404) { if (!cancelled) setTicket('notfound'); return }
        const ct = r.headers.get('content-type') || ''
        const d = ct.includes('application/json') ? await r.json().catch(() => null) : null
        if (!r.ok) throw new Error(d?.error || `Could not load ticket (${r.status})`)
        if (!cancelled && d?.complaint) setTicket(d.complaint)
      } catch (err: any) {
        toastError(err?.message || 'Could not load ticket')
      }
    })()
    return () => { cancelled = true }
  }, [params.id, router])

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${BD}`, position: 'sticky', top: 0, background: BG, zIndex: 10 }}>
        <button onClick={() => router.back()} aria-label="Back" style={{ width: 36, height: 36, borderRadius: 18, background: S1, border: `1px solid ${BD}`, color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <div style={{ flex: 1, color: T1, fontWeight: 800, fontSize: 16 }}>
          Ticket {ticket && ticket !== 'notfound' ? `#${ticket.id.slice(-6).toUpperCase()}` : ''}
        </div>
      </header>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ticket === null && <div style={{ color: T2, fontSize: 14, padding: 24, textAlign: 'center' }}>Loading…</div>}

        {ticket === 'notfound' && (
          <div style={{ color: T2, fontSize: 14, padding: 24, textAlign: 'center' }}>Ticket not found.</div>
        )}

        {ticket && ticket !== 'notfound' && (
          <>
            <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                  background: STATUS_COLOR[ticket.status]?.bg || STATUS_COLOR.OPEN.bg,
                  color:      STATUS_COLOR[ticket.status]?.fg || STATUS_COLOR.OPEN.fg,
                }}>
                  {STATUS_COLOR[ticket.status]?.label || ticket.status}
                </span>
                <span style={{ fontSize: 11, color: T2 }}>{new Date(ticket.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                Category: {ticket.type}
              </div>
              <div style={{ color: T1, fontSize: 14, lineHeight: 1.5 }}>{ticket.description}</div>
            </div>

            {ticket.resolution && (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 16, padding: 16, display: 'flex', gap: 12 }}>
                <CheckCircle2 style={{ width: 18, height: 18, color: '#22C55E', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ color: '#22C55E', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Ops resolution</div>
                  <div style={{ color: T1, fontSize: 14, lineHeight: 1.5 }}>{ticket.resolution}</div>
                  {ticket.resolvedAt && (
                    <div style={{ color: T2, fontSize: 11, marginTop: 6 }}>{new Date(ticket.resolvedAt).toLocaleString('en-IN')}</div>
                  )}
                </div>
              </div>
            )}

            {Array.isArray(ticket.transcript) && ticket.transcript.length > 0 && (
              <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: 16 }}>
                <div style={{ color: T2, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                  Conversation transcript
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ticket.transcript.map((m, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: 12, background: m.role === 'bot' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.07)', border: `1px solid ${m.role === 'bot' ? ACC : BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {m.role === 'bot'
                          ? <Sparkles style={{ width: 12, height: 12, color: ACC }} />
                          : <User style={{ width: 12, height: 12, color: T1 }} />}
                      </div>
                      <div style={{ color: T1, fontSize: 13, lineHeight: 1.5, paddingTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
