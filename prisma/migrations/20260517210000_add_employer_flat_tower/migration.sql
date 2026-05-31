-- Stores the flat + tower components of an employer's saved address
-- separately from the freeform `address` line. Cart page prefills these
-- so repeat employers don't re-type their building details. Both nullable.
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "address_flat"  TEXT;
ALTER TABLE "employer_profiles" ADD COLUMN IF NOT EXISTS "address_tower" TEXT;
