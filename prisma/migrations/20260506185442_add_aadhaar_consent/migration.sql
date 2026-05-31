-- AlterTable
ALTER TABLE "WorkerProfile" ADD COLUMN     "aadhaarConsentAt" TIMESTAMP(3),
ADD COLUMN     "aadhaarConsentIp" TEXT,
ADD COLUMN     "aadhaarConsentVersion" TEXT;
