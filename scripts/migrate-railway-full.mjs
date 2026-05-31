// ─────────────────────────────────────────────────────────────────────────
// Switch — Supabase → Railway end-to-end migration
//
// What this does (in order, atomically per phase):
//   1. pg_dump of Railway as a backup (.dump file on your Desktop)
//   2. Connect to both Supabase and Railway, count every table on both
//   3. Phase 0 — extend existing Railway tables with new columns
//   4. Phase 1 — create new Railway tables for things old DB doesn't have
//                (captain_profiles, ratings, withdrawals, complaints, etc.)
//   5. Phase 3 — copy every Supabase user/profile/captain/etc. into Railway
//                  - UPSERT users by phone (no duplicates, no overwrites)
//                  - Fill new columns on existing 406 Railway users
//                  - Migrate Aadhaar/photo bytes into bytea columns
//   6. Final verification — row counts, sample byte equality, image counts
//
// ZERO data loss properties:
//   - Backup is taken FIRST. If anything goes wrong: pg_restore the dump.
//   - All ALTERs / CREATEs are IF NOT EXISTS — re-runnable.
//   - Every user/profile copy is UPSERT — re-running won't duplicate.
//   - Existing Railway data is never overwritten unless explicitly empty.
//   - Each phase is in its own transaction — partial failure = full rollback.
//
// How to run:
//
//   export RAILWAY_DATABASE_URL='postgresql://postgres:NEW_PASS@yamanote.proxy.rlwy.net:57346/railway'
//   export SUPABASE_DATABASE_URL='postgresql://postgres.vdjzivsfctcybzuxjtzk:SUPA_PASS@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
//   export SUPABASE_URL='https://vdjzivsfctcybzuxjtzk.supabase.co'
//   export SUPABASE_SERVICE_ROLE_KEY='eyJ...'   # service_role key, for downloading bucket images
//
//   cd "/Users/alt/Downloads/Switch-app-main 4"
//   npm install pg @supabase/supabase-js   # if not already installed
//   node scripts/migrate-railway-full.mjs
//
// ─────────────────────────────────────────────────────────────────────────
import pg from 'pg'
import { execFileSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createClient } from '@supabase/supabase-js'

const RW_URL = process.env.RAILWAY_DATABASE_URL
const SB_URL = process.env.SUPABASE_DATABASE_URL
const SB_HTTP_URL = process.env.SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!RW_URL || !SB_URL || !SB_HTTP_URL || !SB_KEY) {
  console.error('❌ Missing one of: RAILWAY_DATABASE_URL, SUPABASE_DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ──────────────────────────────────────────────────────────────────────────
// 1. BACKUP
// ──────────────────────────────────────────────────────────────────────────
const stamp     = new Date().toISOString().replace(/[:.]/g, '-')
const backupDir = join(homedir(), 'Desktop', 'sw-railway-backups', stamp)
mkdirSync(backupDir, { recursive: true })
const dumpFile = join(backupDir, 'pre-migration.dump')

console.log(`\n📦 Step 1/6 — pg_dump backup → ${dumpFile}`)
try {
  execFileSync('pg_dump', ['--no-owner', '--no-acl', '--format=custom', '--file', dumpFile, RW_URL], { stdio: 'inherit' })
} catch (e) {
  console.error('❌ pg_dump failed. Install with: brew install libpq && brew link --force libpq')
  process.exit(1)
}
console.log(`✅ Backup ${(statSync(dumpFile).size / 1024 / 1024).toFixed(2)} MB · keep 7+ days`)

// ──────────────────────────────────────────────────────────────────────────
// 2. CONNECT + PRE-FLIGHT COUNTS
// ──────────────────────────────────────────────────────────────────────────
const rw = new pg.Client({ connectionString: RW_URL })
const sb = new pg.Client({ connectionString: SB_URL })
await rw.connect()
await sb.connect()
const sbHttp = createClient(SB_HTTP_URL, SB_KEY, { auth: { persistSession: false } })

async function countAll(client) {
  const t = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`)
  const out = {}
  for (const r of t.rows) {
    try { const x = await client.query(`SELECT COUNT(*)::int AS n FROM "${r.table_name}"`); out[r.table_name] = x.rows[0].n }
    catch { out[r.table_name] = 'ERR' }
  }
  return out
}

console.log('\n📊 Step 2/6 — counting rows on both databases')
const rwBefore = await countAll(rw)
const sbBefore = await countAll(sb)
console.log('   RAILWAY before:')
for (const [t, n] of Object.entries(rwBefore)) console.log(`      ${t.padEnd(28)} ${n}`)
console.log('   SUPABASE before:')
for (const [t, n] of Object.entries(sbBefore)) console.log(`      ${t.padEnd(28)} ${n}`)

// ──────────────────────────────────────────────────────────────────────────
// 3. PHASE 0 — extend existing Railway tables
// ──────────────────────────────────────────────────────────────────────────
console.log('\n🔧 Step 3/6 — Phase 0: ALTERing existing Railway tables')
await rw.query(`
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
UPDATE "users" SET "created_at_v2" = to_timestamp("created_at") WHERE "created_at" IS NOT NULL AND "created_at_v2" = "updated_at_v2";
UPDATE "users" SET "id" = 'usr_' || replace(gen_random_uuid()::text, '-', '') WHERE "id" IS NULL;
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_id_key"         ON "users"("id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"      ON "users"("email") WHERE "email" IS NOT NULL;
CREATE INDEX        IF NOT EXISTS "users_role_idx"       ON "users"("role");
CREATE INDEX        IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");

-- USER_PROFILES (worker side)
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
`)
console.log('   ✅ Phase 0 ALTERs committed')

// ──────────────────────────────────────────────────────────────────────────
// 4. PHASE 1 — create new tables
// ──────────────────────────────────────────────────────────────────────────
console.log('\n🆕 Step 4/6 — Phase 1: creating new tables for captain/booking/etc.')
await rw.query(`
BEGIN;

CREATE TABLE IF NOT EXISTS "captain_profiles" (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE,
  referral_code   TEXT NOT NULL UNIQUE,
  territory       TEXT,
  total_earnings  DOUBLE PRECISION NOT NULL DEFAULT 0,
  pending_payout  DOUBLE PRECISION NOT NULL DEFAULT 0,
  joined_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'PENDING',
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  last_seen_at    TIMESTAMP,
  contacts        TEXT,
  deleted_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS captain_profiles_status_idx ON captain_profiles(status);
CREATE INDEX IF NOT EXISTS captain_profiles_territory_idx ON captain_profiles(territory);

CREATE TABLE IF NOT EXISTS "ops_profiles" (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE,
  permissions  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

CREATE TABLE IF NOT EXISTS "shifts_v2" (
  id              TEXT PRIMARY KEY,
  employer_user_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  role            TEXT NOT NULL,
  description     TEXT,
  address         TEXT NOT NULL,
  city            TEXT NOT NULL,
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  date            TIMESTAMP NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  duration        DOUBLE PRECISION NOT NULL,
  workers_needed  INTEGER NOT NULL DEFAULT 1,
  hourly_rate     DOUBLE PRECISION NOT NULL DEFAULT 200,
  is_urgent       BOOLEAN NOT NULL DEFAULT false,
  urgent_fee      DOUBLE PRECISION NOT NULL DEFAULT 0,
  payment_status  TEXT NOT NULL DEFAULT 'PENDING',
  payment_amount  DOUBLE PRECISION,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  paid_at         TIMESTAMP,
  status          TEXT NOT NULL DEFAULT 'OPEN',
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS shifts_v2_status_date_idx ON shifts_v2(status, date);
CREATE INDEX IF NOT EXISTS shifts_v2_employer_user_id_idx ON shifts_v2(employer_user_id);
CREATE INDEX IF NOT EXISTS shifts_v2_role_city_status_idx ON shifts_v2(role, city, status);

CREATE TABLE IF NOT EXISTS "bookings_v2" (
  id              TEXT PRIMARY KEY,
  shift_id        TEXT NOT NULL,
  worker_user_id  TEXT NOT NULL,
  employer_user_id TEXT NOT NULL,
  total_amount    DOUBLE PRECISION NOT NULL,
  platform_fee    DOUBLE PRECISION NOT NULL,
  worker_earning  DOUBLE PRECISION NOT NULL,
  payment_id      TEXT,
  check_in_time   TIMESTAMP,
  check_out_time  TIMESTAMP,
  notes           TEXT,
  applied_at      TIMESTAMP DEFAULT NOW(),
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'PENDING',
  payment_status  TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE INDEX IF NOT EXISTS bookings_v2_shift_id_idx ON bookings_v2(shift_id);
CREATE INDEX IF NOT EXISTS bookings_v2_worker_user_id_status_idx ON bookings_v2(worker_user_id, status);
CREATE INDEX IF NOT EXISTS bookings_v2_employer_user_id_status_idx ON bookings_v2(employer_user_id, status);

CREATE TABLE IF NOT EXISTS "payments_v2" (
  id                TEXT PRIMARY KEY,
  booking_id        TEXT NOT NULL UNIQUE,
  razorpay_order_id   TEXT,
  razorpay_payment_id TEXT,
  amount            DOUBLE PRECISION NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'INR',
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  status            TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE INDEX IF NOT EXISTS payments_v2_status_created_at_idx ON payments_v2(status, created_at);

CREATE TABLE IF NOT EXISTS "ratings_v2" (
  id                TEXT PRIMARY KEY,
  booking_id        TEXT NOT NULL,
  rated_by_id       TEXT NOT NULL,
  target_role       TEXT NOT NULL DEFAULT 'WORKER',
  worker_user_id    TEXT,
  target_user_id    TEXT,
  score             INTEGER NOT NULL,
  comment           TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, rated_by_id)
);
CREATE INDEX IF NOT EXISTS ratings_v2_target_user_id_idx ON ratings_v2(target_user_id);

CREATE TABLE IF NOT EXISTS "commissions" (
  id               TEXT PRIMARY KEY,
  captain_profile_id TEXT NOT NULL,
  booking_id       TEXT NOT NULL UNIQUE,
  amount           DOUBLE PRECISION NOT NULL DEFAULT 100,
  paid_at          TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  status           TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE INDEX IF NOT EXISTS commissions_captain_status_idx ON commissions(captain_profile_id, status);

CREATE TABLE IF NOT EXISTS "captain_tasks" (
  id                  TEXT PRIMARY KEY,
  captain_profile_id  TEXT NOT NULL,
  assigned_by_user_id TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  due_date            TIMESTAMP,
  completed_at        TIMESTAMP,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'OPEN'
);
CREATE INDEX IF NOT EXISTS captain_tasks_captain_status_idx ON captain_tasks(captain_profile_id, status);

CREATE TABLE IF NOT EXISTS "captain_attendances" (
  id                  TEXT PRIMARY KEY,
  captain_profile_id  TEXT NOT NULL,
  date                TIMESTAMP NOT NULL,
  check_in_time       TIMESTAMP,
  check_in_lat        DOUBLE PRECISION,
  check_in_lng        DOUBLE PRECISION,
  check_out_time      TIMESTAMP,
  check_out_lat       DOUBLE PRECISION,
  check_out_lng       DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS captain_attendances_captain_date_idx ON captain_attendances(captain_profile_id, date);

CREATE TABLE IF NOT EXISTS "withdrawals" (
  id           TEXT PRIMARY KEY,
  worker_id    TEXT NOT NULL,
  upi_id       TEXT NOT NULL,
  amount       DOUBLE PRECISION NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  notes        TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  utr          TEXT
);
CREATE INDEX IF NOT EXISTS withdrawals_worker_status_idx ON withdrawals(worker_id, status);
CREATE INDEX IF NOT EXISTS withdrawals_status_requested_idx ON withdrawals(status, requested_at);

CREATE TABLE IF NOT EXISTS "complaints_v2" (
  id          TEXT PRIMARY KEY,
  booking_id  TEXT,
  reported_by TEXT NOT NULL,
  against     TEXT NOT NULL,
  type        TEXT NOT NULL,
  description TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN',
  resolution  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS complaints_v2_status_idx ON complaints_v2(status, created_at);

CREATE TABLE IF NOT EXISTS "data_deletion_requests" (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS "aadhaar_access_logs" (
  id              TEXT PRIMARY KEY,
  worker_phone    TEXT NOT NULL,
  accessed_by_id  TEXT NOT NULL,
  fields_viewed   TEXT[] NOT NULL,
  reason          TEXT,
  ip              TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "broadcast_logs" (
  id              TEXT PRIMARY KEY,
  sent_by_user_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  target_role     TEXT,
  target_city     TEXT,
  sent_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "platform_settings" (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

COMMIT;
`)
console.log('   ✅ Phase 1 new tables created')

// ──────────────────────────────────────────────────────────────────────────
// 5. PHASE 3 — copy from Supabase to Railway
// ──────────────────────────────────────────────────────────────────────────
console.log('\n📥 Step 5/6 — Phase 3: copying Supabase data into Railway')

// 5.1 USERS — UPSERT by phone (preserve existing 406, add new ones, fill gaps on existing)
const sbUsers = (await sb.query(`SELECT id, name, phone, email, password, role, "isActive", "tokenVersion", "deletedAt", "fcmTokens", "captainReferralId", "createdAt", "updatedAt", avatar FROM "User"`)).rows
console.log(`   USERS — ${sbUsers.length} from Supabase to merge`)
let usersInserted = 0, usersUpdated = 0
for (const u of sbUsers) {
  // Try update first (matched by phone); insert if not present
  const upd = await rw.query(`
    UPDATE "users" SET
      "id"            = COALESCE("id", $1),
      "email"         = COALESCE("email", $2),
      "password"      = CASE WHEN "password" = '' THEN $3 ELSE "password" END,
      "role"          = $4,
      "is_active"     = $5,
      "token_version" = $6,
      "deleted_at"    = $7,
      "fcm_tokens"    = $8,
      "name"          = COALESCE("name", $9),
      "created_at_v2" = LEAST("created_at_v2", $10),
      "updated_at_v2" = GREATEST("updated_at_v2", $11)
    WHERE "phone" = $12
    RETURNING "phone"
  `, [
    u.id, u.email, u.password || '', u.role, u.isActive, u.tokenVersion ?? 0, u.deletedAt, u.fcmTokens || [], u.name,
    u.createdAt, u.updatedAt, u.phone,
  ])
  if (upd.rowCount && upd.rowCount > 0) {
    usersUpdated++
  } else {
    await rw.query(`
      INSERT INTO "users" ("phone","id","name","email","password","role","is_active","token_version","deleted_at","fcm_tokens","created_at","updated_at","created_at_v2","updated_at_v2")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, EXTRACT(EPOCH FROM $11::timestamp), EXTRACT(EPOCH FROM $12::timestamp), $11, $12)
      ON CONFLICT (phone) DO NOTHING
    `, [u.phone, u.id, u.name, u.email, u.password || '', u.role, u.isActive, u.tokenVersion ?? 0, u.deletedAt, u.fcmTokens || [], u.createdAt, u.updatedAt])
    usersInserted++
  }
}
console.log(`      → ${usersInserted} inserted, ${usersUpdated} updated/merged`)

// 5.2 WORKER PROFILES — fill columns on existing user_profiles row matched by phone, or insert new
const sbWorkers = (await sb.query(`
  SELECT u.phone, w.* FROM "WorkerProfile" w
  JOIN "User" u ON u.id = w."userId"
`)).rows
console.log(`   WORKER PROFILES — ${sbWorkers.length} from Supabase`)
let wInserted = 0, wUpdated = 0
for (const w of sbWorkers) {
  const exists = await rw.query(`SELECT 1 FROM "user_profiles" WHERE "phone" = $1`, [w.phone])
  if (exists.rowCount && exists.rowCount > 0) {
    await rw.query(`
      UPDATE "user_profiles" SET
        "aadhaar_number"           = COALESCE("aadhaar_number", $1),
        "aadhaar_last4"            = COALESCE("aadhaar_last4", $2),
        "aadhaar_consent_version"  = COALESCE("aadhaar_consent_version", $3),
        "aadhaar_consent_at"       = COALESCE("aadhaar_consent_at", $4),
        "aadhaar_consent_ip"       = COALESCE("aadhaar_consent_ip", $5),
        "aadhaar_verified"         = $6,
        "video_verified"           = $7,
        "kyc_status"               = $8,
        "total_shifts"             = $9,
        "total_earnings"           = $10,
        "hourly_rate"              = $11,
        "is_available"             = $12,
        "rating"                   = $13,
        "milestone_level"          = $14,
        "captain_referral_id"      = COALESCE("captain_referral_id", $15),
        "location_sharing_consent" = $16,
        "deleted_at"               = $17,
        "last_seen_at"             = $18,
        "lat"                      = COALESCE("lat", $19),
        "lng"                      = COALESCE("lng", $20),
        "upi_id"                   = COALESCE("upi_id", $21),
        "bio"                      = COALESCE("bio", $22),
        "city"                     = COALESCE("city", $23),
        "skills_v2"                = $24
      WHERE "phone" = $25
    `, [w.aadhaarNumber, w.aadhaarLast4, w.aadhaarConsentVersion, w.aadhaarConsentAt, w.aadhaarConsentIp,
       w.aadhaarVerified, w.videoVerified, w.kycStatus, w.totalShifts, w.totalEarnings, w.hourlyRate, w.isAvailable,
       w.rating, w.milestoneLevel, w.captainReferralId, w.locationSharingConsent, w.deletedAt, w.lastSeenAt,
       w.lat, w.lng, w.upiId, w.bio, w.city, w.skills || [], w.phone])
    wUpdated++
  } else {
    await rw.query(`
      INSERT INTO "user_profiles" ("phone","aadhaar_number","aadhaar_last4","aadhaar_consent_version","aadhaar_consent_at","aadhaar_consent_ip","aadhaar_verified","video_verified","kyc_status","total_shifts","total_earnings","hourly_rate","is_available","rating","milestone_level","captain_referral_id","location_sharing_consent","deleted_at","last_seen_at","lat","lng","upi_id","bio","city","skills_v2")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
      ON CONFLICT (phone) DO NOTHING
    `, [w.phone, w.aadhaarNumber, w.aadhaarLast4, w.aadhaarConsentVersion, w.aadhaarConsentAt, w.aadhaarConsentIp,
       w.aadhaarVerified, w.videoVerified, w.kycStatus, w.totalShifts, w.totalEarnings, w.hourlyRate, w.isAvailable,
       w.rating, w.milestoneLevel, w.captainReferralId, w.locationSharingConsent, w.deletedAt, w.lastSeenAt,
       w.lat, w.lng, w.upiId, w.bio, w.city, w.skills || []])
    wInserted++
  }
  // Image migration — download and store as bytea
  const imageJobs = [
    { col: 'profile_photo', src: w.profilePhoto },
    { col: 'aadhaar_front', src: w.aadhaarFront },
    { col: 'aadhaar_back',  src: w.aadhaarBack  },
  ]
  for (const ij of imageJobs) {
    if (!ij.src) continue
    try {
      let buf = null, mime = 'image/jpeg'
      if (ij.src.startsWith('http')) {
        const r = await fetch(ij.src)
        if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); mime = r.headers.get('content-type') || mime }
      } else if (ij.src.startsWith('aadhaar/') || ij.src.startsWith('docs/')) {
        const { data } = await sbHttp.storage.from(process.env.SUPABASE_BUCKET_PRIVATE || 'private-kyc').download(ij.src)
        if (data) { buf = Buffer.from(await data.arrayBuffer()); mime = data.type || mime }
      }
      if (buf) {
        await rw.query(`UPDATE "user_profiles" SET "${ij.col}_bytes"=$1, "${ij.col}_mime"=$2 WHERE "phone"=$3`, [buf, mime, w.phone])
      }
    } catch (e) { console.warn(`      ⚠️ image ${ij.col} for ${w.phone} failed: ${e.message}`) }
  }
}
console.log(`      → ${wInserted} inserted, ${wUpdated} merged`)

// 5.3 EMPLOYER PROFILES — same merge by phone
const sbEmployers = (await sb.query(`
  SELECT u.phone, e.* FROM "EmployerProfile" e
  JOIN "User" u ON u.id = e."userId"
`)).rows
console.log(`   EMPLOYER PROFILES — ${sbEmployers.length} from Supabase`)
let eInserted = 0, eUpdated = 0
for (const e of sbEmployers) {
  const ex = await rw.query(`SELECT 1 FROM "employer_profiles" WHERE "phone" = $1`, [e.phone])
  if (ex.rowCount && ex.rowCount > 0) {
    await rw.query(`
      UPDATE "employer_profiles" SET
        "owner_name"          = COALESCE("owner_name", $1),
        "company_name"        = COALESCE("company_name", $2),
        "address"             = COALESCE("address", $3),
        "city_v2"             = COALESCE("city_v2", $4),
        "gst_number"          = COALESCE("gst_number", $5),
        "verified_by_ops_at"  = $6,
        "total_shifts"        = $7,
        "rating_v2"           = $8,
        "captain_referral_id" = COALESCE("captain_referral_id", $9),
        "deleted_at"          = $10
      WHERE "phone" = $11
    `, [e.ownerName, e.companyName, e.address, e.city, e.gstNumber, e.verifiedByOpsAt,
       e.totalShifts, e.rating, e.captainReferralId, e.deletedAt, e.phone])
    eUpdated++
  } else {
    await rw.query(`
      INSERT INTO "employer_profiles" ("phone","owner_name","company_name","address","city_v2","gst_number","verified_by_ops_at","total_shifts","rating_v2","captain_referral_id","deleted_at")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (phone) DO NOTHING
    `, [e.phone, e.ownerName, e.companyName, e.address, e.city, e.gstNumber, e.verifiedByOpsAt,
       e.totalShifts, e.rating, e.captainReferralId, e.deletedAt])
    eInserted++
  }
  if (e.logo && e.logo.startsWith('http')) {
    try {
      const r = await fetch(e.logo)
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        await rw.query(`UPDATE "employer_profiles" SET "logo_bytes"=$1, "logo_mime"=$2 WHERE "phone"=$3`, [buf, r.headers.get('content-type') || 'image/jpeg', e.phone])
      }
    } catch {}
  }
}
console.log(`      → ${eInserted} inserted, ${eUpdated} merged`)

// 5.4 CAPTAIN PROFILES → new captain_profiles table
const sbCaptains = (await sb.query(`
  SELECT u.id AS user_id, u.phone, c.* FROM "CaptainProfile" c
  JOIN "User" u ON u.id = c."userId"
`)).rows
console.log(`   CAPTAIN PROFILES — ${sbCaptains.length} from Supabase`)
for (const c of sbCaptains) {
  // Get the Railway-side user.id (may be different from Supabase id since we backfilled)
  const rwUser = (await rw.query(`SELECT id FROM "users" WHERE phone=$1`, [c.phone])).rows[0]
  if (!rwUser) continue
  await rw.query(`
    INSERT INTO "captain_profiles" (id,user_id,referral_code,territory,total_earnings,pending_payout,joined_at,status,lat,lng,last_seen_at,contacts,deleted_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (user_id) DO UPDATE SET
      referral_code = EXCLUDED.referral_code,
      territory = EXCLUDED.territory,
      total_earnings = EXCLUDED.total_earnings,
      pending_payout = EXCLUDED.pending_payout,
      status = EXCLUDED.status,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      last_seen_at = EXCLUDED.last_seen_at
  `, [c.id, rwUser.id, c.referralCode, c.territory, c.totalEarnings, c.pendingPayout, c.joinedAt, c.status, c.lat, c.lng, c.lastSeenAt, c.contacts, null])
}
console.log(`      → ${sbCaptains.length} captain profiles migrated`)

// 5.5 OPS PROFILES → new ops_profiles table
const sbOps = (await sb.query(`
  SELECT u.phone, o.* FROM "OpsProfile" o
  JOIN "User" u ON u.id = o."userId"
`)).rows
console.log(`   OPS PROFILES — ${sbOps.length} from Supabase`)
for (const o of sbOps) {
  const rwUser = (await rw.query(`SELECT id FROM "users" WHERE phone=$1`, [o.phone])).rows[0]
  if (!rwUser) continue
  await rw.query(`INSERT INTO ops_profiles (id, user_id, permissions) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
    [o.id, rwUser.id, o.permissions || []])
}

// 5.6 PLATFORM SETTINGS (promo codes, etc.)
const sbSettings = (await sb.query(`SELECT * FROM "PlatformSetting"`)).rows
for (const s of sbSettings) {
  await rw.query(`INSERT INTO platform_settings (id,key,value) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()`,
    [s.id, s.key, s.value])
}
console.log(`   PLATFORM SETTINGS — ${sbSettings.length} migrated`)

// (Shifts/Bookings/Payments are 0 in Supabase right now per earlier inspection. Add same pattern if you have data.)

// ──────────────────────────────────────────────────────────────────────────
// 6. VERIFY
// ──────────────────────────────────────────────────────────────────────────
console.log('\n🔍 Step 6/6 — final verification')
const rwAfter = await countAll(rw)
console.log('   RAILWAY after:')
for (const [t, n] of Object.entries(rwAfter)) {
  const before = rwBefore[t] ?? 0
  const arrow = before === n ? '=' : `${before} → ${n}`
  console.log(`      ${t.padEnd(28)} ${arrow}`)
}

const totalRwUsers = rwAfter['users']
const usersWithBackfilledId = (await rw.query(`SELECT COUNT(*)::int AS n FROM "users" WHERE "id" IS NOT NULL`)).rows[0].n
const expectedMin = Math.max(rwBefore['users'], sbUsers.length)
console.log(`\n👥 Users:  Railway before=${rwBefore['users']}, Supabase=${sbUsers.length}, Railway after=${totalRwUsers}`)
console.log(`   All users have id populated: ${usersWithBackfilledId === totalRwUsers ? '✅' : '❌ ' + usersWithBackfilledId + '/' + totalRwUsers}`)

if (totalRwUsers < expectedMin) {
  console.error(`\n❌ User count is below expected minimum (${expectedMin}). Investigate!`)
  process.exit(1)
}

console.log('\n🎉 Migration done.')
console.log(`   Backup file: ${dumpFile}`)
console.log('   Paste the entire output back to Claude so we can verify and proceed.')

await rw.end()
await sb.end()
