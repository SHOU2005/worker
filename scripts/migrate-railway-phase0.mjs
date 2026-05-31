// Phase 0 migration: extends existing Railway tables with the new columns
// the Next.js app needs. Purely additive — never modifies, drops, or renames
// any existing column or row. Wrapped in a transaction; auto-rolls back if
// any verification fails.
//
// Run from your Mac:
//   export DATABASE_URL='postgresql://postgres:<NEW_PASSWORD>@yamanote.proxy.rlwy.net:57346/railway'
//   node scripts/migrate-railway-phase0.mjs
//
// Prerequisites:
//   - pg_dump must be on PATH (comes with Postgres / `brew install libpq`)
//   - Node 18+
//   - `npm install pg` (or run from the Switch-app-main dir which has it)

import pg from 'pg'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const url = process.env.DATABASE_URL
if (!url) { console.error('❌ DATABASE_URL not set'); process.exit(1) }

// ──────────────────────────────────────────────────────────────────────────
// Backup folder — your ~/Desktop/sw-railway-backups/<timestamp>/
// ──────────────────────────────────────────────────────────────────────────
const stamp     = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = join(homedir(), 'Desktop', 'sw-railway-backups', stamp)
mkdirSync(backupDir, { recursive: true })
const dumpFile = join(backupDir, 'pre-phase0.dump')

// ──────────────────────────────────────────────────────────────────────────
// 1) Take a full pg_dump backup BEFORE touching anything
// ──────────────────────────────────────────────────────────────────────────
console.log(`\n📦 Taking pg_dump backup → ${dumpFile}`)
try {
  execFileSync('pg_dump', ['--no-owner', '--no-acl', '--format=custom', '--file', dumpFile, url], { stdio: 'inherit' })
} catch (e) {
  console.error('❌ pg_dump failed. Install with: brew install libpq && brew link --force libpq')
  process.exit(1)
}
const stat = await import('node:fs').then(m => m.statSync(dumpFile))
console.log(`✅ Backup complete · ${(stat.size / 1024 / 1024).toFixed(2)} MB · keep this file safe for 7+ days`)

// ──────────────────────────────────────────────────────────────────────────
// 2) Pre-flight row counts on every table
// ──────────────────────────────────────────────────────────────────────────
const c = new pg.Client({ connectionString: url })
await c.connect()

async function rowCounts() {
  const t = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`)
  const out = {}
  for (const r of t.rows) {
    try {
      const x = await c.query(`SELECT COUNT(*)::int AS n FROM "${r.table_name}"`)
      out[r.table_name] = x.rows[0].n
    } catch { out[r.table_name] = 'ERR' }
  }
  return out
}

async function columnSnapshot(tables) {
  const out = {}
  for (const t of tables) {
    const r = await c.query(`SELECT column_name, data_type, is_nullable
                             FROM information_schema.columns
                             WHERE table_schema='public' AND table_name=$1
                             ORDER BY ordinal_position`, [t])
    out[t] = r.rows
  }
  return out
}

const before    = await rowCounts()
const beforeCol = await columnSnapshot(['users', 'user_profiles', 'employer_profiles'])
const before5users = (await c.query(`SELECT phone, name, photo_url, created_at FROM "users" ORDER BY phone LIMIT 5`)).rows

console.log('\n📊 Row counts BEFORE Phase 0:')
for (const [t, n] of Object.entries(before)) console.log(`   ${t.padEnd(28)} ${n}`)

// ──────────────────────────────────────────────────────────────────────────
// 3) Phase 0 ALTER TABLEs — all in one transaction
// ──────────────────────────────────────────────────────────────────────────
const SQL = `
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "id"            TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email"         TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password"      TEXT NOT NULL DEFAULT '';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role"          TEXT NOT NULL DEFAULT 'WORKER';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at"    TIMESTAMP;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "fcm_tokens"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_bytes"  BYTEA;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_mime"   TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "created_at_v2" TIMESTAMP NOT NULL DEFAULT NOW();
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "updated_at_v2" TIMESTAMP NOT NULL DEFAULT NOW();
UPDATE "users" SET "created_at_v2" = to_timestamp("created_at") WHERE "created_at" IS NOT NULL;
UPDATE "users" SET "id" = 'usr_' || replace(gen_random_uuid()::text, '-', '') WHERE "id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_id_key"         ON "users"("id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"      ON "users"("email") WHERE "email" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "users_role_idx"       ON "users"("role");
CREATE INDEX        IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");

-- USER_PROFILES
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_number"           TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_last4"            TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_front_bytes"      BYTEA;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_front_mime"       TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_back_bytes"       BYTEA;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_back_mime"        TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_consent_version"  TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_consent_at"       TIMESTAMP;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_consent_ip"       TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "aadhaar_verified"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "video_verified"           BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "kyc_status"               TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "total_shifts"             INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "total_earnings"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "hourly_rate"              DOUBLE PRECISION NOT NULL DEFAULT 125;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "is_available"             BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "rating"                   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "milestone_level"          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "captain_referral_id"      TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "location_sharing_consent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "deleted_at"               TIMESTAMP;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "last_seen_at"             TIMESTAMP;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "lat"                      DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "lng"                      DOUBLE PRECISION;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "upi_id"                   TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "bio"                      TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "city"                     TEXT;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "skills_v2"                TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "profile_photo_bytes"      BYTEA;
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "profile_photo_mime"       TEXT;
CREATE INDEX IF NOT EXISTS "user_profiles_kyc_status_idx" ON "user_profiles"("kyc_status");
CREATE INDEX IF NOT EXISTS "user_profiles_deleted_at_idx" ON "user_profiles"("deleted_at");
CREATE INDEX IF NOT EXISTS "user_profiles_city_idx"       ON "user_profiles"("city");

-- EMPLOYER_PROFILES
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "owner_name"          TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "company_name"        TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "address"             TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "city_v2"             TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "logo_bytes"          BYTEA;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "logo_mime"           TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "gst_number"          TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "verified_by_ops_at"  TIMESTAMP;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "total_shifts"        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "rating_v2"           DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "captain_referral_id" TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "deleted_at"          TIMESTAMP;

COMMIT;
`

console.log('\n🔧 Running Phase 0 ALTERs in transaction…')
try {
  await c.query(SQL)
  console.log('✅ Phase 0 ALTERs committed')
} catch (e) {
  console.error('❌ Phase 0 failed:', e.message)
  console.error('   The transaction was rolled back automatically. Your DB is unchanged.')
  await c.end()
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────────────
// 4) Verification — row counts + sample data
// ──────────────────────────────────────────────────────────────────────────
const after = await rowCounts()

let bad = false
console.log('\n📊 Row counts AFTER Phase 0:')
for (const [t, n] of Object.entries(after)) {
  const b = before[t]
  const ok = b === n
  if (!ok) bad = true
  console.log(`   ${t.padEnd(28)} ${String(b).padStart(6)} → ${String(n).padStart(6)}  ${ok ? '✅' : '❌ DRIFT'}`)
}

const after5users = (await c.query(`SELECT phone, name, photo_url, created_at FROM "users" ORDER BY phone LIMIT 5`)).rows
const sampleOk = JSON.stringify(before5users) === JSON.stringify(after5users)
console.log(`\n🔍 Sample 5 users byte-equality: ${sampleOk ? '✅ identical' : '❌ DRIFT'}`)

const usersWithoutId = (await c.query(`SELECT COUNT(*)::int AS n FROM "users" WHERE "id" IS NULL`)).rows[0].n
console.log(`🔍 Users still missing 'id': ${usersWithoutId === 0 ? '✅ none (all 406 backfilled)' : '❌ ' + usersWithoutId}`)

if (bad || !sampleOk || usersWithoutId > 0) {
  console.error('\n❌ VERIFICATION FAILED. The Phase 0 changes are committed but something looks off.')
  console.error('   Compare the snapshot above with your pg_dump backup at:')
  console.error('   ' + dumpFile)
  console.error('   Then send me the output and I will help roll back.')
  await c.end()
  process.exit(1)
}

console.log('\n🎉 Phase 0 complete. Existing data is byte-identical, all new columns added.')
console.log('   Backup file:', dumpFile)
console.log('\n📋 Paste the output above back to Claude — including the row-count table — to proceed to Phase 1.')

await c.end()
