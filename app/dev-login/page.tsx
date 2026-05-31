'use client'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// DEV ONLY — instant login for Capacitor / live-reload testing where
// Firebase rejects the LAN-IP origin. Visit:
//   /dev-login?phone=9205617375
// or use the form below. Production builds are blocked at the API layer.

function DevLoginInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const presetPhone  = searchParams?.get('phone') ?? ''
  const [phone,   setPhone]   = useState(presetPhone)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [user,    setUser]    = useState<{ name: string; role: string } | null>(null)

  async function login(p: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/auth/dev-login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: p }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Login failed'); setBusy(false); return }
      setUser(data.user)
      // Route to the role's home — same logic as / and /players entries.
      const dest =
        data.user.role === 'WORKER'   ? '/worker/dashboard' :
        data.user.role === 'EMPLOYER' ? '/employer'         :
        data.user.role === 'CAPTAIN'  ? '/captain'          :
        data.user.role === 'OPS'      ? '/ops'              :
        data.user.role === 'ADMIN'    ? '/ops'              :
                                        '/'
      setTimeout(() => router.push(dest), 600)
    } catch (e) {
      setError((e as Error).message || 'Network error')
      setBusy(false)
    }
  }

  // Auto-login if the URL has ?phone=…
  useEffect(() => {
    if (presetPhone && /^\d{10}$/.test(presetPhone)) {
      login(presetPhone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPhone])

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A', color: '#FFFFFF',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          display: 'inline-block', padding: '4px 10px',
          background: 'rgba(245,158,11,0.18)', color: '#FCD34D',
          fontSize: 11, fontWeight: 800, letterSpacing: 1,
          borderRadius: 999, marginBottom: 12,
        }}>
          DEV ONLY
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, letterSpacing: -0.5 }}>
          Quick login
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 22, lineHeight: 1.4 }}>
          Bypasses Firebase / OTP for local Capacitor testing.
          Production builds return 404.
        </p>

        <input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          placeholder="10-digit phone"
          value={phone}
          onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          disabled={busy}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#FFFFFF', fontSize: 16, fontWeight: 700,
            letterSpacing: 1, outline: 'none', marginBottom: 14,
          }} />

        <button
          onClick={() => login(phone)}
          disabled={busy || phone.length !== 10}
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 12,
            border: 'none', cursor: busy ? 'default' : 'pointer',
            background: phone.length === 10 ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
            color: phone.length === 10 ? '#0A0A0A' : 'rgba(255,255,255,0.4)',
            fontSize: 15, fontWeight: 800, transition: 'all 0.15s',
          }}>
          {busy ? 'Logging in…' : 'Login'}
        </button>

        {error && (
          <p style={{ marginTop: 14, fontSize: 13, color: '#FCA5A5', fontWeight: 600 }}>
            {error}
          </p>
        )}

        {user && (
          <p style={{ marginTop: 14, fontSize: 13, color: '#86EFAC', fontWeight: 600 }}>
            ✓ Signed in as {user.name} ({user.role}). Redirecting…
          </p>
        )}
      </div>
    </div>
  )
}

// /dev-login uses useSearchParams which requires Suspense in Next 14 app
// router. The wrapper is the minimum-overhead solution.
import { Suspense } from 'react'
export default function DevLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0A0A0A' }} />}>
      <DevLoginInner />
    </Suspense>
  )
}
