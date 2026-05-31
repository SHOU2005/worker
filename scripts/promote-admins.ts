import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PHONES = ['9205617375', '8368828660']

async function main() {
  for (const phone of PHONES) {
    // Per-role schema: look up the ADMIN row specifically.
    const existing = await prisma.user.findFirst({ where: { phone, role: 'ADMIN' } })
    if (existing) {
      console.log('Already ADMIN:', { id: existing.id, phone: existing.phone })
      continue
    }
    const created = await prisma.user.create({
      data: { name: 'Admin', phone, role: 'ADMIN' },
    })
    console.log('Created ADMIN row:', { id: created.id, phone: created.phone, role: created.role })
  }
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
