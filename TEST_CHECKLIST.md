# SheRise functionality checklist

After setup, verify these flows in the browser:

1. Home page loads seeded products and categories.
2. Search from the header opens `/shop?q=...` and filters products.
3. Category chips filter the catalog.
4. Product card opens product details.
5. Register creates a customer account and signs in automatically.
6. Login restores the account on refresh.
7. Add to Cart updates the cart badge and cart contents.
8. Cart quantity +/- and remove work.
9. Wishlist toggle works for signed-in users.
10. Address creation and deletion work.
11. Checkout validates an address and `WELCOME10` coupon.
12. COD/demo online checkout creates order(s) and clears the cart.
13. Orders page lists orders; cancellation works for eligible statuses.
14. Order details can create a return request.
15. Product reviews can be submitted by signed-in users.
16. Rewards, notifications and support tickets load/create correctly.
17. Seller registration and product publishing work.
18. Admin login can view stats and change order status.

Local demo accounts after `npm run seed`:
- Admin: `admin@sherise.local` / `Admin@12345`
- Seller: `seller@sherise.local` / `Seller@12345`
- Coupon: `WELCOME10`

External production services such as real payment gateways, OTP/SMS, email, shipping-carrier APIs, cloud storage and push notifications still require provider credentials and webhook integration.

## V5 checks
- [ ] Seller adds product with multiple images; product is pending until admin approval.
- [ ] Seller sees exact order/product after customer checkout.
- [ ] Seller sets expected delivery date and admin pickup date.
- [ ] Seller marks order ready for pickup.
- [ ] Admin sees seller pickup address, seller schedule and activity history.
- [ ] Customer sees seller stage, pickup date and expected delivery date.
- [ ] Customer can request return only after delivery.
- [ ] Admin can approve/reject/process return.
- [ ] Admin dashboard combines KPIs and operational quick links.
- [ ] Customer payment QR is admin-configured and visible at checkout.
- [ ] Seller payout QR is visible to admin only.
- [ ] Admin commission is 10% and seller payout is 90% after payment verification.
