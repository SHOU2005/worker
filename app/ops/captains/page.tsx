'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Search, Phone, MessageCircle, Users, UserCheck, Clock, Ban, IndianRupee } from 'lucide-react'

const BG   = '#000000'; const S1 = '#0F0F0F'; const S2 = '#141414'
const BD   = 'rgba(255,255,255,0.08)'; const T1 = '#FFFFFF'; const T2 = 'rgba(255,255,255,0.4)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface Captain {
  id: string; name: string; phone: string; territory: string | null; status: string
  totalEarnings: number; pendingPayout: number; pendingCommissions: number; paidCommissions?: number; openTasks: number
  workerLeads?: number; employerLeads?: number; approvedWorkerLeads?: number
  joinedAt?: string
}

const STATUS_COLORS: Record<string, string> = { PENDING: '#FBBF24', ACTIVE: '#34D399', SUSPENDED: '#F87171' }
type SortKey = 'recent' | 'name' | 'earnings'

const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, '')}`

export default function OpsCapt() {
  const router = useRouter()
  const [captains, setCaptains] = useState<Captain[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('ALL')
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState<SortKey>('recent')

  useEffect(() => {
    fetch('/api/ops/captains').then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setCaptains(d.captains || []) }).finally(() => setLoading(false))
  }, [router])

  const kpis = useMemo(() => ({
    total:     captains.length,
    active:    captains.filter(c => c.status === 'ACTIVE').length,
    pending:   captains.filter(c => c.status === 'PENDING').length,
    suspended: captains.filter(c => c.status === 'SUSPENDED').length,
    earnings:  captains.reduce((s, c) => s + (c.totalEarnings || 0), 0),
    pendingPayout: captains.reduce((s, c) => s + (c.pendingPayout || 0), 0),
  }), [captains])

  const filtered = useMemo(() => {
    let list = filter === 'ALL' ? captains : captains.filter(c => c.status === filter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.territory || '').toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'earnings') sorted.sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0))
    return sorted
  }, [captains, filter, search, sort])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/ops/captains/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setCaptains(prev => prev.map(c => c.id === id ? { ...c, status } : c))
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Captains</p>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'Total',     value: kpis.total,     Icon: Users,     color: T1 },
            { label: 'Active',    value: kpis.active,    Icon: UserCheck, color: '#34D399' },
            { label: 'Pending',   value: kpis.pending,   Icon: Clock,     color: '#FBBF24' },
            { label: 'Suspended', value: kpis.suspended, Icon: Ban,       color: '#F87171' },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <Icon style={{ width: 13, height: 13, color, opacity: 0.85, marginBottom: 4 }} />
              <p style={{ color: T1, fontWeight: 800, fontSize: 18, margin: 0, letterSpacing: -0.5 }}>{value}</p>
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Earnings strip */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <IndianRupee style={{ width: 12, height: 12, color: T2 }} />
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Earnings paid</p>
            </div>
            <p style={{ color: T1, fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{fmt(kpis.earnings)}</p>
          </div>
          <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Clock style={{ width: 12, height: 12, color: '#FBBF24' }} />
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Pending payout</p>
            </div>
            <p style={{ color: T1, fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{fmt(kpis.pendingPayout)}</p>
          </div>
        </div>

        {/* Search + sort */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T2 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone, territory" style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px 10px 34px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 13, outline: 'none', cursor: 'pointer' }}>
            <option value="recent">Recent</option>
            <option value="name">Name A–Z</option>
            <option value="earnings">Top earnings</option>
          </select>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: filter === f ? T1 : 'transparent', color: filter === f ? '#000' : T2 }}>{f}</button>
          ))}
        </div>

        {loading ? <ListRowSkeleton count={6} dark /> :
          filtered.length === 0 ? <div style={{ color: T2, textAlign: 'center', paddingTop: 40, fontSize: 13 }}>No captains match</div> :
          filtered.map(c => {
            const totalLeads = (c.workerLeads ?? 0) + (c.employerLeads ?? 0)
            return (
            <div key={c.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`/ops/captains/${c.id}`} style={{ color: T1, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>{c.name || '—'}</a>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{c.phone} · {c.territory || 'No territory'}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ color: T2, fontSize: 12 }}>{fmt(c.totalEarnings || 0)} earned</span>
                    {c.pendingCommissions > 0 && <span style={{ color: '#FBBF24', fontSize: 12, fontWeight: 600 }}>{c.pendingCommissions} pending</span>}
                    {c.openTasks > 0 && <span style={{ color: '#60A5FA', fontSize: 12, fontWeight: 600 }}>{c.openTasks} task{c.openTasks > 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${STATUS_COLORS[c.status]}20`, color: STATUS_COLORS[c.status], whiteSpace: 'nowrap' }}>{c.status}</span>
              </div>

              {/* Lead funnel — workers + employers each captain has onboarded */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                <div style={{ background: S2, borderRadius: 10, padding: '8px 10px', border: `1px solid ${BD}` }}>
                  <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Worker leads</p>
                  <p style={{ color: T1, fontSize: 16, fontWeight: 800, margin: '2px 0 0' }}>
                    {c.workerLeads ?? 0}
                    {(c.approvedWorkerLeads ?? 0) > 0 && (
                      <span style={{ fontSize: 11, color: '#34D399', marginLeft: 6, fontWeight: 600 }}>· {c.approvedWorkerLeads} KYC ✓</span>
                    )}
                  </p>
                </div>
                <div style={{ background: S2, borderRadius: 10, padding: '8px 10px', border: `1px solid ${BD}` }}>
                  <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Employer leads</p>
                  <p style={{ color: T1, fontSize: 16, fontWeight: 800, margin: '2px 0 0' }}>{c.employerLeads ?? 0}</p>
                </div>
                <div style={{ background: S2, borderRadius: 10, padding: '8px 10px', border: `1px solid ${BD}` }}>
                  <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>Total</p>
                  <p style={{ color: totalLeads > 0 ? '#34D399' : T1, fontSize: 16, fontWeight: 800, margin: '2px 0 0' }}>{totalLeads}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`tel:${c.phone}`} title="Call" onClick={e => e.stopPropagation()} style={{ width: 38, height: 36, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: T1, textDecoration: 'none' }}><Phone style={{ width: 14, height: 14 }} /></a>
                <a href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" onClick={e => e.stopPropagation()} style={{ width: 38, height: 36, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#34D399', textDecoration: 'none' }}><MessageCircle style={{ width: 14, height: 14 }} /></a>
                {c.status === 'PENDING' && <button onClick={() => updateStatus(c.id, 'ACTIVE')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Activate</button>}
                {c.status === 'ACTIVE'  && <button onClick={() => updateStatus(c.id, 'SUSPENDED')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Suspend</button>}
                {c.status === 'SUSPENDED' && <button onClick={() => updateStatus(c.id, 'ACTIVE')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reactivate</button>}
                <a href={`/ops/captains/${c.id}`} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, color: T2, fontWeight: 700, fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>View →</a>
              </div>
            </div>
            )
          })
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
