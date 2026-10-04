# BIYE — Simple Real Mobile + Password Authentication

## Final authentication model

Registration:
1. Customer enters mobile number + password in registration.
2. BIYE verifies the mobile number through the existing OTP flow.
3. At registration account creation (`payment` createInvoice), the backend creates a **real Supabase Auth user** with:
   - `phone: +880...`
   - `phone_confirm: true`
   - `password: customer's password`
4. The Supabase Auth UID is stored in `profiles.auth_user_id`.
5. The plaintext password is never stored in BIYE tables.

Login:
1. Customer enters mobile number + password.
2. `send-otp.js` calls Supabase Auth password grant with `phone + password`.
3. Supabase verifies the password.
4. Access/refresh tokens are returned to `login.html`.
5. `login.html` establishes the Supabase session and redirects to `dashboard.html`.

## Important Supabase setting

Enable **Phone provider / Phone sign-in** in Supabase Authentication Providers. Registration and login use the real Supabase phone identity; no synthetic `@biye.ltd` email is used for authentication.

## Files
- `netlify/functions/payment.js` — creates the real phone Auth user during registration.
- `netlify/functions/send-otp.js` — existing OTP system + real phone/password login.
- `login.html` — mobile + password login UI.

Payment processing logic is retained; the only payment.js authentication change is the Auth-user creation payload so registration creates a real phone-auth account.
