-- SheRise V2 upgrade for an existing Termux database.
-- Run after replacing the project: psql -d marketplace -f prisma/upgrade-v2.sql

DO $$ BEGIN
  CREATE TYPE "ProductApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" text;
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username") WHERE "username" IS NOT NULL;

ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "paymentScannerUrl" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupLine1" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupLine2" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupCity" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupState" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupPincode" text;
ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "pickupCountry" text NOT NULL DEFAULT 'India';

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "approvalStatus" "ProductApprovalStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "approvedAt" timestamp(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "approvedBy" text;

-- Existing demo catalog remains visible after the upgrade.
UPDATE "Product" SET "approvalStatus" = 'APPROVED' WHERE "sellerId" IS NOT NULL AND "approvalStatus" = 'PENDING';

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Product_approvalStatus_idx" ON "Product"("approvalStatus");
