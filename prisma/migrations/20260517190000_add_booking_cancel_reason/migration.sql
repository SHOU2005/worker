-- Adds the columns the worker post-accept cancel flow writes to.
-- Both nullable + idempotent so the migration is safe to re-run.
ALTER TABLE "bookings_v2" ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT;
ALTER TABLE "bookings_v2" ADD COLUMN IF NOT EXISTS "cancelled_at"  TIMESTAMP(3);
