import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Per-role: list every row this phone has across roles.
  const u = await prisma.user.findFirst({
    where:  { phone: '9289877375', role: { in: ['OPS', 'ADMIN'] } },
    select: { id: true, name: true, role: true, phone: true, createdAt: true, opsProfile: { select: { id: true } } },
  })
  console.log(u ? { found: true, ...u } : { found: false, phone: '9289877375' })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
