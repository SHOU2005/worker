'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/shared/TopBar'
import CaptainBottomNav from '@/components/captain/CaptainBottomNav'
import { useLanguage } from '../LanguageContext'
import { track } from '@/lib/posthog'

const T1   = '#111111'
const T2   = 'rgba(0,0,0,0.5)'
const FONT = '"DM Sans", system-ui, sans-serif'

const BUSINESS_TYPES = ['Restaurant', 'Hotel', 'Retail', 'Warehouse', 'Hospital', 'Office', 'Manufacturing', 'Other']

export default function OnboardEmployerPage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const [step,        setStep]        = useState(1)
  const [name,        setName]        = useState('')
  const [phone,       setPhone]       = useState('')
  const [companyName, setCompanyName] = useState('')
  const [bizType,     setBizType]     = useState('')
  const [city,        setCity]        = useState('')
  const [address,     setAddress]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [captainStatus, setCaptainStatus] = useState<'ACTIVE' | 'PENDING' | 'REJECTED' | 'SUSPENDED' | null>(null)

  // The API rejects non-ACTIVE captains with 403 — but only AFTER the
  // captain has filled out a 3-step form. Fetch status on mount so we can
  // surface the gate up front instead of letting them waste their time.
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

  async function submit() {
    if (blocked) {
      setError(captainStatus === 'PENDING'
        ? 'Your captain account is under review. You can onboard once Ops approves it.'
        : 'Your captain account is not active.')
      return
    }
    if (!name || phone.length !== 10) { setError(t('fillRequiredFields')); return }
    setLoading(true); setError('')
    const res  = await fetch('/api/captain/onboard-employer', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, phone, companyName, businessType: bizType, city, address }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error || 'Failed to register'); return }
    track('captain_onboarded_employer')
    setStep(3)
  }

  return (
    <div style={{ fontFamily: FONT, background: '#FFFFFF', minHeight: '100vh', paddingTop: 'calc(64px + env(safe-area-inset-top,0px))', paddingBottom: 'calc(88px + env(safe-area-inset-bottom,0px))' }}>
      <TopBar title={t('registerEmployer')} />

      {/* Status gate banner — shown only for non-ACTIVE captains */}
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
              ? "You can onboard employers once Ops approves your captain account. We'll notify you."
              : 'Contact Ops support to reactivate your captain account.'}
          </p>
        </div>
      )}

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 20px' }}>
        {[1, 2, 3].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? T1 : '#E5E7EB', transition: 'background 0.3s' }} />
        ))}
      </div>

      <div style={{ padding: '0 20px' }}>
        {step === 1 && (
          <>
            <p style={{ fontWeight: 700, color: T1, fontSize: 18, marginBottom: 20 }}>{t('ownerDetails')}</p>
            {[
              { label: t('ownerName'),    value: name,  setter: setName,  placeholder: t('namePlaceholder'), type: 'text' },
              { label: t('mobileRequired'), value: phone, setter: setPhone, placeholder: t('phonePlaceholder'), type: 'tel', maxLen: 10, numeric: true },
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
            <p style={{ fontWeight: 700, color: T1, fontSize: 18, marginBottom: 20 }}>{t('businessDetails')}</p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 6 }}>{t('companyName')}</label>
              <input className="field" type="text" placeholder="Business name" value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 8 }}>{t('businessType')}</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {BUSINESS_TYPES.map(btype => (
                  <button key={btype} onClick={() => setBizType(btype)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, border: `1px solid ${bizType === btype ? T1 : 'rgba(0,0,0,0.12)'}`, background: bizType === btype ? 'rgba(17,17,17,0.08)' : '#FFFFFF', color: bizType === btype ? T1 : T2, cursor: 'pointer' }}>
                    {btype}
                  </button>
                ))}
              </div>
            </div>
            {[
              { label: t('city'),    value: city,    setter: setCity,    placeholder: t('cityPlaceholder') },
              { label: t('address'), value: address, setter: setAddress, placeholder: 'Full address' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 6 }}>{f.label}</label>
                <input className="field" type="text" placeholder={f.placeholder} value={f.value} onChange={e => f.setter(e.target.value)} />
              </div>
            ))}
            {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}
            <button className="btn btn-primary btn-lg btn-full"
              style={{ marginTop: 8, background: blocked ? '#D1D5DB' : T1, borderRadius: 14, cursor: blocked || loading ? 'not-allowed' : 'pointer' }}
              onClick={submit} disabled={loading || blocked}>
              {loading ? t('registering') : blocked ? 'Account not active' : t('registerEmployer')}
            </button>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <p style={{ fontSize: 22, fontWeight: 800, color: T1, marginBottom: 8 }}>{t('employerRegistered')}</p>
            <p style={{ color: T2, fontSize: 15, marginBottom: 8 }}><strong>{name}</strong> from <strong>{companyName || 'their business'}</strong> has been registered.</p>
            <p style={{ color: T1, fontSize: 14, fontWeight: 600 }}>{t('commissionNote')}</p>
            <button className="btn btn-primary btn-lg btn-full" style={{ marginTop: 32, background: T1, borderRadius: 14 }} onClick={() => router.push('/captain')}>
              {t('backToHomeBtn')}
            </button>
          </div>
        )}
      </div>

      {step !== 3 && <CaptainBottomNav />}
    </div>
  )
}
