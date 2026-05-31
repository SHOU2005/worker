'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import OpsNav from '@/components/ops/OpsNav'

const BG='#000000';const S1='#0F0F0F';const BD='rgba(255,255,255,0.08)';const T1='#FFFFFF';const T2='rgba(255,255,255,0.4)';const FONT='"DM Sans", system-ui, sans-serif'

const DEFAULT_SETTINGS = {
  captainCommissionAmount: '100',
  platformFeePercent:      '37.5',
  urgentFee:               '150',
  workerHourlyRate:        '125',
  employerHourlyRate:      '200',
  activeCities:            'Gurgaon,Delhi,Bangalore,Chennai,Hyderabad',
}

const LABELS: Record<string, string> = {
  captainCommissionAmount: 'Captain Commission per Booking (₹)',
  platformFeePercent:      'Platform Fee (%)',
  urgentFee:               'Urgent Shift Fee (₹)',
  workerHourlyRate:        'Default Worker Hourly Rate (₹)',
  employerHourlyRate:      'Default Employer Hourly Rate (₹)',
  activeCities:            'Active Cities (comma-separated)',
}

export default function SettingsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<Record<string, string>>({ ...DEFAULT_SETTINGS })
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    fetch('/api/ops/settings').then(r => { if (r.status === 401) { router.replace('/ops/login'); return null } return r.json() })
      .then(d => { if (d?.settings) setSettings(prev => ({ ...prev, ...d.settings })) })
  }, [router])

  async function save() {
    setSaving(true)
    await fetch('/api/ops/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/ops/login')
  }

  return (
    <div style={{ fontFamily: FONT, background: BG, minHeight: '100vh', paddingBottom: 'calc(64px + env(safe-area-inset-bottom,0px))' }}>
      <OpsNav />
      <div style={{ padding: '20px', marginLeft: 0, maxWidth: 600 }} className="ops-content">
        <p style={{ color: T1, fontWeight: 800, fontSize: 22, margin: '0 0 24px', paddingTop: 'env(safe-area-inset-top,0px)' }}>Platform Settings</p>

        {Object.entries(settings).map(([key, value]) => (
          <div key={key} style={{ marginBottom: 18 }}>
            <label style={{ color: T2, fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 8 }}>{LABELS[key] || key}</label>
            <input value={value} onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))} style={{ width: '100%', background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: '12px 14px', color: T1, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        ))}

        <button onClick={save} disabled={saving} style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: saved ? '#34D399' : T1, color: '#000000', fontWeight: 800, fontSize: 15, cursor: 'pointer', marginTop: 8, transition: 'background 0.3s' }}>
          {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Settings'}
        </button>

        <button onClick={logout} style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1px solid rgba(248,113,113,0.3)', background: 'transparent', color: '#F87171', fontWeight: 700, fontSize: 15, cursor: 'pointer', marginTop: 12 }}>
          Logout
        </button>
      </div>
      <style>{`@media (min-width: 768px) { .ops-content { margin-left: 220px !important; } }`}</style>
    </div>
  )
}
