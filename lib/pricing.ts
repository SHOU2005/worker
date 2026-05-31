// Single source of truth for worker take-home rate. Worker earns a flat ₹100/hr
// (prorated by the minute) regardless of what the employer pays — the platform
// pockets the difference as commission.
//
// Anything calculating worker earnings (booking creation, dashboard cards, job
// swipe cards, completion notifications) MUST go through workerEarning() so
// changes here propagate everywhere.
export const WORKER_RATE_PER_HOUR = 100

/** Worker take-home for a shift of `durationHours` hours. */
export function workerEarning(durationHours: number): number {
  return Math.round(WORKER_RATE_PER_HOUR * durationHours)
}

/** Worker take-home prorated by the minute — for live wallet display. */
export function workerEarningFromMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round(WORKER_RATE_PER_HOUR * (minutes / 60))
}

/** Worker take-home for an actual check-in/check-out window (live or finished). */
export function workerEarningFromBooking(checkInIso: string | Date | null, checkOutIso: string | Date | null): number {
  if (!checkInIso) return 0
  const start = new Date(checkInIso).getTime()
  const end   = checkOutIso ? new Date(checkOutIso).getTime() : Date.now()
  const minutes = Math.max(0, Math.floor((end - start) / 60_000))
  return workerEarningFromMinutes(minutes)
}

/** Employer charge for actual minutes worked at the posted hourly rate. */
export function employerChargeFromMinutes(employerHourlyRate: number, minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0
  return Math.round(employerHourlyRate * (minutes / 60))
}

/** Platform commission = what the employer paid minus what the worker earns. */
export function platformFee(employerHourlyRate: number, durationHours: number): number {
  const total = Math.round(employerHourlyRate * durationHours)
  return Math.max(0, total - workerEarning(durationHours))
}
