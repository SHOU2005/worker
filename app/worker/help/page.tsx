'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, AlertTriangle, CheckCircle, Clock, MessageSquare, Phone } from 'lucide-react'
import { track } from '@/lib/posthog'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import EmptyState from '@/components/shared/EmptyState'

const FONT = '"DM Sans", system-ui, sans-serif'

const TYPES = [
  { id: 'payment',  emoji: '💰', label: 'Payment issue',     desc: 'Payment not received or wrong amount' },
  { id: 'employer', emoji: '🏢', label: 'Employer issue',    desc: 'Employer behaviour or shift problem' },
  { id: 'safety',   emoji: '🚨', label: 'Safety concern',    desc: 'Unsafe location or harassment' },
  { id: 'app_bug',  emoji: '🐛', label: 'App not working',   desc: 'Something is broken in the app' },
  { id: 'other',    emoji: '❓', label: 'Other',             desc: 'Anything else' },
] as const

interface Complaint {
  id: string; type: string; description: string; status: string
  resolution: string | null; createdAt: string; resolvedAt: string | null
}

const STATUS_COLOR: Record<string, string> = { OPEN: '#FBBF24', IN_PROGRESS: '#60A5FA', RESOLVED: '#34D399', CLOSED: 'rgba(255,255,255,0.4)' }

export default function WorkerHelpPage() {
  const router = useRouter()
  const [step,  setStep]  = useState<'list' | 'new'>('list')
  const [type,  setType]  = useState<string>('')
  const [desc,  setDesc]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/complaints')
      const d = await r.json()
      if (r.ok) setHistory(d.complaints || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function submit() {
    if (!type) { setError('Pick a category'); return }
    if (desc.trim().length < 10) { setError('Please describe the issue (at least 10 characters)'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, description: desc.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Could not submit. Please try again.'); setSaving(false); return }
      track('complaint_submitted', { type })
      setStep('list'); setType(''); setDesc(''); setSaving(false)
      load()
    } catch { setError('Network error. Try again.'); setSaving(false) }
  }

  return (
    <div style={{ fontFamily: FONT, minHeight: '100vh', background: '#FFFFFF', color: '#111111' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10, background: '#FFFFFF', borderBottom: '1px solid rgba(0,0,0,0.07)',
        paddingTop: 'calc(12px + env(safe-area-inset-top))', paddingBottom: 12, paddingLeft: 16, paddingRight: 16,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button onClick={() => step === 'new' ? setStep('list') : router.back()}
          style={{ width: 38, height: 38, borderRadius: 19, border: '1px solid rgba(0,0,0,0.1)', background: '#F5F5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 18, height: 18, color: '#111' }} />
        </button>
        <p style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>{step === 'new' ? 'Report an issue' : 'Help & Support'}</p>
      </div>

      <div style={{ padding: '16px', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

        {step === 'list' ? (
          <>
            {/* Quick contact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <a href="https://wa.me/918368828660?text=Hi%2C%20I%20need%20help%20with%20Switch" target="_blank" rel="noreferrer"
                style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 14, padding: 14, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <MessageSquare style={{ width: 20, height: 20, color: '#0E8C46' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0E8C46' }}>WhatsApp Support</span>
              </a>
              <a href="tel:+918368828660"
                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: 14, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <Phone style={{ width: 20, height: 20, color: '#111' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>Call us</span>
              </a>
            </div>

            <button onClick={() => setStep('new')}
              style={{ width: '100%', height: 56, borderRadius: 14, background: '#111', color: '#fff', border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 18 }}>
              <AlertTriangle style={{ width: 18, height: 18 }} /> Report an Issue
            </button>

            <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.4)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Your Reports</p>
            {loading ? (
              <ListRowSkeleton count={3} />
            ) : history.length === 0 ? (
              <EmptyState
                icon="👌"
                title="No issues reported"
                message="If something goes wrong on a shift, file a report and we'll respond within a few hours."
              />
            ) : (
              history.map(c => {
                const typeMeta = TYPES.find(t => t.id === c.type)
                return (
                  <div key={c.id} style={{ background: '#F5F5F5', borderRadius: 14, padding: '14px 16px', marginBottom: 8, border: '1px solid rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{typeMeta?.emoji} {typeMeta?.label || c.type}</p>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${STATUS_COLOR[c.status] || '#aaa'}20`, color: STATUS_COLOR[c.status] || '#aaa' }}>{c.status}</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', margin: 0, lineHeight: 1.4 }}>{c.description}</p>
                    {c.resolution && (
                      <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(52,211,153,0.08)', borderRadius: 10, border: '1px solid rgba(52,211,153,0.2)' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#10B981', margin: 0, marginBottom: 2 }}>OPS RESPONSE</p>
                        <p style={{ fontSize: 13, color: '#065F46', margin: 0, lineHeight: 1.4 }}>{c.resolution}</p>
                      </div>
                    )}
                    <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.35)', marginTop: 8 }}>
                      <Clock style={{ width: 10, height: 10, display: 'inline', marginRight: 4 }} />
                      {new Date(c.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                )
              })
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.55)', marginBottom: 10 }}>Category</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {TYPES.map(t => (
                <button key={t.id} onClick={() => setType(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                    background: type === t.id ? '#111' : '#F5F5F5',
                    border: `1.5px solid ${type === t.id ? '#111' : 'rgba(0,0,0,0.08)'}`,
                    textAlign: 'left' as const, transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 22 }}>{t.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: type === t.id ? '#fff' : '#111', margin: 0 }}>{t.label}</p>
                    <p style={{ fontSize: 12, color: type === t.id ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.45)', margin: '2px 0 0' }}>{t.desc}</p>
                  </div>
                  {type === t.id && <CheckCircle style={{ width: 18, height: 18, color: '#fff', flexShrink: 0 }} />}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.55)', marginBottom: 8 }}>Describe the issue</p>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value.slice(0, 2000))}
              placeholder="Tell us what happened. Include date, employer name, or shift if relevant."
              rows={5}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                border: '1.5px solid rgba(0,0,0,0.1)', background: '#F5F5F5',
                fontSize: 14, color: '#111', outline: 'none', resize: 'vertical' as const,
                boxSizing: 'border-box' as const, fontFamily: FONT, lineHeight: 1.4,
                marginBottom: 6,
              }}
            />
            <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', textAlign: 'right' as const, marginBottom: 14 }}>{desc.length} / 2000</p>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626', margin: 0 }}>{error}</p>
              </div>
            )}

            <button onClick={submit} disabled={saving || !type || desc.trim().length < 10}
              style={{
                width: '100%', height: 54, borderRadius: 14, fontSize: 15, fontWeight: 800, border: 'none',
                background: !saving && type && desc.trim().length >= 10 ? '#111' : 'rgba(0,0,0,0.08)',
                color: !saving && type && desc.trim().length >= 10 ? '#fff' : 'rgba(0,0,0,0.3)',
                cursor: !saving && type && desc.trim().length >= 10 ? 'pointer' : 'default',
              }}>
              {saving ? 'Submitting…' : 'Submit Report'}
            </button>
            <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)', textAlign: 'center' as const, marginTop: 12 }}>
              The Switch ops team will review and respond within 24 hours.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
