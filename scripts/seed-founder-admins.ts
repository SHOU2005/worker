import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PASSWORD = 'Switch@2026'
const FOUNDER_PHONES = ['9205617375', '8368828660']

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12)

  for (const phone of FOUNDER_PHONES) {
    // Phone is unique per role, not globally — pick an existing ADMIN/OPS
    // row for this phone, falling back to creating a fresh ADMIN row.
    const existing = await prisma.user.findFirst({
      where: { phone, role: { in: ['ADMIN', 'OPS'] } },
    })

    if (existing) {
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data:  { password: hash, isActive: true },
      })
      await prisma.opsProfile.upsert({
        where:  { userId: updated.id },
        create: { userId: updated.id, permissions: ['*'] },
        update: {},
      })
      console.log(`Updated ${phone} (id=${updated.id}, role=${updated.role}) — password set`)
    } else {
      const user = await prisma.user.create({
        data: {
          name:     'Founder Admin',
          phone,
          password: hash,
          role:     'ADMIN',
          opsProfile: { create: { permissions: ['*'] } },
        },
      })
      console.log(`Created ${phone} (id=${user.id}, role=ADMIN)`)
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
