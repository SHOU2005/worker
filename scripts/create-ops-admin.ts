import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PHONE    = '9289877375'
const PASSWORD = 'Switch@2026'

async function main() {
  const existing = await prisma.user.findFirst({ where: { phone: PHONE, role: 'OPS' } })
  if (existing) {
    console.log('User already exists:', { id: existing.id, role: existing.role, name: existing.name })
    return
  }

  const hash = await bcrypt.hash(PASSWORD, 12)
  const user = await prisma.user.create({
    data: {
      name:     'Ops Admin',
      phone:    PHONE,
      password: hash,
      role:     'OPS',
      opsProfile: {
        create: { permissions: ['*'] },
      },
    },
    include: { opsProfile: true },
  })
  console.log('Created ops admin:', { id: user.id, phone: user.phone, role: user.role, opsProfileId: user.opsProfile?.id })
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
