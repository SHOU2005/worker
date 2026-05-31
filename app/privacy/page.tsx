import Link from 'next/link'
import { LEGAL_INFO } from '@/lib/legal'

/**
 * Public Privacy Policy.
 *
 * ⚠️ TEMPLATE FOR LEGAL REVIEW — not final legal text. Have a practising
 * Indian advocate familiar with the DPDP Act 2023 and the Aadhaar Act 2016
 * review and adjust before publishing.
 */
export const metadata = {
  title: 'Privacy Policy · Switch',
  description: 'How Switch collects, uses, and protects personal data.',
}

export default function PrivacyPage() {
  return (
    <article style={pageStyle}>
      <Header title="Privacy Policy" subtitle={`Effective from ${LEGAL_INFO.effectiveDate}`} />

      <Section title="1. Who we are">
        <p>
          {LEGAL_INFO.companyName} (“{LEGAL_INFO.shortName}”, “we”, “us”) operates the Switch
          marketplace mobile and web applications (the “Platform”). Our registered office is at
          {' '}{LEGAL_INFO.registeredAddress}. For privacy or data-related queries, contact our
          Grievance Officer at <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a>.
        </p>
      </Section>

      <Section title="2. Scope">
        <p>
          This policy applies to anyone who creates an account on Switch as a Worker, Employer, or
          Captain (field operations), and to anyone who visits our public web surfaces. By using
          the Platform you agree to the practices described here. If you do not agree, please do
          not use the Platform.
        </p>
      </Section>

      <Section title="3. Information we collect">
        <h3 style={subStyle}>3.1 Information you provide</h3>
        <ul>
          <li><strong>Account details</strong> — full name, mobile number, role, language preference.</li>
          <li><strong>Profile photo</strong> — captured selfie or uploaded image.</li>
          <li><strong>Aadhaar card</strong> — front and back image, plus the 12-digit Aadhaar number.
            Collected only after explicit consent (see §6).</li>
          <li><strong>For Employers</strong> — business name, owner name, GSTIN, registered address,
            company logo.</li>
          <li><strong>For Captains</strong> — territory, contacts list (with permission) used for
            referrals.</li>
          <li><strong>Payment instruments</strong> — UPI ID for worker payouts. Card and UPI
            instruments for Employer payments are handled by our PCI-DSS compliant partner
            Razorpay; we never see or store card numbers.</li>
          <li><strong>Communications</strong> — messages or feedback you send through the app.</li>
        </ul>

        <h3 style={subStyle}>3.2 Information we collect automatically</h3>
        <ul>
          <li><strong>Live location</strong> (latitude/longitude) — refreshed every 2 minutes while
            the app is open. Used to match you with nearby jobs, show your live position to ops
            and employers when a shift is active, and verify on-site arrival via geofence.</li>
          <li><strong>Device identifiers</strong> — push-notification token, app version, OS, model.</li>
          <li><strong>Usage events</strong> — login times, jobs viewed, swipes, payments, errors.</li>
          <li><strong>IP address and approximate region</strong> — for security, fraud prevention,
            and rate limiting.</li>
        </ul>

        <h3 style={subStyle}>3.3 Information from third parties</h3>
        <ul>
          <li><strong>Firebase Authentication</strong> — when you log in via OTP, Firebase verifies
            your phone number and returns a token to us.</li>
          <li><strong>Razorpay</strong> — confirms payment success, failure, and refund status for
            shift bookings via signed webhooks.</li>
        </ul>
      </Section>

      <Section title="4. How we use your information">
        <ul>
          <li>To match Workers with relevant Shifts based on skills, city, distance, rating, and
            availability.</li>
          <li>To allow Employers to verify Workers and pay them safely.</li>
          <li>To compute and pay out Worker earnings and Captain commissions.</li>
          <li>To send service-critical notifications (job offers, OTPs, payment confirmations).</li>
          <li>To prevent abuse, fraud, no-shows, duplicate accounts, and unsafe behaviour.</li>
          <li>To comply with applicable Indian law (KYC, taxation, lawful requests from
            authorities).</li>
          <li>With your separate consent, to send marketing or referral-program communications.</li>
        </ul>
      </Section>

      <Section title="5. Legal basis (DPDP Act 2023)">
        <p>We process personal data on the following lawful grounds:</p>
        <ul>
          <li><strong>Consent</strong> — you tick consent checkboxes at registration and before
            Aadhaar upload.</li>
          <li><strong>Performance of contract</strong> — to deliver the matchmaking, payment, and
            payout services you have signed up for.</li>
          <li><strong>Legal obligation</strong> — to comply with KYC, tax, and law-enforcement
            requirements.</li>
          <li><strong>Legitimate use</strong> — fraud prevention and platform safety, balanced
            against your rights.</li>
        </ul>
      </Section>

      <Section title="6. Special handling of Aadhaar">
        <p>
          Aadhaar numbers and card images are sensitive personal data under the Aadhaar Act 2016
          and the DPDP Act 2023. Our handling:
        </p>
        <ul>
          <li>We collect Aadhaar only after explicit consent recorded at registration time. The
            consent record (text version, timestamp, IP) is stored alongside your profile.</li>
          <li>The 12-digit Aadhaar number is encrypted at rest using AES-256-GCM. The decryption
            key is held in a separate secret store, accessible only to backend services.</li>
          <li>Only the last four digits are stored in plaintext for masked display
            (XXXX&nbsp;XXXX&nbsp;1234).</li>
          <li>Aadhaar images live in a private object-storage bucket. Reads are gated behind
            short-lived (60-second) signed URLs and every Ops or Admin access is recorded in an
            immutable audit log including timestamp, accessor identity, IP, and reason.</li>
          <li>You may revoke Aadhaar consent at any time; we will mask the number, delete the
            images within 30 days, and lose your eligibility for KYC-required shifts until you
            re-consent.</li>
        </ul>
      </Section>

      <Section title="7. Data retention">
        <ul>
          <li>Active accounts — for as long as the account exists.</li>
          <li>Booking, payment, and rating records — for 8 years from creation, to satisfy GST and
            Income Tax record-keeping rules.</li>
          <li>Push tokens, session data — until you log out or the device unregisters.</li>
          <li>Aadhaar images — until consent is withdrawn or the account is deleted, whichever is
            sooner; then permanently deleted within 30 days.</li>
          <li>Audit logs (including Aadhaar access logs) — retained for 5 years for compliance.</li>
        </ul>
      </Section>

      <Section title="8. Sharing your data">
        <p>We share data only with:</p>
        <ul>
          <li><strong>Other Platform users</strong>, only as necessary for the marketplace to
            function — Workers see Employer name and address of a shift they have applied to;
            Employers see name, photo, and ratings of Workers who have applied; Ops staff see
            both for safety and dispute resolution.</li>
          <li><strong>Service providers</strong> bound by data-protection agreements: Razorpay
            (payments), Firebase (authentication, push notifications), Supabase (hosting and
            object storage), an SMS provider for OTP delivery, and an optional product analytics
            provider.</li>
          <li><strong>Authorities</strong> when required by lawful order, subpoena, or to protect
            life or safety.</li>
          <li><strong>Acquirers</strong> in the event of a merger, acquisition, or asset sale, with
            equivalent privacy protections.</li>
        </ul>
        <p>We do not sell personal data to anyone.</p>
      </Section>

      <Section title="9. Security">
        <ul>
          <li>HTTPS everywhere; HSTS enforced on the production domain.</li>
          <li>Passwords hashed with bcrypt (cost 12). JWT sessions versioned and revocable on
            logout-all.</li>
          <li>Rate limiting on OTP, login, and payment-verification endpoints.</li>
          <li>Sensitive PII (Aadhaar number) encrypted at rest with AES-256-GCM.</li>
          <li>Private storage bucket with signed-URL-only access for KYC images, plus an immutable
            access audit log.</li>
          <li>Periodic dependency audits and migrations under version control.</li>
        </ul>
        <p>
          No system is perfectly secure. If you discover a vulnerability, please contact{' '}
          <a href={`mailto:${LEGAL_INFO.securityEmail}`}>{LEGAL_INFO.securityEmail}</a>.
        </p>
      </Section>

      <Section title="10. Your rights (DPDP Act §11–§14)">
        <ul>
          <li><strong>Access</strong> the personal data we hold about you.</li>
          <li><strong>Correction</strong> of inaccurate data via the Profile screen, or by emailing
            the Grievance Officer.</li>
          <li><strong>Withdrawal of consent</strong> (Aadhaar storage, marketing).</li>
          <li><strong>Deletion</strong> of your account and associated personal data — see
            “Delete my account” in the Profile menu, or email{' '}
            <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a>. We
            respond within 30 days.</li>
          <li><strong>Nomination</strong> — you may nominate a person to act on your behalf in case
            of incapacity.</li>
          <li><strong>Grievance redressal</strong> — see §13.</li>
        </ul>
      </Section>

      <Section title="11. Children">
        <p>
          The Platform is not intended for individuals under 18 years of age. If we learn we have
          inadvertently collected data from a minor, we delete it immediately.
        </p>
      </Section>

      <Section title="12. International transfers">
        <p>
          Our primary data centres are in Asia-Pacific. Some third-party processors may store data
          in jurisdictions notified as permitted under the DPDP Act. We rely on standard
          contractual safeguards approved under Indian law for any cross-border transfer.
        </p>
      </Section>

      <Section title="13. Grievance redressal">
        <p>As required by the DPDP Act 2023 and the Information Technology Rules 2011:</p>
        <ul>
          <li><strong>Grievance Officer:</strong> {LEGAL_INFO.grievanceOfficerName}</li>
          <li><strong>Email:</strong> <a href={`mailto:${LEGAL_INFO.grievanceEmail}`}>{LEGAL_INFO.grievanceEmail}</a></li>
          <li><strong>Address:</strong> {LEGAL_INFO.registeredAddress}</li>
        </ul>
        <p>We acknowledge grievances within 24 hours and resolve within 30 days.</p>
      </Section>

      <Section title="14. Changes to this policy">
        <p>
          We update this policy as the Platform evolves. Material changes will be notified
          in-app and by SMS or email at least 7 days before they take effect. Continued use after
          the effective date constitutes acceptance.
        </p>
      </Section>

      <Footer>
        <Link href="/terms">Terms of Service</Link>
        <span> · </span>
        <Link href="/">Back to app</Link>
      </Footer>
    </article>
  )
}

const pageStyle: React.CSSProperties = {
  // Global body is black (--bg:#000000). The privacy text uses dark
  // colors on white, so without an explicit white surface the text was
  // invisible on the dark body. Paint a full-height white card.
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
