/**
 * Centralized company info used by /privacy and /terms pages.
 *
 * 🔧 Replace the placeholder values below with your real company details
 * BEFORE deploying. Play Store and the DPDP Act both expect a real, reachable
 * Grievance Officer.
 */
export const LEGAL_INFO = {
  // ─── Replace these placeholders ───
  companyName:           'Switch Locally Private Limited',         // legal entity name
  shortName:             'Switch',
  registeredAddress:     '[Replace with full registered address, including PIN code]',
  effectiveDate:         '7 May 2026',                              // bump on each material change

  // Officer roles (DPDP §10 + IT Rules 2011 require a designated grievance officer)
  grievanceOfficerName:  '[Replace with Grievance Officer name]',
  grievanceEmail:        'grievance@switchlocally.com',             // create this mailbox
  securityEmail:         'security@switchlocally.com',
  supportEmail:          'support@switchlocally.com',

  // Optional regulator / forum
  cinNumber:             '[Replace with CIN once incorporated]',
  gstin:                 '[Replace with GSTIN once registered]',
} as const

// Aadhaar consent text shown to workers BEFORE they upload Aadhaar.
// Bump CURRENT_AADHAAR_CONSENT_VERSION whenever you change the wording.
// The previous version stays here as a record of what users actually agreed to.
export const CURRENT_AADHAAR_CONSENT_VERSION = 'v1-2026-05-07' as const

export const AADHAAR_CONSENT_TEXT_BY_VERSION: Record<string, string> = {
  'v1-2026-05-07': `I voluntarily provide my Aadhaar number and card images to ${LEGAL_INFO.companyName} ` +
    `(operator of the Switch Platform) for the limited purposes of identity verification (KYC) and ` +
    `compliance with applicable laws.\n\n` +
    `I understand that:\n\n` +
    `• My Aadhaar number will be stored encrypted at rest, and only the last 4 digits will be ` +
    `displayed for confirmation.\n` +
    `• Aadhaar images will be stored in a private bucket; only authorised Operations staff may view ` +
    `them, and every access is logged for audit.\n` +
    `• I may withdraw this consent at any time from the Profile screen, after which Switch will ` +
    `delete my Aadhaar images within 30 days and I will be unable to apply for KYC-required shifts.\n` +
    `• I have read and accept the Privacy Policy and Terms of Service.\n\n` +
    `This consent is given under the Aadhaar (Targeted Delivery of Financial and Other Subsidies, ` +
    `Benefits and Services) Act 2016 and the Digital Personal Data Protection Act 2023.`,
}

