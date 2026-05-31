-- Arrival selfie bytes/mime + timestamp on Booking. Same shape as
-- users.avatar_bytes / users.avatar_mime in the existing schema.
ALTER TABLE "bookings_v2" ADD COLUMN IF NOT EXISTS "arrival_selfie"      BYTEA;
ALTER TABLE "bookings_v2" ADD COLUMN IF NOT EXISTS "arrival_selfie_mime" TEXT;
ALTER TABLE "bookings_v2" ADD COLUMN IF NOT EXISTS "arrival_selfie_at"   TIMESTAMP(3);
