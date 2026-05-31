'use client'
import { useEffect, useState } from 'react'

const BG     = '#000000'
const CARD   = '#141414'
const BORDER = 'rgba(255,255,255,0.09)'
const T1     = '#FFFFFF'
const T2     = 'rgba(255,255,255,0.55)'
const T3     = 'rgba(255,255,255,0.3)'
const FONT   = '"DM Sans", -apple-system, "system-ui", Roboto, sans-serif'

function deriveCode(userId: string | null, phone: string | null): string {
  // Stable per-user code without needing a DB column. Prefer last 4 of phone + 4 chars of userId hash.
  if (!userId && !phone) return ''
  const tail = (phone || '').replace(/\D/g, '').slice(-4) || (userId || '').slice(-4)
  const head = (userId || phone || '').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase()
  return `SW${head}${tail}`
}

export default function ReferPage() {
  const [copied, setCopied] = useState(false)
  const [referCode, setReferCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.user) {
          setReferCode(deriveCode(d.user.id, d.user.phone))
          setName(d.user.name || '')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  function copyCode() {
    if (!referCode) return
    navigator.clipboard?.writeText(referCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1 }}>

      <div style={{
        paddingTop: 'calc(14px + env(safe-area-inset-top))',
        paddingBottom: 16, paddingLeft: 20, paddingRight: 20,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button onClick={() => window.history.back()} style={{
          width: 38, height: 38, borderRadius: 19, border: `1px solid ${BORDER}`, background: CARD,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ fontSize: 20, fontWeight: 900, color: T1, lineHeight: '28px' }}>Refer & Earn</div>
      </div>

      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ background: CARD, borderRadius: 24, padding: '28px 24px', border: `1px solid ${BORDER}`, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎁</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: T1, marginBottom: 8, lineHeight: '34px' }}>Invite Friends, Earn ₹150</div>
          <div style={{ fontSize: 15, color: T2, lineHeight: '22px' }}>For every friend who joins and posts their first job</div>
        </div>

        <div style={{ background: CARD, borderRadius: 20, padding: '20px 24px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5, lineHeight: '16px' }}>Total Earned</div>
          <div style={{ fontSize: 44, fontWeight: 900, color: T1, letterSpacing: -1, lineHeight: '52px' }}>₹0</div>
          <div style={{ fontSize: 13, color: T3, marginTop: 4, lineHeight: '18px' }}>0 successful referrals</div>
        </div>

        <div style={{ background: CARD, borderRadius: 20, padding: '20px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T1, marginBottom: 18, lineHeight: '24px' }}>How it works</div>
          {[
            { step: '1', title: 'Share your code', desc: `Send ${referCode || 'your code'} to friends` },
            { step: '2', title: 'Friend signs up',  desc: 'They register and post their first job' },
            { step: '3', title: 'You earn ₹150',    desc: 'Credited to your wallet after their booking' },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 14, marginBottom: 18, alignItems: 'flex-start' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18, background: T1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#000', fontSize: 16, fontWeight: 900, flexShrink: 0,
              }}>{s.step}</div>
              <div style={{ paddingTop: 2 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T1, lineHeight: '22px' }}>{s.title}</div>
                <div style={{ fontSize: 13, color: T2, marginTop: 3, lineHeight: '18px' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: CARD, borderRadius: 20, padding: '20px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T2, marginBottom: 14, textTransform: 'uppercase' as const, letterSpacing: 0.6, lineHeight: '16px' }}>Your Referral Code</div>
          <div style={{
            background: BG, borderRadius: 14, padding: '18px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            border: `1.5px dashed ${BORDER}`, marginBottom: 14,
          }}>
            <span style={{ fontSize: 28, fontWeight: 900, color: T1, letterSpacing: 3, lineHeight: '36px' }}>
              {loading ? '…' : (referCode || '—')}
            </span>
            <button onClick={copyCode} disabled={!referCode} style={{
              padding: '9px 18px', borderRadius: 10,
              background: copied ? 'rgba(16,185,129,0.15)' : (referCode ? T1 : 'rgba(255,255,255,0.15)'),
              color: copied ? '#10B981' : (referCode ? '#000' : T3),
              border: copied ? '1px solid rgba(16,185,129,0.3)' : 'none',
              cursor: referCode ? 'pointer' : 'default', fontWeight: 700, fontSize: 14, fontFamily: FONT, lineHeight: '20px',
              transition: 'all 0.2s',
            }}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>

          <button disabled={!referCode} onClick={() => {
            const greeting = name ? `Hi! ${name} here. ` : ''
            const msg = `${greeting}Use my referral code ${referCode} on Switch — book verified workers for your home or shop. Sign up: https://app.switchlocally.com`
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
          }} style={{
            width: '100%', padding: '15px 0', borderRadius: 16, border: 'none', cursor: referCode ? 'pointer' : 'default',
            background: referCode ? '#25D366' : 'rgba(255,255,255,0.1)',
            color: referCode ? '#fff' : T3, fontWeight: 700, fontSize: 16, lineHeight: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: FONT,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={referCode ? '#fff' : T3}><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            Share on WhatsApp
          </button>
        </div>

        <div style={{ background: CARD, borderRadius: 16, padding: '16px 18px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T2, marginBottom: 10, lineHeight: '18px' }}>Terms & Conditions</div>
          {['₹150 credited after friend completes first booking', 'No limit on referrals', 'Reward valid for 90 days'].map(t => (
            <div key={t} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: T2, marginTop: 8, flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: T2, lineHeight: '20px' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
