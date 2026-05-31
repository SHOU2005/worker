'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'

const BG   = '#000000'
const S1   = '#0F0F0F'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.4)'
const BD   = 'rgba(255,255,255,0.08)'
const FONT = '"DM Sans", system-ui, sans-serif'

export default function OpsLoginPage() {
  const router = useRouter()
  const [phone,    setPhone]    = useState('')
  const [password, setPassword] = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const phoneOk = /^\d{10}$/.test(phone)
  const pwdOk   = password.length >= 6
  const canSubmit = phoneOk && pwdOk && !loading

  async function handleLogin() {
    if (!canSubmit) return
    setLoading(true); setError('')
    try {
      const res  = await fetch('/api/auth/ops-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone, password }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); return }
      router.replace('/ops')
    } catch (e: any) {
      setError(e?.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
      <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 24, padding: '32px 28px', width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <span style={{ fontSize: 30, fontWeight: 900, color: '#000', lineHeight: 1 }}>S</span>
          </div>
          <h1 style={{ color: T1, fontWeight: 800, fontSize: 22, margin: 0 }}>Ops Portal</h1>
          <p style={{ color: T2, fontSize: 14, margin: '6px 0 0' }}>Internal operations team login</p>
        </div>

        <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 8 }}>Mobile Number</label>
        <input
          style={{ width: '100%', background: '#1C1C1C', border: `1px solid ${phoneOk ? T1 : BD}`, borderRadius: 12,
            padding: '14px 16px', color: T1, fontSize: 18, fontWeight: 600, letterSpacing: 2, outline: 'none',
            boxSizing: 'border-box' as const, marginBottom: 16, transition: 'border-color 0.2s' }}
          type="tel" inputMode="numeric" maxLength={10} placeholder="10-digit number" autoFocus
          value={phone}
          onChange={e => { setPhone(e.target.value.replace(/\D/g, '')); setError('') }}
          onKeyDown={e => e.key === 'Enter' && phoneOk && document.getElementById('ops-password')?.focus()}
        />

        <label style={{ fontSize: 13, fontWeight: 600, color: T2, display: 'block', marginBottom: 8 }}>Password</label>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <input
            id="ops-password"
            style={{ width: '100%', background: '#1C1C1C', border: `1px solid ${pwdOk ? T1 : BD}`, borderRadius: 12,
              padding: '14px 44px 14px 16px', color: T1, fontSize: 16, fontWeight: 600, letterSpacing: 1, outline: 'none',
              boxSizing: 'border-box' as const, transition: 'border-color 0.2s' }}
            type={showPwd ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            style={{ position: 'absolute', right: 8, top: 0, bottom: 0, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', color: T2, cursor: 'pointer' }}>
            {showPwd ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
          </button>
        </div>

        {error && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <button onClick={handleLogin} disabled={!canSubmit}
          style={{ width: '100%', padding: '14px', borderRadius: 12, background: canSubmit ? T1 : 'rgba(255,255,255,0.12)',
            color: canSubmit ? '#000000' : T2, fontWeight: 800, fontSize: 15, border: 'none',
            cursor: canSubmit ? 'pointer' : 'default', opacity: loading ? 0.75 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all 0.2s' }}>
          {loading ? 'Signing in…' : <><span>Sign In</span><ArrowRight style={{ width: 16, height: 16 }} /></>}
        </button>
      </div>
    </div>
  )
}
