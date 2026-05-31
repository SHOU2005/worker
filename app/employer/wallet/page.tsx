'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Wallet as WalletIcon, Gift, Banknote, Sparkles, ChevronRight, AlertCircle, Plus, X, Check } from 'lucide-react'
import { toastError, toastSuccess } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

type Txn = {
  id:        string
  title:     string
  date:      string
  amount:    number
  direction: 'debit' | 'credit'
  status:    'paid' | 'pending' | 'refunded'
}

const PRESETS = [200, 500, 700, 1000, 2000, 5000]

export default function EmployerWalletPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [txns,    setTxns]    = useState<Txn[]>([])
  const [cash,    setCash]    = useState(0)
  const [bonus,   setBonus]   = useState(0)
  const [profile, setProfile] = useState<{ name: string; phone: string; email?: string } | null>(null)
  const [topUpOpen, setTopUpOpen] = useState(false)
  const [amount,    setAmount]    = useState<number | null>(500)
  const [customRaw, setCustomRaw] = useState('')
  const [paying,    setPaying]    = useState(false)

  async function loadWallet() {
    try {
      const r = await fetch('/api/employer/wallet')
      if (r.status === 401) { router.replace('/employer/login'); return }
      const ct = r.headers.get('content-type') || ''
      const d  = ct.includes('application/json') ? await r.json().catch(() => null) : null
      if (!r.ok) throw new Error(d?.error || `Could not load wallet (${r.status})`)
      setCash(Number(d?.balance) || 0)
      setBonus(0)
      const list: Txn[] = (d?.transactions || []).map((t: any) => ({
        id:        t.id,
        title:     t.description || labelFor(t.type),
        date:      t.createdAt,
        amount:    Math.abs(Number(t.amount) || 0),
        direction: Number(t.amount) >= 0 ? 'credit' : 'debit',
        status:    t.status === 'COMPLETED' ? 'paid' : t.status === 'FAILED' ? 'refunded' : 'pending',
      }))
      setTxns(list)
    } catch (err: any) {
      toastError(err?.message || 'Could not load wallet')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    // 1) Profile for prefill
    fetch('/api/employer/profile').then(r => r.ok ? r.json() : null).then(d => {
      const u = d?.user || d?.profile
      if (!u || cancelled) return
      setProfile({ name: u.name || '', phone: u.phone || '', email: u.email || undefined })
    }).catch(() => {})

    // 2) Wallet balance + ledger from the real endpoint.
    loadWallet()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  const balance = cash + bonus

  async function loadRzp(): Promise<boolean> {
    if ((window as any).Razorpay) return true
    return new Promise(res => {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      s.onload = () => res(true)
      s.onerror = () => res(false)
      document.body.appendChild(s)
    })
  }

  function pickPreset(v: number) {
    setAmount(v)
    setCustomRaw('')
  }
  function setCustom(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCustomRaw(digits)
    setAmount(digits ? Number(digits) : null)
  }

  async function payTopUp() {
    if (!amount || amount < 50) { toastError('Minimum top-up is ₹50'); return }
    if (amount > 100000) { toastError('Maximum top-up is ₹1,00,000'); return }
    setPaying(true)
    try {
      // 1) Create a server-side Razorpay order. The endpoint also writes a
      //    PENDING WalletTransaction we'll flip to COMPLETED after verify.
      const orderRes = await fetch('/api/employer/wallet/topup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount }),
      })
      const orderData = await orderRes.json().catch(() => ({}))
      if (!orderRes.ok || !orderData?.orderId) {
        throw new Error(orderData?.error || `Could not start top-up (HTTP ${orderRes.status})`)
      }

      const loaded = await loadRzp()
      if (!loaded) throw new Error('Could not load Razorpay')

      const Rzp = (window as any).Razorpay
      if (typeof Rzp !== 'function') throw new Error('Razorpay loaded but is not callable. Reload the page.')

      const rzp = new Rzp({
        key:         orderData.keyId,
        amount:      orderData.amount,
        currency:    orderData.currency || 'INR',
        order_id:    orderData.orderId,
        name:        'Switch',
        description: `Wallet top-up · ₹${amount.toLocaleString('en-IN')}`,
        theme:       { color: '#000000' },
        prefill: {
          name:    profile?.name  || '',
          contact: profile?.phone ? `+91${profile.phone.replace(/\D/g, '').slice(-10)}` : '',
          email:   profile?.email || '',
        },
        readonly: {
          contact: Boolean(profile?.phone),
          email:   Boolean(profile?.email),
        },
        notes: {
          purpose: 'wallet_topup',
          amount:  String(amount),
        },
        handler: async (response: any) => {
          // 2) Verify signature server-side. The endpoint credits the wallet
          //    atomically inside a DB transaction so balance can't drift.
          try {
            const v = await fetch('/api/employer/wallet/topup/verify', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                razorpayPaymentId: response.razorpay_payment_id,
                razorpayOrderId:   response.razorpay_order_id,
                razorpaySignature: response.razorpay_signature,
              }),
            })
            const vd = await v.json().catch(() => ({}))
            if (!v.ok || !vd?.success) throw new Error(vd?.error || 'Verification failed')
            setTopUpOpen(false)
            toastSuccess(`₹${amount.toLocaleString('en-IN')} credited. New balance: ₹${Number(vd.balance ?? 0).toLocaleString('en-IN')}`)
            await loadWallet()
          } catch (err: any) {
            toastError(err?.message || 'Payment received but verification failed. Contact support.')
          } finally {
            setPaying(false)
          }
        },
        modal: {
          ondismiss: () => { setPaying(false) },
        },
        'payment.failed': (resp: any) => {
          toastError(`Top-up failed${resp?.error?.description ? `: ${resp.error.description}` : ''}`)
          setPaying(false)
        },
      })
      rzp.open()
    } catch (err: any) {
      toastError(err?.message || 'Could not start top-up')
      setPaying(false)
    }
  }

  function labelFor(type: string): string {
    if (type === 'TOPUP')  return 'Wallet top-up'
    if (type === 'DEBIT')  return 'Booking payment'
    if (type === 'REFUND') return 'Refund'
    if (type === 'BONUS')  return 'Bonus credit'
    return 'Wallet activity'
  }

  return (
    <div style={{ minHeight: '100dvh' as any, background: BG, fontFamily: FONT, color: T1, paddingBottom: 'calc(28px + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'calc(16px + env(safe-area-inset-top)) 18px 8px' }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'transparent', color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft style={{ width: 24, height: 24 }} />
        </button>
        <div style={{ fontSize: 26, fontWeight: 900, color: T1, letterSpacing: -0.6 }}>Wallet</div>
      </div>

      <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Balance hero */}
        <div style={{ textAlign: 'center', padding: '20px 12px 8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <WalletIcon style={{ width: 16, height: 16, color: T1 }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: T2 }}>Available Balance</span>
          </div>
          <div style={{ fontSize: 52, fontWeight: 900, color: T1, letterSpacing: -2, lineHeight: 1 }}>
            <span style={{ fontSize: 28, color: T2, fontWeight: 700, marginRight: 6, verticalAlign: 'top' }}>₹</span>
            {balance.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Cash + Bonus split */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SplitCard
            icon={<Banknote style={{ width: 16, height: 16, color: T1 }} />}
            label="Cash"
            amount={cash}
          />
          <SplitCard
            icon={<Sparkles style={{ width: 16, height: 16, color: T1 }} />}
            label="Bonus"
            amount={bonus}
          />
        </div>

        {/* Refer & Earn banner */}
        <button onClick={() => router.push('/employer/refer')}
          style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' as const, fontFamily: FONT, color: T1 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Gift style={{ width: 20, height: 20, color: T1 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T1, letterSpacing: -0.2 }}>Refer & Earn ₹150</div>
            <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>For every friend who joins Switch</div>
          </div>
          <ChevronRight style={{ width: 18, height: 18, color: T3, flexShrink: 0 }} />
        </button>

        {/* Add money CTA */}
        <button onClick={() => setTopUpOpen(true)}
          style={{ marginTop: 4, padding: '16px', borderRadius: 16, background: T1, border: 'none', color: '#000', fontWeight: 800, fontSize: 16, cursor: 'pointer', fontFamily: FONT, boxShadow: '0 10px 24px rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Plus style={{ width: 18, height: 18 }} />
          Add money
        </button>

        {/* Transactions */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: T1, marginBottom: 14, letterSpacing: -0.5 }}>Transactions</div>

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ height: 64, borderRadius: 14, background: SURF, border: `1px solid ${BD}` }} />
              ))}
            </div>
          )}

          {!loading && txns.length === 0 && <TxnEmpty />}

          {!loading && txns.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {txns.map(t => (
                <div key={t.id} style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: t.status === 'paid' ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {t.status === 'paid'
                      ? <Banknote style={{ width: 18, height: 18, color: '#22C55E' }} />
                      : <AlertCircle style={{ width: 18, height: 18, color: '#F59E0B' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, letterSpacing: -0.2 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: T2, marginTop: 3 }}>{new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
                  </div>
                  <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: t.direction === 'credit' ? '#22C55E' : T1 }}>
                      {t.direction === 'credit' ? '+' : '−'}₹{t.amount.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: 11, color: t.status === 'paid' ? '#22C55E' : t.status === 'refunded' ? '#EF4444' : '#F59E0B', marginTop: 3, fontWeight: 700, textTransform: 'capitalize' as const }}>{t.status}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top-up bottom sheet */}
      {topUpOpen && (
        <div onClick={() => !paying && setTopUpOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: BG, borderRadius: '24px 24px 0 0', padding: '18px 18px calc(28px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, border: `1px solid ${BD}`, borderBottom: 'none', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: BD, margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T1, letterSpacing: -0.4 }}>Add money</div>
              <button onClick={() => !paying && setTopUpOpen(false)}
                style={{ width: 32, height: 32, borderRadius: 16, background: SURF2, border: `1px solid ${BD}`, color: T1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div style={{ fontSize: 13, color: T2, marginBottom: 18 }}>Pick an amount and pay via Razorpay. Money lands in your Switch wallet instantly.</div>

            {/* Preset chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
              {PRESETS.map(v => {
                const sel = amount === v && !customRaw
                return (
                  <button key={v} onClick={() => pickPreset(v)}
                    style={{
                      background: sel ? 'rgba(255,255,255,0.06)' : SURF,
                      border: `1.5px solid ${sel ? T1 : BD}`,
                      borderRadius: 14, padding: '14px 8px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      color: T1, fontFamily: FONT, cursor: 'pointer', minWidth: 0,
                    }}>
                    <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: -0.3 }}>₹{v.toLocaleString('en-IN')}</span>
                    {sel && <Check style={{ width: 12, height: 12, color: T1 }} />}
                  </button>
                )
              })}
            </div>

            {/* Custom amount */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T2, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.4 }}>Or enter custom amount</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: SURF, border: `1.5px solid ${customRaw ? T1 : BD}`, borderRadius: 14, padding: '14px 16px' }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: T2 }}>₹</span>
                <input
                  type="tel" inputMode="numeric"
                  value={customRaw}
                  onChange={e => setCustom(e.target.value)}
                  placeholder="0"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: T1, fontSize: 20, fontWeight: 900, fontFamily: FONT, letterSpacing: -0.3, minWidth: 0, padding: 0 }}
                />
              </div>
              <div style={{ fontSize: 11, color: T3, marginTop: 6 }}>Minimum ₹50 · Maximum ₹1,00,000</div>
            </div>

            {/* Summary + Pay */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: T2, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.6 }}>You pay</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: T1, marginTop: 2, letterSpacing: -0.5 }}>
                  ₹{(amount ?? 0).toLocaleString('en-IN')}
                </div>
              </div>
              <button onClick={payTopUp} disabled={!amount || amount < 50 || paying}
                style={{
                  padding: '14px 22px', borderRadius: 14, border: 'none',
                  background: amount && amount >= 50 && !paying ? T1 : SURF2,
                  color:      amount && amount >= 50 && !paying ? '#000' : T3,
                  fontWeight: 800, fontSize: 14,
                  cursor: amount && amount >= 50 && !paying ? 'pointer' : 'not-allowed',
                  display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT, flexShrink: 0,
                  boxShadow: amount && amount >= 50 && !paying ? '0 10px 24px rgba(255,255,255,0.08)' : 'none',
                }}>
                {paying ? 'Opening Razorpay…' : 'Pay now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SplitCard({ icon, label, amount }: { icon: React.ReactNode; label: string; amount: number }) {
  return (
    <div style={{ background: SURF, border: `1px solid ${BD}`, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <span style={{ fontSize: 14, color: T2, fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>
        <span style={{ fontSize: 14, color: T2, fontWeight: 700, marginRight: 2, verticalAlign: 'top' }}>₹</span>
        {amount.toLocaleString('en-IN')}
      </div>
    </div>
  )
}

function TxnEmpty() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 96, height: 64, margin: '0 auto 18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: SURF2, border: `1px solid ${BD}`, position: 'absolute', left: 0, top: 12, transform: 'rotate(-6deg)' }} />
        <div style={{ width: 44, height: 44, borderRadius: 12, background: SURF2, border: `1px solid ${BD}`, position: 'absolute', right: 0, top: 12, transform: 'rotate(6deg)' }} />
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertCircle style={{ width: 22, height: 22, color: T1 }} />
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: T1 }}>No transactions yet</div>
    </div>
  )
}
