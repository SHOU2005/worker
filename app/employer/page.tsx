'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import ServiceDetailSheet from '@/components/employer/ServiceDetailSheet'

// Premium dark palette — shared with profile, wallet, support, schedule,
// jobs.  Keep these four constants in sync everywhere so the whole app
// reads as one cohesive surface.
const BG   = '#08090C'
const S1   = '#13151B'
const S2   = '#1A1D24'
const S3   = '#23262F'
const BD   = 'rgba(255,255,255,0.07)'
const BA   = 'rgba(255,255,255,0.18)'
const T1   = '#FFFFFF'
const T2   = 'rgba(255,255,255,0.55)'
const T3   = 'rgba(255,255,255,0.30)'
const GOLD = '#F5C518'
const FONT = '"DM Sans", system-ui, -apple-system, sans-serif'

const EmpMap = dynamic(() => import('@/components/employer/EmpMap'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', background: S2 }} />,
})

const SLOTS = [
  { id: '1h',  label: '1 hr',   hours: 1,  discount: 0,  badge: ''          },
  { id: '2h',  label: '2 hrs',  hours: 2,  discount: 0,  badge: ''          },
  { id: '4h',  label: '4 hrs',  hours: 4,  discount: 0,  badge: ''          },
  { id: '8h',  label: '8 hrs',  hours: 8,  discount: 0,  badge: 'Full Day'  },
  { id: '12h', label: '12 hrs', hours: 12, discount: 5,  badge: 'Save 5%'   },
  { id: '2d',  label: '2 Days', hours: 16, discount: 10, badge: 'Save 10%'  },
  { id: '7d',  label: '7 Days', hours: 56, discount: 15, badge: 'Best Value' },
] as const

// ?v=2 cache-buster — bumped after the May 10 photo refresh so installed
// PWAs and CDN edges fetch the new branded photos instead of serving the
// old icon set. Increment on future image swaps.
// All service art is JPEG.  Cache-buster bumped to v6 to force Vercel
// edges + browsers to drop any stale 404 responses cached during the
// previous PNG → JPG migration.
const IMG = (f: string) => `/icons/services/${f}.jpg?v=6`

// Twelve services. `useCase` segments the home-page filter into "Home"
// (personal hires for the house) vs "Business" (commercial / event staff).
// A service can be in both if it makes sense (Driver, Cleaner).
// Branded "switch" photo set lives at /icons/services/sw-*.jpg.  Any service
// that doesn't have a dedicated branded photo borrows a thematically-close
// one so the home grid never renders a broken image.  The five we surface
// most prominently (HOME_SERVICES) all have their own dedicated photos.
const ROLES: Record<string, { img: string; cat: string; rate: number; tag?: string; useCase: ('home' | 'business')[] }> = {
  'Maid':            { img: IMG('sw-maid'),           cat: 'Home',     rate: 149, tag: 'Popular',  useCase: ['home', 'business'] },
  'Cook':            { img: IMG('sw-cook'),           cat: 'Kitchen',  rate: 149,                  useCase: ['home', 'business'] },
  'Kitchen Helper':  { img: IMG('sw-kitchen-helper'), cat: 'Kitchen',  rate: 149,                  useCase: ['home', 'business'] },
  'Caretaker':       { img: IMG('sw-maid'),           cat: 'Home',     rate: 149,                  useCase: ['home']             },
  'Waiter':          { img: IMG('sw-waiter'),         cat: 'Events',   rate: 149,                  useCase: ['business']         },
  'Bartender':       { img: IMG('sw-bartender'),      cat: 'Events',   rate: 149, tag: 'New',      useCase: ['business']         },
  'Security Guard':  { img: IMG('sw-security-guard'), cat: 'Security', rate: 149, tag: 'Verified', useCase: ['home', 'business'] },
  'Bouncer':         { img: IMG('sw-security-guard'), cat: 'Security', rate: 149,                  useCase: ['business']         },
  'Driver':          { img: IMG('sw-driver'),         cat: 'Driver',   rate: 149, tag: 'Top Rated',useCase: ['home', 'business'] },
  'Promoter':        { img: IMG('sw-waiter'),         cat: 'Events',   rate: 149,                  useCase: ['business']         },
  'General Helper':  { img: IMG('sw-maid'),           cat: 'Home',     rate: 149, tag: 'Popular',  useCase: ['home', 'business'] },
  'Factory Helper':  { img: IMG('sw-driver'),         cat: 'Driver',   rate: 149,                  useCase: ['business']         },
}

// Premium B&W palette — category-specific colour accents were retired
// with the new design.  All chrome reads as white-on-dark now.
const CAT_COLORS: Record<string, string> = {
  Home:     '#FFFFFF',
  Kitchen:  '#FFFFFF',
  Events:   '#FFFFFF',
  Security: '#FFFFFF',
  Driver:   '#FFFFFF',
}
const CATS = ['All', 'Home', 'Kitchen', 'Events', 'Security', 'Driver'] as const

function slotPrice(rate: number, slot: typeof SLOTS[number]) {
  return Math.round(rate * slot.hours * (1 - slot.discount / 100))
}

/* ── Gold Wax Seal — premium metallic look ──────────────────────────────────
   The seal sits on the dashboard's "Workers Vetted for Quality" card. Goals:
   - Crisp scalloped edge with a tight gold bevel
   - Readable "SWITCH" and "VERIFIED" arcs (the previous bottom arc was
     mis-pathed, which made "VERIFIED" render upside-down)
   - A centred "S" monogram with proper baseline inside the inner ring
   - Subtle specular highlight that hints at metal without looking blown out
─────────────────────────────────────────────────────────────────────────── */
function WaxSeal() {
  const CX = 72, CY = 72
  const N = 18                    // scallop count — odd-ish reads richer
  const R_OUT = 66, R_IN = 60
  const starPoints = Array.from({ length: N * 2 }, (_, i) => {
    const angle = (i * Math.PI) / N - Math.PI / 2
    const r     = i % 2 === 0 ? R_OUT : R_IN
    return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`
  }).join(' ')

  return (
    <svg width="64" height="64" viewBox="0 0 144 144" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Switch verified seal" role="img">
      <defs>
        {/* Scalloped rim — bright bevel along the top, deep amber underneath */}
        <radialGradient id="seal-rim" cx="38%" cy="28%" r="80%">
          <stop offset="0%"   stopColor="#FFF6C2"/>
          <stop offset="22%"  stopColor="#F8CE2C"/>
          <stop offset="55%"  stopColor="#C8900A"/>
          <stop offset="100%" stopColor="#5A3D00"/>
        </radialGradient>
        {/* Main disc — fuller gold with a hint of orange depth */}
        <radialGradient id="seal-face" cx="40%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#FFE588"/>
          <stop offset="40%"  stopColor="#EAB81E"/>
          <stop offset="78%"  stopColor="#A87308"/>
          <stop offset="100%" stopColor="#5C3D00"/>
        </radialGradient>
        {/* Inner medallion */}
        <radialGradient id="seal-inner" cx="42%" cy="34%" r="62%">
          <stop offset="0%"   stopColor="#FFE49C"/>
          <stop offset="55%"  stopColor="#CC9210"/>
          <stop offset="100%" stopColor="#6E4700"/>
        </radialGradient>
        {/* Specular sheen */}
        <radialGradient id="seal-shine" cx="32%" cy="22%" r="38%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.55)"/>
          <stop offset="60%"  stopColor="rgba(255,255,255,0.12)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
        {/* Soft drop shadow under the seal */}
        <filter id="seal-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="9" floodColor="rgba(0,0,0,0.55)"/>
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.5)"/>
        </filter>
        <clipPath id="seal-disc-clip">
          <circle cx="72" cy="72" r="52"/>
        </clipPath>
      </defs>

      {/* Scalloped outer edge */}
      <g filter="url(#seal-shadow)">
        <polygon points={starPoints} fill="url(#seal-rim)"/>
      </g>

      {/* Main disc face */}
      <circle cx="72" cy="72" r="52" fill="url(#seal-face)"/>

      {/* Outer rim bevel — light hairline above the rim, dark hairline below */}
      <circle cx="72" cy="72" r="51.5" fill="none" stroke="rgba(255,250,210,0.55)" strokeWidth="0.8"/>
      <circle cx="72" cy="72" r="49"   fill="none" stroke="rgba(80,50,0,0.5)"       strokeWidth="0.8"/>

      {/* Decorative double ring around the medallion */}
      <circle cx="72" cy="72" r="43"   fill="none" stroke="rgba(255,230,120,0.50)" strokeWidth="1.4"/>
      <circle cx="72" cy="72" r="41"   fill="none" stroke="rgba(80,50,0,0.45)"      strokeWidth="0.8"/>

      {/* Inner medallion — slightly recessed */}
      <circle cx="72" cy="72" r="38"   fill="url(#seal-inner)"/>
      <circle cx="72" cy="72" r="37.6" fill="none" stroke="rgba(255,240,180,0.35)" strokeWidth="0.6"/>

      {/* Top arc — SWITCH (path is a real upper semicircle) */}
      <path id="seal-arc-top" d="M 36,72 A 36,36 0 0,1 108,72" fill="none"/>
      <text fontSize="9" fontWeight="800" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(60,35,0,0.85)" letterSpacing="5">
        <textPath href="#seal-arc-top" startOffset="50%" textAnchor="middle">SWITCH</textPath>
      </text>

      {/* Centred S monogram inside the inner medallion */}
      <text x="72" y="72" textAnchor="middle" dominantBaseline="central"
            fontSize="42" fontWeight="900" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(55,30,0,0.92)" letterSpacing="-1">S</text>

      {/* Bottom arc — VERIFIED (path runs right→left along the bottom so
          textPath renders upright when read along the curve) */}
      <path id="seal-arc-bot" d="M 108,72 A 36,36 0 0,1 36,72" fill="none"/>
      <text fontSize="7" fontWeight="700" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(60,35,0,0.70)" letterSpacing="4">
        <textPath href="#seal-arc-bot" startOffset="50%" textAnchor="middle">VERIFIED</textPath>
      </text>

      {/* Tiny ornamental dots at top/bottom of the arcs */}
      {[
        { x: 72,    y: 30,   r: 1.6 },
        { x: 72,    y: 114,  r: 1.6 },
        { x: 30,    y: 72,   r: 1.4 },
        { x: 114,   y: 72,   r: 1.4 },
      ].map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgba(60,35,0,0.55)"/>
      ))}

      {/* Cardinal star sparkles at the rim */}
      {[45, 135, 225, 315].map(deg => {
        const r = deg * Math.PI / 180
        return (
          <circle key={deg}
            cx={72 + 47 * Math.cos(r)}
            cy={72 + 47 * Math.sin(r)}
            r="1.2"
            fill="rgba(255,245,180,0.7)"/>
        )
      })}

      {/* Specular sheen on top-left — clipped to the disc so it doesn't spill */}
      <ellipse cx="58" cy="50" rx="24" ry="16" fill="url(#seal-shine)" clipPath="url(#seal-disc-clip)"/>
    </svg>
  )
}

/* ── Premium B&W "Switch" verified seal ─────────────────────────────────────
   Mirror of the gold WaxSeal above but tuned for the premium B&W palette —
   brushed graphite rim, monochrome face, embossed "S" monogram, "SWITCH"
   top arc and "VERIFIED" bottom arc. Sized 96px so it reads as the hero of
   the trust card.
─────────────────────────────────────────────────────────────────────────── */
function MonoSeal() {
  const CX = 72, CY = 72
  const N = 18
  const R_OUT = 66, R_IN = 60
  const starPoints = Array.from({ length: N * 2 }, (_, i) => {
    const angle = (i * Math.PI) / N - Math.PI / 2
    const r     = i % 2 === 0 ? R_OUT : R_IN
    return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`
  }).join(' ')
  return (
    <svg width="96" height="96" viewBox="0 0 144 144" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Switch verified seal" role="img">
      <defs>
        <radialGradient id="mseal-rim" cx="38%" cy="28%" r="80%">
          <stop offset="0%"   stopColor="#FFFFFF"/>
          <stop offset="22%"  stopColor="#BFC1C7"/>
          <stop offset="55%"  stopColor="#5A5D67"/>
          <stop offset="100%" stopColor="#15171C"/>
        </radialGradient>
        <radialGradient id="mseal-face" cx="40%" cy="32%" r="70%">
          <stop offset="0%"   stopColor="#FFFFFF"/>
          <stop offset="42%"  stopColor="#D8DAE0"/>
          <stop offset="78%"  stopColor="#5A5D67"/>
          <stop offset="100%" stopColor="#1A1C22"/>
        </radialGradient>
        <radialGradient id="mseal-inner" cx="42%" cy="34%" r="62%">
          <stop offset="0%"   stopColor="#FFFFFF"/>
          <stop offset="55%"  stopColor="#A1A4AC"/>
          <stop offset="100%" stopColor="#2A2C32"/>
        </radialGradient>
        <radialGradient id="mseal-shine" cx="32%" cy="22%" r="38%">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.6)"/>
          <stop offset="60%"  stopColor="rgba(255,255,255,0.15)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </radialGradient>
        <filter id="mseal-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="rgba(0,0,0,0.55)"/>
          <feDropShadow dx="0" dy="1" stdDeviation="2"  floodColor="rgba(0,0,0,0.45)"/>
        </filter>
        <clipPath id="mseal-disc-clip">
          <circle cx="72" cy="72" r="52"/>
        </clipPath>
      </defs>

      {/* Scalloped outer edge */}
      <g filter="url(#mseal-shadow)">
        <polygon points={starPoints} fill="url(#mseal-rim)"/>
      </g>

      {/* Main disc face */}
      <circle cx="72" cy="72" r="52" fill="url(#mseal-face)"/>

      {/* Rim bevel */}
      <circle cx="72" cy="72" r="51.5" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>
      <circle cx="72" cy="72" r="49"   fill="none" stroke="rgba(0,0,0,0.45)"        strokeWidth="0.8"/>

      {/* Decorative double ring */}
      <circle cx="72" cy="72" r="43"   fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2"/>
      <circle cx="72" cy="72" r="41"   fill="none" stroke="rgba(0,0,0,0.35)"        strokeWidth="0.8"/>

      {/* Inner medallion */}
      <circle cx="72" cy="72" r="38"   fill="url(#mseal-inner)"/>
      <circle cx="72" cy="72" r="37.6" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.6"/>

      {/* Top arc — SWITCH */}
      <path id="mseal-arc-top" d="M 36,72 A 36,36 0 0,1 108,72" fill="none"/>
      <text fontSize="9" fontWeight="800" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(20,20,24,0.85)" letterSpacing="5">
        <textPath href="#mseal-arc-top" startOffset="50%" textAnchor="middle">SWITCH</textPath>
      </text>

      {/* S monogram */}
      <text x="72" y="72" textAnchor="middle" dominantBaseline="central"
            fontSize="42" fontWeight="900" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(20,20,24,0.90)" letterSpacing="-1">S</text>

      {/* Bottom arc — VERIFIED */}
      <path id="mseal-arc-bot" d="M 108,72 A 36,36 0 0,1 36,72" fill="none"/>
      <text fontSize="7" fontWeight="700" fontFamily="DM Sans, Arial, sans-serif"
            fill="rgba(20,20,24,0.70)" letterSpacing="4">
        <textPath href="#mseal-arc-bot" startOffset="50%" textAnchor="middle">VERIFIED</textPath>
      </text>

      {/* Tiny dots */}
      {[
        { x: 72, y: 30, r: 1.6 },
        { x: 72, y: 114, r: 1.6 },
        { x: 30, y: 72, r: 1.4 },
        { x: 114, y: 72, r: 1.4 },
      ].map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="rgba(20,20,24,0.55)"/>
      ))}

      {/* Specular sheen */}
      <ellipse cx="58" cy="50" rx="24" ry="16" fill="url(#mseal-shine)" clipPath="url(#mseal-disc-clip)"/>
    </svg>
  )
}

/* ── Service card metadata ────────────────────────────────────────────────
   Reviews/ratings aren't tracked in DB yet, so we derive deterministic
   "feels-right" numbers per service from a fixed table. The icon inside the
   white plate is a Lucide-style glyph matched to the service's vibe.
─────────────────────────────────────────────────────────────────────────── */
// Standard rate across the home grid. Standardising display avoids the
// awkward "₹99 here, ₹249 there" mismatch — variable per-service rates
// still apply server-side via lib/slots.
const STD_RATE = 149
const STD_UNIT = '/hr'

// Per-service display metadata. Review counts are intentionally honest-looking
// (sub-200) — early-stage marketplace numbers, not the "12K reviews" claims
// you'd see on a 5-year-old app. Star ratings stay in the realistic 4.6–4.9
// band that real Indian gig platforms report.
const SERVICE_META: Record<string, { rate: number; unit: string; rating: string; reviews: string; iconPath: string }> = {
  'Maid':             { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '187', iconPath: 'M3 21h18M5 21V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v13M9 12h6M9 16h6' },
  'Cook':             { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '142', iconPath: 'M4 13h16l-1 8H5l-1-8zM6 13a6 6 0 0 1 12 0M12 4v3' },
  'Kitchen Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '98',  iconPath: 'M14 3l5 5-7 7-5-5 7-7zM9 14l-4 4 2 2 4-4' },
  'Driver':           { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '156', iconPath: 'M5 10l1.5-4h11L19 10M3 10h18v6h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3v-6z' },
  'General Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '76',  iconPath: 'M9 7l3-3 3 3M12 4v12M5 14l3 3h8l3-3' },
  // Below — also surfaced on the All Services page, kept here for the
  // ServiceDetailSheet's related-services tabs.
  'Caretaker':        { rate: STD_RATE, unit: STD_UNIT, rating: '4.9', reviews: '52',  iconPath: 'M12 21s-7-4-7-10a7 7 0 1 1 14 0c0 6-7 10-7 10z' },
  'Waiter':           { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '88',  iconPath: 'M12 3v3M5 9h14a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4zM12 13v8M8 21h8' },
  'Bartender':        { rate: STD_RATE, unit: STD_UNIT, rating: '4.8', reviews: '47',  iconPath: 'M5 4h14l-6 7v6h3v3H8v-3h3v-6L5 4z' },
  'Security Guard':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.7', reviews: '109', iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
  'Bouncer':          { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '34',  iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  'Promoter':         { rate: STD_RATE, unit: STD_UNIT, rating: '4.6', reviews: '41',  iconPath: 'M3 11l18-8-5 18-3-8-3 3-7-5z' },
  'Factory Helper':   { rate: STD_RATE, unit: STD_UNIT, rating: '4.5', reviews: '28',  iconPath: 'M3 21h18M4 21V10l5-3v3l5-3v3l5-3v14M9 15h2M14 15h2' },
}

// The 5 services we surface on the dashboard. The 6th tile in the grid is a
// "More services" CTA that routes to the full /employer/services page.
// Each entry below must have a matching `sw-*.jpg` in public/icons/services.
const HOME_SERVICES = ['Maid', 'Cook', 'Kitchen Helper', 'Driver', 'Security Guard'] as const

function ServiceCard({ name, info, index, onClick }: { name: string; info: { img: string; cat: string; rate: number; useCase: ('home'|'business')[] }; index: number; onClick: () => void }) {
  const meta = SERVICE_META[name] || { rate: info.rate, unit: '/hr', rating: '4.7', reviews: '100', iconPath: 'M12 2v20M2 12h20' }

  return (
    <button onClick={onClick}
      className="emp-tile emp-fade-in"
      style={{
        animationDelay: `${Math.min(index, 8) * 40}ms`,
        background: '#0E1014', border: `1px solid ${'rgba(255,255,255,0.07)'}`,
        borderRadius: 18, padding: 0, overflow: 'hidden', cursor: 'pointer',
        textAlign: 'left' as const, fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
        color: '#FFFFFF', display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 22px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
      {/* Rectangle image area (5:6 portrait) — taller than wide so the
          worker photo dominates the card and the dark panel underneath
          reads as a thin metadata strip rather than a competing block. */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '5/6', overflow: 'hidden', background: '#0A0B0E' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={info.img} alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }} />

        {/* Bottom gradient for title legibility. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.92) 100%)', pointerEvents: 'none' }} />

        {/* White circular service-glyph plate */}
        <div style={{ position: 'absolute', left: 10, bottom: 56, width: 32, height: 32, borderRadius: 16, background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.30)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0A0B0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={meta.iconPath}/>
          </svg>
        </div>

        {/* Title + price overlay at bottom */}
        <div style={{ position: 'absolute', left: 10, right: 10, bottom: 8, color: '#FFFFFF' }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{name}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.82)', fontWeight: 600, marginTop: 3 }}>
            Starting at <span style={{ color: '#FFFFFF', fontWeight: 800 }}>₹{meta.rate}{meta.unit}</span>
          </div>
        </div>
      </div>

      {/* Compact metadata strip — rating + verified + Book Now packed
          into one tight band so the worker photo above stays the focus. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#FFFFFF', fontWeight: 800, minWidth: 0 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#FFFFFF"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          {meta.rating}
          <span style={{ color: 'rgba(255,255,255,0.50)', fontWeight: 600, fontSize: 11 }}>({meta.reviews})</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'rgba(255,255,255,0.72)', fontWeight: 700 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Verified
        </span>
      </div>

      {/* Book Now — tight white pill at the very bottom. */}
      <div style={{ padding: '0 8px 8px' }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '9px 12px', borderRadius: 10, background: '#FFFFFF', color: '#000', fontWeight: 600, fontSize: 15, letterSpacing: -0.1 }}>
          <span>Book Now</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>
    </button>
  )
}

// Horizontal-scrolling offer banner shown above the service grid. Surfaces
// active promo codes (SAVE50, etc.) without forcing the user to dig into
// the cart sheet to apply them.
function OfferBanner({ onView }: { onView: () => void }) {
  const offers = [
    { tag: 'SAVE50',      title: '₹50 off your first booking',      sub: 'Auto-applied at checkout' },
    { tag: 'BIGBOOK150',  title: '₹150 off · on ₹999+ bookings',    sub: 'Stack with multi-day or multi-worker' },
    { tag: 'WELCOME10',   title: '10% off · up to ₹200',            sub: 'For returning customers · min ₹300' },
  ]
  return (
    <div style={{ padding: '0 0 16px 16px', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
      <div style={{ display: 'flex', gap: 10, width: 'max-content', paddingRight: 16 }}>
        {offers.map(o => (
          <button key={o.tag} onClick={onView}
            className="emp-press"
            style={{
              flexShrink: 0, width: 280, minHeight: 96,
              borderRadius: 18, padding: '14px 16px',
              background: 'linear-gradient(135deg, #16181F 0%, #0E1014 100%)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 10px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', gap: 14,
              color: '#FFFFFF', fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
              textAlign: 'left' as const, cursor: 'pointer',
            }}>
            <div style={{
              flexShrink: 0, width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)',
              border: '1px solid rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                <line x1="7" y1="7" x2="7.01" y2="7"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#FFFFFF', letterSpacing: -0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {o.title}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.58)', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {o.sub}
              </div>
              <div style={{ marginTop: 7, display: 'inline-block', padding: '3px 9px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.18)', fontSize: 12, fontWeight: 800, letterSpacing: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {o.tag}
              </div>
            </div>
          </button>
        ))}
        <button onClick={onView}
          className="emp-press"
          style={{
            flexShrink: 0, width: 120, minHeight: 96,
            borderRadius: 18, padding: '14px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px dashed rgba(255,255,255,0.18)',
            display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 6,
            color: '#FFFFFF', fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
            cursor: 'pointer',
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          <span style={{ fontSize: 14, fontWeight: 800 }}>View all</span>
        </button>
      </div>
    </div>
  )
}

// "More services" CTA tile that takes the 6th slot in the home grid.
function MoreServicesCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="emp-tile emp-fade-in"
      style={{
        animationDelay: '240ms',
        background: 'linear-gradient(160deg, #16181F 0%, #0E1014 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 18, padding: 0, overflow: 'hidden', cursor: 'pointer',
        fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
        color: '#FFFFFF', display: 'flex', flexDirection: 'column' as const,
        boxShadow: '0 10px 22px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.05)',
        textAlign: 'left' as const,
      }}>
      {/* Rectangle content area — matches the 5:6 ServiceCard image. */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '5/6', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 14, background: 'radial-gradient(120% 80% at 50% 25%, rgba(255,255,255,0.06), transparent 55%)' }}>
        {/* Mini 2x2 preview of service tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 6, width: 76, height: 76 }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }} />
          ))}
        </div>
        <div style={{ textAlign: 'center' as const }}>
          <div style={{ fontSize: 19, fontWeight: 900, color: '#FFFFFF', letterSpacing: -0.4 }}>+{count} more</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.60)', marginTop: 4 }}>Tap to view all services</div>
        </div>
      </div>
      <div style={{ padding: '0 8px 8px' }}>
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: '#FFFFFF', fontWeight: 800, fontSize: 13, letterSpacing: -0.1 }}>
          <span>View all</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </div>
      </div>
    </button>
  )
}

// Bottom nav lives in components/employer/EmpBottomNav.tsx — shared across
// /employer, /employer/jobs, /employer/wallet, /employer/profile so the
// strip stays mounted as you tab between them. Previously /employer/jobs
// rendered no bottom nav at all, which made the screen look like it broke
// when navigating from the home tab.

// Shared style for the three top-right icon buttons so wallet / refer /
// profile all read as a consistent set. Avatar variant keeps the same outer
// shape but renders the user's initial inside instead of an SVG.
const topIconBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 20,
  background: '#13151B',
  border: '1px solid rgba(255,255,255,0.07)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#FFFFFF', cursor: 'pointer',
}
const topIconBtnAvatar: React.CSSProperties = {
  ...topIconBtn,
  fontWeight: 900, fontSize: 16,
  fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
  background: 'linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)',
  border: '1px solid rgba(255,255,255,0.18)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
}

export default function EmployerHome() {
  const router = useRouter()
  const [auth, setAuth] = useState<'checking' | 'ok' | 'redirecting'>('checking')
  const [employer,   setEmployer]   = useState<any>(null)
  const [activeJobs, setActiveJobs] = useState<any[]>([])
  const [pendingPayJobs, setPendingPayJobs] = useState<any[]>([])
  const [recentTitles, setRecentTitles] = useState<string[]>([])
  // Instant booking was removed — every employer order goes through the
  // scheduled flow now. Kept as a const so downstream code that still
  // reads `mode` doesn't need a full refactor.
  const mode = 'schedule' as const
  // Default to the 8-hour ("Full Day") slot regardless of where it sits
  // in the SLOTS array. Indexing by position broke when 1h/2h were
  // prepended — the home tab started highlighting "2 hrs" instead.
  const [slot,       setSlot]       = useState<typeof SLOTS[number]>(SLOTS.find(s => s.id === '8h') ?? SLOTS[0])
  const [cat,        setCat]        = useState<typeof CATS[number]>('All')
  // Service-detail sheet: which service the employer is previewing. null
  // means closed. Tapping any service tile opens it; Schedule / Book Instant
  // inside the sheet then route on to /schedule/[svc] or /cart.
  const [previewService, setPreviewService] = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  // 'all' shows every service; 'home' filters to personal-use services;
  // 'business' to commercial / event staffing. Default is derived from the
  // employer's saved businessType ("Personal / Individual" → home, else
  // business). Stored locally so refreshing keeps the user's last view.
  const [useCase, setUseCase] = useState<'all' | 'home' | 'business'>('all')
  // If the employer signed up as Home, hide the Business/All toggles so
  // the home tab only shows home services. Same for Business signups.
  // Derived from EmployerProfile.businessType on first fetch.
  const [lockedUseCase, setLockedUseCase] = useState<'home' | 'business' | null>(null)
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const [hasAnyJobs,  setHasAnyJobs]  = useState<boolean | null>(null) // null until we know

  // Show the welcome card on first visit (no past jobs + not dismissed)
  useEffect(() => {
    if (hasAnyJobs === false && typeof window !== 'undefined' && !localStorage.getItem('emp_welcome_dismissed')) {
      setWelcomeOpen(true)
    }
  }, [hasAnyJobs])

  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('emp_splashed')) {
      setAuth('redirecting')
      window.location.replace('/employer/splash')
      return
    }
    // Hold the render until the auth check resolves. Without this, the page
    // briefly flashes the full home UI (with default placeholder values) for
    // an unauthenticated user before the redirect to /employer/login fires —
    // which is what the user reported as "showing employer home page".
    fetch('/api/employer/profile').then(r => {
      if (r.status === 401 || r.status === 403 || r.status === 404) {
        setAuth('redirecting')
        router.replace('/employer/login')
        return Promise.reject('auth')
      }
      return r.json()
    }).then(d => {
      if (d && d.error) {
        setAuth('redirecting')
        router.replace('/employer/login')
        return
      }
      setEmployer(d.user || d.profile)
      setAuth('ok')
      // Seed the use-case filter from the employer's stored businessType.
      // localStorage wins over the profile so a user who explicitly switched
      // views keeps their choice across reloads.
      try {
        // Hard-lock by signup type — if employer chose Home at signup, the
        // home tab only shows home services and the toggle is hidden.
        const bt = (d?.user?.employerProfile?.businessType || d?.profile?.businessType || '') as string
        if (bt === 'Personal / Individual') {
          setLockedUseCase('home')
          setUseCase('home')
        } else if (bt) {
          setLockedUseCase('business')
          setUseCase('business')
        } else {
          // No signup type stored — fall back to localStorage preference.
          const stored = localStorage.getItem('emp_use_case')
          if (stored === 'home' || stored === 'business' || stored === 'all') setUseCase(stored)
        }
      } catch { /* ignore */ }
    }).catch(e => { if (e !== 'auth') console.error('profile fetch error', e) })

    fetch('/api/employer/jobs').then(r => r.json()).then(d => {
      if (d.jobs) {
        const jobs = d.jobs as Array<{ status: string; title: string; bookings?: Array<{ status: string; paymentStatus: string }> }>
        setHasAnyJobs(jobs.length > 0)
        // Match prisma ShiftStatus exactly. ON_THE_WAY/ARRIVED/STARTED were
        // never in the enum, so the active-job banner silently dropped any
        // shift in IN_PROGRESS.
        setActiveJobs(jobs.filter(j => ['SEARCHING', 'ASSIGNED', 'IN_PROGRESS'].includes(j.status)))
        // Shifts with at least one booking awaiting payment
        setPendingPayJobs(jobs.filter(j => j.bookings?.some(b => b.status === 'PENDING' && b.paymentStatus === 'PENDING')))
        // Distinct service titles from past bookings, most-recent first.
        // Used to power the "Book again" rail above the services grid.
        const seen = new Set<string>()
        const ordered: string[] = []
        for (const j of jobs) {
          if (!j.title) continue
          if (seen.has(j.title)) continue
          seen.add(j.title)
          ordered.push(j.title)
          if (ordered.length >= 4) break
        }
        setRecentTitles(ordered)
      } else {
        setHasAnyJobs(false)
      }
    }).catch(() => setHasAnyJobs(false))
  }, [])

  function dismissWelcome() {
    setWelcomeOpen(false)
    try { localStorage.setItem('emp_welcome_dismissed', '1') } catch {}
  }

  if (auth !== 'ok') {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%',
          border: '2.5px solid rgba(255,255,255,0.1)', borderTopColor: T1,
          animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  const bizName   = employer?.employerProfile?.companyName || employer?.name || 'there'
  const initial   = bizName[0]?.toUpperCase() || 'E'
  const hour      = new Date().getHours()
  const greet     = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
  // Instant booking was retired — no urgent-pricing multiplier.
  const instMulti = 1

  const filtered = Object.entries(ROLES).filter(([name, info]) => {
    const matchCat  = cat === 'All' || info.cat === cat
    const matchSrch = !search || name.toLowerCase().includes(search.toLowerCase())
    const matchUse  = useCase === 'all' || info.useCase.includes(useCase)
    return matchCat && matchSrch && matchUse
  })

  function pickUseCase(next: 'all' | 'home' | 'business') {
    setUseCase(next)
    try { localStorage.setItem('emp_use_case', next) } catch {}
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FONT, color: T1, overflowX: 'hidden' }}>

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div style={{ padding: 'calc(14px + env(safe-area-inset-top)) 18px 14px', background: BG }}>
        {/* Greeting row — simple "Good {time}, {first name}" with the
            classic 3-icon cluster on the right. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, color: T2, fontWeight: 700, marginBottom: 4 }}>
              Good {greet} <span aria-hidden>👋</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.6, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
              {(employer?.name || bizName || 'there').split(' ')[0]}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {activeJobs.length > 0 && (
              <button onClick={() => router.push(`/employer/job/${activeJobs[0].id}`)} aria-label="Live job"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: FONT }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', display: 'inline-block', animation: 'glow 1.5s ease infinite' }} />
                Live
              </button>
            )}
            <button className="emp-iconbtn" aria-label="Wallet"
              onClick={() => router.push('/employer/wallet')}
              style={topIconBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/>
                <path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/>
                <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
              </svg>
            </button>
            <button className="emp-iconbtn" aria-label="Refer & Earn"
              onClick={() => router.push('/employer/refer')}
              style={topIconBtn}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="8" width="18" height="4" rx="1"/>
                <path d="M12 8v13"/>
                <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
                <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
              </svg>
            </button>
            <button className="emp-iconbtn" aria-label="Profile"
              onClick={() => router.push('/employer/profile')}
              style={topIconBtnAvatar}>
              {initial}
            </button>
          </div>
        </div>

        {/* Big search bar */}
        <div style={{ background: S1, borderRadius: 16, border: `1px solid ${BD}`, display: 'flex', alignItems: 'center', gap: 12, padding: '15px 18px', marginBottom: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T2} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search for services like maid, cook, driver…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, color: T1, fontFamily: FONT, background: 'transparent' }} />
          {search && <button onClick={() => setSearch('')} aria-label="Clear search" style={{ background: 'none', border: 'none', cursor: 'pointer', color: T2, fontSize: 20, padding: 0, lineHeight: 1 }}>×</button>}
        </div>

        {/* Map — sits right under the search bar so the employer sees
            nearby workers before scrolling to the service grid. */}
        <div className="emp-fade-in" style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${BD}`, position: 'relative', marginBottom: 14 }}>
          <div style={{ height: 220 }}>
            <EmpMap />
          </div>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(8,9,12,0.78) 0%, rgba(8,9,12,0) 100%)', padding: '32px 14px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', pointerEvents: 'none' }}>
            <button className="emp-press"
              onClick={() => router.push(activeJobs.length > 0 ? `/employer/job/${activeJobs[0].id}` : '/employer/services')}
              style={{
                padding: '9px 18px', borderRadius: 20, background: T1, border: 'none',
                color: '#000', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: FONT,
                pointerEvents: 'auto',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
              }}>
              {activeJobs.length > 0 ? 'Track' : 'Browse'}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 14, scrollbarWidth: 'none' as const, paddingBottom: 2 }}>
          {[
            { id: 'All',      label: 'All',      glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
            { id: 'Home',     label: 'Home',     glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10 12 2l9 8"/><path d="M5 9v12h14V9"/></svg> },
            { id: 'Kitchen',  label: 'Kitchen',  glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13h16l-1 8H5l-1-8z"/><path d="M6 13a6 6 0 0 1 12 0"/><path d="M12 4v3"/></svg> },
            { id: 'Events',   label: 'Events',   glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
            { id: 'Security', label: 'Security', glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> },
            { id: 'Driver',   label: 'Driver',   glyph: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10l1.5-4h11L19 10"/><path d="M3 10h18v6h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3v-6z"/></svg> },
          ].map((c) => {
            const isSelected = c.id === 'All'
            return (
              <button key={c.id} className="emp-press"
                onClick={() => c.id === 'All' ? setSearch('') : router.push(`/employer/services?cat=${encodeURIComponent(c.id)}`)}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', borderRadius: 99,
                  background: isSelected ? T1 : S1,
                  border: `1.5px solid ${isSelected ? T1 : BD}`,
                  color: isSelected ? '#000' : T1,
                  fontFamily: FONT, fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                  cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  transition: 'background 180ms, color 180ms, border-color 180ms',
                }}>
                {c.glyph}
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>

        {/* Home vs Business filter — only rendered when the user hasn't
            been locked to one by their signup type. Home-signups never
            see the Business tab, and vice versa. */}
        {!lockedUseCase && (
          <div style={{ margin: '14px 16px 0', display: 'flex', gap: 8 }}>
            {([
              { id: 'all',      label: 'All',          emoji: ''   },
              { id: 'home',     label: 'For Home',     emoji: '🏠' },
              { id: 'business', label: 'For Business', emoji: '🏢' },
            ] as const).map(opt => {
              const on = useCase === opt.id
              return (
                <button key={opt.id} className="emp-press" onClick={() => pickUseCase(opt.id)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 14,
                    border: `1.5px solid ${on ? BA : BD}`,
                    background: on ? T1 : S1,
                    color: on ? '#000' : T2,
                    fontWeight: on ? 800 : 600, fontSize: 13, fontFamily: FONT, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    boxShadow: on ? '0 4px 14px rgba(255,255,255,0.10)' : 'none',
                    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease' }}>
                  {opt.emoji && <span style={{ fontSize: 14 }}>{opt.emoji}</span>}
                  <span>{opt.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {/* ── Welcome card — first-time users with no bookings yet ── */}
        {welcomeOpen && (
          <div style={{ margin: '12px 16px', background: 'linear-gradient(135deg, #0F2A1E 0%, #0D1F2D 100%)',
            borderRadius: 20, border: '1px solid rgba(20,184,166,0.25)', padding: '18px 18px 16px',
            position: 'relative', overflow: 'hidden' }}>
            <button onClick={dismissWelcome} aria-label="Dismiss"
              style={{ position: 'absolute', top: 10, right: 10, width: 28, height: 28, borderRadius: 14,
                background: 'rgba(255,255,255,0.06)', border: 'none', color: T2, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 }}>×</button>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#5EEAD4', letterSpacing: 0.6, textTransform: 'uppercase' as const, marginBottom: 6 }}>
              Welcome to Switch
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T1, marginBottom: 14, letterSpacing: -0.3 }}>
              Hire trusted workers in 3 taps
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { n: '1', t: 'Pick a service',    s: 'Choose from cleaning, cooking, security, and more' },
                { n: '2', t: 'Pay securely',      s: 'UPI / card via Razorpay — money held safely' },
                { n: '3', t: 'Worker arrives',    s: '~10 min for instant, scheduled for later' },
              ].map(s => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: 'rgba(20,184,166,0.18)',
                    color: '#5EEAD4', fontSize: 12, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{s.n}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T1 }}>{s.t}</div>
                    <div style={{ fontSize: 12, color: T2, marginTop: 1, lineHeight: '17px' }}>{s.s}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pending payment banner ─────────────────────────────── */}
        {pendingPayJobs.length > 0 && (
          <div className="emp-press" onClick={() => router.push(`/employer/job/${pendingPayJobs[0].id}/payment`)}
            style={{ margin: '12px 16px', background: 'rgba(245,197,24,0.10)', borderRadius: 18, border: '1px solid rgba(245,197,24,0.3)', padding: '16px 16px 16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, boxShadow: '0 4px 20px rgba(245,197,24,0.08)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase' as const, marginBottom: 5 }}>
                {pendingPayJobs.length} {pendingPayJobs.length === 1 ? 'booking' : 'bookings'} awaiting payment
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{pendingPayJobs[0].title}</div>
              <div style={{ fontSize: 13, color: T2, marginTop: 3 }}>
                Worker reserved — pay to confirm and start the shift
              </div>
            </div>
            {/* Chevron in a soft circle — bigger tap target + premium feel */}
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(245,197,24,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        )}

        {/* ── Active job banner ─────────────────────────────────── */}
        {activeJobs.length > 0 && (
          <div className="emp-press" onClick={() => router.push(`/employer/job/${activeJobs[0].id}`)} style={{ margin: '12px 16px', background: 'rgba(34,197,94,0.08)', borderRadius: 18, border: '1px solid rgba(34,197,94,0.2)', padding: '16px 16px 16px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, boxShadow: '0 4px 20px rgba(34,197,94,0.06)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase' as const, marginBottom: 5 }}>Active Job</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{activeJobs[0].title}</div>
              <div style={{ fontSize: 14, color: T2, marginTop: 3 }}>
                {activeJobs[0].status === 'SEARCHING' ? 'Searching for worker…' : activeJobs[0].status === 'IN_PROGRESS' ? 'In progress' : 'Worker en route'}
              </div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(34,197,94,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        )}

        {/* Map moved to top section (under search bar) — was here before. */}

        {/* Instant booking removed — only the scheduled flow remains.
            Workers all see the job on their dashboard, employer picks a
            specific date + start time at checkout. */}

        {/* Duration slot picker + category tabs removed — duration is now
            chosen on the schedule page after a service tile tap, and the
            service grid below is unfiltered by default. */}
        <div style={{ height: 6 }} />

        {/* ── Book again rail — past services for one-tap repeat ── */}
        {recentTitles.length > 0 && !search && cat === 'All' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: T1 }}>Book Again</div>
              <div style={{ fontSize: 12, color: T3 }}>Your recent services</div>
            </div>
            <div style={{ padding: '0 0 0 16px', overflowX: 'auto', scrollbarWidth: 'none' as const }}>
              <div style={{ display: 'flex', gap: 10, width: 'max-content', paddingRight: 16 }}>
                {recentTitles.map(title => {
                  const info = ROLES[title]
                  if (!info) return null
                  const catColor = CAT_COLORS[info.cat] || '#888'
                  return (
                    <button key={title} className="emp-press"
                      onClick={() => setPreviewService(title)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 8px',
                        borderRadius: 999, border: `1px solid ${BD}`, background: S1, cursor: 'pointer',
                        fontFamily: FONT, minWidth: 0, flexShrink: 0 }}>
                      <img src={info.img} alt="" style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover', flexShrink: 0 }} />
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: T1, whiteSpace: 'nowrap' as const }}>{title}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: T3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: catColor }} />
                          Book again
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Offer banner — horizontal-scroll carousel ───────────── */}
        <OfferBanner onView={() => router.push('/employer/offers')} />

        {/* ── Section header ────────────────────────────────────── */}
        <div style={{ padding: '0 16px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T1, letterSpacing: -0.5 }}>{search ? `"${search}"` : 'Popular Services'}</div>
            <div style={{ fontSize: 13, color: T2, marginTop: 3 }}>Tap to schedule</div>
          </div>
          <button onClick={() => router.push('/employer/services')} style={{ fontSize: 13, color: T1, fontWeight: 800, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: FONT, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            View all
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>

        {/* ── Service grid — 5 popular services + a "More" tile ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px' }}>
          {(() => {
            const homeList = HOME_SERVICES
              .map(n => [n, ROLES[n]] as const)
              .filter(([, info]) => !!info)
              .filter(([name]) => !search || name.toLowerCase().includes(search.toLowerCase()))
            const tiles: React.ReactNode[] = homeList.map(([name, info], idx) => (
              <ServiceCard
                key={name}
                name={name}
                info={info!}
                index={idx}
                onClick={() => setPreviewService(name)}
              />
            ))
            const remaining = Object.keys(ROLES).length - homeList.length
            if (!search && remaining > 0) {
              tiles.push(<MoreServicesCard key="__more__" count={remaining} onClick={() => router.push('/employer/services')} />)
            }
            return tiles
          })()}
        </div>
        {search && HOME_SERVICES.every(s => !s.toLowerCase().includes(search.toLowerCase())) && (
          <div style={{ textAlign: 'center', paddingTop: 30, color: T2 }}>
            Not in the popular list. <button onClick={() => router.push('/employer/services')} style={{ background: 'none', border: 'none', color: T1, fontWeight: 800, fontFamily: FONT, cursor: 'pointer' }}>View all services →</button>
          </div>
        )}

        {/* ── Refer & Earn banner — premium B&W ─────────────────── */}
        <button onClick={() => router.push('/employer/refer')}
          className="emp-press"
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            width: 'calc(100% - 32px)', margin: '24px 16px 0',
            padding: '18px 18px', borderRadius: 20,
            background: 'linear-gradient(135deg, #16181F 0%, #0E1014 100%)',
            border: `1px solid ${BD}`,
            color: T1, fontFamily: FONT, cursor: 'pointer',
            textAlign: 'left' as const, position: 'relative', overflow: 'hidden',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
          }}>
          {/* Subtle radial highlight */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.06), transparent 60%)', pointerEvents: 'none' }} />
          <div style={{
            position: 'relative', flexShrink: 0,
            width: 60, height: 60, borderRadius: 16,
            background: 'linear-gradient(135deg, #2A2A2A 0%, #0A0A0A 100%)',
            border: '1px solid rgba(255,255,255,0.16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="8" width="18" height="4" rx="1"/>
              <path d="M12 8v13"/>
              <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>
              <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ fontSize: 11, color: T2, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 4 }}>Refer & Earn</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: T1, letterSpacing: -0.4, lineHeight: 1.15 }}>
              Earn <span style={{ color: T1, background: 'linear-gradient(180deg,#FFFFFF 0%,#BFBFBF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' as any }}>₹150</span> per friend
            </div>
            <div style={{ fontSize: 12, color: T2, marginTop: 4 }}>Tap to share your code</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T3} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, position: 'relative' }}><polyline points="9 18 15 12 9 6"/></svg>
        </button>

        {/* ── Workers Vetted for Quality — Snabbit-style, premium B&W ── */}
        <div className="emp-fade-in" style={{ margin: '24px 16px 0', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(180deg, #0E1014 0%, #08090C 100%)', border: `1px solid ${BD}`, padding: '36px 24px 28px', textAlign: 'center' as const, position: 'relative' }}>
          {/* Soft top spotlight */}
          <div aria-hidden style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)', width: 280, height: 200, background: 'radial-gradient(circle, rgba(255,255,255,0.05), transparent 70%)', pointerEvents: 'none' }} />

          {/* Large centred metallic seal */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18, position: 'relative' }}>
            <MonoSeal />
          </div>

          <div style={{ fontSize: 22, fontWeight: 900, color: T1, letterSpacing: -0.5, marginBottom: 6 }}>Experts Vetted for Quality</div>
          <div style={{ fontSize: 13, color: T2, lineHeight: 1.5, marginBottom: 24, maxWidth: 280, marginInline: 'auto' as const }}>
            Every worker on Switch clears a 3-step verification.
          </div>

          {/* 3 trust badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
            {[
              { svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: 'Top rated'   },
              { svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>, label: 'Trained' },
              { svg: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>, label: 'Verified' },
            ].map(b => (
              <div key={b.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: '14px 6px', border: `1px solid ${BD}`, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 }}>
                {b.svg}
                <div style={{ fontSize: 12, fontWeight: 800, color: T1, letterSpacing: -0.1 }}>{b.label}</div>
              </div>
            ))}
          </div>

          {/* 4 trust checks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left' as const }}>
            {[
              'Govt ID verification on every worker',
              'Live GPS tracking during the job',
              '100% secure payments via Razorpay',
              'Satisfaction guarantee on every booking',
            ].map(txt => (
              <div key={txt} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: `1px solid ${BD}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T1} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize: 13, color: T1 }}>{txt}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 16 }} />
      </div>

      {previewService && (
        <ServiceDetailSheet
          service={previewService}
          mode={'home'}
          slot={slot.id}
          imgFor={(name) => ROLES[name]?.img ?? IMG('house-cleaner')}
          onClose={() => setPreviewService(null)}
        />
      )}

      <style>{`
        @keyframes glow{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes emp-fade-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .emp-fade-in { animation: emp-fade-up 380ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        .emp-press:active { transform: scale(0.98); transition: transform 80ms ease; }
        .emp-tile { transition: transform 120ms ease, box-shadow 200ms ease; }
        .emp-tile:active { transform: scale(0.97); }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  )
}
