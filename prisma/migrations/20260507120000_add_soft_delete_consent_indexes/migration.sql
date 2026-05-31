-- =============================================================================
-- Migration: soft-delete + location consent + missing performance indexes
-- =============================================================================
-- Strictly additive. No DROP COLUMN, no DROP TABLE, no rename. Existing rows
-- get the column defaults (NULL for *deletedAt, false for locationSharingConsent).
--
-- Index creation uses IF NOT EXISTS to make this safe to re-run on a partially-
-- applied DB. CREATE INDEX is NOT wrapped in CONCURRENTLY here because Prisma's
-- migration runner executes inside a transaction, and Postgres rejects
-- CREATE INDEX CONCURRENTLY inside a transaction. If you want CONCURRENTLY for
-- zero-downtime on a hot table, skip Prisma and run the index commands manually
-- with `psql --single-transaction=false`. See migration runbook in DEPLOYMENT.md.
-- =============================================================================

-- ── 1. Soft-delete columns (additive, default NULL → no row touched) ────────
ALTER TABLE "User"            ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "WorkerProfile"   ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "EmployerProfile" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- ── 2. Location-sharing consent (default false → no surprise lat/lng leakage) ─
ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "locationSharingConsent" BOOLEAN NOT NULL DEFAULT false;

-- ── 3. Indexes for new columns ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "User_deletedAt_idx"            ON "User"("deletedAt");
CREATE INDEX IF NOT EXISTS "WorkerProfile_deletedAt_idx"   ON "WorkerProfile"("deletedAt");
CREATE INDEX IF NOT EXISTS "EmployerProfile_deletedAt_idx" ON "EmployerProfile"("deletedAt");

-- ── 4. Hot-path performance indexes that were missing ───────────────────────
-- worker shift list filtering
CREATE INDEX IF NOT EXISTS "Booking_workerProfileId_status_idx"
  ON "Booking"("workerProfileId", "status");

-- worker dashboard "recent payouts" view
CREATE INDEX IF NOT EXISTS "Withdrawal_workerId_status_idx"
  ON "Withdrawal"("workerId", "status");

-- user's own complaints history
CREATE INDEX IF NOT EXISTS "Complaint_reportedBy_createdAt_idx"
  ON "Complaint"("reportedBy", "createdAt");

-- ops complaint triage queue
CREATE INDEX IF NOT EXISTS "Complaint_status_createdAt_idx"
  ON "Complaint"("status", "createdAt");

-- verify-otp WHERE phone=? AND verified=false ORDER BY createdAt DESC hot path
CREATE INDEX IF NOT EXISTS "OtpLog_phone_verified_createdAt_idx"
  ON "OtpLog"("phone", "verified", "createdAt");
