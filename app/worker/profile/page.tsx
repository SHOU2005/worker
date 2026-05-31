'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  MapPin, ChevronRight, Shield, Bell, HelpCircle,
  LogOut, Edit2, CheckCircle, Gift, Copy, Share2, Briefcase, Camera, Globe,
  FileText,
} from 'lucide-react'
import { compressImage } from '@/lib/compress-image'
import { toastError, toastSuccess } from '@/lib/toast'
import TopBar    from '@/components/shared/TopBar'
import BottomNav from '@/components/shared/BottomNav'
import { LANGUAGES } from '@/lib/lang'
import { identify } from '@/lib/posthog'
import { useLanguage } from '@/app/worker/LanguageContext'

const SKILLS = [
  { label:'Shop Helper', emoji:'🏪' },
  { label:'Delivery',    emoji:'🚴' },
  { label:'Security',    emoji:'🔒' },
  { label:'Kitchen',     emoji:'🍳' },
  { label:'Warehouse',   emoji:'🏭' },
  { label:'Cleaning',    emoji:'🧹' },
]
// Worker-self-selected list of languages they can speak with employers/customers.
// Stored in localStorage (per-device) — same pattern as the UI language picker.
const SPOKEN_LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati', 'Kannada', 'Punjabi', 'Urdu']
const SPOKEN_LANG_KEY = 'sw_spoken_langs'

// Built inside the component so labels react to language changes — moved
// out of the module-level constant to allow t() lookups.
type MenuAction = '' | 'notifications' | 'language' | 'help' | 'privacy' | 'logout' | 'kyc'
type KycStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | null

export default function ProfilePage() {
  const router = useRouter()
  const { t }  = useLanguage()
  const MENU_ITEMS: Array<{ icon: typeof Shield; labelKey: string; subKey: string; color: string; bg: string; action: MenuAction; disabled?: boolean }> = [
    // Placeholder — the real Aadhaar row is computed below once kycStatus
    // useState has initialised. We patch it in via index 0 after the
    // hooks declarations to keep React hook order stable.
    { icon:Shield,     labelKey:'aadhaarNotSubmitted', subKey:'',                color:'#111111', bg:'rgba(0,0,0,0.07)',     action:'kyc',          disabled:false },
    { icon:Bell,       labelKey:'notificationsLabel', subKey:'notificationsSub',   color:'#111111', bg:'rgba(0,0,0,0.07)',     action:'notifications' },
    { icon:Globe,      labelKey:'changeLanguage',     subKey:'',                   color:'#111111', bg:'rgba(0,0,0,0.07)',     action:'language'      },
    { icon:HelpCircle, labelKey:'helpSupport',        subKey:'helpSupportSub',     color:'#111111', bg:'rgba(0,0,0,0.07)',     action:'help'          },
    { icon:FileText,   labelKey:'privacyTerms',       subKey:'',                   color:'#111111', bg:'rgba(0,0,0,0.07)',     action:'privacy'       },
    { icon:LogOut,     labelKey:'logoutLabel',        subKey:'',                   color:'#FF3B30', bg:'rgba(255,59,48,0.1)',  action:'logout'        },
  ]
  const currentLang = typeof window !== 'undefined' ? localStorage.getItem('sw_lang') || 'en' : 'en'
  const currentLangLabel = LANGUAGES.find(l => l.code === currentLang)?.label || 'English'
  const [loaded,       setLoaded]       = useState(false)
  const [editing,      setEditing]      = useState(false)
  const [name,         setName]         = useState('')
  const [phone,        setPhone]        = useState('')
  const [city,         setCity]         = useState('')
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set())
  const [refCopied,    setRefCopied]    = useState(false)
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError,   setPhotoError]    = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [upiId,        setUpiId]        = useState('')
  const [editUpi,      setEditUpi]      = useState(false)
  const [savingUpi,    setSavingUpi]    = useState(false)
  const [upiError,     setUpiError]     = useState('')
  const [saving,       setSaving]       = useState(false)
  const [totalShifts,  setTotalShifts]  = useState(0)
  const [totalEarnings,setTotalEarnings]= useState(0)
  const [rating,       setRating]       = useState(0)
  const [isAvailable,  setIsAvailable]  = useState(true)
  const [savingAvail,  setSavingAvail]  = useState(false)
  const [spokenLangs,  setSpokenLangs]  = useState<Set<string>>(new Set())
  const [kycStatus,    setKycStatus]    = useState<KycStatus>(null)

  // Aadhaar row reflects the worker's actual KYC state. APPROVED + PENDING
  // are non-interactive so the user can't redundantly re-submit; REJECTED
  // and the not-submitted default let them enter /worker/kyc.
  if (kycStatus === 'APPROVED') {
    MENU_ITEMS[0] = { icon:Shield, labelKey:'aadhaarVerified',      subKey:'aadhaarVerifiedSub', color:'#10B981', bg:'rgba(16,185,129,0.10)', action:'',    disabled:true  }
  } else if (kycStatus === 'PENDING') {
    MENU_ITEMS[0] = { icon:Shield, labelKey:'aadhaarPending',       subKey:'aadhaarPendingSub',  color:'#F59E0B', bg:'rgba(245,158,11,0.10)', action:'',    disabled:true  }
  } else if (kycStatus === 'REJECTED') {
    MENU_ITEMS[0] = { icon:Shield, labelKey:'aadhaarRejectedLabel', subKey:'aadhaarRejectedSub', color:'#DC2626', bg:'rgba(220,38,38,0.10)',  action:'kyc', disabled:false }
  }

  useEffect(() => {
    // Load the worker's own list of spoken languages from localStorage.
    try {
      const raw = localStorage.getItem(SPOKEN_LANG_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as string[]
        if (Array.isArray(arr)) setSpokenLangs(new Set(arr))
      }
    } catch { /* malformed payload, ignore */ }
  }, [])

  function toggleSpokenLang(l: string) {
    setSpokenLangs(prev => {
      const next = new Set(prev)
      next.has(l) ? next.delete(l) : next.add(l)
      try { localStorage.setItem(SPOKEN_LANG_KEY, JSON.stringify(Array.from(next))) } catch {}
      return next
    })
  }

  useEffect(() => {
    fetch('/api/worker/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.user) { setLoaded(true); return }
        setName(d.user.name || '')
        setPhone(d.user.phone ? `+91 ${d.user.phone.slice(0,5)} ${d.user.phone.slice(5)}` : '')
        if (d.user.workerProfile) {
          const wp = d.user.workerProfile
          setCity(wp.city || '')
          if (wp.skills?.length) setActiveSkills(new Set(wp.skills))
          setTotalShifts(wp.totalShifts || 0)
          setTotalEarnings(wp.totalEarnings || 0)
          setRating(wp.rating || 0)
          setIsAvailable(wp.isAvailable !== false)
          if (wp.profilePhoto) setProfilePhoto(wp.profilePhoto)
          if (wp.upiId) setUpiId(wp.upiId)
          if (wp.kycStatus) setKycStatus(wp.kycStatus as KycStatus)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const referralCode = 'SW' + name.replace(/\s+/g,'').slice(0,4).toUpperCase() + phone.replace(/\D/g,'').slice(-4)

  function copyCode() {
    navigator.clipboard?.writeText(referralCode).catch(()=>{})
    setRefCopied(true)
    setTimeout(()=>setRefCopied(false), 2000)
  }

  function toggleSkill(s: string) {
    setActiveSkills(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      // persist immediately so toggles aren't lost when navigating away
      fetch('/api/worker/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: Array.from(next) }),
      }).catch(() => {})
      return next
    })
  }

  async function saveUpi() {
    const value = upiId.trim().toLowerCase()
    // UPI format: <handle>@<bank> — needs alphanumeric/dot/dash/underscore
    // before the @ and a bank code after. Without this gate "@" or "a@"
    // saved cleanly and withdrawals later failed with a useless backend
    // error. Match the same pattern NPCI uses for VPA validation.
    if (!/^[a-z0-9._-]{2,}@[a-z]{2,}$/.test(value)) {
      setUpiError('Enter a valid UPI ID (e.g. yourname@okhdfcbank)')
      return
    }
    setUpiError('')
    setSavingUpi(true)
    try {
      const r = await fetch('/api/worker/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ upiId: value }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setUpiError(d.error || 'Could not save UPI. Try again.')
        return
      }
      setEditUpi(false)
    } catch {
      setUpiError('Network error. Check your connection.')
    } finally {
      setSavingUpi(false)
    }
  }

  return (
    <>
      <TopBar title="My Profile" unread={0} />

      <div style={{ minHeight:'100vh', paddingTop:'calc(56px + var(--safe-t))', paddingBottom:'calc(80px + var(--safe-b))', background:'#FFFFFF' }}>

        {/* ── Profile header ── */}
        <div className="px-4 pt-3 pb-5">
          <div className="rounded-3xl overflow-hidden"
            style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.08)', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>

            <div style={{ height:3, background:'rgba(0,0,0,0.07)' }} />

            <div className="p-5">
              <div className="flex items-center gap-4 mb-5">
                <div className="relative flex-shrink-0">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="user"
                    style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      // Remember the previously-saved photo so we can roll
                      // back the preview if the upload fails — workers were
                      // mistaking the local preview for a real save.
                      const previousPhoto = profilePhoto
                      setPhotoUploading(true); setPhotoError('')
                      let data = ''
                      try {
                        data = await compressImage(file, 200, 600)
                        // DON'T set the preview yet — only paint it once the
                        // server confirms it persisted bytes. That stops the
                        // "looks successful but DB is empty" false-positive.
                        const res = await fetch('/api/worker/profile', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ profilePhoto: data }),
                        })
                        const d = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          const msg = d.error || `Could not save photo (HTTP ${res.status})`
                          setPhotoError(msg); toastError(msg)
                          setProfilePhoto(previousPhoto)
                          return
                        }
                        if (!d?.saved?.profilePhotoBytes) {
                          const msg = `Server didn't persist the bytes (saved=${d?.saved?.profilePhotoBytes||0}B). Try a different photo.`
                          setPhotoError(msg); toastError(msg)
                          setProfilePhoto(previousPhoto)
                          return
                        }
                        // Confirmed saved. Now paint the new photo.
                        setProfilePhoto(data)
                        toastSuccess(`Photo saved (${Math.round(d.saved.profilePhotoBytes/1024)} KB)`)
                      } catch (ex: any) {
                        const msg = ex?.message || 'Could not process photo'
                        setPhotoError(msg); toastError(msg)
                        setProfilePhoto(previousPhoto)
                      } finally {
                        setPhotoUploading(false)
                      }
                    }}
                  />
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    style={{ display: 'block', width: 76, height: 76, borderRadius: 16, overflow: 'hidden',
                      border: '2px solid rgba(0,0,0,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      position: 'relative', padding: 0, cursor: 'pointer' }}>
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="Profile"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#E5E5E5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, fontWeight: 900, color: 'rgba(0,0,0,0.35)' }}>
                        {name ? name[0].toUpperCase() : '+'}
                      </div>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 26,
                      background: 'rgba(0,0,0,0.52)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Camera style={{ width: 11, height: 11, color: '#FFFFFF' }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>Edit</span>
                    </div>
                  </button>
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: '#111111', border: '2px solid #FFFFFF' }}>
                    <CheckCircle style={{ width: 12, height: 12, color: '#FFFFFF' }} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {loaded && name ? (
                      <p style={{ fontSize:20, fontWeight:900, color:'#111111', lineHeight:1.15 }}>{name}</p>
                    ) : loaded ? (
                      <p style={{ fontSize:20, fontWeight:900, color:'rgba(0,0,0,0.4)', lineHeight:1.15 }}>Add your name</p>
                    ) : (
                      <div style={{ width:140, height:20, borderRadius:6, background:'rgba(0,0,0,0.08)' }} />
                    )}
                    <button onClick={()=>setEditing(e=>!e)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background:'rgba(0,0,0,0.07)' }}>
                      <Edit2 style={{ width:12, height:12, color:'rgba(0,0,0,0.6)' }} />
                    </button>
                  </div>
                  {loaded ? (
                    <p style={{ fontSize:14, color:'rgba(0,0,0,0.4)', marginBottom:8 }}>{phone || '—'}</p>
                  ) : (
                    <div style={{ width:120, height:14, borderRadius:5, background:'rgba(0,0,0,0.06)', marginBottom:8 }} />
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                      style={{ background:'rgba(0,0,0,0.06)', border:'1px solid rgba(0,0,0,0.12)' }}>
                      <CheckCircle style={{ width:10, height:10, color:'#111111' }} />
                      <span style={{ fontSize:12, fontWeight:700, color:'#111111' }}>{t('verifiedTag')}</span>
                    </div>
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                      style={{ background:'rgba(0,0,0,0.06)' }}>
                      <MapPin style={{ width:10, height:10, color:'rgba(0,0,0,0.45)' }} />
                      <span style={{ fontSize:12, fontWeight:600, color:'rgba(0,0,0,0.45)' }}>{city || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Available switch — workers can toggle themselves off when busy.
                  isAvailable=false hides them from urgent-job pushes; jobs still
                  appear in the feed so they can re-enable and accept. */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', marginTop:8, borderTop:'1px solid rgba(0,0,0,0.08)' }}>
                <div>
                  <p style={{ fontSize:14, fontWeight:700, color:'#111111', margin:0 }}>
                    {isAvailable ? t('availableForJobs') : t('notAvailable')}
                  </p>
                  <p style={{ fontSize:12, color:'rgba(0,0,0,0.45)', margin:'2px 0 0' }}>
                    {t('availabilityHint')}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (savingAvail) return
                    const next = !isAvailable
                    setIsAvailable(next); setSavingAvail(true)
                    try {
                      const r = await fetch('/api/worker/profile', {
                        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify({ isAvailable: next }),
                      })
                      if (!r.ok) setIsAvailable(!next)
                    } catch { setIsAvailable(!next) }
                    setSavingAvail(false)
                  }}
                  aria-pressed={isAvailable}
                  style={{
                    width:50, height:28, borderRadius:14, border:'none',
                    background: isAvailable ? '#22C55E' : 'rgba(0,0,0,0.18)',
                    position:'relative', cursor:'pointer', transition:'background 0.18s',
                    flexShrink:0,
                  }}>
                  <span style={{
                    position:'absolute', top:2, left: isAvailable ? 24 : 2, width:24, height:24,
                    borderRadius:'50%', background:'#FFFFFF',
                    boxShadow:'0 2px 6px rgba(0,0,0,0.25)', transition:'left 0.18s',
                  }} />
                </button>
              </div>

              <div className="grid grid-cols-3 pt-4" style={{ borderTop:'1px solid rgba(0,0,0,0.08)' }}>
                {[
                  { value: rating.toFixed(1),                          label: t('rating'),         icon:'⭐' },
                  { value: String(totalShifts),                         label: t('jobsDoneLabel'), icon:'✅' },
                  { value: `₹${Math.round(totalEarnings/1000)}k`,      label: t('thisMonthLabel'), icon:'💰' },
                ].map(s => (
                  <div key={s.label} className="text-center py-1">
                    <p style={{ fontSize:20, fontWeight:900, color:'#111111', lineHeight:1 }}>{s.value}</p>
                    <p style={{ fontSize:13, color:'rgba(0,0,0,0.38)', marginTop:4 }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Edit form ── */}
        {editing && (
          <div className="px-4 pb-5">
            <div className="rounded-2xl p-4 space-y-3"
              style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.09)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              <p style={{ fontSize:16, fontWeight:800, color:'#111111', marginBottom:4 }}>Edit Info</p>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:'rgba(0,0,0,0.4)', marginBottom:6 }}>Your Name</p>
                <input value={name} onChange={e=>setName(e.target.value)} className="field" style={{ fontSize:15 }} />
              </div>
              <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:'rgba(0,0,0,0.4)', margin:0 }}>City</p>
                  <button type="button"
                    onClick={async () => {
                      if (!('geolocation' in navigator)) return
                      const pos = await new Promise<GeolocationPosition | null>(res =>
                        navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 10_000 })
                      )
                      if (!pos) return
                      try {
                        const r = await fetch(`/api/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
                        const d = await r.json()
                        if (d?.city) setCity(d.city)
                      } catch {}
                    }}
                    style={{ background:'none', border:'none', padding:'2px 6px', fontSize:11, fontWeight:700, color:'#3B82F6', cursor:'pointer' }}>
                    📍 Use my location
                  </button>
                </div>
                <input value={city} onChange={e=>setCity(e.target.value)} className="field" style={{ fontSize:15 }} />
              </div>
              <button onClick={async () => {
                  setSaving(true)
                  try {
                    await fetch('/api/worker/profile', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name:   name.trim(),
                        city:   city.trim(),
                        skills: Array.from(activeSkills),
                      }),
                    })
                  } catch { /* network error — keep editing */ }
                  setSaving(false)
                  setEditing(false)
                }} disabled={saving} className="btn btn-primary btn-full"
                style={{ height:48, fontSize:15, fontWeight:700, borderRadius:14 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── My Skills ── */}
        <div className="px-4 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(0,0,0,0.07)' }}>
              <Briefcase style={{ width:14, height:14, color:'rgba(0,0,0,0.6)' }} />
            </div>
            <p style={{ fontSize:17, fontWeight:800, color:'#111111' }}>My Skills</p>
          </div>
          <p style={{ fontSize:14, color:'rgba(0,0,0,0.38)', marginBottom:12 }}>Tap to select work types you can do</p>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map(({ label, emoji }) => {
              const on = activeSkills.has(label)
              return (
                <button key={label} onClick={()=>toggleSkill(label)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl"
                  style={on
                    ? { background:'#111111', color:'#FFFFFF',
                        boxShadow:'0 3px 16px rgba(0,0,0,0.12)', fontSize:13, fontWeight:700, border:'none', cursor:'pointer' }
                    : { background:'#F5F5F5', color:'rgba(0,0,0,0.5)', border:'1px solid rgba(0,0,0,0.09)', fontSize:13, fontWeight:600, cursor:'pointer' }
                  }>
                  <span style={{ fontSize:15 }}>{emoji}</span>
                  {on && <CheckCircle style={{ width:12, height:12, color:'#FFFFFF' }} />}
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Payout UPI ── */}
        <div className="px-4 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:'rgba(0,0,0,0.06)' }}>
              <span style={{ fontSize:14 }}>💸</span>
            </div>
            <p style={{ fontSize:17, fontWeight:800, color:'#111111' }}>Payout UPI ID</p>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.09)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(0,0,0,0.06)', border:'1px solid rgba(0,0,0,0.09)' }}>
                <span style={{ fontSize:18 }}>💸</span>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:700, color:'rgba(0,0,0,0.35)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>
                  Salary goes to
                </p>
                {editUpi ? (
                  <input value={upiId}
                    onChange={e=>{ setUpiId(e.target.value.toLowerCase()); setUpiError('') }}
                    autoFocus
                    placeholder="yourname@upi"
                    style={{ width:'100%', background:'none', border:'none', outline:'none',
                      fontSize:15, fontWeight:700, color:'#111111' }} />
                ) : upiId ? (
                  <p style={{ fontSize:15, fontWeight:700, color:'#111111' }}>{upiId}</p>
                ) : (
                  <p style={{ fontSize:15, fontWeight:700, color:'rgba(0,0,0,0.4)' }}>Not added</p>
                )}
              </div>
              {upiId.includes('@') && !editUpi && (
                <CheckCircle style={{ width:18, height:18, color:'#111111', flexShrink:0 }} />
              )}
            </div>
            <div style={{ padding:'0 16px 14px' }}>
              {upiError && (
                <p style={{ fontSize: 12, color: '#DC2626', margin: '0 0 8px', fontWeight: 600 }}>{upiError}</p>
              )}
              {editUpi ? (
                <button onClick={saveUpi} disabled={savingUpi || !upiId.includes('@')}
                  style={{ width:'100%', height:40, borderRadius:12,
                    background: upiId.includes('@') ? '#111111' : 'rgba(0,0,0,0.15)',
                    color:'#FFFFFF', fontSize:15, fontWeight:700, border:'none', cursor: upiId.includes('@') ? 'pointer' : 'default' }}>
                  {savingUpi ? 'Saving…' : 'Save UPI ID'}
                </button>
              ) : (
                <button onClick={()=>setEditUpi(true)}
                  style={{ width:'100%', height:40, borderRadius:12, background:'rgba(0,0,0,0.06)',
                    color:'rgba(0,0,0,0.6)', fontSize:15, fontWeight:700, border:'1px solid rgba(0,0,0,0.09)', cursor:'pointer' }}>
                  Change UPI ID
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live-location sharing is now on by default — toggle hidden from the
            UI. The flag still exists in the DB so it can be flipped off via
            account-deletion / data-export flows. */}

        {/* ── Refer & Earn ── */}
        <div className="px-4 pb-5">
          <div className="rounded-3xl overflow-hidden"
            style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.09)', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background:'#111111' }}>
                    <Gift style={{ width:20, height:20, color:'#FFFFFF' }} />
                  </div>
                  <div>
                    <p style={{ fontSize:16, fontWeight:900, color:'#111111' }}>Refer &amp; Earn</p>
                    <p style={{ fontSize:14, color:'rgba(0,0,0,0.45)', marginTop:1 }}>₹200 per referral</p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ fontSize:24, fontWeight:900, color:'#111111', lineHeight:1 }}>₹600</p>
                  <p style={{ fontSize:13, color:'rgba(0,0,0,0.38)', marginTop:2 }}>3 friends</p>
                </div>
              </div>

              <div className="rounded-2xl p-4 mb-4 flex items-center justify-between"
                style={{ background:'#FFFFFF', border:'1.5px dashed rgba(0,0,0,0.15)' }}>
                <div>
                  <p style={{ fontSize:12, fontWeight:700, color:'rgba(0,0,0,0.38)', letterSpacing:'0.1em', marginBottom:5 }}>
                    YOUR CODE
                  </p>
                  <p style={{ fontSize:20, fontWeight:900, color:'#111111', letterSpacing:4 }}>{referralCode}</p>
                </div>
                <button onClick={copyCode}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                  style={{ background: refCopied ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.07)',
                    border:'1px solid rgba(0,0,0,0.12)', fontSize:14, fontWeight:700, color:'#111111', cursor:'pointer' }}>
                  {refCopied ? <CheckCircle style={{ width:13, height:13 }} /> : <Copy style={{ width:13, height:13 }} />}
                  {refCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <button
                onClick={() => {
                  const msg = `Hey! Join me on Switch and earn ₹99–₹129/hr doing part-time work near you. Use my referral code *${referralCode}* to get started!\n\nDownload Switch: https://switch.app`
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl"
                style={{ background:'rgba(0,0,0,0.07)', border:'1px solid rgba(0,0,0,0.09)',
                  fontSize:15, fontWeight:700, color:'#111111', cursor:'pointer' }}>
                <Share2 style={{ width:16, height:16 }} />
                Share with Friends
              </button>
            </div>
          </div>
        </div>

        {/* ── Work Area + Languages ── */}
        <div className="px-4 pb-5">
          <div className="rounded-2xl overflow-hidden"
            style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.09)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>

            <button onClick={() => setEditing(true)} className="w-full flex items-center gap-3 px-4 py-4 text-left">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background:'rgba(0,0,0,0.07)' }}>
                <MapPin style={{ width:18, height:18, color:'rgba(0,0,0,0.6)' }} />
              </div>
              <div className="flex-1">
                <p style={{ fontSize:15, fontWeight:700, color:'#111111' }}>{t('workAreaLabel')}</p>
                <p style={{ fontSize:13, color:'rgba(0,0,0,0.38)', marginTop:2 }}>{city || t('notSet')}</p>
              </div>
              <ChevronRight style={{ width:17, height:17, color:'rgba(0,0,0,0.25)' }} />
            </button>

            <div style={{ height:1, background:'rgba(0,0,0,0.06)', margin:'0 16px' }} />

            <div className="px-4 py-4">
              <p style={{ fontSize:14, fontWeight:700, color:'rgba(0,0,0,0.4)', marginBottom:6 }}>{t('languagesISpeak')}</p>
              <p style={{ fontSize:12, color:'rgba(0,0,0,0.38)', marginBottom:10 }}>{t('languagesISpeakHint')}</p>
              <div className="flex gap-2 flex-wrap">
                {SPOKEN_LANGUAGES.map(l => {
                  const active = spokenLangs.has(l)
                  return (
                    <button key={l} type="button" onClick={() => toggleSpokenLang(l)}
                      className="px-3 py-1.5 rounded-full active:scale-95 transition-transform"
                      style={{
                        background: active ? '#111111' : 'rgba(0,0,0,0.06)',
                        color: active ? '#FFFFFF' : 'rgba(0,0,0,0.6)',
                        fontSize: 13, fontWeight: 600,
                        border: active ? '1px solid #111111' : '1px solid rgba(0,0,0,0.08)',
                        cursor: 'pointer',
                      }}>
                      {active ? '✓ ' : ''}{l}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Settings menu ── */}
        <div className="px-4 pb-4">
          <div className="rounded-2xl overflow-hidden"
            style={{ background:'#F5F5F5', border:'1px solid rgba(0,0,0,0.09)', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
            {MENU_ITEMS.map(({ icon:Icon, labelKey, subKey, color, bg, action, disabled }, i) => (
              <div key={labelKey}>
                <button
                  disabled={!!disabled}
                  style={disabled ? { cursor: 'default' } : undefined}
                  onClick={async () => {
                    if (disabled) return
                    if (action==='kyc')           { router.push('/worker/kyc'); return }
                    if (action==='logout') {
                      // Was never calling the logout API — only clearing
                      // localStorage. The auth cookie persisted, so the
                      // user stayed signed in on the next page load. Hit
                      // the API, clear local state, then hard-navigate.
                      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
                      identify(null)
                      try {
                        localStorage.removeItem('sw_perms')
                        localStorage.removeItem('sw_role')
                        sessionStorage.clear()
                      } catch {}
                      window.location.replace('/login')
                      return
                    }
                    if (action==='help')          router.push('/worker/help')
                    if (action==='language')      router.push('/language')
                    if (action==='notifications') router.push('/worker/notifications')
                    if (action==='privacy')       window.open('/legal', '_blank')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-4 text-left">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background:bg }}>
                    <Icon style={{ width:18, height:18, color, strokeWidth:1.8 }} />
                  </div>
                  <div className="flex-1">
                    <p style={{ fontSize:15, fontWeight:600, color: action === 'logout' ? '#DC2626' : '#111111' }}>{t(labelKey as never)}</p>
                    {(subKey || action==='language') && (
                      <p style={{ fontSize:13, color:'rgba(0,0,0,0.38)', marginTop:2 }}>
                        {action==='language' ? currentLangLabel : t(subKey as never)}
                      </p>
                    )}
                  </div>
                  {action !== 'logout' && !disabled && <ChevronRight style={{ width:17, height:17, color:'rgba(0,0,0,0.25)' }} />}
                </button>
                {i < MENU_ITEMS.length-1 && <div style={{ height:1, background:'rgba(0,0,0,0.06)', margin:'0 16px' }} />}
              </div>
            ))}
          </div>
        </div>

        <p className="text-center pb-4" style={{ fontSize:13, color:'rgba(0,0,0,0.25)' }}>
          Switch v1.1 · Made in India 🇮🇳
        </p>

      </div>

      <BottomNav active="/worker/profile" />
    </>
  )
}
