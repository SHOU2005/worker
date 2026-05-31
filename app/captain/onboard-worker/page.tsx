'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import { useLanguage } from '../LanguageContext'
import type { TKey } from '../i18n'
import { track } from '@/lib/posthog'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.5)'
const FONT = '"DM Sans", system-ui, sans-serif'

const SKILL_KEYS: TKey[] = ['skillCleaning','skillCooking','skillSecurity','skillDriving','skillDelivery','skillWarehouse','skillReception','skillRetail','skillHousekeeping','skillOther']

export default function OnboardWorkerPage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const [step,    setStep]    = useState(1)
  const [name,    setName]    = useState('')
  const [phone,   setPhone]   = useState('')
  const [city,    setCity]    = useState('')
  const [skills,  setSkills]  = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [captainStatus, setCaptainStatus] = useState<'ACTIVE' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | null>(null)

  // Surface the API's ACTIVE-only check up front so a captain doesn't fill
  // out the form just to be told 403 at submit time.
  useEffect(() => {
    fetch('/api/captain/profile').then(r => {
      if (r.status === 401) { router.replace('/captain/login'); return null }
      return r.json()
    }).then(d => {
      const s = d?.user?.captainProfile?.status
      if (s) setCaptainStatus(s)
    }).catch(() => {})
  }, [router])

  const blocked = captainStatus !== null && captainStatus !== 'ACTIVE'

  function toggleSkill(s: string) {
    setSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function submit() {
    if (blocked) {
      setError(captainStatus === 'PENDING'
        ? 'Your captain account is under review. You can onboard once Ops approves it.'
        : 'Your captain account is not active.')
      return
    }
    setLoading(true); setError('')
    const res = await fetch('/api/captain/onboard-worker', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, phone, city, skills }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    track('captain_onboarded_worker', { city, skillCount: skills.length })
    setStep(3)
  }

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('registerWorker')} />

      {blocked && (
        <div style={{ margin: '16px 20px 0', padding: '12px 14px', borderRadius: 12,
          background: captainStatus === 'PENDING' ? '#FEF3C7' : '#FEE2E2',
          border: `1px solid ${captainStatus === 'PENDING' ? '#FCD34D' : '#FCA5A5'}` }}>
          <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px',
            color: captainStatus === 'PENDING' ? '#92400E' : '#991B1B' }}>
            {captainStatus === 'PENDING' ? 'Account under review' : 'Account not active'}
          </p>
          <p style={{ fontSize: 12, margin: 0, color: 'rgba(0,0,0,0.7)' }}>
            {captainStatus === 'PENDING'
              ? "You can onboard workers once Ops approves your captain account. We'll notify you."
              : 'Contact Ops support to reactivate your captain account.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '16px 20px' }}>
        {[1, 2, 3].map(s => <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? T1 : '#E5E7EB', transition: 'background 0.3s' }} />)}
      </div>

      <div style={{ padding: '0 20px' }}>
        {step === 1 && (
          <>
            <p style={{ fontWeight: 700, color: T1, fontSize: 18, marginBottom: 20 }}>{t('workerDetails')}</p>
            {[
              { label: t('fullNameRequired'), value: name, setter: setName, placeholder: t('workerNamePlaceholder'), type: 'text' },
              { label: t('mobileRequired'),   value: phone, setter: setPhone, placeholder: t('phonePlaceholder'), type: 'tel', maxLen: 10, numeric: true },
              { label: t('city'),             value: city, setter: setCity,  placeholder: t('cityPlaceholder'), type: 'text' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input className="field" type={f.type} inputMode={f.numeric ? 'numeric' : undefined} maxLength={f.maxLen} placeholder={f.placeholder} value={f.value} onChange={e => f.setter(f.numeric ? e.target.value.replace(/\D/g, '') : e.target.value)} />
              </div>
            ))}
            {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}
            <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 8, background: T1, borderRadius: 14 }} onClick={() => { if (!name || phone.length !== 10) { setError(t('fillRequiredFields')); return }; setError(''); setStep(2) }}>
              {t('next')}
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ fontWeight: 700, color: T1, fontSize: 18, marginBottom: 8 }}>{t('skills')}</p>
            <p style={{ color: T2, fontSize: 14, marginBottom: 16 }}>{t('selectSkills')}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
              {SKILL_KEYS.map(key => {
                const label = t(key)
                return (
                  <button key={key} onClick={() => toggleSkill(label)} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid ${skills.includes(label) ? T1 : 'rgba(0,0,0,0.12)'}`, background: skills.includes(label) ? '#F5F5F5' : '#FFFFFF', color: skills.includes(label) ? T1 : T2, cursor: 'pointer' }}>
                    {label}
                  </button>
                )
              })}
            </div>
            {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}
            <button className="btn btn-primary btn-lg btn-full"
              style={{ background: blocked ? '#D1D5DB' : T1, borderRadius: 14, cursor: blocked || loading ? 'not-allowed' : 'pointer' }}
              onClick={submit} disabled={loading || blocked}>
              {loading ? t('registering') : blocked ? 'Account not active' : t('registerWorker')}
            </button>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: T1, marginBottom: 8 }}>{t('workerRegistered')}</p>
            <p style={{ color: T2, fontSize: 15, marginBottom: 16 }}><strong>{name}</strong> {t('workerAddedDesc')}</p>
            <div style={{ background: '#F7F7F7', borderRadius: 14, padding: '14px 16px', marginBottom: 24, textAlign: 'left' }}>
              <p style={{ fontWeight: 700, color: T1, margin: '0 0 4px', fontSize: 14 }}>{t('nextStepForWorker')}</p>
              <p style={{ color: T2, margin: 0, fontSize: 13 }}>{t('downloadSwitchWorker')}</p>
            </div>
            <p style={{ color: T1, fontSize: 14, fontWeight: 600 }}>{t('commissionNote')}</p>
            <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 24, background: T1, borderRadius: 14 }} onClick={() => router.push('/captain')}>
              {t('backToHome')}
            </button>
          </div>
        )}
      </div>

      {step !== 3 && <CaptainBottomNav />}
    </div>
  )
}
