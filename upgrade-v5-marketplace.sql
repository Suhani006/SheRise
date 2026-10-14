-- SheRise V5 production marketplace upgrade. Run after previous upgrades.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "weightGrams" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lengthCm" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "widthCm" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "heightCm" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "orderGroupId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "providerOrderId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "providerShipmentId" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "labelUrl" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "manifestUrl" TEXT;
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "estimatedDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Shipment" ADD COLUMN IF NOT EXISTS "shippingCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ProductVariantImage" (
  "id" TEXT PRIMARY KEY,
  "variantId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT,
  "sort" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "ProductVariantImage_variantId_idx" ON "ProductVariantImage"("variantId");
DO $$ BEGIN
  ALTER TABLE "ProductVariantImage" ADD CONSTRAINT "ProductVariantImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "OrderGroup" (
  "id" TEXT PRIMARY KEY,
  "groupNumber" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderGroup_userId_idx" ON "OrderGroup"("userId");
DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_orderGroupId_fkey" FOREIGN KEY ("orderGroupId") REFERENCES "OrderGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Refund" (
  "id" TEXT PRIMARY KEY,
  "paymentId" TEXT,
  "orderId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerRefundId" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "Refund_orderId_idx" ON "Refund"("orderId");
DO $$ BEGIN
  ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SearchEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "query" TEXT NOT NULL,
  "results" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SearchEvent_query_idx" ON "SearchEvent"("query");
CREATE INDEX IF NOT EXISTS "SearchEvent_createdAt_idx" ON "SearchEvent"("createdAt");
