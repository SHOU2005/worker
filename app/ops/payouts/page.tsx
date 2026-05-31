'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListRowSkeleton } from '@/components/shared/Skeleton'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

interface Commission { id: string; amount: number; createdAt: string; captain: { id: string; user: { name: string; phone: string } } }

export default function PayoutsPage() {
  const router = useRouter()
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading,     setLoading]     = useState(true)
  const [paying,      setPaying]      = useState(false)

  useEffect(() => {
    fetch('/api/ops/commissions?status=APPROVED').then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d) setCommissions(d.commissions || []) }).finally(() => setLoading(false))
  }, [router])

  // Group by captain
  const byCaptain: Record<string, { name: string; phone: string; total: number; ids: string[] }> = {}
  for (const c of commissions) {
    const cid = c.captain.id
    if (!byCaptain[cid]) byCaptain[cid] = { name: c.captain.user.name, phone: c.captain.user.phone, total: 0, ids: [] }
    byCaptain[cid].total += c.amount
    byCaptain[cid].ids.push(c.id)
  }

  async function pay(ids: string[]) {
    setPaying(true)
    await fetch('/api/ops/commissions/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
    setCommissions(prev => prev.filter(c => !ids.includes(c.id)))
    setPaying(false)
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 8px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Payouts</p>
        <p style={{ color: T2, fontSize: 14, marginBottom: 20 }}>Approved commissions ready for payment</p>
        {loading ? <ListRowSkeleton count={6} dark /> :
          Object.entries(byCaptain).length === 0 ? <p style={{ color: T2, textAlign: 'center', paddingTop: 40 }}>No approved payouts pending</p> :
          Object.entries(byCaptain).map(([cid, data]) => (
            <div key={cid} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 16, padding: '16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 16, margin: 0 }}>{data.name}</p>
                  <p style={{ color: T2, fontSize: 13, margin: '2px 0 0' }}>{data.phone} · {data.ids.length} commissions</p>
                </div>
                <p style={{ color: '#34D399', fontWeight: 800, fontSize: 22, margin: 0 }}>₹{data.total}</p>
              </div>
              <button onClick={() => pay(data.ids)} disabled={paying} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                {paying ? 'Processing…' : `Mark ₹${data.total} as Paid`}
              </button>
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
