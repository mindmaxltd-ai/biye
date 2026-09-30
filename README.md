# BIYE.LTD — Mobile + Password Authentication Upgrade

## What changed

BIYE customer login is now designed around the real Supabase Auth phone identity:

`Mobile Number + Password → Supabase Auth → BIYE Dashboard`

Email remains available for notifications/receipts and legacy compatibility, but it is not the customer-facing login identifier.

### Updated files
- `payment.js`
  - New registrations create Supabase Auth users with both `phone` and `phone_confirm: true`.
  - Existing profile lookup accepts both `+880...` and `880...` phone formats.
  - Existing password storage remains exclusively in Supabase Auth.
- `send-otp.js`
  - Login uses Supabase `phone + password`.
  - Password-reset profile lookup accepts both phone formats.
- `login.html`
  - Already uses the BIYE mobile-number login form and calls `send-otp` with the phone number.
- `migrate-phone-auth.js`
  - One-time migration for existing customers.
  - DRY RUN by default; never changes passwords.

## Required Supabase setting

Enable **Phone** authentication in Supabase Authentication → Providers before production phone-password sign-in.

BIYE's own registration OTP should be completed before a new Auth user is created, so the backend can safely set `phone_confirm: true` for that verified registration.

## Existing users: migrate before testing phone login

Required environment variables in a secure server/terminal only:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
```

First run a dry run:

```bash
node migrate-phone-auth.js
```

Review `CONFLICT` and `SKIP` lines.

Then apply only after the dry run is clean enough for the project:

```bash
APPLY=1 node migrate-phone-auth.js
```

The migration:
1. Reads profiles and Supabase Auth users.
2. Matches accounts using existing Auth UID, mobile number, profile email, or BIYE's legacy synthetic email.
3. Refuses ambiguous matches.
4. Sets the Auth user's phone and `phone_confirm: true`.
5. Synchronizes `profiles.auth_user_id` and normalizes `profiles.phone` to `+880...`.
6. Does not read, export, or change passwords.

## Important

Never put the Supabase service-role key in `login.html`, browser JavaScript, GitHub, or any public file.

Supabase documents `auth.admin.listUsers()` as a server-only operation and `auth.admin.updateUserById()` as the administrative method for updating a user's phone/phone confirmation. See the official documentation:
- https://supabase.com/docs/reference/javascript/auth-admin-listusers
- https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
