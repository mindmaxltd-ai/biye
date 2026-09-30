# BIYE.LTD — Mobile + Password Login Fix

## What is included

1. `netlify/functions/send-otp.js`
   - Existing OTP send/verify rules retained.
   - Existing reset-password and consent actions retained.
   - Primary login is real Supabase Phone + Password.
   - Adds a controlled legacy-login bridge for older BIYE accounts that were created with `8801XXXXXXXXX@biye.ltd`.
   - After a successful legacy login, the exact Auth user is upgraded with the real phone identity (`phone_confirm=true`) so future logins use the mobile number.
   - Does not expose the legacy email to the customer.
   - Keeps `profiles.auth_user_id` aligned when the profile is found.
   - Never stores plaintext passwords.

2. `login.html`
   - Existing UI retained.
   - Sends mobile number + password to `send-otp`.
   - Persists the returned Supabase session and redirects to `dashboard.html`.

3. `migrate-phone-auth.js`
   - One-time migration utility.
   - DRY-RUN by default; `APPLY=1` is required to write changes.
   - Safer matching order: real phone identity → historical synthetic BIYE identity → phone metadata → existing auth_user_id → profile email only as a last resort.
   - If multiple preferred Auth identities exist, it reports a conflict instead of choosing one.
   - Never reads or changes passwords.

## Deployment

Copy `netlify/functions/send-otp.js` to the deployed Netlify function path and replace the existing file.
Keep the existing `login.html` if identical; this package contains the verified current copy.

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_KEY`)
- `SUPABASE_ANON_KEY`
- `SMS_API_KEY`

## Important Supabase setting

Supabase Auth must allow Phone sign-in for true phone + password authentication.

## Migration option

Run the migration utility from a trusted server/terminal only:

```bash
node migrate-phone-auth.js
APPLY=1 node migrate-phone-auth.js
```

Review the dry-run output first. Do not expose the service-role key in browser code.

## Payment code

`payment.js` is intentionally NOT included or changed in this package. Cash-payment OTP, invoice, receipt, SMS/email, and payment processing logic are outside this login fix.
