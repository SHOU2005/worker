'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Phone, MessageCircle, Search, AlertTriangle, CheckCircle2, Clock, Sparkles, User, ChevronDown, ChevronUp } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const S2='#141414';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const T3='rgba(255,255,255,0.55)';const FONT='"DM Sans", system-ui, sans-serif'

interface Reporter { id: string; name: string; phone: string; role: string }
interface TranscriptMsg { role: 'user' | 'bot'; text: string; ts?: number }
interface Complaint {
  id: string; type: string; status: string; description: string; reportedBy: string
  against: string; createdAt: string; resolution: string | null; bookingId: string | null
  source?: string | null; transcript?: TranscriptMsg[] | null
  reporter: Reporter | null
}

const TYPE_LABEL: Record<string, string> = {
  payment: '💰 Payment', employer: '🏢 Employer', safety: '🚨 Safety', app_bug: '🐛 App bug', other: '❓ Other',
}
const STATUS_COLOR: Record<string, string> = { OPEN: '#FBBF24', IN_PROGRESS: '#60A5FA', RESOLVED: '#34D399', CLOSED: T2 }

const waLink = (phone: string) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}`

export default function ComplaintsPage() {
  const router = useRouter()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [loading,    setLoading]    = useState(true)
  const [resolving,  setResolving]  = useState<string | null>(null)
  const [resolution, setResolution] = useState('')
  const [filter,     setFilter]     = useState('OPEN')
  const [search,     setSearch]     = useState('')
  const [openTranscripts, setOpenTranscripts] = useState<Set<string>>(new Set())

  function load(f = filter) {
    setLoading(true)
    fetch(`/api/ops/complaints?status=${f}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setComplaints(d.complaints || []) }).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filter])

  async function resolve(id: string) {
    if (!resolution.trim()) return
    const res = await fetch(`/api/ops/complaints/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'RESOLVED', resolution }) })
    if (!res.ok) return
    setComplaints(prev => prev.filter(c => c.id !== id))
    setResolving(null); setResolution('')
  }

  const kpis = useMemo(() => ({
    open:     complaints.filter(c => c.status === 'OPEN').length,
    inprog:   complaints.filter(c => c.status === 'IN_PROGRESS').length,
    resolved: complaints.filter(c => c.status === 'RESOLVED').length,
  }), [complaints])

  const filtered = useMemo(() => {
    if (!search.trim()) return complaints
    const q = search.trim().toLowerCase()
    return complaints.filter(c =>
      c.description.toLowerCase().includes(q) ||
      (c.reporter?.name || '').toLowerCase().includes(q) ||
      (c.reporter?.phone || '').includes(q) ||
      c.type.includes(q)
    )
  }, [complaints, search])

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Complaints</p>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Open',        value: kpis.open,     Icon: AlertTriangle, color: '#FBBF24' },
            { label: 'In Progress', value: kpis.inprog,   Icon: Clock,         color: '#60A5FA' },
            { label: 'Resolved',    value: kpis.resolved, Icon: CheckCircle2,  color: '#34D399' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <Icon style={{ width: 13, height: 13, color, marginBottom: 4 }} />
              <p style={{ color: T1, fontWeight: 800, fontSize: 18, margin: 0 }}>{value}</p>
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T2 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search description, name, phone, type"
            style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px 10px 34px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2 }}>{f.replace('_', ' ')}</button>
          ))}
        </div>

        {loading ? <ListRowSkeleton count={6} dark /> :
          filtered.length === 0 ? <div style={{ textAlign: 'center', paddingTop: 60 }}><p style={{ fontSize: 36 }}>✅</p><p style={{ color: T2 }}>No complaints match</p></div> :
          filtered.map(c => (
            <div key={c.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: T1 }}>{TYPE_LABEL[c.type] || c.type}</span>
                  {c.source === 'bot_escalation' && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 20, background: 'rgba(96,165,250,0.15)', color: '#60A5FA', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles style={{ width: 11, height: 11 }} /> Bot-escalated
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${STATUS_COLOR[c.status] || T2}20`, color: STATUS_COLOR[c.status] || T2 }}>{c.status.replace('_', ' ')}</span>
              </div>
              <p style={{ color: T1, fontSize: 14, margin: '0 0 10px', lineHeight: 1.45, whiteSpace: 'pre-wrap' as const }}>{c.description}</p>

              {/* Reporter info */}
              {c.reporter && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: S2, borderRadius: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: T1, fontSize: 13, fontWeight: 700, margin: 0 }}>{c.reporter.name || '—'}</p>
                    <p style={{ color: T2, fontSize: 11, margin: '2px 0 0' }}>{c.reporter.phone} · {c.reporter.role}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={`tel:${c.reporter.phone}`} title="Call" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                      <Phone style={{ width: 13, height: 13, color: T1 }} />
                    </a>
                    <a href={waLink(c.reporter.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                      <MessageCircle style={{ width: 13, height: 13, color: '#34D399' }} />
                    </a>
                  </div>
                </div>
              )}

              <p style={{ color: T2, fontSize: 11, margin: '0 0 12px' }}>
                {new Date(c.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {c.against ? ` · against ${c.against}` : ''}
                {c.bookingId ? ` · booking ${c.bookingId.slice(-6)}` : ''}
              </p>

              {Array.isArray(c.transcript) && c.transcript.length > 0 && (
                <div style={{ background: S2, borderRadius: 10, marginBottom: 10, border: `1px solid ${BD}` }}>
                  <button onClick={() => setOpenTranscripts(prev => {
                    const next = new Set(prev); if (next.has(c.id)) next.delete(c.id); else next.add(c.id); return next
                  })}
                    style={{ width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', color: T1, cursor: 'pointer', fontFamily: FONT, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MessageCircle style={{ width: 13, height: 13, color: '#60A5FA' }} />
                      Bot transcript · {c.transcript.length} msgs
                    </span>
                    {openTranscripts.has(c.id) ? <ChevronUp style={{ width: 14, height: 14, color: T2 }} /> : <ChevronDown style={{ width: 14, height: 14, color: T2 }} />}
                  </button>
                  {openTranscripts.has(c.id) && (
                    <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {c.transcript.map((m, i) => (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <div style={{ width: 20, height: 20, borderRadius: 10, background: m.role === 'bot' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                            {m.role === 'bot'
                              ? <Sparkles style={{ width: 10, height: 10, color: '#60A5FA' }} />
                              : <User style={{ width: 10, height: 10, color: T1 }} />}
                          </div>
                          <p style={{ color: T1, fontSize: 12, margin: 0, lineHeight: 1.45, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const }}>{m.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {c.resolution && (
                <div style={{ background: 'rgba(52,211,153,0.08)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, border: '1px solid rgba(52,211,153,0.2)' }}>
                  <p style={{ color: '#34D399', fontSize: 11, fontWeight: 700, margin: 0, marginBottom: 2 }}>RESOLUTION</p>
                  <p style={{ color: T3, fontSize: 13, margin: 0, lineHeight: 1.4 }}>{c.resolution}</p>
                </div>
              )}

              {c.status === 'OPEN' && resolving === c.id ? (
                <>
                  <textarea value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Resolution note (visible to reporter)…"
                    style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 13, resize: 'vertical', minHeight: 80, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setResolving(null); setResolution('') }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T2, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => resolve(c.id)} disabled={!resolution.trim()} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: resolution.trim() ? '#34D399' : 'rgba(52,211,153,0.3)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: resolution.trim() ? 'pointer' : 'default' }}>Mark Resolved</button>
                  </div>
                </>
              ) : c.status === 'OPEN' ? (
                <button onClick={() => setResolving(c.id)} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Resolve Complaint
                </button>
              ) : null}
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
