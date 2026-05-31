import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Delete in dependency order: rating -> commission/payment -> booking -> shift
  const r = await prisma.rating.deleteMany({})
  const c = await prisma.commission.deleteMany({})
  const p = await prisma.payment.deleteMany({})
  const b = await prisma.booking.deleteMany({})
  const s = await prisma.shift.deleteMany({})
  console.log(`Cleared: ${r.count} ratings · ${c.count} commissions · ${p.count} payments · ${b.count} bookings · ${s.count} shifts`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
