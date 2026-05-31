// Phase 2 — final column alignment so the new Prisma schema can map cleanly
// onto the Railway tables. All ALTERs are conditional and idempotent.
//
//   export DATABASE_URL='postgresql://postgres:NEW_PASS@yamanote.proxy.rlwy.net:57346/railway'
//   node scripts/migrate-railway-phase2.mjs
//
// What it does:
//   1. Renames a few columns on the new *_v2 tables so they line up with the
//      existing Prisma field names (Booking.workerProfileId, Shift.employerProfileId, …)
//   2. Adds `contacts` to user_profiles / captain_profiles (used by the contacts UI)
//   3. Creates the `notifications` table (was never created earlier)
//
// All changes are wrapped in a single transaction. Re-runnable.

import pg from 'pg'

const url = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error('❌ DATABASE_URL not set'); process.exit(1) }

const c = new pg.Client({ connectionString: url })
await c.connect()

console.log('\n🔧 Phase 2 — renaming columns + adding notifications table')
try {
  await c.query(`
BEGIN;

-- 1. Rename mismatched columns on new *_v2 tables
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='shifts_v2' AND column_name='employer_user_id') THEN
    ALTER TABLE shifts_v2 RENAME COLUMN employer_user_id TO employer_profile_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='bookings_v2' AND column_name='worker_user_id') THEN
    ALTER TABLE bookings_v2 RENAME COLUMN worker_user_id TO worker_profile_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='bookings_v2' AND column_name='employer_user_id') THEN
    ALTER TABLE bookings_v2 RENAME COLUMN employer_user_id TO employer_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ratings_v2' AND column_name='worker_user_id') THEN
    ALTER TABLE ratings_v2 RENAME COLUMN worker_user_id TO worker_profile_id;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='aadhaar_access_logs' AND column_name='worker_phone') THEN
    ALTER TABLE aadhaar_access_logs RENAME COLUMN worker_phone TO worker_profile_id;
  END IF;
END $$;

-- 2. Re-create indexes that referenced renamed columns
CREATE INDEX IF NOT EXISTS shifts_v2_employer_profile_id_status_idx ON shifts_v2(employer_profile_id, status);
CREATE INDEX IF NOT EXISTS bookings_v2_worker_profile_id_status_idx ON bookings_v2(worker_profile_id, status);
CREATE INDEX IF NOT EXISTS bookings_v2_employer_id_status_idx       ON bookings_v2(employer_id, status);
CREATE INDEX IF NOT EXISTS ratings_v2_worker_profile_id_idx          ON ratings_v2(worker_profile_id);
CREATE INDEX IF NOT EXISTS aadhaar_access_logs_worker_profile_id_idx ON aadhaar_access_logs(worker_profile_id);

-- 3. Add contacts column (legacy field used by referral UI)
ALTER TABLE user_profiles    ADD COLUMN IF NOT EXISTS contacts TEXT;
ALTER TABLE captain_profiles ADD COLUMN IF NOT EXISTS contacts TEXT;

-- 3b. Legacy URL columns kept alongside the new bytea columns so existing
--     upload paths (Supabase Storage signed URLs) continue working until we
--     finish moving uploads to bytea-only.
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_photo TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS aadhaar_front TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS aadhaar_back  TEXT;
ALTER TABLE users         ADD COLUMN IF NOT EXISTS fcm_token     TEXT;
ALTER TABLE users         ADD COLUMN IF NOT EXISTS captain_referral_id TEXT;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS logo TEXT;

-- 3c. Swap primary key on user_profiles + employer_profiles from the legacy
--     `phone` column to the new `id` column. The Prisma models declare `id`
--     as @id and don't pass `phone` on create, so leaving phone as NOT NULL
--     PK breaks every nested workerProfile.create / employerProfile.create.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
    WHERE tc.table_name='user_profiles' AND tc.constraint_type='PRIMARY KEY'
      AND kcu.column_name='phone'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_pkey;
    ALTER TABLE user_profiles ALTER COLUMN phone DROP NOT NULL;
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_phone_key ON user_profiles(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key ON user_profiles(user_id);

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu USING (constraint_schema, constraint_name)
    WHERE tc.table_name='employer_profiles' AND tc.constraint_type='PRIMARY KEY'
      AND kcu.column_name='phone'
  ) THEN
    ALTER TABLE employer_profiles DROP CONSTRAINT employer_profiles_pkey;
    ALTER TABLE employer_profiles ALTER COLUMN phone DROP NOT NULL;
    ALTER TABLE employer_profiles ADD CONSTRAINT employer_profiles_pkey PRIMARY KEY (id);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS employer_profiles_phone_key ON employer_profiles(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employer_profiles_user_id_key ON employer_profiles(user_id);

-- 3d. Foreign key constraints with ON DELETE CASCADE so deleting a user
--     cleans up their profile rows. Without these, Prisma user.delete()
--     leaves orphan profile rows that break Prisma's required `user`
--     relation on the next findMany.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='user_profiles' AND constraint_name='user_profiles_user_id_fkey') THEN
    DELETE FROM user_profiles up WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = up.user_id);
    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='employer_profiles' AND constraint_name='employer_profiles_user_id_fkey') THEN
    DELETE FROM employer_profiles ep WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ep.user_id);
    ALTER TABLE employer_profiles ADD CONSTRAINT employer_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='captain_profiles' AND constraint_name='captain_profiles_user_id_fkey') THEN
    DELETE FROM captain_profiles cp WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = cp.user_id);
    ALTER TABLE captain_profiles ADD CONSTRAINT captain_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='ops_profiles' AND constraint_name='ops_profiles_user_id_fkey') THEN
    DELETE FROM ops_profiles op WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = op.user_id);
    ALTER TABLE ops_profiles ADD CONSTRAINT ops_profiles_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE table_name='notifications_v2' AND constraint_name='notifications_v2_user_id_fkey') THEN
    DELETE FROM notifications_v2 n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id);
    ALTER TABLE notifications_v2 ADD CONSTRAINT notifications_v2_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 4. Notifications table — `notifications` already exists in the legacy schema
--     with int id + epoch created_at, so we use `notifications_v2` for the new app.
CREATE TABLE IF NOT EXISTS notifications_v2 (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_v2_user_read_idx    ON notifications_v2(user_id, read);
CREATE INDEX IF NOT EXISTS notifications_v2_user_created_idx ON notifications_v2(user_id, created_at);

-- 4b. otp_verifications_v2 — same story as notifications: legacy table has
--      created_at + expires_at as `double precision` (epoch seconds), which
--      Prisma rejects when reading back into DateTime. New table with proper
--      TIMESTAMP types for the new app.
CREATE TABLE IF NOT EXISTS otp_verifications_v2 (
  id          TEXT PRIMARY KEY,
  phone       TEXT NOT NULL,
  otp         TEXT NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  verified    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS otp_verifications_v2_phone_idx                  ON otp_verifications_v2(phone);
CREATE INDEX IF NOT EXISTS otp_verifications_v2_phone_verified_created_idx ON otp_verifications_v2(phone, verified, created_at);

-- 5. Postgres ENUM types (Prisma generates queries that cast to these).
--    Created idempotently. Then convert TEXT status columns to use them.
DO $$ BEGIN CREATE TYPE "KycStatus"        AS ENUM ('PENDING','APPROVED','REJECTED');                                  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "Role"             AS ENUM ('WORKER','EMPLOYER','CAPTAIN','OPS','ADMIN');                       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ShiftStatus"      AS ENUM ('OPEN','SEARCHING','ASSIGNED','IN_PROGRESS','COMPLETED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BookingStatus"    AS ENUM ('PENDING','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentStatus"    AS ENUM ('PENDING','PAID','FAILED','REFUNDED');                                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CaptainStatus"    AS ENUM ('PENDING','ACTIVE','INACTIVE');                                       EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommissionStatus" AS ENUM ('PENDING','APPROVED','PAID');                                         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TaskStatus"       AS ENUM ('OPEN','COMPLETED');                                                  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING','PROCESSING','PAID','REJECTED');                            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "RatingTarget"     AS ENUM ('WORKER','EMPLOYER');                                                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Convert columns. We guard each ALTER with a column-type check so re-runs don't fail.
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='users' AND column_name='role') = 'text' THEN
    ALTER TABLE users ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE users ALTER COLUMN role TYPE "Role" USING role::"Role";
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'WORKER'::"Role";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='kyc_status') = 'text' THEN
    ALTER TABLE user_profiles ALTER COLUMN kyc_status DROP DEFAULT;
    ALTER TABLE user_profiles ALTER COLUMN kyc_status TYPE "KycStatus" USING kyc_status::"KycStatus";
    ALTER TABLE user_profiles ALTER COLUMN kyc_status SET DEFAULT 'PENDING'::"KycStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='shifts_v2' AND column_name='status') = 'text' THEN
    ALTER TABLE shifts_v2 ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE shifts_v2 ALTER COLUMN status TYPE "ShiftStatus" USING status::"ShiftStatus";
    ALTER TABLE shifts_v2 ALTER COLUMN status SET DEFAULT 'OPEN'::"ShiftStatus";
    ALTER TABLE shifts_v2 ALTER COLUMN payment_status DROP DEFAULT;
    ALTER TABLE shifts_v2 ALTER COLUMN payment_status TYPE "PaymentStatus" USING payment_status::"PaymentStatus";
    ALTER TABLE shifts_v2 ALTER COLUMN payment_status SET DEFAULT 'PENDING'::"PaymentStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='bookings_v2' AND column_name='status') = 'text' THEN
    ALTER TABLE bookings_v2 ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE bookings_v2 ALTER COLUMN status TYPE "BookingStatus" USING status::"BookingStatus";
    ALTER TABLE bookings_v2 ALTER COLUMN status SET DEFAULT 'PENDING'::"BookingStatus";
    ALTER TABLE bookings_v2 ALTER COLUMN payment_status DROP DEFAULT;
    ALTER TABLE bookings_v2 ALTER COLUMN payment_status TYPE "PaymentStatus" USING payment_status::"PaymentStatus";
    ALTER TABLE bookings_v2 ALTER COLUMN payment_status SET DEFAULT 'PENDING'::"PaymentStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='payments_v2' AND column_name='status') = 'text' THEN
    ALTER TABLE payments_v2 ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE payments_v2 ALTER COLUMN status TYPE "PaymentStatus" USING status::"PaymentStatus";
    ALTER TABLE payments_v2 ALTER COLUMN status SET DEFAULT 'PENDING'::"PaymentStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='captain_profiles' AND column_name='status') = 'text' THEN
    ALTER TABLE captain_profiles ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE captain_profiles ALTER COLUMN status TYPE "CaptainStatus" USING status::"CaptainStatus";
    ALTER TABLE captain_profiles ALTER COLUMN status SET DEFAULT 'PENDING'::"CaptainStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='commissions' AND column_name='status') = 'text' THEN
    ALTER TABLE commissions ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE commissions ALTER COLUMN status TYPE "CommissionStatus" USING status::"CommissionStatus";
    ALTER TABLE commissions ALTER COLUMN status SET DEFAULT 'PENDING'::"CommissionStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='captain_tasks' AND column_name='status') = 'text' THEN
    ALTER TABLE captain_tasks ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE captain_tasks ALTER COLUMN status TYPE "TaskStatus" USING status::"TaskStatus";
    ALTER TABLE captain_tasks ALTER COLUMN status SET DEFAULT 'OPEN'::"TaskStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='withdrawals' AND column_name='status') = 'text' THEN
    ALTER TABLE withdrawals ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE withdrawals ALTER COLUMN status TYPE "WithdrawalStatus" USING status::"WithdrawalStatus";
    ALTER TABLE withdrawals ALTER COLUMN status SET DEFAULT 'PENDING'::"WithdrawalStatus";
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name='ratings_v2' AND column_name='target_role') = 'text' THEN
    ALTER TABLE ratings_v2 ALTER COLUMN target_role DROP DEFAULT;
    ALTER TABLE ratings_v2 ALTER COLUMN target_role TYPE "RatingTarget" USING target_role::"RatingTarget";
    ALTER TABLE ratings_v2 ALTER COLUMN target_role SET DEFAULT 'WORKER'::"RatingTarget";
  END IF;
END $$;

COMMIT;
`)
  console.log('✅ Phase 2 column rename + notifications table done')
} catch (e) {
  console.error('❌ Phase 2 failed:', e.message)
  process.exit(1)
}

// Verification
const cols = async (tbl) => (await c.query(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
  [tbl]
)).rows.map(r => r.column_name)

console.log('\n🔍 Verification — final column names per table:')
for (const t of ['shifts_v2', 'bookings_v2', 'ratings_v2', 'aadhaar_access_logs', 'notifications', 'user_profiles', 'employer_profiles']) {
  console.log(`   ${t}:`)
  console.log(`     ${(await cols(t)).join(', ')}`)
}

await c.end()
console.log('\n🎉 Phase 2 complete. Now run: npx prisma generate')
