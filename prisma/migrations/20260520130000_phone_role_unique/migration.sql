-- Allow the same phone number to hold separate accounts per role.
-- Before: User.phone is globally unique → one phone = one account, one role.
-- After:  Composite unique on (phone, role) → same phone can have a
--         WORKER account, an EMPLOYER account, etc., each with their
--         own profile rows and independent state.

-- Drop the old single-column unique constraint. The auto-generated name
-- from Prisma is "users_phone_key". DROP IF EXISTS so re-runs are safe.
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_phone_key";

-- Add the new composite unique. Using an explicit name matches the
-- @@unique(map:) in the Prisma schema so future migrate diffs see it.
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_role_key" ON "users"("phone", "role");
