// Admin allow-list — driven primarily by the ADMIN_PHONES env var (comma-
// separated 10-digit numbers). A small set of founder numbers is also
// allow-listed in code as a safety net so they retain access if the env
// var is missing or rotated by accident. Set ADMIN_PHONES in Vercel +
// Railway envs to grant additional admins beyond these.
export const FOUNDER_ADMIN_PHONES = ['9205617375', '8368828660']
export const ADMIN_PHONES = Array.from(new Set([
  ...FOUNDER_ADMIN_PHONES,
  ...(process.env.ADMIN_PHONES || '')
    .split(',').map(s => s.trim().replace(/\D/g, '')).filter(s => s.length === 10),
]))
// Back-compat alias for older callers
export const ADMIN_PHONE = ADMIN_PHONES[0] ?? null
export function isAdminPhone(phone: string): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '').slice(-10)
  return ADMIN_PHONES.includes(digits)
}
export const VALID_ROLES = ['WORKER', 'EMPLOYER', 'CAPTAIN', 'OPS', 'ADMIN'] as const
export type AppRole = typeof VALID_ROLES[number]

export function isValidRole(r: unknown): r is AppRole {
  return typeof r === 'string' && (VALID_ROLES as readonly string[]).includes(r)
}

// Map default — the app is Gurgaon-first. Used as the fallback centerpoint
// for every Leaflet map mount when neither the shift nor the worker has a
// usable lat/lng yet. Hard-coded 19.076 / 72.877 (Mumbai!) was scattered
// across four files despite comments labelling it "Gurgaon"; this constant
// is the single source of truth.
export const DEFAULT_MAP_CENTER = { lat: 28.4595, lng: 77.0266, label: 'Gurgaon' }
