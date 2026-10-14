# SheRise V8.1 — Windows package

This is the Windows-ready SheRise marketplace package. It does **not** require Termux, Android, `pkg`, `chmod`, or any Termux permission.

## Requirements
- Windows 10 or Windows 11
- Node.js LTS
- PostgreSQL 14 or newer, running locally
- PostgreSQL `psql` available on PATH

## Install
1. Extract the ZIP to a normal writable folder, for example `C:\SheRise`.
2. Double-click `setup-windows.bat`.
3. Enter your PostgreSQL `DATABASE_URL` when prompted, for example:
   `postgresql://postgres:YOUR_PASSWORD@localhost:5432/sherise`
4. The setup installs dependencies, generates Prisma Client, synchronizes the schema, applies the V8.1 private seller-contact field, and seeds the development accounts.

## Start
Double-click:
- `start-backend-windows.bat`
- `start-frontend-windows.bat`

Then open:
`http://localhost:5173`

## Development accounts
- Admin: `admin` / `Admin@12345`
- Seller: `seller` / `Seller@12345`
- Coupon: `WELCOME10`

## V8.1 seller contact change
Seller Centre → **Store & pickup** contains:
- Pickup address
- **Pickup contact mobile number (Admin only)**

The number is stored on the `Seller` record. It is shown to authenticated SheRise admins for pickup/contact operations. It is not included in public product/offer seller data.

## Database persistence
SheRise uses PostgreSQL. Closing the frontend/backend windows does not delete database data. Keep PostgreSQL running when using the local application.

## Production note
This package is a Windows development/local deployment package. For internet-facing production deployment, use a persistent managed PostgreSQL database and a production process/hosting setup.
