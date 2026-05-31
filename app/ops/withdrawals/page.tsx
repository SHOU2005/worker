'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Phone, MessageCircle, Search, Clock, CheckCircle2, Ban } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const S2='#141414';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Worker { id: string; name: string; phone: string; city: string | null }
interface Withdrawal {
  id: string; workerId: string; upiId: string; amount: number; status: string
  requestedAt: string; processedAt: string | null; utr: string | null; notes: string | null
  worker: Worker | null
}

const STATUS_COLOR: Record<string, string> = { PENDING: '#FBBF24', PROCESSING: '#60A5FA', PAID: '#34D399', REJECTED: '#F87171' }
const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const waLink = (phone: string) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}`

export default function WithdrawalsPage() {
  const router = useRouter()
  const [items,   setItems]   = useState<Withdrawal[]>([])
  const [filter,  setFilter]  = useState('PENDING')
  const [search,  setSearch]  = useState('')
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [utr,     setUtr]     = useState('')

  function load(f = filter) {
    setLoading(true)
    fetch(`/api/ops/withdrawals?status=${f}`)
      .then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setItems(d.withdrawals || []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [filter])

  async function setStatus(id: string, status: string, extra: { utr?: string; notes?: string } = {}) {
    const res = await fetch('/api/ops/withdrawals', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, ...extra }),
    })
    if (!res.ok) return
    setActingId(null); setUtr('')
    load()
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.trim().toLowerCase()
    return items.filter(w =>
      (w.worker?.name || '').toLowerCase().includes(q) ||
      (w.worker?.phone || '').includes(q) ||
      w.upiId.includes(q)
    )
  }, [items, search])

  const kpis = useMemo(() => ({
    pending:    items.filter(w => w.status === 'PENDING').length,
    processing: items.filter(w => w.status === 'PROCESSING').length,
    paid:       items.filter(w => w.status === 'PAID').length,
    pendingAmt: items.filter(w => w.status === 'PENDING').reduce((s, w) => s + w.amount, 0),
  }), [items])

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Withdrawals</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Pending',    value: kpis.pending,         Icon: Clock,        color: '#FBBF24' },
            { label: 'Processing', value: kpis.processing,      Icon: Clock,        color: '#60A5FA' },
            { label: 'Paid',       value: kpis.paid,            Icon: CheckCircle2, color: '#34D399' },
            { label: 'Due',        value: fmt(kpis.pendingAmt), Icon: Ban,          color: T1 },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <Icon style={{ width: 13, height: 13, color, marginBottom: 4 }} />
              <p style={{ color: T1, fontWeight: 800, fontSize: typeof value === 'string' ? 14 : 18, margin: 0 }}>{value}</p>
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T2 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, UPI"
            style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px 10px 34px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {['PENDING', 'PROCESSING', 'PAID', 'REJECTED', 'ALL'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2 }}>{f}</button>
          ))}
        </div>

        {loading ? <ListRowSkeleton count={6} dark /> :
          filtered.length === 0 ? <div style={{ textAlign: 'center', paddingTop: 60 }}><p style={{ fontSize: 36 }}>💸</p><p style={{ color: T2 }}>No withdrawals match</p></div> :
          filtered.map(w => (
            <div key={w.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 16, margin: 0 }}>{w.worker?.name || 'Unknown'}</p>
                  <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>{w.worker?.phone}{w.worker?.city ? ` · ${w.worker.city}` : ''}</p>
                  <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>UPI: <span style={{ color: T1, fontWeight: 600 }}>{w.upiId}</span></p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: T1, fontWeight: 800, fontSize: 18, margin: 0 }}>{fmt(w.amount)}</p>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${STATUS_COLOR[w.status] || T2}20`, color: STATUS_COLOR[w.status] || T2 }}>{w.status}</span>
                </div>
              </div>

              <p style={{ color: T2, fontSize: 11, margin: '0 0 12px' }}>
                Requested {new Date(w.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {w.processedAt ? ` · Processed ${new Date(w.processedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                {w.utr ? ` · UTR ${w.utr}` : ''}
              </p>

              <div style={{ display: 'flex', gap: 6, marginBottom: w.status === 'PENDING' || w.status === 'PROCESSING' ? 10 : 0 }}>
                {w.worker?.phone && (
                  <>
                    <a href={`tel:${w.worker.phone}`} title="Call" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                      <Phone style={{ width: 14, height: 14, color: T1 }} />
                    </a>
                    <a href={waLink(w.worker.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                      <MessageCircle style={{ width: 14, height: 14, color: '#34D399' }} />
                    </a>
                  </>
                )}
              </div>

              {w.status === 'PENDING' && actingId !== w.id && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setStatus(w.id, 'PROCESSING')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#60A5FA', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Mark Processing</button>
                  <button onClick={() => setActingId(w.id)} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Mark Paid</button>
                  <button onClick={() => setStatus(w.id, 'REJECTED')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Reject</button>
                </div>
              )}

              {w.status === 'PROCESSING' && actingId !== w.id && (
                <button onClick={() => setActingId(w.id)} style={{ width: '100%', padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Mark Paid (add UTR)</button>
              )}

              {actingId === w.id && (
                <>
                  <input value={utr} onChange={e => setUtr(e.target.value)} placeholder="Bank UTR / Transaction ID"
                    style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 13, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setActingId(null); setUtr('') }} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T2, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => setStatus(w.id, 'PAID', { utr })} disabled={!utr.trim()} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: utr.trim() ? '#34D399' : 'rgba(52,211,153,0.3)', color: '#fff', fontWeight: 700, fontSize: 12, cursor: utr.trim() ? 'pointer' : 'default' }}>Confirm Paid</button>
                  </div>
                </>
              )}
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
