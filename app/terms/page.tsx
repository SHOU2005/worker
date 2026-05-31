import Link from 'next/link'
import { LEGAL_INFO } from '@/lib/legal'

/**
 * Public Terms of Service.
 *
 * ⚠️ TEMPLATE FOR LEGAL REVIEW — not final legal text. Marketplace platforms in
 * India are governed by the Information Technology Act 2000 + Rules 2011 + 2021,
 * the Consumer Protection (E-commerce) Rules 2020, and the Code on Wages 2019
 * (relevant if Workers are deemed employees). Have an Indian advocate review.
 */
export const metadata = {
  title: 'Terms of Service · Switch',
  description: 'Terms governing use of the Switch marketplace platform.',
}

export default function TermsPage() {
  return (
    <article style={pageStyle}>
      <Header title="Terms of Service" subtitle={`Effective from ${LEGAL_INFO.effectiveDate}`} />

      <Section title="1. Acceptance">
        <p>
          These Terms constitute a binding agreement between you and {LEGAL_INFO.companyName}
          (“{LEGAL_INFO.shortName}”). By creating an account, posting a Shift, accepting a Shift,
          or using any feature of the Platform you agree to these Terms and to our{' '}
          <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the
          Platform.
        </p>
      </Section>

      <Section title="2. Eligibility">
        <ul>
          <li>You must be at least 18 years old.</li>
          <li>You must provide accurate identity information; we may suspend accounts that supply
            false data.</li>
          <li>Workers must hold a valid Aadhaar card to apply for KYC-required shifts.</li>
          <li>Employers must operate a lawful business in India and provide a valid GSTIN where
            required.</li>
        </ul>
      </Section>

      <Section title="3. Nature of the Platform">
        <p>
          {LEGAL_INFO.shortName} is a <strong>marketplace</strong> that connects independent
          Workers with Employers needing short-term help. We are an “intermediary” under §2(w) of
          the Information Technology Act 2000.
        </p>
        <ul>
          <li>{LEGAL_INFO.shortName} is <strong>not the employer</strong> of Workers. Workers are
            independent contractors of the Employer who books them.</li>
          <li>{LEGAL_INFO.shortName} does not control how Employers conduct their business or how
            Workers perform a shift.</li>
          <li>{LEGAL_INFO.shortName} is not a party to any contract of service between Worker and
            Employer.</li>
        </ul>
      </Section>

      <Section title="4. Account responsibilities">
        <ul>
          <li>You are responsible for keeping your login credentials confidential.</li>
          <li>You agree to receive notifications, OTPs, and service messages from us via SMS, push,
            and email.</li>
          <li>One person, one account. Duplicate accounts will be merged or banned.</li>
          <li>You may close your account at any time via the Profile screen. Some records (booking,
            payment) are retained for tax compliance — see Privacy Policy §7.</li>
        </ul>
      </Section>

      <Section title="5. Worker terms">
        <h3 style={subStyle}>5.1 Conduct</h3>
        <ul>
          <li>Arrive at the Shift location on time and perform the agreed work safely and lawfully.</li>
          <li>Wear appropriate clothing; carry any tools the listing specifies.</li>
          <li>Do not engage in harassment, theft, intoxication, or unsafe behaviour at a Shift.</li>
          <li>Do not solicit Employer customers for off-Platform work — see §10.</li>
        </ul>

        <h3 style={subStyle}>5.2 No-show and cancellation</h3>
        <ul>
          <li>If you accept a Shift you must complete it. Last-minute cancellations and no-shows
            harm Employers and other Workers; repeated incidents (3 in 30 days) result in
            suspension.</li>
          <li>Cancelling more than 4 hours before start: warning only.</li>
          <li>Cancelling within 4 hours of start or no-show: Worker pays a nominal penalty of ₹100
            deducted from next earnings.</li>
        </ul>

        <h3 style={subStyle}>5.3 Earnings and payouts</h3>
        <ul>
          <li>Earnings are calculated as <code>hourlyRate × hoursWorked × 0.85</code>, plus any
            tier-based bonuses you have unlocked.</li>
          <li>Payouts are sent to the UPI ID on your profile within 24 hours of Shift completion,
            subject to Employer payment confirmation and KYC clearance.</li>
          <li>If a Worker’s earnings cross ₹2,40,000 in a financial year, TDS will be deducted as
            per the Income Tax Act 1961.</li>
        </ul>
      </Section>

      <Section title="6. Employer terms">
        <h3 style={subStyle}>6.1 Posting Shifts</h3>
        <ul>
          <li>Listings must be lawful, accurate, and represent real work.</li>
          <li>You may not post Shifts that involve hazardous tasks without proper safety equipment,
            illegal activity, or anything that violates the Code on Wages 2019 (e.g. paying below
            minimum wage).</li>
          <li>Hourly rate set by the Employer must meet the State minimum wage; we may reject or
            edit listings below that floor.</li>
        </ul>

        <h3 style={subStyle}>6.2 Payment</h3>
        <ul>
          <li>Payment is collected upfront when an Employer confirms a Worker. The booking remains
            <em> Pending Payment </em>until our payment partner confirms receipt.</li>
          <li>We charge a 15% platform fee on the gross Shift amount.</li>
          <li>GST is added at the prevailing rate where applicable.</li>
        </ul>

        <h3 style={subStyle}>6.3 Cancellations and refunds</h3>
        <ul>
          <li>Cancelling more than 4 hours before start: full refund minus payment-gateway fee.</li>
          <li>Cancelling within 4 hours of start or no-show by Employer: Worker is paid 50% as
            standby fee; remainder refunded.</li>
          <li>If a Worker fails to arrive, payment is fully refunded and Worker is penalised under
            §5.2.</li>
          <li>Refunds are processed within 5 working days via the original payment instrument.</li>
        </ul>

        <h3 style={subStyle}>6.4 Worker conduct</h3>
        <p>
          Employers must treat Workers with dignity, provide safe working conditions, and follow
          all labour laws. Harassment, withholding payment, or unsafe environments will result in
          listing removal and possible legal escalation.
        </p>
      </Section>

      <Section title="7. Captain terms">
        <ul>
          <li>Captains are independent field representatives who onboard Workers and Employers.</li>
          <li>Commissions are paid per verified onboarding as published in-app.</li>
          <li>Captain accounts may be suspended for fraudulent referrals, fake KYC, or misleading
            new users.</li>
        </ul>
      </Section>

      <Section title="8. Ratings and reviews">
        <ul>
          <li>Both sides may rate each other after a completed Shift.</li>
          <li>Ratings must be honest. Coercing or buying ratings is prohibited.</li>
          <li>We may remove ratings that violate community standards (defamation, slurs,
            personal-information disclosure).</li>
        </ul>
      </Section>

      <Section title="9. Prohibited conduct">
        <ul>
          <li>Off-Platform circumvention — i.e. arranging payment outside Switch to avoid the
            platform fee.</li>
          <li>Fake accounts, multiple accounts, identity fraud.</li>
          <li>Scraping or automated access to the Platform.</li>
          <li>Reverse engineering, decompiling, or modifying the apps.</li>
          <li>Using the Platform for unlawful activity.</li>
        </ul>
        <p>Violations result in account suspension, forfeiture of pending earnings, and (where
          appropriate) legal action.</p>
      </Section>

      <Section title="10. Anti-circumvention">
        <p>
          For 6 months after a Shift, the Worker and Employer agree not to engage each other for
          similar work outside the Platform. If they wish to do so, they must do it through the
          Platform so the appropriate fee and protections apply. Repeat violators forfeit access.
        </p>
      </Section>

      <Section title="11. Intellectual property">
        <p>
          All content, branding, and software in the Platform belong to {LEGAL_INFO.companyName}.
          You may not copy, redistribute, or create derivative works without written permission.
          User-generated content (ratings, photos) remains yours; you grant us a non-exclusive,
          worldwide licence to host and display it within the Platform.
        </p>
      </Section>

      <Section title="12. Disclaimers">
        <p>
          The Platform is provided “as is”. We do not warrant uninterrupted service, freedom from
          errors, or that the matchmaking will produce specific outcomes. We are not responsible
          for the conduct of any Worker or Employer.
        </p>
      </Section>

      <Section title="13. Limitation of liability">
        <p>
          To the fullest extent permitted by law, {LEGAL_INFO.companyName}’s aggregate liability
          for any claim arising out of these Terms is limited to the platform fees you paid us in
          the 6 months preceding the claim. We are not liable for indirect, incidental, or
          consequential damages.
        </p>
      </Section>

      <Section title="14. Indemnity">
        <p>
          You agree to indemnify and hold {LEGAL_INFO.companyName}, its officers, employees, and
          partners harmless from any claim arising out of your use of the Platform, your
          interaction with another user, or your breach of these Terms.
        </p>
      </Section>

      <Section title="15. Suspension and termination">
        <p>
          We may suspend or terminate accounts that breach these Terms, post unsafe or unlawful
          listings, or cause harm to other users. We will give you a written reason wherever
          reasonably possible.
        </p>
      </Section>

      <Section title="16. Disputes">
        <p>
          We strongly encourage parties to use the in-app dispute flow first. If unresolved within
          14 days, disputes are subject to:
        </p>
        <ul>
          <li><strong>Governing law:</strong> the laws of India.</li>
          <li><strong>Exclusive jurisdiction:</strong> the courts at the city of our registered
            office.</li>
          <li>Consumers retain their rights under the Consumer Protection Act 2019 to approach the
            District / State / National Consumer Disputes Redressal Commissions.</li>
        </ul>
      </Section>

      <Section title="17. Changes to these Terms">
        <p>
          We may update these Terms as the Platform evolves. Material changes will be notified at
          least 7 days before they take effect. Continued use of the Platform after the effective
          date constitutes acceptance.
        </p>
      </Section>

      <Section title="18. Contact">
        <ul>
          <li><strong>Support:</strong> <a href={`mailto:${LEGAL_INFO.supportEmail}`}>{LEGAL_INFO.supportEmail}</a></li>
          <li><strong>Grievance Officer:</strong> {LEGAL_INFO.grievanceOfficerName}, <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a></li>
          <li><strong>Registered office:</strong> {LEGAL_INFO.registeredAddress}</li>
        </ul>
      </Section>

      <Footer>
        <Link href="/privacy">Privacy Policy</Link>
        <span> · </span>
        <Link href="/">Back to app</Link>
      </Footer>
    </article>
  )
}

const pageStyle: React.CSSProperties = {
  // Same dark-body fix as /privacy — paint a white surface so the dark
  // legal text remains readable.
  minHeight: '100vh',
  background: '#FFFFFF',
  maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px',
  fontFamily: '"DM Sans", system-ui, sans-serif',
  lineHeight: 1.65, color: '#111111',
}
const subStyle: React.CSSProperties = { fontSize: 17, fontWeight: 700, color: '#111111', marginTop: 18, marginBottom: 6 }

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header style={{ marginBottom: 32, paddingBottom: 18, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>Switch · Legal</p>
      <h1 style={{ fontSize: 32, fontWeight: 900, color: '#111111', margin: '6px 0 4px', letterSpacing: -0.5 }}>{title}</h1>
      <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', margin: 0 }}>{subtitle}</p>
    </header>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111111', margin: '0 0 8px' }}>{title}</h2>
      <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.78)' }}>{children}</div>
    </section>
  )
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <footer style={{ marginTop: 48, paddingTop: 20, borderTop: '1px solid rgba(0,0,0,0.08)', fontSize: 13, color: 'rgba(0,0,0,0.5)', textAlign: 'center' as const }}>
      {children}
    </footer>
  )
}
