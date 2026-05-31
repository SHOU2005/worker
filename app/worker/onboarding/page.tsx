'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Camera, CheckCircle, ArrowRight, Upload, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

const SKILLS = [
  { key: 'helper',        label: 'Helper',         emoji: '🏠' },
  { key: 'shopAssistant', label: 'Shop Assistant',  emoji: '🏪' },
  { key: 'driver',        label: 'Driver',          emoji: '🚗' },
  { key: 'deliveryBoy',   label: 'Delivery Boy',    emoji: '📦' },
  { key: 'security',      label: 'Security Guard',  emoji: '🔒' },
  { key: 'kitchen',       label: 'Kitchen Helper',  emoji: '🍳' },
  { key: 'cleaning',      label: 'Cleaning Staff',  emoji: '🧹' },
  { key: 'warehouse',     label: 'Warehouse Worker',emoji: '🏭' },
]

const STEPS = [
  { n: 1, label: 'Aadhaar',  icon: Shield },
  { n: 2, label: 'Selfie',   icon: Camera },
  { n: 3, label: 'Skills',   icon: CheckCircle },
]

export default function OnboardingPage() {
  const router   = useRouter()
  const [step,   setStep]   = useState(1)
  const [aadhar, setAadhar] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [docs,   setDocs]   = useState({ aadhaar: false, selfie: false })
  const [saving, setSaving] = useState(false)

  function toggleSkill(k: string) {
    setSkills(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])
  }

  async function finish() {
    setSaving(true)
    try {
      const res = await fetch('/api/worker/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skills,
          aadhaarNumber:  aadhar,
          aadhaarConsent: true,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Could not submit. Try again.')
        setSaving(false); return
      }
      toast.success('KYC submitted! We will verify within 24 hours.')
      router.push('/worker/dashboard')
    } catch {
      toast.error('Network error. Try again.')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen" style={{background:'#f5f5f7'}}>

      {/* Header */}
      <div
        className="px-5 pb-6"
        style={{
          background: '#FFFFFF',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          paddingTop: 'max(env(safe-area-inset-top,0px), 56px)',
        }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: 'rgba(0,0,0,0.4)' }}>One-time setup</p>
        <h1 className="text-2xl font-black mb-4" style={{ color: '#111111' }}>Verify your identity</h1>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
                step > s.n
                  ? undefined
                  : step === s.n
                    ? 'bg-white'
                    : 'bg-white/15'
              )}
              style={step > s.n ? { background: '#111111' } : undefined}
              >
                {step > s.n
                  ? <CheckCircle className="w-4 h-4 text-white" />
                  : <s.icon className={cn('w-4 h-4', step === s.n ? 'text-gray-900' : 'text-white/40')} />
                }
              </div>
              <span className={cn(
                'text-xs font-semibold',
                step === s.n ? 'text-white' : 'text-white/35'
              )}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={cn('h-px w-6 transition-colors', step > s.n ? 'bg-gray-800' : 'bg-white/15')} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">

        {/* ── STEP 1: AADHAAR ── */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-up">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{background:'#111111'}}>
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-black text-gray-900">Aadhaar Verification</p>
                  <p className="text-xs text-gray-400">Your data is 100% secure</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Aadhaar Number</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="Enter 12-digit Aadhaar number"
                  value={aadhar}
                  onChange={e => setAadhar(e.target.value.replace(/\D/g, ''))}
                  className="field"
                />
                {aadhar.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {aadhar.replace(/(.{4})/g, '$1 ').trim()}
                  </p>
                )}
              </div>

              {/* Upload area */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Aadhaar Card</label>
                <button
                  type="button"
                  onClick={() => setDocs(p => ({ ...p, aadhaar: true }))}
                  className={cn(
                    'w-full rounded-2xl py-10 flex flex-col items-center gap-3 border-2 border-dashed transition-all',
                    docs.aadhaar
                      ? 'border-success-400 bg-success-50'
                      : 'border-gray-200 bg-gray-50 active:bg-gray-100'
                  )}
                >
                  {docs.aadhaar ? (
                    <>
                      <CheckCircle className="w-10 h-10 text-success-500" />
                      <p className="text-sm font-bold text-success-700">Uploaded successfully ✓</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-gray-300" />
                      <div className="text-center">
                        <p className="text-sm font-semibold text-gray-500">Tap to upload</p>
                        <p className="text-xs text-gray-400 mt-0.5">Front & back of Aadhaar card</p>
                      </div>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Why we need it */}
            <div className="card-bordered p-4">
              <p className="text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Why we ask</p>
              {['Employers need verified workers', 'One-time only — no re-upload ever', 'Your data is encrypted & safe'].map(t => (
                <div key={t} className="flex items-center gap-2 py-1">
                  <CheckCircle className="w-3.5 h-3.5 text-success-500 flex-shrink-0" />
                  <p className="text-xs text-gray-600">{t}</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={aadhar.length < 12 || !docs.aadhaar}
              className="btn btn-primary btn-lg btn-full font-bold text-base"
            >
              Continue <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* ── STEP 2: SELFIE ── */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-up">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{background:'#111111'}}>
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-black text-gray-900">Selfie Video Check</p>
                  <p className="text-xs text-gray-400">Proves it&apos;s really you</p>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 mb-4">
                <p className="text-xs font-bold text-gray-600 mb-3">Before recording</p>
                <div className="space-y-2">
                  {[
                    'Good lighting — face clearly visible',
                    'Look straight at camera',
                    'No glasses, cap, or mask',
                    'Slowly turn your head left to right',
                  ].map(tip => (
                    <div key={tip} className="flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-success-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-600">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDocs(p => ({ ...p, selfie: true }))}
                className={cn(
                  'w-full rounded-2xl py-12 flex flex-col items-center gap-3 border-2 border-dashed transition-all',
                  docs.selfie
                    ? 'border-success-400 bg-success-50'
                    : 'border-gray-200 bg-gray-50 active:bg-gray-100'
                )}
              >
                {docs.selfie ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-success-500" />
                    <p className="text-sm font-bold text-success-700">Selfie recorded ✓</p>
                  </>
                ) : (
                  <>
                    <Camera className="w-12 h-12 text-gray-300" />
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-500">Tap to open camera</p>
                      <p className="text-xs text-gray-400 mt-0.5">10-second video only</p>
                    </div>
                  </>
                )}
              </button>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn btn-ghost btn-md flex-1">Back</button>
              <button
                onClick={() => setStep(3)}
                disabled={!docs.selfie}
                className="btn btn-primary btn-md flex-1 font-bold"
              >
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: SKILLS ── */}
        {step === 3 && (
          <div className="space-y-4 animate-fade-up">
            <div className="card p-5">
              <p className="font-black text-gray-900 text-lg mb-1">What can you do?</p>
              <p className="text-sm text-gray-400 mb-5">Pick all roles that apply. More skills = more jobs.</p>

              <div className="grid grid-cols-2 gap-2.5">
                {SKILLS.map(s => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => toggleSkill(s.key)}
                    className={cn(
                      'flex items-center gap-2.5 p-3 rounded-2xl border-2 text-left transition-all',
                      skills.includes(s.key)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-100 bg-gray-50'
                    )}
                  >
                    <span className="text-xl">{s.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'text-xs font-bold truncate',
                        skills.includes(s.key) ? 'text-primary-700' : 'text-gray-700'
                      )}>
                        {s.label}
                      </p>
                    </div>
                    {skills.includes(s.key) && (
                      <CheckCircle className="w-4 h-4 text-primary-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div
              className="card p-5"
              style={{background:'#F5F5F5'}}
            >
              <p className="font-bold mb-4" style={{ color:'#111111' }}>Review & Submit</p>
              <div className="space-y-2.5">
                {[
                  { ok: aadhar.length === 12, label: `Aadhaar: ${aadhar.replace(/(.{4})/g,'$1 ').trim()}` },
                  { ok: docs.aadhaar,          label: 'Aadhaar card uploaded' },
                  { ok: docs.selfie,           label: 'Selfie video recorded' },
                  { ok: skills.length > 0,     label: `Skills: ${skills.length} selected` },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-2">
                    <CheckCircle className={cn('w-4 h-4 flex-shrink-0', row.ok ? 'text-success-600' : 'text-gray-300')} />
                    <p className="text-sm" style={{ color: 'rgba(0,0,0,0.55)' }}>{row.label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-4 leading-relaxed" style={{ color: 'rgba(0,0,0,0.38)' }}>
                Review takes up to 24 hours. You will get notified.
              </p>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="btn btn-ghost btn-md flex-1">Back</button>
              <button
                onClick={finish}
                disabled={saving || skills.length === 0}
                className="btn btn-primary btn-md flex-1 font-bold"
                style={{background:'#111111',boxShadow:'0 4px 16px rgba(0,0,0,0.15)'}}
              >
                {saving
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <>Submit KYC 🚀</>
                }
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
