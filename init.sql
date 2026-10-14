-- SheRise Marketplace PostgreSQL bootstrap.
-- Designed for Termux/Android where Prisma's migration engine may not run natively.
-- Run: psql -d sherise -f prisma/init.sql

DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('CUSTOMER','SELLER','ADMIN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('PLACED','CONFIRMED','PACKED','SHIPPED','OUT_FOR_DELIVERY','DELIVERED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ProductApprovalStatus" AS ENUM ('PENDING','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "username" text UNIQUE,
  "mobile" text,
  "passwordHash" text NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Address" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "line1" text NOT NULL,
  "line2" text,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "pincode" text NOT NULL,
  "country" text NOT NULL DEFAULT 'India',
  "isDefault" boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "Seller" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL UNIQUE,
  "businessName" text NOT NULL,
  "kycStatus" text NOT NULL DEFAULT 'PENDING',
  "gstNumber" text,
  "bankAccount" text,
  "paymentScannerUrl" text,
  "pickupLine1" text,
  "pickupLine2" text,
  "pickupCity" text,
  "pickupState" text,
  "pickupPincode" text,
  "pickupCountry" text NOT NULL DEFAULT 'India'
);
CREATE TABLE IF NOT EXISTS "Category" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "parentId" text REFERENCES "Category"("id")
);
CREATE TABLE IF NOT EXISTS "Brand" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "Product" (
  "id" text PRIMARY KEY,
  "sku" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "description" text,
  "price" decimal(12,2) NOT NULL,
  "mrp" decimal(12,2) NOT NULL,
  "tax" decimal(65,30) NOT NULL DEFAULT 0,
  "stock" integer NOT NULL DEFAULT 0,
  "minQty" integer NOT NULL DEFAULT 1,
  "maxQty" integer,
  "brandId" text REFERENCES "Brand"("id"),
  "categoryId" text REFERENCES "Category"("id"),
  "sellerId" text REFERENCES "Seller"("id"),
  "approvalStatus" "ProductApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approvedAt" timestamp(3),
  "approvedBy" text
);
CREATE TABLE IF NOT EXISTS "ProductVariant" (
  "id" text PRIMARY KEY,
  "productId" text NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "sku" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "attributes" jsonb NOT NULL,
  "price" decimal(12,2) NOT NULL,
  "stock" integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "ProductImage" (
  "id" text PRIMARY KEY,
  "productId" text NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "alt" text,
  "sort" integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS "Cart" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS "CartItem" (
  "id" text PRIMARY KEY,
  "cartId" text NOT NULL REFERENCES "Cart"("id") ON DELETE CASCADE,
  "productId" text NOT NULL REFERENCES "Product"("id"),
  "quantity" integer NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS "Wishlist" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "productId" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Order" (
  "id" text PRIMARY KEY,
  "orderNumber" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES "User"("id"),
  "sellerId" text REFERENCES "Seller"("id"),
  "status" "OrderStatus" NOT NULL DEFAULT 'PLACED',
  "subtotal" decimal(12,2) NOT NULL,
  "discount" decimal(65,30) NOT NULL DEFAULT 0,
  "tax" decimal(65,30) NOT NULL DEFAULT 0,
  "shipping" decimal(65,30) NOT NULL DEFAULT 0,
  "total" decimal(12,2) NOT NULL,
  "shippingName" text,
  "shippingLine1" text,
  "shippingLine2" text,
  "shippingCity" text,
  "shippingState" text,
  "shippingPincode" text,
  "shippingCountry" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sellerExpectedDeliveryAt" timestamp(3),
  "sellerPickupDate" timestamp(3),
  "sellerReadyAt" timestamp(3),
  "pickedUpAt" timestamp(3),
  "sellerStage" text NOT NULL DEFAULT 'NEW'
);
CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "productId" text NOT NULL REFERENCES "Product"("id"),
  "quantity" integer NOT NULL,
  "price" decimal(12,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS "Payment" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "method" text NOT NULL,
  "status" text NOT NULL,
  "amount" decimal(12,2) NOT NULL,
  "transactionId" text
);
CREATE TABLE IF NOT EXISTS "Shipment" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "carrier" text,
  "trackingNumber" text,
  "status" text NOT NULL DEFAULT 'CREATED'
);
CREATE TABLE IF NOT EXISTS "Return" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'REQUESTED',
  "refundAmount" decimal(65,30) NOT NULL DEFAULT 0,
  "requestedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" timestamp(3),
  "adminNote" text
);
CREATE TABLE IF NOT EXISTS "OrderActivity" (
  "id" text PRIMARY KEY,
  "orderId" text NOT NULL REFERENCES "Order"("id") ON DELETE CASCADE,
  "actorUserId" text,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Review" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "productId" text NOT NULL REFERENCES "Product"("id") ON DELETE CASCADE,
  "rating" integer NOT NULL,
  "body" text,
  "verifiedPurchase" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Coupon" (
  "id" text PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "type" text NOT NULL,
  "value" decimal(12,2) NOT NULL,
  "minOrder" decimal,
  "maxDiscount" decimal,
  "expiresAt" timestamp(3),
  "usageLimit" integer,
  "active" boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS "Commission" (
  "id" text PRIMARY KEY,
  "sellerId" text NOT NULL REFERENCES "Seller"("id"),
  "orderId" text NOT NULL,
  "rate" decimal(5,2) NOT NULL,
  "amount" decimal(12,2) NOT NULL,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "SellerPayout" (
  "id" text PRIMARY KEY,
  "sellerId" text NOT NULL REFERENCES "Seller"("id"),
  "amount" decimal(12,2) NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "read" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'OPEN',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Banner" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "imageUrl" text NOT NULL,
  "link" text,
  "active" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "Offer" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "description" text,
  "discount" decimal(65,30) NOT NULL DEFAULT 0,
  "startsAt" timestamp(3) NOT NULL,
  "endsAt" timestamp(3) NOT NULL,
  "active" boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS "Reward" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "points" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id" text PRIMARY KEY,
  "key" text NOT NULL UNIQUE,
  "value" text NOT NULL,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" text PRIMARY KEY,
  "userId" text,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entityId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_brandId_idx" ON "Product"("brandId");
CREATE INDEX IF NOT EXISTS "Product_sellerId_idx" ON "Product"("sellerId");
CREATE INDEX IF NOT EXISTS "Product_approvalStatus_idx" ON "Product"("approvalStatus");
CREATE INDEX IF NOT EXISTS "CartItem_cartId_idx" ON "CartItem"("cartId");
CREATE INDEX IF NOT EXISTS "CartItem_productId_idx" ON "CartItem"("productId");
CREATE INDEX IF NOT EXISTS "Order_userId_idx" ON "Order"("userId");
CREATE INDEX IF NOT EXISTS "Order_sellerId_idx" ON "Order"("sellerId");
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderActivity_orderId_idx" ON "OrderActivity"("orderId");
CREATE INDEX IF NOT EXISTS "Review_productId_idx" ON "Review"("productId");
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
