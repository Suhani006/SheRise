-- SheRise V8 advanced marketplace foundation.
-- Safe to run repeatedly on PostgreSQL.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "parentProductId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "authenticityInfo" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "enhancedContent" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "listingQualityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "suppressionReason" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "videoUrls" JSONB;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "weightGrams" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "lengthCm" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "widthCm" INTEGER;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "heightCm" INTEGER;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "media" JSONB;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "helpfulCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "reported" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "sellerResponse" TEXT;
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "stackable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ProductOffer" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "mrp" DECIMAL(12,2) NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "minPrice" DECIMAL(12,2),
  "maxPrice" DECIMAL(12,2),
  "scheduledPrice" DECIMAL(12,2),
  "scheduledAt" TIMESTAMP(3),
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "fulfillmentMode" TEXT NOT NULL DEFAULT 'SELF_SHIP',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductOffer_productId_sellerId_key" UNIQUE ("productId","sellerId")
);
CREATE INDEX IF NOT EXISTS "ProductOffer_productId_featured_active_idx" ON "ProductOffer"("productId","featured","active");
DO $$ BEGIN ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ProductOffer" ADD CONSTRAINT "ProductOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ProductQuestion" (
  "id" TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "answer" TEXT,
  "answeredBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ProductQuestion_productId_createdAt_idx" ON "ProductQuestion"("productId","createdAt");
DO $$ BEGIN ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "line1" TEXT NOT NULL,
  "line2" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "pincode" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ BEGIN ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "WarehouseInventory" (
  "id" TEXT PRIMARY KEY,
  "warehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL DEFAULT '',
  "onHand" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  "reorderPoint" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WarehouseInventory_warehouseId_productId_variantId_key" UNIQUE ("warehouseId","productId","variantId")
);
CREATE INDEX IF NOT EXISTS "WarehouseInventory_productId_variantId_idx" ON "WarehouseInventory"("productId","variantId");
DO $$ BEGIN ALTER TABLE "WarehouseInventory" ADD CONSTRAINT "WarehouseInventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "WarehouseInventory" ADD CONSTRAINT "WarehouseInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "InventoryTransfer" (
  "id" TEXT PRIMARY KEY,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "InventoryTransfer_status_createdAt_idx" ON "InventoryTransfer"("status","createdAt");
DO $$ BEGIN ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryTransfer" ADD CONSTRAINT "InventoryTransfer_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FulfillmentTask" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "stage" TEXT NOT NULL DEFAULT 'PICK',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "assignedTo" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "FulfillmentTask_warehouseId_status_idx" ON "FulfillmentTask"("warehouseId","status");
DO $$ BEGIN ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "FulfillmentTask" ADD CONSTRAINT "FulfillmentTask_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SellerLedgerEntry" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "reference" TEXT,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SellerLedgerEntry_sellerId_createdAt_idx" ON "SellerLedgerEntry"("sellerId","createdAt");
DO $$ BEGIN ALTER TABLE "SellerLedgerEntry" ADD CONSTRAINT "SellerLedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "SellerLedgerEntry" ADD CONSTRAINT "SellerLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SellerPerformanceMetric" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "orderDefectRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "cancellationRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lateDispatchRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "returnRate" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "complaintCount" INTEGER NOT NULL DEFAULT 0,
  "policyViolationCount" INTEGER NOT NULL DEFAULT 0,
  "authenticityComplaintCount" INTEGER NOT NULL DEFAULT 0,
  "healthStatus" TEXT NOT NULL DEFAULT 'HEALTHY',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SellerPerformanceMetric_sellerId_periodStart_idx" ON "SellerPerformanceMetric"("sellerId","periodStart");
DO $$ BEGIN ALTER TABLE "SellerPerformanceMetric" ADD CONSTRAINT "SellerPerformanceMetric_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "RecommendationEvent" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT,
  "productId" TEXT,
  "eventType" TEXT NOT NULL,
  "query" TEXT,
  "categoryId" TEXT,
  "price" DECIMAL(12,2),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "RecommendationEvent_userId_eventType_createdAt_idx" ON "RecommendationEvent"("userId","eventType","createdAt");
CREATE INDEX IF NOT EXISTS "RecommendationEvent_productId_eventType_createdAt_idx" ON "RecommendationEvent"("productId","eventType","createdAt");
DO $$ BEGIN ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PriceRule" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "productId" TEXT,
  "minPrice" DECIMAL(12,2) NOT NULL,
  "maxPrice" DECIMAL(12,2) NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'FIXED',
  "value" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PriceRule_sellerId_active_idx" ON "PriceRule"("sellerId","active");
DO $$ BEGIN ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PriceRule" ADD CONSTRAINT "PriceRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BulkImportJob" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "errors" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
DO $$ BEGIN ALTER TABLE "BulkImportJob" ADD CONSTRAINT "BulkImportJob_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AdvertisingCampaign" (
  "id" TEXT PRIMARY KEY,
  "sellerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "budget" DECIMAL(12,2) NOT NULL,
  "spend" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DO $$ BEGIN ALTER TABLE "AdvertisingCampaign" ADD CONSTRAINT "AdvertisingCampaign_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "AdEvent" (
  "id" TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL,
  "productId" TEXT,
  "userId" TEXT,
  "type" TEXT NOT NULL,
  "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "AdEvent_campaignId_type_createdAt_idx" ON "AdEvent"("campaignId","type","createdAt");
DO $$ BEGIN ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdvertisingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product parent/child catalogue relationship.
DO $$ BEGIN ALTER TABLE "Product" ADD CONSTRAINT "Product_parentProductId_fkey" FOREIGN KEY ("parentProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Product_parentProductId_idx" ON "Product"("parentProductId");
