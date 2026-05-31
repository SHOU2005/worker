'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Commission { id: string; amount: number; status: string; createdAt: string; captain: { user: { name: string; phone: string } }; booking: { shift: { title: string; date: string } } }

export default function CommissionsPage() {
  const router = useRouter()
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(true)
  const [approving,   setApproving]   = useState(false)

  useEffect(() => {
    fetch('/api/ops/commissions?status=PENDING').then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setCommissions(d.commissions || []) }).finally(() => setLoading(false))
  }, [router])

  function toggle(id: string) { setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  function toggleAll() { setSelected(selected.size === commissions.length ? new Set() : new Set(commissions.map(c => c.id))) }

  async function approve() {
    if (!selected.size) return
    setApproving(true)
    await fetch('/api/ops/commissions/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected] }) })
    setCommissions(prev => prev.filter(c => !selected.has(c.id)))
    setSelected(new Set())
    setApproving(false)
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingTop: 'env(safe-area-inset-top,0px)' }}>
          <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0 }}>Commissions</p>
          {selected.size > 0 && (
            <button onClick={approve} disabled={approving} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: T1, color: '#000000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {approving ? 'Approving…' : `Approve ${selected.size}`}
            </button>
          )}
        </div>
        {commissions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <input type="checkbox" checked={selected.size === commissions.length} onChange={toggleAll} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <span style={{ color: T2, fontSize: 13 }}>Select all ({commissions.length})</span>
          </div>
        )}
        {loading ? <ListRowSkeleton count={6} dark /> :
          commissions.length === 0 ? <p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>No pending commissions</p> :
          commissions.map(c => (
            <div key={c.id} onClick={() => toggle(c.id)} style={{ background: selected.has(c.id) ? 'rgba(255,255,255,0.06)' : S1, border: `1px solid ${selected.has(c.id) ? 'rgba(255,255,255,0.3)' : BD}`, borderRadius: 14, padding: '14px 16px', marginBottom: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="checkbox" checked={selected.has(c.id)} readOnly style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ color: T1, fontWeight: 700, fontSize: 15, margin: 0 }}>{c.captain?.user?.name}</p>
                <p style={{ color: T2, fontSize: 13, margin: '2px 0' }}>{c.booking?.shift?.title}</p>
                <p style={{ color: T2, fontSize: 12, margin: 0 }}>{new Date(c.createdAt).toLocaleDateString('en-IN')}</p>
              </div>
              <p style={{ color: '#34D399', fontWeight: 800, fontSize: 18, margin: 0 }}>₹{c.amount}</p>
            </div>
          ))
        }
        <a href="/ops/payouts" style={{ display: 'block', marginTop: 16, padding: '12px', borderRadius: 12, border: `1px solid ${BD}`, color: T2, textAlign: 'center', textDecoration: 'none', fontSize: 14 }}>
          View Approved → Pay Out
        </a>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
