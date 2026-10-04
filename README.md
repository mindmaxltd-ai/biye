# BIYE Mobile / Member ID Login — FIXED V2

## What changed
- Login accepts either a Bangladeshi mobile number or BIYE Member ID.
- Supabase Phone Auth is tried first for real phone identities.
- For existing BIYE accounts, the backend resolves the actual Supabase Auth identity using profile phone, profile email, legacy `880...@biye.ltd` identity, or `profiles.auth_user_id`.
- The password is always checked by Supabase Auth; BIYE never stores or compares plaintext passwords.
- On successful phone login, `profiles.auth_user_id` is reconciled to the Auth user that actually authenticated.
- Existing OTP send/verify/reset/consent logic is preserved.
- `payment.js` is NOT included and is NOT changed.

## Deployment
1. Replace `netlify/functions/send-otp.js` with this version.
2. Replace `login.html` with this version.
3. Do NOT replace `payment.js`.
4. Redeploy Netlify.
5. Test with the customer's mobile number and existing password.

## Important
This version is deliberately compatible with BIYE's historical synthetic-email Auth accounts, so an existing customer does not need a new password merely because the login screen now says mobile number / Member ID.
