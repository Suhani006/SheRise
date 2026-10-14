-- SheRise V3 upgrade: order address snapshots for admin delivery/pickup workflow.
-- Run on an existing Termux database:
--   psql -d marketplace -f prisma/upgrade-v3.sql

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingName" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingLine1" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingLine2" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingCity" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingState" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingPincode" text;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "shippingCountry" text;
