'use client'
import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'
import { Search, Phone, MessageCircle, Users, UserCheck, Clock, Ban, Star } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const S2='#141414';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Worker {
  id: string; kycStatus: string; city: string | null; totalShifts: number; totalEarnings?: number; rating?: number
  user: { name: string; phone: string; isActive: boolean; createdAt?: string }
}

const KYC_COLORS: Record<string, string> = { PENDING: '#FBBF24', APPROVED: '#34D399', REJECTED: '#F87171' }
type SortKey = 'recent' | 'name' | 'shifts' | 'rating'

const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${n.toLocaleString('en-IN')}`
const waLink = (phone: string) => `https://wa.me/${phone.replace(/[^0-9]/g, '')}`

function WorkersList() {
  const router  = useRouter(); const params = useSearchParams()
  const [workers,  setWorkers]  = useState<Worker[]>([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [kycFilter,setKycFilter]= useState(params.get('kycStatus') || 'ALL')
  const [search,   setSearch]   = useState('')
  const [sort,     setSort]     = useState<SortKey>('recent')
  const [city,     setCity]     = useState('ALL')

  function load(status: string, p: number) {
    setLoading(true)
    const q = new URLSearchParams()
    if (status !== 'ALL') q.set('kycStatus', status)
    q.set('page', String(p))
    fetch(`/api/ops/workers?${q.toString()}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) { setWorkers(d.workers || []); setTotal(d.total || 0); setPages(d.pages || 1) } })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(kycFilter, page) }, [kycFilter, page])
  useEffect(() => { setPage(1) }, [kycFilter])

  async function approveKyc(id: string, status: string) {
    await fetch(`/api/ops/workers/${id}/kyc`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setWorkers(prev => prev.map(w => w.id === id ? { ...w, kycStatus: status } : w))
  }

  const cities = useMemo(() => Array.from(new Set(workers.map(w => w.city).filter(Boolean) as string[])).sort(), [workers])

  const kpis = useMemo(() => ({
    pending:  workers.filter(w => w.kycStatus === 'PENDING').length,
    approved: workers.filter(w => w.kycStatus === 'APPROVED').length,
    rejected: workers.filter(w => w.kycStatus === 'REJECTED').length,
    suspended: workers.filter(w => !w.user.isActive).length,
    shifts:   workers.reduce((s, w) => s + (w.totalShifts || 0), 0),
  }), [workers])

  const filtered = useMemo(() => {
    let list = workers
    if (city !== 'ALL') list = list.filter(w => w.city === city)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(w => (w.user.name || '').toLowerCase().includes(q) || (w.user.phone || '').includes(q))
    }
    const sorted = [...list]
    if (sort === 'name')   sorted.sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''))
    if (sort === 'shifts') sorted.sort((a, b) => (b.totalShifts || 0) - (a.totalShifts || 0))
    if (sort === 'rating') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0))
    return sorted
  }, [workers, city, search, sort])

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 0 16px', paddingTop: 'env(safe-area-inset-top,0px)' }}>
          <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0 }}>Workers</p>
          <p style={{ color: T2, fontSize: 12, margin: 0 }}>{total.toLocaleString('en-IN')} total</p>
        </div>

        {/* KPI tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
          {[
            { label: 'Pending',   value: kpis.pending,   Icon: Clock,     color: '#FBBF24' },
            { label: 'Approved',  value: kpis.approved,  Icon: UserCheck, color: '#34D399' },
            { label: 'Rejected',  value: kpis.rejected,  Icon: Ban,       color: '#F87171' },
            { label: 'Shifts',    value: kpis.shifts,    Icon: Users,     color: T1 },
          ].map(({ label, value, Icon, color }) => (
            <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <Icon style={{ width: 13, height: 13, color, opacity: 0.85, marginBottom: 4 }} />
              <p style={{ color: T1, fontWeight: 800, fontSize: 18, margin: 0, letterSpacing: -0.5 }}>{value.toLocaleString('en-IN')}</p>
              <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Search + sort + city */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
            <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T2 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or phone" style={{ width: '100%', background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px 10px 34px', color: T1, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {cities.length > 1 && (
            <select value={city} onChange={e => setCity(e.target.value)} style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 13, outline: 'none', cursor: 'pointer' }}>
              <option value="ALL">All cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: '10px 12px', color: T1, fontSize: 13, outline: 'none', cursor: 'pointer' }}>
            <option value="recent">Recent</option>
            <option value="name">Name A–Z</option>
            <option value="shifts">Most shifts</option>
            <option value="rating">Top rated</option>
          </select>
        </div>

        {/* KYC filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map(f => (
            <button key={f} onClick={() => setKycFilter(f)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${BD}`, cursor: 'pointer', background: kycFilter === f ? T1 : 'transparent', color: kycFilter === f ? '#000' : T2 }}>{f}</button>
          ))}
        </div>

        {loading ? <ListRowSkeleton count={6} dark /> :
          filtered.length === 0 ? <div style={{ color: T2, textAlign: 'center', paddingTop: 40, fontSize: 13 }}>No workers match</div> :
          filtered.map(w => (
            <div key={w.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 14, padding: '12px 14px', marginBottom: 8 }}>
              <div onClick={() => router.push(`/ops/workers/${w.id}`)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: 0 }}>{w.user.name || '—'}</p>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{w.user.phone} · {w.city || '—'}</p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ color: T2, fontSize: 12 }}>{w.totalShifts} shift{w.totalShifts === 1 ? '' : 's'}</span>
                    {(w.rating || 0) > 0 && <span style={{ color: '#FBBF24', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star style={{ width: 11, height: 11, fill: '#FBBF24' }} />{w.rating!.toFixed(1)}</span>}
                    {!w.user.isActive && <span style={{ color: '#F87171', fontSize: 11, fontWeight: 600 }}>SUSPENDED</span>}
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${KYC_COLORS[w.kycStatus] || T2}20`, color: KYC_COLORS[w.kycStatus] || T2, whiteSpace: 'nowrap' }}>{w.kycStatus}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <a href={`tel:${w.user.phone}`} title="Call" onClick={e => e.stopPropagation()} style={{ width: 38, height: 34, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: T1, textDecoration: 'none' }}><Phone style={{ width: 13, height: 13 }} /></a>
                <a href={waLink(w.user.phone)} target="_blank" rel="noopener noreferrer" title="WhatsApp" onClick={e => e.stopPropagation()} style={{ width: 38, height: 34, borderRadius: 10, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: '#34D399', textDecoration: 'none' }}><MessageCircle style={{ width: 13, height: 13 }} /></a>
                {w.kycStatus === 'PENDING' ? (
                  <>
                    <button onClick={() => approveKyc(w.id, 'APPROVED')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Approve</button>
                    <button onClick={() => approveKyc(w.id, 'REJECTED')} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reject</button>
                  </>
                ) : (
                  <a href={`/ops/workers/${w.id}`} style={{ flex: 1, padding: '8px', borderRadius: 10, border: `1px solid ${BD}`, color: T2, fontWeight: 700, fontSize: 13, textAlign: 'center', textDecoration: 'none' }}>View →</a>
                )}
              </div>
            </div>
          ))
        }

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: page <= 1 ? T2 : T1, fontSize: 13, fontWeight: 600, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}>← Prev</button>
            <span style={{ color: T2, fontSize: 13 }}>Page {page} of {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages} style={{ padding: '8px 14px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: page >= pages ? T2 : T1, fontSize: 13, fontWeight: 600, cursor: page >= pages ? 'not-allowed' : 'pointer', opacity: page >= pages ? 0.5 : 1 }}>Next →</button>
          </div>
        )}
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}

export default function WorkersPage() { return <Suspense><WorkersList /></Suspense> }
