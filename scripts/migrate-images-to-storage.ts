/**
 * One-shot: walk every WorkerProfile / CaptainProfile / EmployerProfile row,
 * find columns still holding base64 data URLs, upload to Supabase Storage,
 * and rewrite the column to the resulting URL or storage path.
 *
 * Run:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-images-to-storage.ts
 *
 * Idempotent: rows already storing https/aadhaar/docs paths are skipped.
 */
import { PrismaClient } from '@prisma/client'
import { uploadPublicImage, uploadPrivateImage, isStorageConfigured } from '../lib/storage'

const prisma = new PrismaClient()

function isBase64DataUrl(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:')
}

async function migrateWorkers() {
  const rows = await prisma.workerProfile.findMany({
    select: { id: true, profilePhoto: true, aadhaarFront: true, aadhaarBack: true },
  })
  let touched = 0
  for (const r of rows) {
    const update: Record<string, string | null> = {}

    if (isBase64DataUrl(r.profilePhoto)) {
      const res = await uploadPublicImage(r.profilePhoto, 'workers')
      if (res.url && res.url !== r.profilePhoto) update.profilePhoto = res.url
      else if (res.error) console.warn(`  worker ${r.id} profilePhoto: ${res.error}`)
    }
    if (isBase64DataUrl(r.aadhaarFront)) {
      const res = await uploadPrivateImage(r.aadhaarFront, 'aadhaar')
      if (res.path && res.path !== r.aadhaarFront) update.aadhaarFront = res.path
      else if (res.error) console.warn(`  worker ${r.id} aadhaarFront: ${res.error}`)
    }
    if (isBase64DataUrl(r.aadhaarBack)) {
      const res = await uploadPrivateImage(r.aadhaarBack, 'aadhaar')
      if (res.path && res.path !== r.aadhaarBack) update.aadhaarBack = res.path
      else if (res.error) console.warn(`  worker ${r.id} aadhaarBack: ${res.error}`)
    }

    if (Object.keys(update).length > 0) {
      await prisma.workerProfile.update({ where: { id: r.id }, data: update })
      touched++
      console.log(`  worker ${r.id}: migrated ${Object.keys(update).join(', ')}`)
    }
  }
  return touched
}

async function migrateCaptainsAndOthers() {
  // Captain photos live on User.avatar (CAPTAIN role only)
  const captains = await prisma.user.findMany({
    where:  { role: 'CAPTAIN', avatar: { not: null } },
    select: { id: true, avatar: true },
  })
  let touched = 0
  for (const u of captains) {
    if (!isBase64DataUrl(u.avatar)) continue
    const res = await uploadPublicImage(u.avatar!, 'captains')
    if (res.url && res.url !== u.avatar) {
      await prisma.user.update({ where: { id: u.id }, data: { avatar: res.url } })
      touched++
      console.log(`  captain ${u.id}: avatar migrated`)
    } else if (res.error) {
      console.warn(`  captain ${u.id}: ${res.error}`)
    }
  }
  return touched
}

async function migrateEmployers() {
  const employers = await prisma.employerProfile.findMany({
    where:  { logo: { not: null } },
    select: { id: true, logo: true },
  })
  let touched = 0
  for (const e of employers) {
    if (!isBase64DataUrl(e.logo)) continue
    const res = await uploadPublicImage(e.logo!, 'employers')
    if (res.url && res.url !== e.logo) {
      await prisma.employerProfile.update({ where: { id: e.id }, data: { logo: res.url } })
      touched++
      console.log(`  employer ${e.id}: logo migrated`)
    } else if (res.error) {
      console.warn(`  employer ${e.id}: ${res.error}`)
    }
  }
  return touched
}

async function main() {
  if (!isStorageConfigured()) {
    console.error('Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.')
    process.exit(1)
  }

  console.log('Migrating WorkerProfile…')
  const w = await migrateWorkers()
  console.log(`Migrating CaptainProfile (User.avatar)…`)
  const c = await migrateCaptainsAndOthers()
  console.log(`Migrating EmployerProfile…`)
  const e = await migrateEmployers()

  console.log(`\nDone. Workers touched: ${w}, captains: ${c}, employers: ${e}`)
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
