# SheRise API routes

## Public
- `GET /api/health`
- `GET /api/categories`
- `GET /api/brands`
- `GET /api/banners`
- `GET /api/offers`
- `GET /api/products`
- `GET /api/products/:id`
- `GET /api/products/:id/reviews`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/coupons/validate`

## Authenticated customer
- `GET /api/auth/me`
- `GET/POST /api/cart`
- `POST /api/cart/items`
- `PATCH/DELETE /api/cart/items/:id`
- `DELETE /api/cart`
- `GET /api/wishlist`
- `POST /api/wishlist/toggle`
- `GET/POST /api/addresses`
- `PATCH/DELETE /api/addresses/:id`
- `POST /api/checkout`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders/:id/cancel`
- `POST /api/orders/:id/return`
- `POST /api/products/:id/reviews`
- `GET /api/rewards`
- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`
- `GET/POST /api/support/tickets`

## Seller
- `POST /api/seller/register`
- `GET /api/seller/me`
- `GET/POST /api/seller/products`
- `GET /api/seller/orders`
- `GET /api/seller/analytics`

## Admin
- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/orders`
- `PATCH /api/admin/orders/:id/status`

## V5 routes
- `PATCH /api/seller/orders/:id/schedule` — seller sets expected delivery, admin pickup date and seller stage.
- `GET /api/seller/returns` — seller return requests for their orders.
- `GET /api/admin/returns` / `PATCH /api/admin/returns/:id/status` — admin return management.
- `GET /api/admin/activities` — admin order activity feed.
- `GET/POST/PATCH /api/admin/coupons` — admin coupon management.

## V8 advanced API routes

### Customer/public
- `GET /api/products/:id/offers`
- `GET /api/products/:id/questions`
- `POST /api/products/:id/questions`
- `POST /api/reviews/:id/helpful`
- `POST /api/reviews/:id/report`
- `POST /api/activity/event`
- `GET /api/recommendations`

### Seller
- `GET/POST /api/seller/offers`
- `GET/POST /api/seller/price-rules`
- `GET/POST /api/seller/warehouses`
- `POST /api/seller/warehouses/:id/inventory`
- `GET /api/seller/ledger`
- `GET /api/seller/performance`
- `GET/POST /api/seller/ads`

### Admin
- `GET /api/admin/warehouses`
- `GET /api/admin/fulfillment`
- `POST /api/admin/fulfillment/:orderId/task`
- `PATCH /api/admin/fulfillment/:id`
- `GET /api/admin/seller-performance`
- `GET /api/admin/ledger`
- `GET /api/admin/recommendation-events`
- `GET /api/admin/ad-campaigns`
