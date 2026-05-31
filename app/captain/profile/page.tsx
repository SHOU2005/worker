'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import { Copy, Check } from 'lucide-react'
import { useLanguage } from '../LanguageContext'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.45)'
const BD   = 'rgba(0,0,0,0.08)'
const FONT = '"DM Sans", system-ui, sans-serif'

interface Profile {
  name: string
  phone: string
  captainProfile: {
    status: string
    territory: string | null
    totalEarnings: number
    pendingPayout: number
    joinedAt: string
    referralCode: string | null
  } | null
}

export default function CaptainProfilePage() {
  const router  = useRouter()
  const { t }   = useLanguage()
  const [profile,  setProfile]  = useState<Profile | null>(null)
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState('')
  const [city,     setCity]     = useState('')
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [copied,   setCopied]   = useState(false)

  useEffect(() => {
    fetch('/api/captain/profile').then(r => {
      if (r.status === 401) { router.replace('/captain/login'); return null }
      return r.json()
    }).then(d => {
      if (!d) return
      setProfile(d.user)
      setName(d.user.name)
      setCity(d.user.captainProfile?.territory || '')
    }).finally(() => setLoading(false))
  }, [router])

  async function save() {
    setSaving(true)
    await fetch('/api/captain/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, city }) })
    setSaving(false); setEditing(false)
    setProfile(prev => prev ? { ...prev, name, captainProfile: prev.captainProfile ? { ...prev.captainProfile, territory: city } : null } : null)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    try { sessionStorage.clear() } catch {}
    // Hard navigation so React state (profile, dashboard) is fully discarded.
    window.location.replace('/captain/login')
  }

  function copyCode() {
    const code = profile?.captainProfile?.referralCode
    if (!code) return
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (loading) return <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T2 }}>{t('loading')}</div>

  const cp = profile?.captainProfile

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('profile')} />
      <div style={{ padding: '24px 20px' }}>

        {/* Avatar + name */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 28, margin: '0 auto 12px' }}>
            {profile?.name?.[0]?.toUpperCase()}
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: T1, margin: '0 0 4px' }}>{profile?.name}</p>
          <p style={{ color: T2, fontSize: 14, margin: 0 }}>{profile?.phone}</p>
          <span style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: '#F5F5F5', color: T1, border: `1px solid ${BD}` }}>
            {cp?.status || 'PENDING'}
          </span>
        </div>

        {/* Referral Code */}
        {cp?.referralCode && (
          <div style={{ background: T1, borderRadius: 16, padding: '16px 18px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.2, margin: '0 0 8px' }}>{t('referralCode')}</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 26, fontWeight: 900, color: '#FFFFFF', margin: 0, letterSpacing: 4, fontFamily: '"Courier New", monospace' }}>{cp.referralCode}</p>
              <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '8px 0 0' }}>{t('referralEarn')}</p>
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {[
            { label: t('territory'),         value: cp?.territory || t('notAssigned') },
            { label: t('totalEarned'),        value: `₹${cp?.totalEarnings ?? 0}` },
            { label: t('pendingPayoutLabel'), value: `₹${cp?.pendingPayout ?? 0}` },
            { label: t('memberSince'),        value: cp?.joinedAt ? new Date(cp.joinedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#F7F7F7', borderRadius: 14, padding: '14px 16px' }}>
              <p style={{ fontSize: 11, color: T2, margin: '0 0 4px' }}>{label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: T1, margin: 0 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Edit form */}
        {editing ? (
          <div style={{ background: '#F7F7F7', borderRadius: 16, padding: '20px', marginBottom: 12 }}>
            <p style={{ fontWeight: 700, color: T1, marginBottom: 16, margin: '0 0 16px' }}>{t('editProfile')}</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 6 }}>{t('name')}</label>
              <input className="field" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 6 }}>{t('cityTerritoryLabel')}</label>
              <input className="field" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Bangalore" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(false)} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${BD}`, background: '#FFFFFF', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: T2 }}>{t('cancel')}</button>
              <button onClick={save} disabled={saving} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: T1, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{saving ? t('saving') : t('save')}</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} style={{ width: '100%', padding: '14px', borderRadius: 14, border: `1px solid ${BD}`, background: 'transparent', color: T1, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginBottom: 12 }}>
            {t('editProfile')}
          </button>
        )}

        <button onClick={logout} style={{ width: '100%', padding: '14px', borderRadius: 14, border: `1px solid ${BD}`, background: '#F7F7F7', color: T2, fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 4 }}>
          {t('logout')}
        </button>
      </div>
      <CaptainBottomNav />
    </div>
  )
}
