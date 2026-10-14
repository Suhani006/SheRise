# SheRise V8 — Advanced Marketplace Foundation

This release extends the existing V7.4 full-stack marketplace. It does not add UI controls unless there is a corresponding API/database path.

## Included and connected

### Customer
- Seller offer comparison from real `ProductOffer` records
- Featured-offer data model
- Product videos when seller/catalog data contains video URLs
- Authenticity information and enhanced product content fields
- Product Q&A persisted to PostgreSQL
- Review helpful counts and report state
- Recommendation activity events and recommendation API
- Existing cart, checkout, manual UPI/COD, orders, returns, tracking, wishlist and support remain intact

### Seller
- Multiple seller offers per product
- Offer price/MRP/stock/fulfillment mode
- Product GTIN and variant barcode/dimension fields
- Parent/child catalogue foundation
- Listing quality/suppression fields
- Warehouse creation
- Per-warehouse inventory with reserved/on-hand/reorder values
- Inventory transfer table foundation
- Fulfillment task model
- Seller price rules
- Seller ledger entries
- Seller health/performance metrics
- Advertising campaigns and ad-event storage
- Advanced Seller Centre at `/seller/advanced`

### Admin
- Warehouse network visibility
- Fulfillment task operations
- Seller health view
- Seller settlement ledger
- Recommendation activity visibility
- Advertising campaign visibility
- Advanced Admin Operations at `/admin/advanced`
- Existing admin payment verification, commission, seller payout, product approval, returns, tracking and customer scanner remain intact

## Deliberately provider-dependent

These are represented by configuration/data models where useful, but are not falsely presented as live without credentials:

- Real SMS/WhatsApp/email delivery
- Real courier pickup/label/tracking execution
- Automatic bank payout
- External competitor price feeds
- Cloud object storage/CDN
- ML-based recommendations/forecasting
- Automatic payment-provider refunds

## Payment rule

SheRise continues to use its manual UPI/COD flow with admin verification and an admin-controlled customer payment QR.

## Database

Run `bash setup-termux.sh` on Termux. It applies the V8 SQL upgrade after the existing marketplace SQL upgrades.
