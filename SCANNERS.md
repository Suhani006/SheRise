# SheRise scanner workflows

## Customer payment scanner
- Admin uploads/updates the customer UPI QR from the Admin console.
- Public checkout retrieves only the configured customer scanner image.
- Customers can scan it during manual UPI checkout and submit the transaction/reference number.
- Admin verifies the manual payment before it is treated as verified.

## Seller payout scanner
- Seller uploads their payout QR from Seller > Payout scanner.
- Seller API responses intentionally strip `paymentScannerUrl` and expose only `hasPaymentScanner`.
- The full seller scanner URL is returned only by the ADMIN seller-management endpoint.
- It is never included in customer checkout/catalog/order responses.
