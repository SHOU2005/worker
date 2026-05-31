// Milestone bonuses are expressed as a percentage uplift on the hourly rate.
// e.g. bonusPct: 10 with hourlyRate 200 → effective rate 220/hr.
export const MILESTONES = [
  { level: 0, label: 'Starter',  emoji: '🌱', minJobs: 0,  maxJobs: 4,        bonusPct: 0  },
  { level: 1, label: 'Bronze',   emoji: '🥉', minJobs: 5,  maxJobs: 9,        bonusPct: 5  },
  { level: 2, label: 'Silver',   emoji: '🥈', minJobs: 10, maxJobs: 24,       bonusPct: 10 },
  { level: 3, label: 'Gold',     emoji: '🥇', minJobs: 25, maxJobs: 49,       bonusPct: 15 },
  { level: 4, label: 'Platinum', emoji: '💎', minJobs: 50, maxJobs: Infinity, bonusPct: 20 },
]

export function getMilestone(totalShifts: number) {
  return [...MILESTONES].reverse().find(m => totalShifts >= m.minJobs) ?? MILESTONES[0]
}

export function getNextMilestone(totalShifts: number) {
  return MILESTONES.find(m => m.minJobs > totalShifts) ?? null
}

export function getProgress(totalShifts: number) {
  const current = getMilestone(totalShifts)
  const next    = getNextMilestone(totalShifts)
  if (!next) return { pct: 100, remaining: 0, current, next: null }
  const range   = next.minJobs - current.minJobs
  const done    = totalShifts - current.minJobs
  return { pct: Math.round((done / range) * 100), remaining: next.minJobs - totalShifts, current, next }
}

// Compute the effective hourly rate after applying the worker's milestone bonus.
export function applyMilestoneBonus(hourlyRate: number, totalShifts: number) {
  const m = getMilestone(totalShifts)
  return Math.round(hourlyRate * (1 + m.bonusPct / 100))
}
