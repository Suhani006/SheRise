-- SheRise: remove legacy external-gateway payment fields.
-- Run against an existing PostgreSQL database before deploying the new Prisma schema.
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "providerOrderId";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "providerPaymentId";
ALTER TABLE "Payment" DROP COLUMN IF EXISTS "signature";
