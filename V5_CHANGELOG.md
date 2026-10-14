# SheRise V5 consolidated update

This ZIP combines the earlier SheRise marketplace functionality with the new admin + seller workflow requested.

## Included
- Customer/Seller choice at registration; Admin is never shown in the public registration role choices.
- Admin route and API restricted to authenticated ADMIN users; Admin is not in the hamburger menu.
- Combined Admin console: KPI overview, quick links, product approvals, orders/tracking, payments, returns, sellers/payouts, users, coupons, customer payment scanner and activity feed.
- Seller centre: Add Product, multiple product images, image removal, product removal, order received per product, expected customer delivery date, admin pickup date, seller stage, returns, pickup address and payout scanner.
- Seller pickup address and seller payout scanner are exposed to Admin only (seller can see/manage their own values).
- Customer checkout uses the Admin-configured customer payment QR.
- Admin payment verification records 10% commission and creates the 90% seller payout.
- Customer order tracking shows seller stage, expected delivery, pickup date and activity timeline.
- Customer can request a return after delivery; Admin can process return status.
- Admin order activity records customer placement, seller schedule/stage updates, admin status/tracking changes and return updates.
- Buy Now is shown beside Add to Cart on marketplace product cards and product details.
- Termux setup upgrades an existing V2/V3 database automatically before initialization.

## Demo accounts
- Admin: `admin` / `Admin@12345`
- Seller: `seller` / `Seller@12345`

## Upgrade note
Use a new folder for V5 when possible. If you point V5 at the existing `marketplace` database, `setup-termux.sh` applies the V2/V3/V4 compatibility SQL before initialization.

## Marketplace upgrade pass
- Added variant-aware cart/order lines and variant stock reservation.
- Added checkout grouping for multi-seller carts while preserving seller-specific orders.
- Added Shiprocket serviceability/rate estimation and admin shipment creation/AWB hooks.
- Added shipment metadata, product package dimensions, payment provider metadata and refund records.
- Added search suggestions and basic search analytics.
