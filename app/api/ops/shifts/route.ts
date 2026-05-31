import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/session'
import { broadcastUrgentJob, pushToUsers } from '@/lib/fcm-server'
import { extractLatLng } from '@/lib/maps-link'
import { getTokenFromCookies } from '@/lib/auth'
import { workerEarning as calcWorkerEarning } from '@/lib/pricing'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// GET — list every shift (open + assigned + in_progress + completed) with the
// posting employer, current vacancy, and source ("ops" if it was created by an
// OPS user / cold-call onboarding flow, else "employer"). Used by /ops/shifts.
export async function GET(req: NextRequest) {
  try {
    const payload = getTokenFromCookies()
    if (!payload || (payload.role !== 'OPS' && payload.role !== 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const status = req.nextUrl.searchParams.get('status') || undefined
    const where = status ? { status: status as never } : {}

    const shifts = await prisma.shift.findMany({
      where,
      include: {
        employer: { include: { user: { select: { name: true, phone: true, role: true } } } },
        bookings: { where: { status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const enriched = shifts.map(s => ({
      id:             s.id,
      title:          s.title,
      role:           s.role,
      address:        s.address,
      city:           s.city,
      mapLink:        s.mapLink,
      date:           s.date,
      startTime:      s.startTime,
      endTime:        s.endTime,
      duration:       s.duration,
      hourlyRate:     s.hourlyRate,
      isUrgent:       s.isUrgent,
      status:         s.status,
      paymentStatus:  s.paymentStatus,
      paymentAmount:  s.paymentAmount,
      workersNeeded:  s.workersNeeded,
      activeBookings: s.bookings.length,
      vacancyLeft:    Math.max(0, s.workersNeeded - s.bookings.length),
      employer: {
        name:    s.employer?.user?.name ?? null,
        phone:   s.employer?.user?.phone ?? null,
        company: s.employer?.companyName ?? null,
      },
      // OPS-posted shifts use markPaid:true to flip to PAID immediately without
      // a Razorpay round-trip — that's the cleanest signal for source.
      source: s.razorpayOrderId ? 'employer' : 'ops',
      createdAt: s.createdAt,
    }))
    return NextResponse.json({ shifts: enriched })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    console.error('[/api/ops/shifts GET] failed:', msg)
    return NextResponse.json({ shifts: [], error: msg }, { status: 200 })
  }
}

// OPS can create a shift in two ways:
//   1) Pick an existing employer by employerProfileId
//   2) Enter a new employer's name + phone — we'll auto-create the User +
//      EmployerProfile and use that. Useful for cold-call signups where the
//      employer hasn't onboarded themselves yet.
const schema = z.object({
  // Either employerProfileId OR (newEmployerName + newEmployerPhone) is required
  employerProfileId:  z.string().optional(),
  newEmployerName:    z.string().trim().min(2).optional(),
  newEmployerPhone:   z.string().regex(/^\d{10}$/).optional(),
  newEmployerCity:    z.string().trim().optional(),
  newEmployerCompany: z.string().trim().optional(),

  title:             z.string().min(3),
  role:              z.string().min(1),
  description:       z.string().optional(),
  address:           z.string().min(3),
  city:              z.string().min(2),
  lat:               z.number(),
  lng:               z.number(),
  mapLink:           z.string().url().optional(),
  date:              z.string(),
  startTime:         z.string(),
  // Optional — when omitted, shift runs until worker checks out (open-ended).
  endTime:           z.string().optional().nullable(),
  duration:          z.number().min(1).max(24),
  workersNeeded:     z.number().min(1).max(50),
  hourlyRate:        z.number().min(50).max(2000),
  isUrgent:          z.boolean().default(false),
  // OPS shifts can be posted as PAID immediately (skip the Razorpay flow)
  // since OPS is acting on behalf of the platform / a phone-onboarded employer.
  markPaid:          z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const sess = await requireSession(['OPS', 'ADMIN'])
  if (sess instanceof NextResponse) return sess

  let data: z.infer<typeof schema>
  try { data = schema.parse(await req.json()) }
  catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Resolve the employer — either the picked existing one, or auto-create from name+phone.
  let employerProfileId = data.employerProfileId
  if (!employerProfileId) {
    if (!data.newEmployerName || !data.newEmployerPhone) {
      return NextResponse.json({
        error: 'Pick an existing employer, or provide both newEmployerName + newEmployerPhone',
      }, { status: 400 })
    }
    // Atomically: ensure an EMPLOYER User exists for that phone (separate from any
    // WORKER/CAPTAIN row sharing the phone — schema's @@unique([phone, role])
    // allows multiple rows per phone, one per role), and ensure their EmployerProfile exists.
    let created: string
    try {
      created = await prisma.$transaction(async tx => {
      // Look up the (phone, EMPLOYER) row specifically — or (phone, ADMIN) if the
      // platform owner is posting on their own behalf. Do NOT touch a (phone, WORKER) row.
      const employerUser =
        (await tx.user.findUnique({
          where:  { phone_role: { phone: data.newEmployerPhone!, role: 'EMPLOYER' } },
          select: { id: true, deletedAt: true, employerProfile: { select: { id: true } } },
        })) ??
        (await tx.user.findUnique({
          where:  { phone_role: { phone: data.newEmployerPhone!, role: 'ADMIN' } },
          select: { id: true, deletedAt: true, employerProfile: { select: { id: true } } },
        }))

      if (employerUser) {
        // If the prior account was soft-deleted, un-delete so OPS can post on their behalf.
        if (employerUser.deletedAt) {
          await tx.user.update({ where: { id: employerUser.id }, data: { deletedAt: null } })
        }
        if (employerUser.employerProfile) return employerUser.employerProfile.id
        const ep = await tx.employerProfile.create({
          data: {
            userId:      employerUser.id,
            companyName: data.newEmployerCompany ?? null,
            city:        data.newEmployerCity ?? data.city,
            ownerName:   data.newEmployerName!,
          },
          select: { id: true },
        })
        return ep.id
      }

      const u = await tx.user.create({
        data: {
          phone:    data.newEmployerPhone!,
          name:     data.newEmployerName!,
          role:     'EMPLOYER',
          password: '',  // they'll set one if they ever log in directly
        },
        select: { id: true },
      })
      const ep = await tx.employerProfile.create({
        data: {
          userId:      u.id,
          companyName: data.newEmployerCompany ?? null,
          city:        data.newEmployerCity ?? data.city,
          ownerName:   data.newEmployerName!,
        },
        select: { id: true },
      })
      return ep.id
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      // Race between two OPS users onboarding the same phone — surface a clean message
      // instead of leaking the raw Prisma stack trace.
      if (msg.includes('Unique constraint') && msg.includes('phone')) {
        return NextResponse.json(
          { error: 'That phone already has an employer account — pick them from the existing employer list instead.' },
          { status: 409 },
        )
      }
      throw err
    }
    employerProfileId = created
  } else {
    const employer = await prisma.employerProfile.findUnique({ where: { id: employerProfileId } })
    if (!employer) return NextResponse.json({ error: 'Employer not found' }, { status: 404 })
  }

  // Compute the total so we can record it on the shift even when marked PAID
  const totalPaise = Math.round(data.hourlyRate * data.duration * data.workersNeeded * 100)
  const earningPerWorker = calcWorkerEarning(data.duration)

  // If OPS pasted a Maps link, extract precise lat/lng from it (overrides
  // the fallback Gurgaon default the form sends). Worker will see the same
  // link as a tappable "Open in Maps" button on the job card.
  const linkLatLng = extractLatLng(data.mapLink)
  const finalLat = linkLatLng?.lat ?? data.lat
  const finalLng = linkLatLng?.lng ?? data.lng

  const shift = await prisma.shift.create({
    data: {
      employerProfileId: employerProfileId!,
      title:         data.title,
      role:          data.role,
      description:   data.description ?? '',
      address:       data.address,
      city:          data.city,
      lat:           finalLat,
      lng:           finalLng,
      mapLink:       data.mapLink ?? null,
      date:          new Date(data.date),
      startTime:     data.startTime,
      endTime:       data.endTime || null,
      duration:      data.duration,
      workersNeeded: data.workersNeeded,
      hourlyRate:    data.hourlyRate,
      isUrgent:      data.isUrgent,
      urgentFee:     data.isUrgent ? 99 : 0,
      status:        'OPEN',
      // OPS-posted shifts are PAID by default so they appear immediately in
      // the worker job feed (which filters by paymentStatus='PAID').
      paymentStatus: data.markPaid ? 'PAID' : 'PENDING',
      paymentAmount: data.markPaid ? totalPaise / 100 : null,
      paidAt:        data.markPaid ? new Date() : null,
    },
  })

  // Notify ALL approved workers (no city filter) — first to accept wins.
  if (shift.paymentStatus === 'PAID') {
    if (data.isUrgent) {
      broadcastUrgentJob(
        shift.id, shift.title, shift.address,
        `₹${earningPerWorker.toLocaleString('en-IN')} per worker`,
        { role: shift.role },
      ).catch(console.error)
    } else {
      // Notify EVERY worker (not just APPROVED) — they all see the job feed,
      // so every worker should get the push too. KYC still gates accept.
      const workers = await prisma.workerProfile.findMany({
        where:  { deletedAt: null },
        select: { user: { select: { id: true } } },
      })
      pushToUsers(workers.map(w => w.user.id), {
        title: `New ${shift.title} job posted`,
        body:  `${shift.city} · ${shift.address} · ₹${earningPerWorker.toLocaleString('en-IN')} per worker`,
        url:   `/worker/jobs?shift=${shift.id}`,
        data:  { type: 'NEW_JOB', shiftId: shift.id, pay: `₹${earningPerWorker} per worker` },
      }).catch(console.error)
    }
  }

  return NextResponse.json({ shift }, { status: 201 })
}
