'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { LEGAL_INFO } from '@/lib/legal'

/**
 * Combined legal page — Terms + Privacy in one place with a sticky tab
 * switcher. Profile menu now links here as a single "Terms & Privacy" item
 * instead of two; the standalone /terms and /privacy URLs still work for
 * deep links from emails, app prompts, etc.
 */

function LegalInner() {
  const params   = useSearchParams()
  const router   = useRouter()
  // Default to Terms; ?tab=privacy lands on the privacy view.
  const initial: Tab = params.get('tab') === 'privacy' ? 'privacy' : 'terms'
  const [tab, setTab] = useState<Tab>(initial)

  function setTabAndUrl(next: Tab) {
    setTab(next)
    // Reflect tab in URL without a full nav so users can share the link
    // and back-button cycles through tabs naturally.
    const usp = new URLSearchParams(params.toString())
    usp.set('tab', next)
    router.replace(`/legal?${usp.toString()}`)
  }

  return (
    <article style={pageStyle}>
      <header style={{ marginBottom: 8 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Switch · Legal</p>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#111111', margin: '6px 0 4px', letterSpacing: -0.5 }}>
          {tab === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', margin: 0 }}>Effective from {LEGAL_INFO.effectiveDate}</p>
      </header>

      <div style={tabBarStyle}>
        {(['terms', 'privacy'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTabAndUrl(t)} style={tabButtonStyle(t === tab)}>
            {t === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
          </button>
        ))}
      </div>

      <p style={summaryStyle}>
        {tab === 'terms'
          ? 'In plain English: Switch is a marketplace that connects workers with employers. We are not the employer. Show up to shifts you accept, do honest work, and treat each other with respect. Cancellations close to the start time have a small penalty. Earnings are paid via UPI within 24 hours of completion.'
          : "In plain English: we collect what we need to run the platform — your phone, name, KYC, and shift activity. We don't sell your data. Aadhaar is encrypted at rest. You can ask us to delete your data; some records (payments, tax) we have to keep by law."}
      </p>

      {tab === 'terms' ? <TermsBody /> : <PrivacyBody />}

      <footer style={footerStyle}>
        <button onClick={() => setTabAndUrl(tab === 'terms' ? 'privacy' : 'terms')}
          style={{ background: 'none', border: 'none', color: '#111', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', padding: 0, fontSize: 13 }}>
          {tab === 'terms' ? 'Read Privacy Policy →' : 'Read Terms of Service →'}
        </button>
        <span style={{ color: 'rgba(0,0,0,0.5)' }}> · </span>
        <Link href="/" style={{ color: 'rgba(0,0,0,0.5)' }}>Back to app</Link>
      </footer>
    </article>
  )
}

export default function LegalPage() {
  return <Suspense fallback={null}><LegalInner /></Suspense>
}

type Tab = 'terms' | 'privacy'

const pageStyle: React.CSSProperties = {
  // Body background is black (globals.css). Paint a full-height white
  // surface so the dark legal text stays readable.
  minHeight: '100vh',
  background: '#FFFFFF',
  maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px',
  fontFamily: '"DM Sans", system-ui, sans-serif',
  lineHeight: 1.65, color: '#111111',
}

const tabBarStyle: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 10,
  display: 'flex', gap: 8,
  margin: '20px -4px 18px',
  padding: '8px 4px',
  background: 'rgba(255,255,255,0.96)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '10px 14px', borderRadius: 12,
    border: `1.5px solid ${active ? '#111111' : 'rgba(0,0,0,0.1)'}`,
    background: active ? '#111111' : '#FFFFFF',
    color: active ? '#FFFFFF' : 'rgba(0,0,0,0.6)',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
  }
}

const summaryStyle: React.CSSProperties = {
  background: '#F7F7F7', borderRadius: 14, padding: '14px 16px',
  fontSize: 14, color: 'rgba(0,0,0,0.72)', lineHeight: 1.55,
  margin: '0 0 24px', border: '1px solid rgba(0,0,0,0.06)',
}

const subStyle: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: '#111111', marginTop: 18, marginBottom: 6 }
const footerStyle: React.CSSProperties = { marginTop: 48, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 13, textAlign: 'center' as const }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.78)' }}>{children}</div>
    </section>
  )
}

function TermsBody() {
  return (
    <>
      <Section title="1. Acceptance">
        <p>
          These Terms are a binding agreement between you and {LEGAL_INFO.companyName}
          (“{LEGAL_INFO.shortName}”). By creating an account, posting a Shift, accepting a Shift, or using any feature of the Platform you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Platform.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <ul>
          <li>You must be at least 18 years old.</li>
          <li>Provide accurate identity information; we may suspend accounts that supply false data.</li>
          <li>Workers must hold a valid Aadhaar to apply for KYC-required shifts.</li>
          <li>Employers must operate a lawful business in India and provide a valid GSTIN where required.</li>
        </ul>
      </Section>

      <Section title="3. Nature of the Platform">
        <p>
          {LEGAL_INFO.shortName} is a <strong>marketplace</strong> connecting independent Workers with Employers needing short-term help. We are an "intermediary" under §2(w) of the Information Technology Act 2000.
        </p>
        <ul>
          <li>{LEGAL_INFO.shortName} is <strong>not the employer</strong> of Workers. Workers are independent contractors of the Employer.</li>
          <li>We do not control how Employers run their business or how Workers perform a shift.</li>
          <li>We are not a party to the contract of service between Worker and Employer.</li>
        </ul>
      </Section>

      <Section title="4. Account">
        <ul>
          <li>Keep your login credentials confidential.</li>
          <li>You agree to receive notifications, OTPs, and service messages via SMS, push, and email.</li>
          <li>One person, one account. Duplicate accounts will be merged or banned.</li>
          <li>You may close your account anytime via Profile. Some records (booking, payment) are retained for tax compliance — see Privacy Policy.</li>
        </ul>
      </Section>

      <Section title="5. Worker terms">
        <h3 style={subStyle}>5.1 Conduct</h3>
        <ul>
          <li>Arrive on time and perform agreed work safely and lawfully.</li>
          <li>Wear appropriate clothing; bring tools the listing specifies.</li>
          <li>No harassment, theft, intoxication, or unsafe behaviour.</li>
          <li>Do not solicit Employer customers for off-Platform work — see §10.</li>
        </ul>
        <h3 style={subStyle}>5.2 No-show and cancellation</h3>
        <ul>
          <li>If you accept a Shift, complete it. 3 last-minute cancellations or no-shows in 30 days suspends your account.</li>
          <li>Cancelling more than 4 hours before start: warning only.</li>
          <li>Within 4 hours / no-show: ₹100 penalty deducted from next earnings.</li>
        </ul>
        <h3 style={subStyle}>5.3 Earnings and payouts</h3>
        <ul>
          <li>Earnings = <code>hourlyRate × hoursWorked × 0.85</code> + tier bonuses.</li>
          <li>Payouts go to your UPI within 24 hours of Shift completion (subject to Employer payment confirmation and KYC).</li>
          <li>If earnings cross ₹2,40,000 per FY, TDS is deducted per the Income Tax Act 1961.</li>
        </ul>
      </Section>

      <Section title="6. Employer terms">
        <h3 style={subStyle}>6.1 Posting</h3>
        <ul>
          <li>Listings must be lawful, accurate, and represent real work.</li>
          <li>No hazardous tasks without safety equipment, no illegal activity, no listings below State minimum wage.</li>
        </ul>
        <h3 style={subStyle}>6.2 Payment</h3>
        <ul>
          <li>Payment is collected upfront when an Employer confirms a Worker. Booking stays <em>Pending Payment</em> until our payment partner confirms receipt.</li>
          <li>Platform fee: 15% of the gross Shift amount. GST added at the prevailing rate.</li>
        </ul>
        <h3 style={subStyle}>6.3 Cancellations and refunds</h3>
        <ul>
          <li>More than 4 hours before start: full refund minus payment-gateway fee.</li>
          <li>Within 4 hours / Employer no-show: Worker paid 50% as standby fee; remainder refunded.</li>
          <li>Worker no-show: full refund. Worker penalised under §5.2.</li>
          <li>Refunds processed within 5 working days via the original payment instrument.</li>
        </ul>
        <h3 style={subStyle}>6.4 Worker conduct</h3>
        <p>Treat Workers with dignity, provide safe working conditions, follow all labour laws. Harassment, withholding payment, or unsafe environments will result in listing removal and possible legal escalation.</p>
      </Section>

      <Section title="7. Captain terms">
        <ul>
          <li>Captains are independent field reps who onboard Workers and Employers.</li>
          <li>Commissions paid per verified onboarding as published in-app.</li>
          <li>Captain accounts may be suspended for fraudulent referrals, fake KYC, or misleading new users.</li>
        </ul>
      </Section>

      <Section title="8. Ratings and reviews">
        <ul>
          <li>Both sides may rate each other after a completed Shift.</li>
          <li>Ratings must be honest. Coercing or buying ratings is prohibited.</li>
          <li>We may remove ratings that breach community standards.</li>
        </ul>
      </Section>

      <Section title="9. Prohibited conduct">
        <ul>
          <li>Off-Platform circumvention (arranging payment outside Switch to skip the platform fee).</li>
          <li>Fake accounts, multiple accounts, identity fraud.</li>
          <li>Scraping or automated access.</li>
          <li>Reverse engineering or modifying the apps.</li>
          <li>Using the Platform for unlawful activity.</li>
        </ul>
        <p>Violations result in suspension, forfeiture of pending earnings, and (where appropriate) legal action.</p>
      </Section>

      <Section title="10. Anti-circumvention">
        <p>For 6 months after a Shift, the Worker and Employer agree not to engage each other for similar work outside the Platform. If they wish to do so, it must be through the Platform so the appropriate fee and protections apply.</p>
      </Section>

      <Section title="11. Intellectual property">
        <p>All content, branding, and software in the Platform belong to {LEGAL_INFO.companyName}. You may not copy, redistribute, or create derivative works without written permission. User-generated content (ratings, photos) remains yours; you grant us a non-exclusive, worldwide licence to host and display it within the Platform.</p>
      </Section>

      <Section title="12. Disclaimers">
        <p>The Platform is provided "as is". We do not warrant uninterrupted service, freedom from errors, or that matchmaking will produce specific outcomes. We are not responsible for the conduct of any Worker or Employer.</p>
      </Section>

      <Section title="13. Limitation of liability">
        <p>To the fullest extent permitted by law, {LEGAL_INFO.companyName}'s aggregate liability for any claim arising out of these Terms is limited to the platform fees you paid us in the 6 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.</p>
      </Section>

      <Section title="14. Indemnity">
        <p>You agree to indemnify {LEGAL_INFO.companyName}, its officers, employees, and partners from any claim arising out of your use of the Platform, your interaction with another user, or your breach of these Terms.</p>
      </Section>

      <Section title="15. Suspension and termination">
        <p>We may suspend or terminate accounts that breach these Terms, post unsafe or unlawful listings, or harm other users. We will give a written reason wherever reasonably possible.</p>
      </Section>

      <Section title="16. Disputes">
        <p>Use the in-app dispute flow first. If unresolved within 14 days:</p>
        <ul>
          <li><strong>Governing law:</strong> the laws of India.</li>
          <li><strong>Exclusive jurisdiction:</strong> the courts at the city of our registered office.</li>
          <li>Consumers retain their rights under the Consumer Protection Act 2019.</li>
        </ul>
      </Section>

      <Section title="17. Changes to these Terms">
        <p>We may update these Terms as the Platform evolves. Material changes will be notified at least 7 days before they take effect. Continued use after the effective date means you accept them.</p>
      </Section>

      <Section title="18. Contact">
        <ul>
          <li><strong>Support:</strong> <a href={`mailto:${LEGAL_INFO.supportEmail}`}>{LEGAL_INFO.supportEmail}</a></li>
          <li><strong>Grievance Officer:</strong> {LEGAL_INFO.grievanceOfficerName}, <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a></li>
          <li><strong>Registered office:</strong> {LEGAL_INFO.registeredAddress}</li>
        </ul>
      </Section>
    </>
  )
}

function PrivacyBody() {
  return (
    <>
      <Section title="1. Who we are">
        <p>
          {LEGAL_INFO.companyName} ("{LEGAL_INFO.shortName}", "we", "us") operates the Switch marketplace. Our registered office is at {LEGAL_INFO.registeredAddress}. For privacy queries, contact our Grievance Officer at <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a>.
        </p>
      </Section>

      <Section title="2. What we collect">
        <h3 style={subStyle}>2.1 You give us</h3>
        <ul>
          <li>Phone number (used to log in and verify accounts).</li>
          <li>Name, role (Worker / Employer / Captain), city.</li>
          <li>Profile photo (optional; helps the other side recognise you).</li>
          <li>For Workers: Aadhaar number, Aadhaar front and back photos for KYC.</li>
          <li>For Employers: business name, GSTIN if applicable, address, business type.</li>
          <li>For Workers: UPI ID for payouts.</li>
          <li>Ratings, reviews, in-app messages.</li>
        </ul>
        <h3 style={subStyle}>2.2 We collect automatically</h3>
        <ul>
          <li>Device info (model, OS version) and approximate IP location for fraud prevention.</li>
          <li>Precise GPS while you have an active shift, to verify arrival and ETA.</li>
          <li>App diagnostics (crashes, performance) via Sentry.</li>
          <li>Analytics events (which screens you visit) via PostHog.</li>
        </ul>
      </Section>

      <Section title="3. Why we use your data">
        <ul>
          <li><strong>Run the service:</strong> match Workers and Employers, process payments, send OTPs.</li>
          <li><strong>KYC & safety:</strong> verify identity per the IT Rules 2011 / 2021 and the Code on Wages 2019; investigate fraud or harassment reports.</li>
          <li><strong>Notifications:</strong> shift assignments, payment alerts, new listings.</li>
          <li><strong>Improve the platform:</strong> aggregate analytics to find broken flows.</li>
          <li><strong>Comply with the law:</strong> tax filings, Aadhaar Act 2016, DPDP Act 2023.</li>
        </ul>
      </Section>

      <Section title="4. Aadhaar handling">
        <ul>
          <li>Aadhaar is collected only for KYC of Workers — the Aadhaar Act and the IT Rules require identity proof for marketplace platforms.</li>
          <li>Aadhaar number and images are encrypted at rest and never shared with Employers.</li>
          <li>You may withdraw consent at any time, but you will no longer be eligible for KYC-restricted shifts.</li>
        </ul>
      </Section>

      <Section title="5. Sharing your data">
        <ul>
          <li><strong>The other side of a shift</strong> sees your name, photo, rating, and (for the Worker on a confirmed shift) your phone number.</li>
          <li><strong>Captains</strong> who referred you see your status and the count of completed shifts.</li>
          <li><strong>Service providers:</strong> Razorpay (payments), Firebase (auth/notifications), Sentry (diagnostics), PostHog (analytics). Each is contractually bound to protect your data.</li>
          <li><strong>Government / law enforcement</strong> when legally compelled.</li>
        </ul>
        <p>We do <strong>not</strong> sell your data.</p>
      </Section>

      <Section title="6. Where we store data">
        <p>Data is stored on infrastructure operated by Railway, Vercel, and Supabase. Production databases are hosted in India where available; some operational data may transit through other regions for redundancy. We rely on Standard Contractual Clauses where applicable.</p>
      </Section>

      <Section title="7. How long we keep it">
        <ul>
          <li>Account data: while your account is active, plus up to 90 days after deletion.</li>
          <li>Payment and tax records: 8 years (Income Tax Act 1961, GST Act 2017).</li>
          <li>KYC records: 5 years from last activity (PMLA / IT Rules guidance).</li>
          <li>Logs and analytics: rolling 24 months.</li>
        </ul>
      </Section>

      <Section title="8. Your rights">
        <p>Under the DPDP Act 2023 you can:</p>
        <ul>
          <li>Access and correct your personal data.</li>
          <li>Erase your account (subject to the retention rules above).</li>
          <li>Withdraw consent (some features may stop working as a result).</li>
          <li>Nominate someone to act for you in case of incapacity.</li>
          <li>Raise a grievance with our Grievance Officer; if unresolved, escalate to the Data Protection Board of India.</li>
        </ul>
        <p>Use the Profile screen for self-service or email <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a>.</p>
      </Section>

      <Section title="9. Security">
        <p>We use HTTPS in transit, AES-256 at rest for sensitive fields, role-based access for our team, and quarterly access audits. We respond to security reports at <a href={`mailto:${LEGAL_INFO.securityEmail}`}>{LEGAL_INFO.securityEmail}</a>.</p>
      </Section>

      <Section title="10. Children">
        <p>The Platform is for users 18+. If we discover an account belongs to a minor, we will deactivate it and delete personal data.</p>
      </Section>

      <Section title="11. Changes to this Policy">
        <p>Material changes will be highlighted in-app at least 7 days before they take effect. The "Effective from" date at the top of this page reflects the latest version.</p>
      </Section>

      <Section title="12. Contact">
        <ul>
          <li><strong>Grievance Officer:</strong> {LEGAL_INFO.grievanceOfficerName}, <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a></li>
          <li><strong>Support:</strong> <a href={`mailto:${LEGAL_INFO.supportEmail}`}>{LEGAL_INFO.supportEmail}</a></li>
          <li><strong>Registered office:</strong> {LEGAL_INFO.registeredAddress}</li>
        </ul>
      </Section>
    </>
  )
}
