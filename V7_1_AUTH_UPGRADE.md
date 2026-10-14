# SheRise V7.1 Authentication Upgrade

The existing V7 website now includes a substantially expanded authentication experience without replacing the marketplace architecture.

## Added to the current website
- Professional customer login form with SheRise branding.
- Email / username / mobile identifier login.
- Password show/hide control.
- Remember-me control.
- Forgot-password flow UI.
- Password strength feedback and confirmation.
- Mobile/email OTP login flow UI and API.
- OTP resend/change-details flow.
- Login-attempt and OTP/reset request rate limiting.
- Secure bcrypt password reset.
- Seller/customer registration retained in the same authentication experience.
- Google/Apple buttons are presented as integration points and do not pretend OAuth is configured.

## External integrations still required for production
- SMS/email provider for delivering OTP/reset codes.
- Google OAuth credentials if Google login is enabled.
- Apple OAuth credentials if Apple login is enabled.
- Production email templates and transactional delivery.
- Persistent session/device store if full device-session management is enabled.
- CAPTCHA provider when bot protection is required.

## Local OTP testing
Set `AUTH_OTP_DEV_MODE="true"` only in local development. The API then returns the generated OTP in its response so the flow can be tested without an SMS provider. Keep it `false` in production.
