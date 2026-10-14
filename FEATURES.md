# SheRise functional feature map

## Customer
- Registration/login
- Profile
- Address management
- Product browsing/search/filter/sort
- Product details and reviews
- Wishlist
- Cart quantity management
- Coupon validation
- Checkout
- COD and pending online-payment flow
- Orders, cancellation and return request
- Notifications
- Support tickets

## Seller
- Seller registration
- Seller profile
- Product publishing
- Inventory visibility
- Seller product list
- Seller order list
- Seller analytics endpoint

## Admin
- Platform stats
- User listing
- Order listing
- Order status management

## Local development limits
Real payment gateways, OTP providers, shipping-carrier APIs, email/SMS, cloud image storage, background workers and production observability still require external services and credentials. The local flows are deliberately explicit rather than pretending those external integrations are live.

## V5 workflow additions
- Combined admin operations console: overview, KPIs, quick links, product approvals, orders/tracking, payments, returns, sellers/payouts, users, coupons and customer payment scanner.
- Seller centre: add products with multiple images, remove images/products, received-orders view, expected customer delivery date, admin pickup date, seller preparation stage, return view, pickup profile and admin-only payout scanner.
- Order activity timeline recorded for customer order placement, seller schedule/stage changes, admin status/tracking updates and return updates.
- Customer order tracking displays seller stage, expected delivery, admin pickup date and return action after delivery.

## V7 marketplace feature pack
- Voice search using supported browser speech recognition.
- Expanded hamburger navigation with categories, discovery sections and account tools.
- Recently viewed product history on the device.
- Product comparison workspace for up to four products.
- New-arrivals, best-sellers and discount discovery sorting.
- Customer profile editing for name, username and mobile.
- Dedicated About, FAQ, Terms, Privacy, Return, Shipping and Cancellation pages.

## V8 advanced modules

- Database-backed seller offers and featured-offer data
- Seller catalogue quality, GTIN/barcode and parent/child fields
- Product video/authenticity/enhanced-content fields
- Product Q&A and richer review moderation/helpfulness fields
- Recommendation event collection and recommendations API
- Seller price rules
- Multiple seller warehouses and warehouse inventory
- Inventory transfer records
- Fulfillment pick/pack task records
- Seller ledger and performance/health metrics
- Seller advertising campaigns and ad-event analytics
- Role-protected advanced Seller and Admin operation pages
