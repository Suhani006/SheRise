# SheRise — Functional Marketplace for Android Termux

This package is a repaired full-stack SheRise marketplace build. The frontend is connected to the Express API and PostgreSQL database instead of using dead/static buttons.

## Branding

- Name: **SheRise**
- Logo: the uploaded SheRise logo is included at `frontend/public/sherise-logo.jpg`.
- The logo and SheRise name are used throughout the header, home page, auth pages and footer.

## Working local features

### Customer
- Registration choice: **Customer** or **Seller**
- Username/email login
- Product catalog shows only **admin-approved seller products**
- Search, category filters and sorting
- Product details, stock and reviews
- Wishlist and cart
- **Buy Now** beside Add to Cart
- Address management
- Checkout with the admin-uploaded customer payment QR
- UPI transaction/reference capture for admin verification
- Order history and **customer-visible tracking updates**
- Cancellation, returns, notifications, rewards and support

### Seller
- Seller role selected during registration (no seller/admin item in the hamburger menu)
- Product publishing with **image upload**, price, MRP and stock
- Products remain hidden from customers until admin approval
- Seller can remove product images/products
- Seller payout scanner upload; scanner is hidden from customers and exposed only to admin
- Seller pickup address and payout details
- Seller orders and analytics

### Admin
- Admin dashboard is role-protected and not listed in the hamburger menu
- Product approval/rejection
- Customer payment verification
- **10% platform commission / 90% seller payout** after verified payment
- Customer payment QR upload shown at checkout
- Seller payout scanner and seller pickup address visible only in admin area
- Order status and shipment/tracking updates
- Customer delivery address snapshot for fulfillment
- Seller payout marking after manual QR payment

## Important repair

The previous frontend crashed because components called `useAuth()` without an `AuthProvider`. This build exports `AuthProvider` and wraps the application with it in `frontend/src/main.tsx`. This is the key fix that makes the login/cart/wishlist/profile-dependent interactions function.

## Android Termux setup

### Easiest method

From the extracted project directory:

```bash
bash setup-termux.sh
```

The script:
- detects your current PostgreSQL role with `whoami`
- creates the `sherise` database if necessary
- writes `backend/.env` with the correct local PostgreSQL username
- writes `frontend/.env`
- installs backend packages
- generates Prisma Client
- creates the PostgreSQL tables from `backend/prisma/init.sql`
- seeds demo products, categories, brands, coupon and accounts

If your PostgreSQL server is not running, start it first.

### Manual method

```bash
cd backend
cp .env.example .env
# Edit .env and replace YOUR_TERMUX_DB_USER with: whoami
npm install
npx prisma generate
psql -d sherise -f prisma/init.sql
psql -d sherise -f prisma/upgrade-v3.sql
npm run seed
npm run dev
```

In a second Termux session:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev -- --host 0.0.0.0
```

Open:

```text
http://localhost:5173
```

API health check:

```bash
curl http://localhost:4000/api/health
```

## Demo accounts

Created by `npm run seed`:

- Admin: `admin@sherise.local` / `Admin@12345`
- Seller: `seller@sherise.local` / `Seller@12345`
- Coupon: `WELCOME10`

These are local development credentials. Change them before any real deployment.

## Prisma + Termux note

Prisma 7 runtime uses `@prisma/adapter-pg` because Prisma 7 requires a driver adapter for this setup.

Android/Termux can receive a non-ARM Prisma schema engine binary. Therefore this package uses `prisma/init.sql` to create the database tables and uses Prisma Client only for runtime queries. Do **not** rely on `prisma migrate dev` on the Android/Termux environment used for this project.

## Production integrations

The local application flows are functional, but real external services still require their own provider credentials and webhook verification, including:

- OTP/SMS
- Email
- Shipping carriers/tracking
- Cloud image storage
- Push notifications
- Production monitoring/background jobs

The package deliberately does not pretend those external services are live without credentials.

### Optional: remove the seeded demo catalog

If you want a clean marketplace with no seeded demo products, run from `backend`:

```bash
npm run clear-demo
```

This removes seeded `SR-*` products that do not have order history. It does not remove real seller products.

## SheRise v4 workflow

- Registration explicitly lets a new account choose **Customer** or **Seller**.
- The hamburger menu does **not** show Seller Dashboard or Admin Dashboard.
- Admin dashboard is available only after an authenticated `ADMIN` login; all admin API endpoints are role-protected.
- Sellers submit products with images; every seller product starts as **PENDING** and stays out of the customer catalog until admin approval.
- Sellers can remove their product images/products (products with order history cannot be deleted).
- Admin uploads the customer payment QR; customers see it at UPI checkout and submit the payment reference.
- Admin verifies payment, records **10% platform commission**, and creates the remaining **90% seller payout**.
- Sellers can upload a payout QR that is available to the seller and admin workflow, but is never exposed through customer catalog/checkout APIs.
- Seller pickup address is stored for admin fulfillment and is not exposed to customers.
- Admin updates order status and shipment tracking; customers see the tracking timeline and tracking number in their order details.
- Product cards include **Add to Cart** and **Buy Now**, including seeded/demo products.


## V5 update
This build combines the requested admin and seller workflows. The admin console is role-protected and includes KPI overview, product approvals, order/tracking operations, payment verification, returns, seller pickup/payout controls, users, coupons and the customer payment QR. Sellers can add products/images, view orders received per product, set customer delivery and admin pickup dates, mark orders ready for pickup, manage pickup details and submit an admin-only payout scanner. Customers can track seller dates/stages and request a return after delivery.

## Production integrations added in V5 upgrade


### Shiprocket
Set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION`, and optionally `SHIPROCKET_PICKUP_PINCODE`. The API includes serviceability/rate estimation and an admin endpoint to create a shipment and assign an AWB. The Shiprocket API supports rates, order creation, AWB, pickup, labels, tracking, returns and NDR workflows. Shiprocket API documentation is available from Shiprocket.

### Database migration
Run `backend/prisma/upgrade-v5-marketplace.sql` after the earlier upgrade scripts, then run `npx prisma generate`. This adds variant links, order groups, package dimensions, provider payment metadata, shipment metadata, refunds and search events.


## V8 advanced marketplace foundation

This ZIP extends V7.4 without adding decorative controls that have no backend. New persisted modules include:

- Seller offers and database-backed offer comparison / featured-offer data
- Product Q&A and review helpful/report fields
- Product video URLs, authenticity information and enhanced catalogue fields
- Parent/child catalogue support, GTIN/barcode fields and listing quality/suppression fields
- Seller price rules and scheduled-price fields
- Multiple seller warehouses and per-warehouse inventory/reservation fields
- Inventory transfer records and fulfillment pick/pack task records
- Seller ledger and seller-health/performance metrics
- Recommendation activity events and a database-backed recommendation endpoint
- Seller advertising campaigns and ad event storage

The UI exposes these controls only through real API routes. Payment processing remains the existing SheRise manual UPI/COD workflow. Actual SMS/WhatsApp/email delivery, courier network execution, bank payouts, cloud media storage and external competitor data still require provider credentials/integrations.

### Database upgrade

For the Termux package, run `bash setup-termux.sh`. It applies `upgrade-v8-advanced.sql` after the existing marketplace upgrades.

For an already configured database, run from `backend`:

```bash
psql -d sherise -f prisma/upgrade-v5-marketplace.sql
psql -d sherise -f prisma/upgrade-v8-advanced.sql
npx prisma generate
```

### Advanced pages

- Seller: `/seller/advanced`
- Admin: `/admin/advanced`

These pages are role protected.

## Windows V8.1
Use `setup-windows.bat`, then `start-backend-windows.bat` and `start-frontend-windows.bat`. See `README_WINDOWS.md`. No Termux is required.
