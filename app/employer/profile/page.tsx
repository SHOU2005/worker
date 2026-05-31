'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Calendar, Wallet, BadgePercent, HelpCircle, Gift, MapPin, Settings, FileText, LogOut, AlertCircle, Plus, MoreHorizontal } from 'lucide-react'
import { toastError, toastSuccess } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const ACC   = '#A78BFA'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

type Profile = {
  name: string
  phone: string
  employerProfile?: {
    companyName?:  string
    businessType?: string
    address?:      string
    flat?:         string
    tower?:        string
    city?:         string
    gstNumber?:    string
    totalShifts:   number
    rating:        number
    createdAt?:    string
  }
}

type SavedAddress = {
  id:       string
  label:    string
  address:  string
  selected: boolean
}

export default function EmployerProfilePage() {
  const router = useRouter()
  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [walletBal,  setWalletBal]  = useState<number | null>(null)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState({ companyName: '', businessType: '', address: '', flat: '', tower: '', city: '', gstNumber: '', name: '' })
  const [saving,     setSaving]     = useState(false)
  const [showLogout, setShowLogout] = useState(false)
  const [showAddrs,  setShowAddrs]  = useState(false)

  useEffect(() => {
    fetch('/api/employer/profile').then(r => {
      if (r.status === 401) { router.replace('/employer/login'); return r.json() }
      return r.json()
    }).then(d => {
      const u = d?.user || d?.profile
      if (!u) return
      setProfile(u)
      const ep = u.employerProfile
      setDraft({
        name:         u.name           || '',
        companyName:  ep?.companyName  || '',
        businessType: ep?.businessType || '',
        address:      ep?.address      || '',
        flat:         ep?.flat         || '',
        tower:        ep?.tower        || '',
        city:         ep?.city         || '',
        gstNumber:    ep?.gstNumber    || '',
      })
    }).catch(() => {})

    // Fetch the real wallet balance for the My Wallet card. Best-effort —
    // falls back to 0 if the endpoint isn't available.
    fetch('/api/employer/wallet').then(r => r.ok ? r.json() : null).then(d => {
      setWalletBal(typeof d?.balance === 'number' ? d.balance : 0)
    }).catch(() => setWalletBal(0))
  }, [router])

  async function saveEdit() {
    setSaving(true)
    try {
      const res = await fetch('/api/employer/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(draft),
      })
      if (!res.ok) throw new Error('Save failed')
      setProfile(p => p ? {
        ...p,
        name: draft.name || p.name,
        employerProfile: {
          ...(p.employerProfile || { totalShifts: 0, rating: 0 }),
          ...draft,
        },
      } : p)
      setEditing(false)
      toastSuccess('Profile updated')
    } catch (err: any) {
      toastError(err?.message || 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    try { sessionStorage.clear() } catch {}
    window.location.replace('/employer/login')
  }

  if (!profile) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ color: T2, fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  const ep       = profile.employerProfile
  const bizName  = ep?.companyName || profile.name || 'My Business'
  const displayName = profile.name || bizName
  const initial  = displayName[0]?.toUpperCase() || 'B'
  const isHome   = (ep?.businessType || '').trim() === 'Personal / Individual'

  // Profile completion logic: required fields are address + city. Business
  // accounts also need companyName + businessType. Banner only shows when
  // something is missing — completed profiles get no nag.
  const missing = [
    ep?.address || '',
    ep?.city    || '',
    ...(isHome ? [] : [ep?.companyName || '', ep?.businessType || '']),
  ].filter(v => !v.trim()).length
  const incomplete = missing > 0

  // Static saved addresses derived from profile. A future iteration would
  // pull from a SavedAddress table; for v1 we surface the single profile
  // address so the Saved Addresses sheet has something to render.
  const savedAddresses: SavedAddress[] = ep?.address
    ? [{ id: 'profile', label: isHome ? 'Home' : 'Business', selected: true, address: [ep.flat, ep.tower, ep.address, ep.city].filter(Boolean).join(', ') }]
    : []

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(16px + env(safe-area-inset-top)) 18px 8px' }}>
        <button onClick={() => router.push('/employer')} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 24, height: 24 }} />
        </button>
        <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>Profile</div>
      </div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '24px 16px 28px' }}>
        <div style={{
          width: 92, height: 92, borderRadius: 46,
          background: `linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T1, fontWeight: 900, fontSize: 36,
          border: '2px solid rgba(255,255,255,0.18)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}>{initial}</div>
        <button onClick={() => setEditing(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: T1, fontFamily: FONT }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.3 }}>{displayName}</span>
          <ChevronRight style={{ width: 18, height: 18, color: T2 }} />
        </button>
        <div style={{ fontSize: 13, color: T2 }}>+91 {profile.phone}</div>
      </div>

      <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Incomplete profile banner */}
        {incomplete && (
          <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 14px 14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: T1, flexShrink: 0, boxShadow: '0 0 8px rgba(255,255,255,0.55)' }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>Your profile is incomplete</div>
            </div>
            <button onClick={() => setEditing(true)}
              style={{ padding: '8px 18px', borderRadius: 12, background: T1, border: 'none', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: FONT }}>
              Complete
            </button>
          </div>
        )}

        {/* 2x2 grid of feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <Tile
            tint={T1}
            icon={<Calendar style={{ width: 18, height: 18, color: T1 }} />}
            title="My Bookings"
            subtitle="View all bookings"
            onClick={() => router.push('/employer/jobs')}
          />
          <Tile
            tint={T1}
            icon={<Wallet style={{ width: 18, height: 18, color: T1 }} />}
            title="My Wallet"
            subtitle={`₹${walletBal ?? 0}`}
            onClick={() => router.push('/employer/wallet')}
          />
          <Tile
            tint={T1}
            icon={<BadgePercent style={{ width: 18, height: 18, color: T1 }} />}
            title="All Offers"
            subtitle="No active offers"
            onClick={() => router.push('/employer/offers')}
          />
          <Tile
            tint={T1}
            icon={<HelpCircle style={{ width: 18, height: 18, color: T1 }} />}
            title="Help & Support"
            subtitle="Get Quick Help"
            onClick={() => router.push('/employer/support')}
          />
        </div>

        {/* Refer banner */}
        <button onClick={() => router.push('/employer/refer')}
          style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT, color: T1 }}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gift style={{ width: 22, height: 22, color: T1 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T1 }}>Earn ₹150</div>
            <div style={{ fontSize: 13, color: T2, marginTop: 2 }}>Refer your friends and earn now</div>
          </div>
          <ChevronRight style={{ width: 18, height: 18, color: T3, flexShrink: 0 }} />
        </button>

        {/* Manage Account section */}
        <div style={{ fontSize: 15, fontWeight: 800, color: T2, padding: '14px 4px 6px', letterSpacing: -0.2 }}>
          Manage Account
        </div>
        <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, overflow: 'hidden' }}>
          <ListRow
            icon={<MapPin style={{ width: 18, height: 18, color: T1 }} />}
            label="Saved Addresses"
            sub={savedAddresses.length > 0 ? `${savedAddresses.length} saved` : 'No addresses yet'}
            onClick={() => setShowAddrs(true)}
          />
          <Divider />
          <ListRow
            icon={<Settings style={{ width: 18, height: 18, color: T1 }} />}
            label={isHome ? 'Home details' : 'Business details'}
            sub="Edit address, GST and more"
            onClick={() => setEditing(true)}
          />
          <Divider />
          <ListRow
            icon={<FileText style={{ width: 18, height: 18, color: T1 }} />}
            label="Terms & Privacy"
            sub="How Switch works and how we handle your data"
            onClick={() => router.push('/legal')}
          />
          <Divider />
          <ListRow
            icon={<LogOut style={{ width: 18, height: 18, color: '#EF4444' }} />}
            label="Sign out"
            sub="Sign out of your account"
            danger
            onClick={() => setShowLogout(true)}
          />
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: T3, padding: '12px 0 0' }}>Switch v2.0.0</div>
      </div>

      {/* Edit details sheet */}
      {editing && (
        <BottomSheet onClose={() => setEditing(false)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: T1 }}>{isHome ? 'Home details' : 'Business details'}</div>
            <button onClick={() => setEditing(false)}
              style={{ width: 32, height: 32, borderRadius: 16, background: SURF2, border: `1px solid ${BD}`, color: T1, fontSize: 16, cursor: 'pointer', fontFamily: FONT }}>×</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Name" value={draft.name} onChange={v => setDraft(d => ({ ...d, name: v }))} />
            {!isHome && <Field label="Business Name"  value={draft.companyName}  onChange={v => setDraft(d => ({ ...d, companyName: v }))} />}
            {!isHome && <Field label="Business Type"  value={draft.businessType} onChange={v => setDraft(d => ({ ...d, businessType: v }))} />}
            <Field label="Flat / House No." value={draft.flat}    onChange={v => setDraft(d => ({ ...d, flat: v }))} />
            <Field label="Tower / Building" value={draft.tower}   onChange={v => setDraft(d => ({ ...d, tower: v }))} />
            <Field label="Address" value={draft.address} onChange={v => setDraft(d => ({ ...d, address: v }))} multiline />
            <Field label="City"    value={draft.city}    onChange={v => setDraft(d => ({ ...d, city: v }))} />
            {!isHome && <Field label="GST Number" value={draft.gstNumber} onChange={v => setDraft(d => ({ ...d, gstNumber: v }))} />}
          </div>

          <button onClick={saveEdit} disabled={saving}
            style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 14, background: T1, color: '#000', fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer', fontFamily: FONT, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </BottomSheet>
      )}

      {/* Saved addresses sheet */}
      {showAddrs && (
        <BottomSheet onClose={() => setShowAddrs(false)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: T1 }}>Saved Addresses</div>
            <button onClick={() => { setShowAddrs(false); setEditing(true) }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, background: SURF2, border: `1px solid ${BD}`, color: T1, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FONT }}>
              <Plus style={{ width: 14, height: 14 }} /> Add address
            </button>
          </div>
          {savedAddresses.length === 0 ? (
            <div style={{ padding: '32px 8px', textAlign: 'center', color: T2, fontSize: 14 }}>No saved addresses yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {savedAddresses.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', gap: 12, padding: '14px 4px', borderTop: i === 0 ? 'none' : `1px solid ${BD}` }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MapPin style={{ width: 16, height: 16, color: T1 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: T1 }}>{a.label}</span>
                      {a.selected && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#22C55E', background: 'rgba(34,197,94,0.14)', padding: '3px 8px', borderRadius: 99, letterSpacing: 0.4 }}>SELECTED</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: T2, marginTop: 4, lineHeight: 1.45 }}>{a.address}</div>
                  </div>
                  <button onClick={() => { setShowAddrs(false); setEditing(true) }} aria-label="More"
                    style={{ width: 32, height: 32, borderRadius: 16, background: SURF2, border: `1px solid ${BD}`, color: T2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                    <MoreHorizontal style={{ width: 16, height: 16 }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </BottomSheet>
      )}

      {/* Logout sheet */}
      {showLogout && (
        <BottomSheet onClose={() => setShowLogout(false)}>
          <div style={{ fontSize: 22, fontWeight: 900, color: T1, marginBottom: 10 }}>Sign out?</div>
          <div style={{ fontSize: 14, color: T2, marginBottom: 24 }}>You'll need to log in again to manage your bookings.</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setShowLogout(false)}
              style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: FONT }}>Cancel</button>
            <button onClick={handleLogout}
              style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: '1px solid #EF4444', background: '#EF4444', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: FONT }}>Sign Out</button>
          </div>
        </BottomSheet>
      )}

    </div>
  )
}

function Tile({ tint, icon, title, subtitle, onClick }: { tint: string; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 18, padding: 16, textAlign: 'left' as const, fontFamily: FONT, color: T1, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 110 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${tint}26`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <ChevronRight style={{ width: 16, height: 16, color: T3 }} />
      </div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: T1, letterSpacing: -0.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>{subtitle}</div>
      </div>
    </button>
  )
}

function ListRow({ icon, label, sub, onClick, danger }: { icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT }}>
      <div style={{ width: 36, height: 36, borderRadius: 18, background: danger ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: danger ? '#EF4444' : T1, letterSpacing: -0.2 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>{sub}</div>}
      </div>
      <ChevronRight style={{ width: 16, height: 16, color: T3, flexShrink: 0 }} />
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: BD, margin: '0 16px' }} />
}

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>{label}</div>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
          style={{ width: '100%', background: SURF2, border: `1px solid ${BD}`, borderRadius: 12, padding: '11px 14px', color: T1, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: FONT, minHeight: 64 }} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: '100%', background: SURF2, border: `1px solid ${BD}`, borderRadius: 12, padding: '11px 14px', color: T1, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const, fontFamily: FONT }} />
      )}
    </div>
  )
}

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: BG, borderRadius: '24px 24px 0 0', padding: '20px 20px calc(28px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, border: `1px solid ${BD}`, borderBottom: 'none', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 2, background: BD, margin: '0 auto 18px' }} />
        {children}
      </div>
    </div>
  )
}
