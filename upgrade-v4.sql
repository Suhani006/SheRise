-- SheRise V4/V5 order workflow upgrade for an existing Termux database.
-- Safe to run repeatedly.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sellerExpectedDeliveryAt" timestamp(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sellerPickupDate" timestamp(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sellerReadyAt" timestamp(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickedUpAt" timestamp(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "sellerStage" text NOT NULL DEFAULT 'NEW';
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "requestedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "resolvedAt" timestamp(3);
ALTER TABLE "Return" ADD COLUMN IF NOT EXISTS "adminNote" text;
CREATE TABLE IF NOT EXISTS "OrderActivity" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "actorUserId" text,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderActivity_orderId_idx" ON "OrderActivity"("orderId");
