import { prisma } from './prisma'


export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function scoreWorker(
  worker: { rating: number; totalShifts: number; lat: number | null; lng: number | null },
  shiftLat: number,
  shiftLng: number
): number {
  const distance = worker.lat && worker.lng
    ? haversineDistance(shiftLat, shiftLng, worker.lat, worker.lng)
    : 999

  const distanceScore = Math.max(0, 50 - distance * 5)
  const ratingScore   = (worker.rating / 5) * 30
  const expScore      = Math.min(worker.totalShifts / 50, 1) * 20

  return distanceScore + ratingScore + expScore
}

export async function findMatchingWorkers(
  shiftId: string,
  limit = 5
): Promise<Array<{
  id: string
  userId: string
  name: string
  avatar: string | null
  rating: number
  totalShifts: number
  distance: number
  skills: string[]
  city: string | null
  score: number
}>> {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
  })
  if (!shift) return []

  const workers = await prisma.workerProfile.findMany({
    where: {
      deletedAt:   null,
      kycStatus:   'APPROVED',
      isAvailable: true,
      bookings: {
        none: {
          shiftId,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
        },
      },
    },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  })

  const scored = workers.map((w) => {
    const distance = w.lat && w.lng
      ? haversineDistance(shift.lat ?? 0, shift.lng ?? 0, w.lat, w.lng)
      : 999
    const score = scoreWorker(w, shift.lat ?? 0, shift.lng ?? 0)
    return {
      id: w.id,
      userId: w.userId,
      name: w.user.name,
      avatar: w.user.avatar,
      rating: w.rating,
      totalShifts: w.totalShifts,
      distance: Math.round(distance * 10) / 10,
      skills: w.skills,
      city: w.city,
      score,
    }
  })

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
