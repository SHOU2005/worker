'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Plus, Trash2, Save, RotateCcw, Tag } from 'lucide-react'

const FONT = '"DM Sans", system-ui, sans-serif'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.5)'
const T3   = 'rgba(255,255,255,0.25)'
const BD   = 'rgba(255,255,255,0.08)'
const S1   = '#0F0F0F'
const S2   = '#161616'

type Promo = {
  code:         string
  type:         'flat' | 'percent'
  amount:       number
  minSpend?:    number | null
  maxDiscount?: number | null
  description:  string
  active:       boolean
}

const blank = (): Promo => ({ code: '', type: 'percent', amount: 10, minSpend: 0, maxDiscount: undefined, description: '', active: true })

export default function OpsPromosPage() {
  const router = useRouter()
  const [promos, setPromos] = useState<Promo[]>([])
  const [original, setOriginal] = useState<string>('[]')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]  = useState(false)
  const [error, setError]    = useState('')
  const [toast, setToast]    = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/promos')
      if (res.status === 401) { router.replace('/ops/login'); return }
      const d = await res.json()
      setPromos(d.promos || [])
      setOriginal(JSON.stringify(d.promos || []))
    } catch { setError('Failed to load promos') }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function update(i: number, patch: Partial<Promo>) {
    setPromos(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }
  function remove(i: number) {
    setPromos(prev => prev.filter((_, idx) => idx !== i))
  }
  function addNew() {
    setPromos(prev => [...prev, blank()])
  }

  const isDirty = JSON.stringify(promos) !== original

  async function save() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/ops/promos', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ promos }),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Save failed')
        return
      }
      setPromos(d.promos)
      setOriginal(JSON.stringify(d.promos))
      setToast('Promos saved')
      setTimeout(() => setToast(''), 1800)
    } catch { setError('Network error') }
    setSaving(false)
  }

  return (
    <div style={{ fontFamily: FONT, background: '#000', minHeight: '100vh', color: T1, paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />

      <div style={{ padding: '20px 20px 0', maxWidth: 880 }} className="ops-content">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ color: T2, fontSize: 13, margin: 0 }}>Operations</p>
            <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '2px 0 0', letterSpacing: -0.5 }}>Promo Codes</p>
          </div>
          <button onClick={save} disabled={!isDirty || saving}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 12,
              background: isDirty ? '#10B981' : 'rgba(255,255,255,0.06)',
              color: isDirty ? '#FFF' : T3, fontWeight: 700, fontSize: 13, border: 'none',
              cursor: isDirty && !saving ? 'pointer' : 'default', opacity: saving ? 0.6 : 1 }}>
            <Save style={{ width: 14, height: 14 }} />
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: '#FCA5A5', margin: 0 }}>{error}</p>
          </div>
        )}
        {toast && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
            <p style={{ fontSize: 13, color: '#6EE7B7', margin: 0 }}>{toast}</p>
          </div>
        )}

        {loading ? (
          <ListRowSkeleton count={4} dark />
        ) : promos.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T2 }}>
            <Tag style={{ width: 24, height: 24, margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
            <p style={{ margin: 0, fontSize: 14 }}>No promo codes yet. Add your first one below.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {promos.map((p, i) => (
              <div key={i} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <input value={p.code} onChange={e => update(i, { code: e.target.value.toUpperCase() })}
                    placeholder="CODE"
                    style={{ flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 14, fontWeight: 800, letterSpacing: 1, outline: 'none' }} />
                  <button type="button" onClick={() => update(i, { active: !p.active })}
                    style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                      background: p.active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                      color:      p.active ? '#10B981' : T2,
                      border: `1px solid ${p.active ? 'rgba(16,185,129,0.35)' : BD}`, cursor: 'pointer' }}>
                    {p.active ? 'ACTIVE' : 'INACTIVE'}
                  </button>
                  <button type="button" onClick={() => remove(i)}
                    style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 style={{ width: 14, height: 14, color: '#F87171' }} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Type</label>
                    <select value={p.type} onChange={e => update(i, { type: e.target.value as Promo['type'] })}
                      style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '9px 12px', color: T1, fontSize: 13, outline: 'none' }}>
                      <option value="percent" style={{ color: '#000' }}>Percent off (%)</option>
                      <option value="flat"    style={{ color: '#000' }}>Flat amount (₹)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>
                      {p.type === 'percent' ? 'Percent (%)' : 'Discount (₹)'}
                    </label>
                    <input type="number" min={1} max={p.type === 'percent' ? 100 : 10000} value={p.amount}
                      onChange={e => update(i, { amount: parseFloat(e.target.value || '0') })}
                      style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '9px 12px', color: T1, fontSize: 13, outline: 'none' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Min cart (₹)</label>
                    <input type="number" min={0} value={p.minSpend ?? 0}
                      onChange={e => update(i, { minSpend: parseFloat(e.target.value || '0') })}
                      style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '9px 12px', color: T1, fontSize: 13, outline: 'none' }} />
                  </div>
                  {p.type === 'percent' && (
                    <div>
                      <label style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Max discount (₹) <span style={{ color: T3, fontWeight: 500 }}>optional</span></label>
                      <input type="number" min={0} value={p.maxDiscount ?? ''}
                        onChange={e => update(i, { maxDiscount: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="No cap"
                        style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '9px 12px', color: T1, fontSize: 13, outline: 'none' }} />
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Description (shown to user)</label>
                  <input value={p.description} onChange={e => update(i, { description: e.target.value })}
                    placeholder="e.g. First booking — 15% off"
                    style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '9px 12px', color: T1, fontSize: 13, outline: 'none' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={addNew}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 14px', borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', color: T1, fontWeight: 700, fontSize: 14, border: `1px dashed ${BD}`, cursor: 'pointer' }}>
            <Plus style={{ width: 16, height: 16 }} /> Add promo code
          </button>
          {isDirty && (
            <button onClick={() => { setPromos(JSON.parse(original)); setError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', borderRadius: 12,
                background: 'transparent', color: T2, fontWeight: 700, fontSize: 13, border: `1px solid ${BD}`, cursor: 'pointer' }}>
              <RotateCcw style={{ width: 14, height: 14 }} /> Discard changes
            </button>
          )}
        </div>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
