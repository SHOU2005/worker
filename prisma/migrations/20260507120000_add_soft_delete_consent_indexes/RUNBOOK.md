# Migration Runbook — `20260507120000_add_soft_delete_consent_indexes`

This is a **fully additive** migration. It only adds columns and indexes; it never drops or renames anything. Existing data is preserved 1:1.

## What this migration does

### New columns (all nullable or with safe defaults — zero rows are touched)
- `User.deletedAt: TIMESTAMP NULL` — DPDP §12 soft delete
- `WorkerProfile.deletedAt: TIMESTAMP NULL`
- `EmployerProfile.deletedAt: TIMESTAMP NULL`
- `WorkerProfile.locationSharingConsent: BOOLEAN NOT NULL DEFAULT false` — DPDP §6 consent. Existing workers default to false (opt-out by design).

### New indexes (additive, no existing index removed)
- `User_deletedAt_idx`
- `WorkerProfile_deletedAt_idx`
- `EmployerProfile_deletedAt_idx`
- `Booking_workerProfileId_status_idx` — speeds worker shift list
- `Withdrawal_workerId_status_idx` — speeds worker payout history
- `Complaint_reportedBy_createdAt_idx` — speeds user's complaint list
- `Complaint_status_createdAt_idx` — speeds ops triage queue
- `OtpLog_phone_verified_createdAt_idx` — speeds verify-otp lookup

## Safety properties

- ✅ **No data loss possible** — all SQL is `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.
- ✅ **Idempotent** — re-running on a partially-applied DB is safe.
- ✅ **Reversible** — see Rollback below if needed.
- ⚠️ **Existing OPS dashboards depending on `/api/ops/live-locations` will see fewer workers** because the new endpoint only returns workers who have opted in. This is by design (DPDP requirement). Workers can opt in via the new toggle on their profile page.

## Pre-migration checklist

1. **Take a logical backup** (do this even though the migration is additive — always):
   ```bash
   pg_dump --no-owner --format=custom "$DATABASE_URL" > backup-$(date +%Y%m%d-%H%M).dump
   ```
2. **Confirm the new migration is staged**:
   ```bash
   ls prisma/migrations/20260507120000_add_soft_delete_consent_indexes/
   # Must show migration.sql and RUNBOOK.md
   ```
3. **Confirm Prisma + DB versions match**:
   ```bash
   npx prisma migrate status
   # Should list 20260507120000_add_soft_delete_consent_indexes as "not yet applied"
   ```

## Run the migration

### Production (Vercel + Railway / any managed Postgres)

```bash
# 1. Generate the Prisma client locally so types match
npx prisma generate

# 2. Apply the migration to the production DB
DATABASE_URL=<prod-url> DIRECT_URL=<prod-direct-url> npx prisma migrate deploy
```

`prisma migrate deploy` is the production-safe command — it never resets, never reseeds, and only applies pending migrations.

### Local dev / staging

```bash
DATABASE_URL=<dev-url> npx prisma migrate deploy
```

Or, if you want to test the SQL directly first:
```bash
psql "$DATABASE_URL" < prisma/migrations/20260507120000_add_soft_delete_consent_indexes/migration.sql
```
This works because every statement uses `IF NOT EXISTS`.

## Verification after migration

```sql
-- 1. Soft-delete columns landed
\d "User"
-- Should show: deletedAt | timestamp(3) without time zone

\d "WorkerProfile"
-- Should show: deletedAt + locationSharingConsent (boolean, not null, default false)

-- 2. Existing rows untouched: no soft-deletes, no location consents flipped
SELECT COUNT(*) FROM "User"          WHERE "deletedAt" IS NOT NULL;  -- expect 0
SELECT COUNT(*) FROM "WorkerProfile" WHERE "locationSharingConsent" = true; -- expect 0

-- 3. Indexes exist
\di "User_deletedAt_idx"
\di "Booking_workerProfileId_status_idx"
\di "OtpLog_phone_verified_createdAt_idx"

-- 4. Row counts unchanged from your pre-migration snapshot
SELECT
  (SELECT COUNT(*) FROM "User")            AS users,
  (SELECT COUNT(*) FROM "WorkerProfile")   AS workers,
  (SELECT COUNT(*) FROM "EmployerProfile") AS employers,
  (SELECT COUNT(*) FROM "Booking")         AS bookings,
  (SELECT COUNT(*) FROM "Payment")         AS payments,
  (SELECT COUNT(*) FROM "Shift")           AS shifts;
```

## Post-migration steps

1. **Deploy the application code** (it depends on the new columns):
   ```bash
   vercel deploy --prod
   ```
   The new code:
   - Filters `/api/ops/live-locations` by consent
   - Adds the consent toggle to worker profile UI
   - Soft-deletes via `/api/user/delete-account`
   - Rejects soft-deleted users in `getActiveSession`
   - Adds the daily `/api/cron/purge-deleted` cron

2. **Confirm Vercel cron is updated**:
   - Vercel dashboard → your project → Settings → Crons
   - You should see two cron entries (reconcile-payments hourly, purge-deleted daily 04:00).
   - The `CRON_SECRET` env var must be set.

3. **Smoke test (under 5 min)**:
   - Log in as a worker → toggle "Live Location" on → confirm `/api/ops/live-locations` (as ops) now shows you.
   - Log in as a worker → request account deletion → confirm immediate logout.
   - As ops, hit `/api/ops/workers` — the deleted worker should not appear.
   - DB check: the User row still exists with `deletedAt` set.

4. **30 days later** (or set up a test cutoff): the daily cron will scrub PII fields from the soft-deleted User row, while keeping booking/payment history (8-year IT/GST retention).

## Rollback (if needed)

The migration is fully additive, so rollback is just dropping what was added. **No row data is lost** — you only lose the consent flag values (which start at `false` anyway) and any soft-delete timestamps (which would also be re-set by user requests).

```sql
-- Rollback: drop new indexes
DROP INDEX IF EXISTS "User_deletedAt_idx";
DROP INDEX IF EXISTS "WorkerProfile_deletedAt_idx";
DROP INDEX IF EXISTS "EmployerProfile_deletedAt_idx";
DROP INDEX IF EXISTS "Booking_workerProfileId_status_idx";
DROP INDEX IF EXISTS "Withdrawal_workerId_status_idx";
DROP INDEX IF EXISTS "Complaint_reportedBy_createdAt_idx";
DROP INDEX IF EXISTS "Complaint_status_createdAt_idx";
DROP INDEX IF EXISTS "OtpLog_phone_verified_createdAt_idx";

-- Rollback: drop new columns
ALTER TABLE "WorkerProfile"   DROP COLUMN IF EXISTS "locationSharingConsent";
ALTER TABLE "User"            DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "WorkerProfile"   DROP COLUMN IF EXISTS "deletedAt";
ALTER TABLE "EmployerProfile" DROP COLUMN IF EXISTS "deletedAt";

-- Then mark the Prisma migration as rolled back:
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260507120000_add_soft_delete_consent_indexes';
```

If you have `pg_dump` from before the migration:
```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" backup-YYYYMMDD-HHMM.dump
```

## Why CONCURRENTLY isn't used

Postgres requires `CREATE INDEX CONCURRENTLY` to run **outside** a transaction. Prisma's migration runner wraps each migration in a transaction by default, so we use plain `CREATE INDEX IF NOT EXISTS`.

For your tables this is fine — none of these are large enough today to make index creation a measurable lock. If at scale (≥10M rows on `OtpLog` or `Booking`) you want zero-downtime, run the index creation manually before deploy:

```bash
# Skip Prisma; run with autocommit
PGOPTIONS='-c default_transaction_read_only=off' psql "$DATABASE_URL" -c \
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS \"OtpLog_phone_verified_createdAt_idx\" ON \"OtpLog\"(\"phone\", \"verified\", \"createdAt\");"
```
Then run `prisma migrate deploy` — it'll see the index already exists and skip that line.
