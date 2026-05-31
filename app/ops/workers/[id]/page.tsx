'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'
import { Phone, MessageCircle, MapPin, Calendar, IndianRupee, Briefcase, Star, ShieldCheck, Video } from 'lucide-react'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

const KYC_COLOR: Record<string, string> = { PENDING: '#FBBF24', APPROVED: '#34D399', REJECTED: '#F87171' }
const STATUS_COLOR: Record<string, string> = { COMPLETED: '#34D399', PENDING: '#FBBF24', CANCELLED: '#F87171', IN_PROGRESS: '#60A5FA' }

const fmt = (n: number) => n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${(n || 0).toLocaleString('en-IN')}`
const waLink = (phone: string) => `https://wa.me/${(phone || '').replace(/[^0-9]/g, '')}`

interface Worker {
  id: string; kycStatus: string; city: string | null; totalShifts: number; totalEarnings: number
  skills: string[]; aadhaarNumber: string | null; aadhaarVerified: boolean; videoVerified: boolean
  hourlyRate: number; rating: number; captainReferralId: string | null
  user: { id: string; name: string; phone: string; isActive: boolean; createdAt: string }
  bookings: { id: string; status: string; totalAmount: number; createdAt: string; shift: { title: string; startTime: string }; employer: { name: string } }[]
}

export default function WorkerDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [worker,    setWorker]    = useState<Worker | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [toggling,  setToggling]  = useState(false)
  const [kycAction, setKycAction] = useState(false)

  useEffect(() => {
    fetch(`/api/ops/workers/${id}`).then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d?.worker) setWorker(d.worker) }).finally(() => setLoading(false))
  }, [id, router])

  async function toggleSuspend() {
    if (!worker) return
    setToggling(true)
    await fetch(`/api/ops/workers/${id}/suspend`, { method: 'PATCH' })
    setWorker(prev => prev ? { ...prev, user: { ...prev.user, isActive: !prev.user.isActive } } : prev)
    setToggling(false)
  }

  async function setKyc(status: string) {
    setKycAction(true)
    await fetch(`/api/ops/workers/${id}/kyc`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setWorker(prev => prev ? { ...prev, kycStatus: status } : prev)
    setKycAction(false)
  }

  if (loading) return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <div style={{ color: T2, textAlign: 'center', paddingTop: 60 }}>Loading…</div>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )

  if (!worker) return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0 }} className="ops-content">
        <p style={{ color: T2, textAlign: 'center', paddingTop: 60 }}>Worker not found</p>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )

  const phone = worker.user.phone
  const completedBookings = worker.bookings.filter(b => b.status === 'COMPLETED').length
  const cancelledBookings = worker.bookings.filter(b => b.status === 'CANCELLED').length

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0, maxWidth: 760 }} className="ops-content">

        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: T2, fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 12, paddingTop: 'env(safe-area-inset-top,0px)' }}>← Back</button>

        {/* Header card */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 18, padding: '18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: -0.5 }}>{worker.user.name || '—'}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, color: T2, fontSize: 13 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Phone style={{ width: 11, height: 11 }} />{phone}</span>
                {worker.city && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin style={{ width: 11, height: 11 }} />{worker.city}</span>}
                {worker.user.createdAt && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar style={{ width: 11, height: 11 }} />Joined {new Date(worker.user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: `${KYC_COLOR[worker.kycStatus] || T2}20`, color: KYC_COLOR[worker.kycStatus] || T2, whiteSpace: 'nowrap' }}>{worker.kycStatus}</span>
              {!worker.user.isActive && <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#F8717120', color: '#F87171' }}>SUSPENDED</span>}
            </div>
          </div>

          {/* Quick contact */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <a href={`tel:${phone}`} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Phone style={{ width: 13, height: 13 }} />Call</a>
            <a href={waLink(phone)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#34D399', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><MessageCircle style={{ width: 13, height: 13 }} />WhatsApp</a>
          </div>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Shifts',    value: worker.totalShifts,   Icon: Briefcase },
              { label: 'Earnings',  value: fmt(worker.totalEarnings), Icon: IndianRupee },
              { label: 'Rating',    value: worker.rating > 0 ? `${worker.rating.toFixed(1)}★` : '—', Icon: Star },
              { label: '₹/hr',      value: worker.hourlyRate ? `₹${worker.hourlyRate}` : '—', Icon: IndianRupee },
            ].map(({ label, value, Icon }) => (
              <div key={label} style={{ background: '#1A1A1A', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                <Icon style={{ width: 12, height: 12, color: T2, marginBottom: 3 }} />
                <p style={{ color: T1, fontWeight: 700, fontSize: 14, margin: 0 }}>{value}</p>
                <p style={{ color: T2, fontSize: 10, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Verification badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: worker.aadhaarVerified ? '#34D39920' : '#F8717120', color: worker.aadhaarVerified ? '#34D399' : '#F87171', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ShieldCheck style={{ width: 11, height: 11 }} />Aadhaar {worker.aadhaarVerified ? '✓' : '✗'}
            </span>
            <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: worker.videoVerified ? '#34D39920' : '#F8717120', color: worker.videoVerified ? '#34D399' : '#F87171', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Video style={{ width: 11, height: 11 }} />Video {worker.videoVerified ? '✓' : '✗'}
            </span>
            {worker.captainReferralId && <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600, background: '#2563EB20', color: '#60A5FA' }}>Captain Referred</span>}
          </div>

          {/* Skills */}
          {worker.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {worker.skills.map(s => (
                <span key={s} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: T2, fontWeight: 600 }}>{s}</span>
              ))}
            </div>
          )}

          {/* KYC actions */}
          {worker.kycStatus === 'PENDING' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setKyc('APPROVED')} disabled={kycAction} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: '#34D399', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Approve KYC</button>
              <button onClick={() => setKyc('REJECTED')} disabled={kycAction} style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${BD}`, background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Reject KYC</button>
            </div>
          )}

          {/* Suspend toggle */}
          <button onClick={toggleSuspend} disabled={toggling} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${worker.user.isActive ? '#F87171' : '#34D399'}`, background: 'transparent', color: worker.user.isActive ? '#F87171' : '#34D399', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {toggling ? '…' : worker.user.isActive ? 'Suspend Worker' : 'Unsuspend Worker'}
          </button>
        </div>

        {/* Booking summary */}
        {worker.bookings.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Completed', value: completedBookings, color: '#34D399' },
              { label: 'Cancelled', value: cancelledBookings, color: '#F87171' },
              { label: 'Total',     value: worker.bookings.length, color: T1 },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
                <p style={{ color, fontWeight: 800, fontSize: 18, margin: 0, letterSpacing: -0.5 }}>{value}</p>
                <p style={{ color: T2, fontSize: 10, margin: 0, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Booking history */}
        <p style={{ color: T2, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Booking History</p>
        {worker.bookings.length === 0
          ? <p style={{ color: T2, fontSize: 14, textAlign: 'center', paddingTop: 20 }}>No bookings yet</p>
          : worker.bookings.map(b => (
            <div key={b.id} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: T1, fontWeight: 600, fontSize: 14, margin: 0 }}>{b.shift.title}</p>
                  <p style={{ color: T2, fontSize: 12, margin: '2px 0 0' }}>{b.employer.name} · {new Date(b.shift.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: `${STATUS_COLOR[b.status] || T2}20`, color: STATUS_COLOR[b.status] || T2 }}>{b.status}</span>
                  <p style={{ color: T1, fontWeight: 700, fontSize: 13, margin: '4px 0 0' }}>{fmt(b.totalAmount)}</p>
                </div>
              </div>
            </div>
          ))
        }
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
