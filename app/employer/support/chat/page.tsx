'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, ListOrdered, AlertCircle, CheckCircle2, RefreshCw, Globe, Check } from 'lucide-react'
import { toastError, toastSuccess } from '@/lib/toast'

const BG    = '#08090C'
const SURF  = '#13151B'
const SURF2 = '#1A1D24'
const BD    = 'rgba(255,255,255,0.07)'
const BDH   = 'rgba(255,255,255,0.14)'
const T1    = '#FFFFFF'
const T2    = 'rgba(255,255,255,0.55)'
const T3    = 'rgba(255,255,255,0.32)'
const WARN  = '#F59E0B'
const FONT  = '"DM Sans", system-ui, -apple-system, sans-serif'

type Msg = { role: 'user' | 'bot'; text: string; ts: number }
type BotAction = 'answer' | 'clarify' | 'suggest_escalation'

// Language is persisted in localStorage so Jyoti remembers between visits.
// Sent on every chat turn as a hint so the LLM replies in the chosen language.
const LANG_KEY = 'jyoti-lang'
type LangCode = 'en' | 'hi' | 'hinglish'

const LANGS: { code: LangCode; native: string; english: string }[] = [
  { code: 'en',       native: 'English',  english: 'English'  },
  { code: 'hi',       native: 'हिंदी',     english: 'Hindi'    },
  { code: 'hinglish', native: 'Hinglish', english: 'Hindi-English mix' },
]

const STARTER_CHIPS: Record<LangCode, { emoji: string; text: string }[]> = {
  en: [
    { emoji: '💸', text: 'When will I get my refund?' },
    { emoji: '👷', text: "My worker hasn't arrived yet" },
    { emoji: '📋', text: 'How do I post a job?' },
    { emoji: '💳', text: 'Payment failed but money was deducted' },
  ],
  hi: [
    { emoji: '💸', text: 'मेरा रिफंड कब मिलेगा?' },
    { emoji: '👷', text: 'मेरा वर्कर अभी तक नहीं आया' },
    { emoji: '📋', text: 'जॉब कैसे पोस्ट करूं?' },
    { emoji: '💳', text: 'पेमेंट फेल हुआ लेकिन पैसे कट गए' },
  ],
  hinglish: [
    { emoji: '💸', text: 'Refund kab milega mera?' },
    { emoji: '👷', text: 'Mera worker abhi tak nahi aaya' },
    { emoji: '📋', text: 'Job kaise post karu?' },
    { emoji: '💳', text: 'Payment fail ho gaya but paise kat gaye' },
  ],
}

const HELLO: Record<LangCode, string> = {
  en:       "Hi! I'm **Jyoti**, your Switch support assistant. Ask me anything — refunds, bookings, payments, or how the app works. If I can't sort it out, I'll connect you with our human team.",
  hi:       "नमस्ते! मैं **ज्योति** हूं, आपकी Switch सपोर्ट असिस्टेंट। रिफंड, बुकिंग, पेमेंट या ऐप के बारे में कुछ भी पूछिए। अगर मैं सॉल्व नहीं कर पाई तो आपको हमारी टीम से कनेक्ट कर दूंगी।",
  hinglish: "Namaste! Main **Jyoti** hu, aapki Switch support assistant. Refunds, bookings, payments ya app ke baare me kuch bhi puchiye. Agar main solve nahi kar payi to aapko hamari team se connect kar dungi.",
}

const PLACEHOLDER: Record<LangCode, string> = {
  en:       'Message Jyoti…',
  hi:       'ज्योति को मैसेज करें…',
  hinglish: 'Jyoti ko message karein…',
}

const ESCALATE_LABEL: Record<LangCode, string> = {
  en:       'Talk to a human · Raise a ticket',
  hi:       'टीम से बात करें · टिकट उठाएं',
  hinglish: 'Team se baat karein · Ticket raise karein',
}

const TRY_ASKING: Record<LangCode, string> = {
  en:       'Try asking',
  hi:       'कुछ ऐसा पूछें',
  hinglish: 'Try karke dekhein',
}

export default function JyotiChatPage() {
  const router = useRouter()
  const [lang, setLang]       = useState<LangCode>('en')
  const [langOpen, setLangOpen] = useState(false)
  const [messages, setMessages]     = useState<Msg[]>([])
  const [input,    setInput]        = useState('')
  const [sending,  setSending]      = useState(false)
  const [lastAction, setLastAction] = useState<BotAction>('answer')
  const [escalated,  setEscalated]  = useState<string | null>(null)
  const [escalating, setEscalating] = useState(false)
  // 'ok' | 'no_key' | 'api_error' — surfaced as a slim banner so the user
  // sees why Jyoti is replying with the fallback message instead of a real
  // answer (most common cause: ANTHROPIC_API_KEY not set on Vercel).
  const [botStatus, setBotStatus] = useState<'ok' | 'no_key' | 'api_error'>('ok')
  const scrollRef   = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  // Restore last-used language on mount, then plant the welcome message.
  useEffect(() => {
    let saved: LangCode = 'en'
    try {
      const v = localStorage.getItem(LANG_KEY) as LangCode | null
      if (v && LANGS.some(l => l.code === v)) saved = v
    } catch {}
    setLang(saved)
    setMessages([{ role: 'bot', text: HELLO[saved], ts: Date.now() }])
  }, [])

  // When the user picks a new language, replace the welcome message if the
  // conversation hasn't started yet so the greeting reflects the choice.
  function changeLang(next: LangCode) {
    setLang(next)
    try { localStorage.setItem(LANG_KEY, next) } catch {}
    setLangOpen(false)
    setMessages(prev => {
      if (prev.length <= 1) return [{ role: 'bot', text: HELLO[next], ts: Date.now() }]
      return prev
    })
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [messages, sending, escalated])

  function adjustComposer() {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  async function send(text: string) {
    const clean = text.trim()
    if (!clean || sending || escalated) return
    const userMsg: Msg = { role: 'user', text: clean, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    requestAnimationFrame(adjustComposer)
    setSending(true)
    try {
      const res = await fetch('/api/employer/support/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: next.map(m => ({ role: m.role, text: m.text })),
          language: LANGS.find(l => l.code === lang)?.english || 'English',
        }),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : friendlyHttpError(res.status, lang)
        throw new Error(errMsg)
      }
      const jyotiStatus = res.headers.get('X-Jyoti-Status') || 'ok'
      setBotStatus(jyotiStatus === 'no_key' || jyotiStatus === 'api_error' ? jyotiStatus : 'ok')
      const reply  = typeof data?.reply === 'string' && data.reply.trim() ? data.reply : "I couldn't generate a reply."
      const action: BotAction =
        data?.action === 'clarify' || data?.action === 'suggest_escalation' ? data.action : 'answer'
      setMessages(prev => [...prev, { role: 'bot', text: reply, ts: Date.now() }])
      setLastAction(action)
    } catch (err: any) {
      const msg = err?.message || 'Could not reach support'
      toastError(msg)
      setMessages(prev => [...prev, {
        role: 'bot',
        text: `${msg}. Tap below to raise a ticket with our team.`,
        ts:   Date.now(),
      }])
      setLastAction('suggest_escalation')
    } finally {
      setSending(false)
    }
  }

  async function escalate() {
    if (escalating || escalated) return
    const userMsgs = messages.filter(m => m.role === 'user')
    if (userMsgs.length === 0) {
      toastError('Type your issue first so we can pass it to the team.')
      return
    }
    const summary  = userMsgs[userMsgs.length - 1].text.slice(0, 200)
    const category = guessCategory(userMsgs.map(m => m.text).join(' '))
    setEscalating(true)
    try {
      const res  = await fetch('/api/employer/support/escalate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript: messages, summary, category }),
      })
      const data = await readJsonSafe(res)
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : friendlyHttpError(res.status, lang)
        throw new Error(errMsg)
      }
      if (!data?.ticketId) throw new Error('Ticket created but no ID returned')
      setEscalated(data.ticketId)
      toastSuccess('Ticket raised — support team will reply within 24 hours')
    } catch (err: any) {
      toastError(err?.message || 'Could not raise ticket')
    } finally {
      setEscalating(false)
    }
  }

  const userTurns = messages.filter(m => m.role === 'user').length
  const showEscalateBar = !escalated && (lastAction === 'suggest_escalation' || userTurns >= 3)
  const langDef = LANGS.find(l => l.code === lang) || LANGS[0]

  // Lay the page out as a fixed-height flex column anchored to the viewport.
  // 100dvh keeps the composer above the iOS keyboard and resizes when the
  // address bar collapses. min-height: 0 on the scroll area is critical or
  // the flex column won't actually constrain it on iOS Safari.
  return (
    <div style={{
      fontFamily: FONT, background: BG, color: T1,
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      width: '100%', maxWidth: '100vw', overflow: 'hidden',
      height: '100dvh' as any,
    }}>
      <style>{`
        @keyframes jyoti-pop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes jyoti-pulse-dot { 0%, 100% { transform: scale(0.6); opacity: 0.4; } 50% { transform: scale(1); opacity: 1; } }
        .jyoti-bubble { animation: jyoti-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .jyoti-dot { width: 6px; height: 6px; border-radius: 50%; background: ${T1}; display: inline-block; animation: jyoti-pulse-dot 1.2s infinite ease-in-out; }
        .jyoti-dot:nth-child(2) { animation-delay: 0.15s; }
        .jyoti-dot:nth-child(3) { animation-delay: 0.3s; }
        .jyoti-scrollbar::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        /* Hide language label on phones narrower than 380px so the header
           never overflows or wraps onto two lines. */
        @media (max-width: 379px) {
          .jyoti-lang-label { display: none; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: 'calc(10px + env(safe-area-inset-top)) 10px 10px',
        borderBottom: `1px solid ${BD}`,
        background: BG, zIndex: 5,
      }}>
        <button onClick={() => router.back()} aria-label="Back"
          style={iconBtn}>
          <ArrowLeft style={{ width: 18, height: 18 }} />
        </button>
        <JyotiAvatar size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: T1, fontWeight: 800, fontSize: 15, lineHeight: '18px', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>Jyoti</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: T2, background: 'rgba(255,255,255,0.06)', padding: '2px 5px', borderRadius: 99, letterSpacing: 0.4, textTransform: 'uppercase' as const, border: `1px solid ${BD}`, flexShrink: 0 }}>AI</span>
          </div>
          <div style={{ color: T2, fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.7)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Online · Support team</span>
          </div>
        </div>
        <button onClick={() => setLangOpen(true)} aria-label="Language"
          style={{ ...iconBtn, width: 'auto', padding: '0 10px', gap: 5, minWidth: 38 }}>
          <Globe style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span className="jyoti-lang-label" style={{ fontSize: 11, fontWeight: 700, color: T1, fontFamily: FONT, whiteSpace: 'nowrap' as const }}>{langDef.native}</span>
        </button>
        <button onClick={() => router.push('/employer/support/tickets')} aria-label="My tickets"
          style={iconBtn}>
          <ListOrdered style={{ width: 16, height: 16 }} />
        </button>
      </header>

      {/* Status banner — only shows when the bot is offline so the user knows
          the fallback reply isn't Jyoti being unhelpful, it's a config gap. */}
      {botStatus !== 'ok' && (
        <div style={{ flexShrink: 0, padding: '10px 12px', background: 'rgba(245,158,11,0.08)', borderBottom: `1px solid rgba(245,158,11,0.18)`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertCircle style={{ width: 14, height: 14, color: WARN, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: T1, lineHeight: 1.4 }}>
            {botStatus === 'no_key'
              ? 'Jyoti AI is offline (API key not configured on this build). Raise a ticket and our support team will reply directly.'
              : 'Jyoti AI is having trouble. Raise a ticket if you need help right now.'}
          </div>
        </div>
      )}

      {/* Messages scroll area */}
      <div ref={scrollRef}
        className="jyoti-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto', overflowX: 'hidden',
          padding: '14px 12px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 0,
          WebkitOverflowScrolling: 'touch' as any,
          overscrollBehavior: 'contain',
        }}>

        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const isStreak = prev && prev.role === m.role && (m.ts - prev.ts) < 60_000
          return <Bubble key={i} role={m.role} text={m.text} showAvatar={!isStreak} />
        })}

        {sending && <TypingBubble />}

        {messages.length <= 1 && !sending && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ color: T3, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.7, marginBottom: 2, paddingLeft: 4 }}>
              {TRY_ASKING[lang]}
            </div>
            {STARTER_CHIPS[lang].map(chip => (
              <button key={chip.text} onClick={() => send(chip.text)} disabled={sending}
                style={{ textAlign: 'left' as const, padding: '13px 14px', borderRadius: 14, background: SURF, border: `1px solid ${BD}`, color: T1, fontFamily: FONT, fontSize: 14, fontWeight: 500, cursor: sending ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{chip.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{chip.text}</span>
              </button>
            ))}
          </div>
        )}

        {escalated && (
          <div className="jyoti-bubble" style={{ marginTop: 14, padding: 18, background: 'linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.04))', border: '1px solid rgba(34,197,94,0.28)', borderRadius: 18, color: T1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(34,197,94,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <CheckCircle2 style={{ width: 18, height: 18, color: '#22C55E' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Ticket raised</div>
                <div style={{ fontSize: 12, color: T2, marginTop: 1 }}>Reference #{escalated.slice(-6).toUpperCase()}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T2, lineHeight: 1.5 }}>
              Our support team will get back to you within 24 hours. You can track the status of this ticket anytime.
            </div>
            <button onClick={() => router.push('/employer/support/tickets')}
              style={{ marginTop: 4, padding: '10px 16px', borderRadius: 12, background: T1, color: '#000', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer', fontFamily: FONT, alignSelf: 'flex-start' }}>
              View my tickets
            </button>
          </div>
        )}
      </div>

      {/* Escalate bar */}
      {showEscalateBar && (
        <div style={{ flexShrink: 0, padding: '10px 12px 0', background: BG }}>
          <button onClick={escalate} disabled={escalating}
            style={{ width: '100%', padding: '13px', borderRadius: 14, background: 'rgba(245,158,11,0.10)', border: `1px solid rgba(245,158,11,0.40)`, color: WARN, fontWeight: 800, fontSize: 14, fontFamily: FONT, cursor: escalating ? 'default' : 'pointer', opacity: escalating ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {escalating
              ? <><RefreshCw style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} /> Opening ticket…</>
              : <><AlertCircle style={{ width: 15, height: 15 }} /> {ESCALATE_LABEL[lang]}</>}
          </button>
        </div>
      )}

      {/* Composer */}
      {!escalated && (
        <div style={{
          flexShrink: 0,
          padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
          background: BG,
          borderTop: showEscalateBar ? 'none' : `1px solid ${BD}`,
        }}>
          <div style={{ background: SURF, border: `1px solid ${input.trim() ? BDH : BD}`, borderRadius: 18, padding: '4px 4px 4px 14px', display: 'flex', alignItems: 'flex-end', gap: 6, transition: 'border-color 200ms' }}>
            <textarea
              ref={composerRef}
              value={input}
              onChange={e => { setInput(e.target.value); adjustComposer() }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
              }}
              placeholder={PLACEHOLDER[lang]}
              disabled={sending}
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', resize: 'none',
                color: T1, fontSize: 14, lineHeight: '20px', padding: '10px 0',
                outline: 'none', fontFamily: FONT, maxHeight: 120, minWidth: 0,
              }}
            />
            <button onClick={() => send(input)} disabled={!input.trim() || sending}
              aria-label="Send"
              style={{
                width: 38, height: 38, borderRadius: 19, marginBottom: 2,
                background: input.trim() && !sending ? T1 : 'transparent',
                color: input.trim() && !sending ? '#000' : T3,
                border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !sending ? 'pointer' : 'default',
                transition: 'all 200ms', flexShrink: 0,
              }}>
              <Send style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      )}

      {/* Language picker sheet */}
      {langOpen && (
        <div onClick={() => setLangOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: BG, borderRadius: '24px 24px 0 0', padding: '18px 18px calc(28px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 520, border: `1px solid ${BD}`, borderBottom: 'none' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: BD, margin: '0 auto 16px' }} />
            <div style={{ fontSize: 18, fontWeight: 900, color: T1, marginBottom: 4 }}>Choose language</div>
            <div style={{ fontSize: 12, color: T2, marginBottom: 16 }}>Jyoti will reply in your selected language.</div>
            {LANGS.map(l => {
              const sel = l.code === lang
              return (
                <button key={l.code} onClick={() => changeLang(l.code)}
                  style={{ width: '100%', background: sel ? 'rgba(255,255,255,0.05)' : 'transparent', border: `1px solid ${sel ? BDH : BD}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' as const, color: T1, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Globe style={{ width: 16, height: 16, color: T1 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: T1 }}>{l.native}</div>
                    <div style={{ fontSize: 12, color: T2, marginTop: 2 }}>{l.english}</div>
                  </div>
                  {sel && <Check style={{ width: 18, height: 18, color: T1, flexShrink: 0 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Bubble({ role, text, showAvatar }: { role: 'user' | 'bot'; text: string; showAvatar: boolean }) {
  const isUser = role === 'user'
  return (
    <div className="jyoti-bubble" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8, marginTop: showAvatar ? 8 : 2, width: '100%', maxWidth: '100%' }}>
      {!isUser && (showAvatar ? <JyotiAvatar size={28} /> : <div style={{ width: 28, flexShrink: 0 }} />)}
      <div style={{
        maxWidth:    '82%',
        padding:     '10px 14px',
        borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        background:  isUser ? T1 : SURF,
        border:      isUser ? 'none' : `1px solid ${BD}`,
        color:       isUser ? '#000' : T1,
        fontSize:    14,
        lineHeight:  1.5,
        whiteSpace:  'pre-wrap' as const,
        wordBreak:   'break-word' as const,
        overflowWrap: 'anywhere' as const,
      }}>
        {renderRichText(text, isUser)}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="jyoti-bubble" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
      <JyotiAvatar size={28} />
      <div style={{ padding: '14px 16px', borderRadius: '18px 18px 18px 6px', background: SURF, border: `1px solid ${BD}`, display: 'flex', gap: 5, alignItems: 'center' }}>
        <span className="jyoti-dot" />
        <span className="jyoti-dot" />
        <span className="jyoti-dot" />
      </div>
    </div>
  )
}

function JyotiAvatar({ size }: { size: number }) {
  return (
    <div style={{
      position: 'relative',
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      background: `linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T1, fontWeight: 900, fontSize: Math.floor(size * 0.46),
      letterSpacing: -0.5,
      border: '1px solid rgba(255,255,255,0.18)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      fontFamily: FONT,
    }}>
      J
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 19,
  background: SURF, border: `1px solid ${BD}`, color: T1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', flexShrink: 0, fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
}

function renderRichText(text: string, isUser: boolean): React.ReactNode {
  // Inline **bold** support without pulling a markdown lib.
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ color: isUser ? '#000' : T1, fontWeight: 800 }}>{p.slice(2, -2)}</strong>
    }
    return <span key={i}>{p}</span>
  })
}

async function readJsonSafe(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try { return await res.json() } catch { return null }
  }
  return null
}

function friendlyHttpError(status: number, lang: LangCode): string {
  const en: Record<number, string> = {
    401: "You've been signed out. Please log in again.",
    404: 'Support is being deployed — please try again in a minute.',
    429: 'Too many requests. Please slow down for a moment.',
  }
  const hi: Record<number, string> = {
    401: 'आप लॉग आउट हो गए हैं। फिर से लॉग इन करें।',
    404: 'सपोर्ट डिप्लॉय हो रहा है — एक मिनट में फिर कोशिश करें।',
    429: 'बहुत ज़्यादा मैसेज — थोड़ा रुकें।',
  }
  const hinglish: Record<number, string> = {
    401: 'Aap log out ho gaye hain. Phir se login karein.',
    404: 'Support deploy ho raha hai — ek minute me phir try karein.',
    429: 'Bahut zyada messages — thoda rukein.',
  }
  const dict = lang === 'hi' ? hi : lang === 'hinglish' ? hinglish : en
  if (dict[status]) return dict[status]
  if (status >= 500) {
    return lang === 'hi'
      ? 'सपोर्ट अभी उपलब्ध नहीं है। थोड़ी देर में फिर कोशिश करें।'
      : lang === 'hinglish'
        ? 'Support abhi available nahi hai. Thodi der me try karein.'
        : 'Support is temporarily unavailable. Please try again shortly.'
  }
  return `Request failed (${status})`
}

function guessCategory(blob: string): string {
  const b = blob.toLowerCase()
  if (/refund|money back|deduct|रिफंड|पैसे|paise/.test(b))         return 'refund'
  if (/payment|paid|charge|razor|पेमेंट|पैसे/.test(b))             return 'payment'
  if (/worker|cleaner|cook|maid|helper|वर्कर|मेड/.test(b))         return 'worker'
  if (/safety|stol|threat|harass|सुरक्षा|chori/.test(b))           return 'safety'
  if (/bug|crash|error|broken|बग|एरर/.test(b))                    return 'app_bug'
  if (/account|login|profile|gst|kyc|अकाउंट/.test(b))             return 'account'
  return 'other'
}
