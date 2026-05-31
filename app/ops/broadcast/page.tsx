'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { Send, CheckCircle, Loader2 } from 'lucide-react'

const BG = '#000000', S1 = '#0F0F0F', BD = 'rgba(255,255,255,0.08)', T1 = '#FFFFFF', T2 = 'rgba(255,255,255,0.4)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface BroadcastLog {
  id: string; title: string; body: string; targetRole: string; targetCity: string | null; sentCount: number; createdAt: string
}

export default function BroadcastPage() {
  const router = useRouter()
  const [title,      setTitle]      = useState('')
  const [body,       setBody]       = useState('')
  const [targetRole, setTargetRole] = useState<'ALL' | 'WORKER' | 'CAPTAIN' | 'EMPLOYER'>('ALL')
  const [targetCity, setTargetCity] = useState('')
  const [url,        setUrl]        = useState('')
  const [sending,    setSending]    = useState(false)
  const [result,     setResult]     = useState<{ targeted: number; delivered: number; failed: number } | null>(null)
  const [error,      setError]      = useState('')
  const [logs,       setLogs]       = useState<BroadcastLog[]>([])

  async function loadLogs() {
    try {
      const r = await fetch('/api/ops/broadcast')
      if (r.status === 401) { router.replace('/ops/login'); return }
      const d = await r.json()
      setLogs(d.logs ?? [])
    } catch { /* ignore */ }
  }
  useEffect(() => { loadLogs() }, [])

  async function send() {
    if (!title || !body) return
    setSending(true); setResult(null); setError('')
    try {
      const r = await fetch('/api/ops/broadcast', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body, targetRole,
          targetCity: targetCity.trim() || undefined,
          url:        url.trim() || undefined,
        }),
      })
      if (r.status === 401) { router.replace('/ops/login'); return }
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Failed to send'); return }
      setResult({ targeted: d.targeted, delivered: d.delivered, failed: d.failed })
      setTitle(''); setBody(''); setUrl('')
      loadLogs()
    } catch { setError('Network error') }
    finally { setSending(false) }
  }

  const targetLabel = targetRole === 'ALL' ? 'All Users' : `${targetRole.charAt(0)}${targetRole.slice(1).toLowerCase()}s`

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))', color: T1 }}>
      <OpsNav />

      <div style={{ padding: '20px 20px 0', maxWidth: 720 }} className="ops-content">
        <div style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <p style={{ color: T2, fontSize: 13, margin: 0 }}>Operations</p>
          <p style={{ color: T1, fontWeight: 800, fontSize: 24, margin: '2px 0 0', letterSpacing: -0.5 }}>Broadcast</p>
          <p style={{ color: T2, fontSize: 12, marginTop: 2 }}>Send a push notification to workers, captains, employers, or everyone</p>
        </div>

        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 18, padding: 18, marginTop: 18 }}>
          {/* Audience */}
          <div style={{ marginBottom: 16 }}>
            <Label>Audience</Label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['ALL', 'WORKER', 'CAPTAIN', 'EMPLOYER'] as const).map(r => (
                <button key={r} onClick={() => setTargetRole(r)}
                  style={{
                    padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: targetRole === r ? T1 : 'rgba(255,255,255,0.05)',
                    color: targetRole === r ? '#000' : T2,
                  }}>
                  {r === 'ALL' ? '👥 All' : r === 'WORKER' ? '👷 Workers' : r === 'CAPTAIN' ? '🧭 Captains' : '🏢 Employers'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <Field label="City filter (optional)">
              <input value={targetCity} onChange={e => setTargetCity(e.target.value)} placeholder="e.g. Gurgaon"
                style={inputStyle} />
            </Field>
            <Field label="Tap action URL (optional)">
              <input value={url} onChange={e => setUrl(e.target.value)} placeholder="/worker/jobs"
                style={inputStyle} />
            </Field>
          </div>

          <Field label="Title">
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
              placeholder="e.g. ⚡ Bonus Boost — earn +20% today!" style={inputStyle} />
            <Counter value={title} max={60} />
          </Field>

          <Field label="Message">
            <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={160} rows={3}
              placeholder="Short, punchy message — keep under 160 chars."
              style={{ ...inputStyle, height: 'auto', resize: 'vertical', minHeight: 96, padding: '10px 12px' }} />
            <Counter value={body} max={160} />
          </Field>

          {/* Preview */}
          {(title || body) && (
            <div style={{ marginTop: 14, padding: 12, background: '#1A1A1A', borderRadius: 12, border: `1px solid ${BD}` }}>
              <p style={{ color: T2, fontSize: 11, fontWeight: 700, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Preview</p>
              <p style={{ color: T1, fontWeight: 700, fontSize: 14, margin: '0 0 3px' }}>{title || 'Notification title'}</p>
              <p style={{ color: T2, fontSize: 13, margin: 0 }}>{body || 'Message body'}</p>
            </div>
          )}

          {result && (
            <div style={{ marginTop: 14, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle style={{ width: 18, height: 18, color: '#22C55E' }} />
              <div>
                <p style={{ color: '#86EFAC', fontWeight: 800, fontSize: 14, margin: 0 }}>Broadcast sent</p>
                <p style={{ color: 'rgba(134,239,172,0.7)', fontSize: 12, margin: '2px 0 0' }}>
                  Targeted {result.targeted} · Delivered {result.delivered} · Failed {result.failed}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: 14, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 13, color: '#FCA5A5', fontWeight: 600, margin: 0 }}>{error}</p>
            </div>
          )}

          <button onClick={send} disabled={!title || !body || sending}
            style={{
              marginTop: 18, width: '100%', height: 52, borderRadius: 14, fontSize: 15, fontWeight: 800, border: 'none',
              background: title && body && !sending ? T1 : 'rgba(255,255,255,0.1)',
              color: title && body && !sending ? '#000' : T2,
              cursor: title && body && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {sending ? <><Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> Sending…</> : <><Send style={{ width: 16, height: 16 }} /> Send to {targetLabel}</>}
          </button>
        </div>

        {/* Recent broadcasts */}
        {logs.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{ color: T2, fontSize: 11, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Recent broadcasts</p>
            <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, overflow: 'hidden' }}>
              {logs.map((l, i) => (
                <div key={l.id} style={{ padding: '12px 14px', borderBottom: i < logs.length - 1 ? `1px solid ${BD}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <p style={{ color: T1, fontSize: 14, fontWeight: 700, margin: 0 }}>{l.title}</p>
                    <span style={{ fontSize: 11, color: T2 }}>{new Date(l.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p style={{ color: T2, fontSize: 13, margin: '0 0 6px' }}>{l.body}</p>
                  <div style={{ display: 'flex', gap: 6, fontSize: 11, color: T2 }}>
                    <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>{l.targetRole}</span>
                    {l.targetCity && <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6 }}>{l.targetCity}</span>}
                    <span style={{ background: 'rgba(34,197,94,0.08)', color: '#86EFAC', padding: '2px 8px', borderRadius: 6 }}>{l.sentCount} sent</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, marginBottom: 14 }}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
function Label({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</p>
}
function Counter({ value, max }: { value: string; max: number }) {
  return <p style={{ fontSize: 11, color: T2, textAlign: 'right' as const, margin: '4px 0 0' }}>{value.length}/{max}</p>
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`,
  color: T1, fontSize: 14, fontWeight: 500, outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}
