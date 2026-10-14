# SheRise V6 — No Gateway + Scanner Access Update

## Removed
- External gateway checkout flow
- Gateway checkout script and browser SDK usage
- Gateway order/signature verification endpoint
- Gateway-specific payment fields from the Prisma model
- Gateway-specific refund processing
- Gateway environment variables
- Legacy backup source files containing gateway code

## Payment methods
- Manual UPI using the admin-managed customer QR scanner
- Cash on Delivery
- Admin verifies manual UPI payments and can record refunds manually

## Scanner workflows
### Customer scanner
- ADMIN uploads the customer UPI QR from the Admin console.
- Customers can see it only through the checkout payment section.
- Customer submits the UPI/reference number after scanning.

### Seller scanner
- SELLER uploads a payout QR from Seller Centre.
- Seller API responses never expose the stored scanner URL.
- ADMIN seller-management APIs expose the seller scanner to ADMIN only.
- Customers never receive seller scanner data.

## Existing database migration
For an existing database, run `backend/prisma/remove-gateway-payment-fields.sql` once before applying the new Prisma schema. It removes the three legacy Payment columns from the previous schema.
