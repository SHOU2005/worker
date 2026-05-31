'use client'

/**
 * Disabled — every worker can use the app regardless of KYC status. The
 * /worker/kyc page is still reachable directly so workers can submit KYC
 * voluntarily, but no route forces them through it. The accept-shift action
 * (/api/shifts/[id]/accept) is the only KYC-gated step.
 *
 * Kept as a no-op component so the existing import in /worker/layout
 * doesn't need to change.
 */
export default function AadhaarGate() {
  return null
}
