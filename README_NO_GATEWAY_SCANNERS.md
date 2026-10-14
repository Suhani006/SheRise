# SheRise payment/scanner behavior

SheRise checkout no longer uses an external payment gateway.

Customers can pay using:
1. Manual UPI — the QR is configured by ADMIN and displayed at checkout.
2. Cash on Delivery.

For manual UPI, the customer enters the transaction/reference number and ADMIN verifies the payment.

Seller payout QR:
- Seller submits it from Seller Centre.
- The seller URL is stripped from the seller self-service response.
- Only ADMIN seller-management endpoints return the full seller scanner image.
- Seller payout scanners are never displayed to customers.
