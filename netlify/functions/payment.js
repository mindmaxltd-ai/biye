// netlify/functions/payment.js
// BIYE.LTD — Registration account creation + Invoice → SSLCommerz/manual → Receipt
// Schema (biye_schema.sql): profiles, invoices(profile_id,...), payments(profile_id,...), receipts(profile_id,...)
//
// Netlify env needed:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SSLC_STORE_ID, SSLC_STORE_PWD, SSLC_IS_LIVE       (SSLCommerz — optional; without it, gateway_url is null)
//   CASH_CONFIRM_PHONES    comma-separated BIYE cash-collection numbers
//                           default: "01767626653,01346098892"
//   BKASH_MERCHANT_NUMBER   bKash merchant/personal collection number
//   NAGAD_MERCHANT_NUMBER   Nagad collection number
//   ROCKET_MERCHANT_NUMBER  Rocket collection number
//   BANK_NAME               bank name for manual bank transfer
//   BANK_ACCOUNT_NAME       bank account title
//   BANK_ACCOUNT_NUMBER    bank account number
//   BANK_BRANCH             bank branch
//   BANK_ROUTING            bank routing number (optional)
//   GOOGLE_PAY_URL          configured Google Pay checkout URL (optional)
//   PAYPAL_CHECKOUT_URL     configured PayPal checkout URL (optional)
//   ADMIN_PHONE             admin/banker phone for manual-payment alerts
//   ADMIN_SECRET            long random secret for legacy admin confirmation

const SUPABASE_URL   = process.env.SUPABASE_URL || '';
const SERVICE_KEY    = process.env.SUPABASE_SERVICE_KEY ||
                       process.env.SUPABASE_SERVICE_ROLE_KEY ||
                       process.env.SUPABASE_KEY || '';
const SITE_URL       = process.env.URL || process.env.SITE_URL || 'https://biye.ltd';
const SSLC_STORE_ID  = process.env.SSLC_STORE_ID  || process.env.SSLCOMMERZ_STORE_ID  || '';
const SSLC_STORE_PWD = process.env.SSLC_STORE_PWD || process.env.SSLCOMMERZ_STORE_PASSWD || '';
const SSLC_IS_LIVE   = process.env.SSLC_IS_LIVE === 'true';
const SSLC_API = SSLC_IS_LIVE
  ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
  : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';

const DEFAULT_CASH_CONFIRM_PHONES = ['8801767626653', '8801346098892'];
const CASH_CONFIRM_PHONES = (process.env.CASH_CONFIRM_PHONES || DEFAULT_CASH_CONFIRM_PHONES.join(','))
  .split(',').map(normPhone).filter(Boolean);
const BKASH_MERCHANT_NUMBER = process.env.BKASH_MERCHANT_NUMBER || '';
const NAGAD_MERCHANT_NUMBER = process.env.NAGAD_MERCHANT_NUMBER || '';
const ROCKET_MERCHANT_NUMBER = process.env.ROCKET_MERCHANT_NUMBER || '';
const BANK_NAME = process.env.BANK_NAME || '';
const BANK_ACCOUNT_NAME = process.env.BANK_ACCOUNT_NAME || '';
const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || '';
const BANK_BRANCH = process.env.BANK_BRANCH || '';
const BANK_ROUTING = process.env.BANK_ROUTING || '';
const GOOGLE_PAY_URL = process.env.GOOGLE_PAY_URL || '';
const PAYPAL_CHECKOUT_URL = process.env.PAYPAL_CHECKOUT_URL || '';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const crypto = require('crypto');
function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
function hashOtp(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }

// ── Product catalogue ────────────────────────────────────────
// Every "price" is the SUBTOTAL — VAT (5%) is added on top to get total.
// payment_type must be one of the DB enum values: registration, match_view,
// subscription, refund (manual_match/ai_suggestion need the migration in
// biye_migration_manual_payment.sql before they can be used).
function withVat(subtotal) {
  const tax = Math.round(subtotal * 0.05);
  return { subtotal, tax, total: subtotal + tax };
}
const MATCH_VIEW_TIERS = [111, 222, 333]; // 1st, 2nd, 3rd purchase — 4th+ stays at 333

const PACKAGES = {
  REG:          { type: 'registration', name: 'BIYE Registration (Lifetime)', ...withVat(999) },
  MATCH_PACK:   { type: 'match_view',   name: 'Additional Match View',        tiered: true, tiers: MATCH_VIEW_TIERS },
  SUB_SILVER:   { type: 'subscription', name: 'Silver Membership 1yr',    subtotal: 4999,  tax: 250, total: 5249 },
  SUB_GOLD:     { type: 'subscription', name: 'Gold Membership 1yr',      subtotal: 9999,  tax: 500, total: 10499 },
  SUB_PLATINUM: { type: 'subscription', name: 'Platinum Membership 1yr',  subtotal: 24999, tax: 1250, total: 26249 },
};

const SB = {
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
};

const reply = (status, body) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  },
  body: JSON.stringify(body),
});

function genInvoiceNumber() {
  return 'INV-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random()*9000);
}
function genMemberCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — avoids misreads
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return 'BIYE-' + code;
}
function genTxnId() {
  return 'TXN-' + Date.now() + '-' + Math.floor(100 + Math.random()*900);
}

// 8801XXXXXXXXX (no +) — used for phone matching/allowlists
function normPhone(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (n.startsWith('880')) return n;
  if (n.startsWith('0'))   return '88' + n;
  if (n.startsWith('1'))   return '880' + n;
  return n;
}
// +8801XXXXXXXXX — required by Supabase Auth's `phone` field / profiles.phone
function normPhoneE164(raw) {
  const n = normPhone(raw);
  return n ? '+' + n : '';
}

async function sbSelect(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d : [];
}
async function sbInsert(table, row, returnRow = true) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB, Prefer: returnRow ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const errBody = await r.text().catch(() => '');
    console.error(`sbInsert(${table}) failed — status ${r.status}:`, errBody);
    return returnRow ? null : false;
  }
  if (!returnRow) return true;
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d[0] : null;
}
async function sbUpdate(table, query, updates) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...SB, Prefer: 'return=minimal' },
    body: JSON.stringify(updates),
  });
  return r.ok;
}
async function authAdminCreateUser(payload) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('authAdminCreateUser failed — Supabase status', r.status, JSON.stringify(d));
  }
  return { ok: r.ok, data: d };
}

function isStrongPassword(pw) {
  // Kept intentionally simple, matching register.html's own rule — just a
  // minimum length. No forced uppercase/digit/special character.
  return typeof pw === 'string' && pw.length >= 8;
}

// ── REQUIRE RECENTLY VERIFIED REGISTRATION OTP ─────────────────
// The browser never gets to prove OTP verification by itself. This checks
// the server-side otp_codes record that send-otp.js consumed after a correct
// registration OTP was entered.
async function hasRecentVerifiedRegistrationOtp(phoneRaw) {
  const phone = normPhone(phoneRaw);
  if (!phone) return false;
  const q = await fetch(`${SUPABASE_URL}/rest/v1/otp_codes?phone=eq.${encodeURIComponent(phone)}&purpose=eq.registration&consumed_at=not.is.null&order=created_at.desc&limit=1`, {
    headers: SB,
  });
  if (!q.ok) return false;
  const rows = await q.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.consumed_at) return false;
  return (Date.now() - new Date(row.consumed_at).getTime()) <= 15 * 60 * 1000;
}

// ── CREATE REGISTRATION (REAL PHONE AUTH + PROFILE) ─────────
// This is the only new-account creation endpoint used by register.html.
// It requires a server-side verified BIYE registration OTP, creates a real
// Supabase Auth phone user, then creates the matching public.profiles row.
async function createRegistration(body) {
  const phoneE164 = normPhoneE164(body.phone);
  const password = String(body.password || '');
  const name = String(body.name || '').trim();

  if (!phoneE164 || !name) return reply(400, { ok:false, error:'phone and name are required' });
  if (!isStrongPassword(password)) return reply(400, { ok:false, error:'password must be at least 8 characters' });
  if (!(await hasRecentVerifiedRegistrationOtp(phoneE164))) {
    return reply(403, { ok:false, error:'ফোন OTP আগে সফলভাবে যাচাই করুন' });
  }

  const existing = await sbSelect('profiles', `phone=eq.${encodeURIComponent(phoneE164)}&select=id,auth_user_id&limit=1`);
  if (existing[0]) {
    return reply(409, { ok:false, error:'এই মোবাইল নম্বর দিয়ে ইতিমধ্যে একটি BIYE account আছে' });
  }

  const authRes = await authAdminCreateUser({
    phone: phoneE164,
    phone_confirm: true,
    password,
    user_metadata: { display_name: name, phone: phoneE164 },
  });
  if (!authRes.ok || !authRes.data || !authRes.data.id) {
    console.error('createRegistration auth failed:', JSON.stringify(authRes.data));
    return reply(400, { ok:false, error:'Supabase Phone Auth account তৈরি করা যায়নি', detail: authRes.data });
  }

  const authUserId = authRes.data.id;
  const gender = body.seeking_type === 'groom' ? 'female' : 'male';

  let dob = null;
  if (body.dob && /^\d{4}-\d{2}-\d{2}$/.test(body.dob)) {
    dob = body.dob;
  } else {
    const age = parseInt(body.age, 10);
    if (age && age > 0 && age < 120) dob = `${new Date().getFullYear() - age}-01-01`;
  }

  const ownerType = body.owner_type === 'self' ? 'self' : 'guardian_assisted';
  const profile = await sbInsert('profiles', {
    auth_user_id: authUserId,
    display_name: name,
    gender,
    date_of_birth: dob,
    phone: phoneE164,
    email: body.email || null,
    division: body.division || null,
    district: body.district || null,
    education: body.education || null,
    profession: body.profession || null,
    religion: body.religion || null,
    marital_status: body.marital_status || 'never_married',
    profile_owner_type: ownerType,
    candidate_consent_status: ownerType === 'self' ? 'granted' : 'pending',
    member_code: genMemberCode(),
    guardian_name: body.guardian_name || null,
    guardian_phone: body.guardian_phone || null,
    guardian_relation: body.guardian_relation || null,
    candidate_phone: body.candidate_phone || null,
    profile_status: 'draft',
  });

  if (!profile) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
      method:'DELETE',
      headers:{ apikey:SERVICE_KEY, Authorization:'Bearer '+SERVICE_KEY },
    }).catch(() => {});
    return reply(500, { ok:false, error:'account তৈরি হয়েছে কিন্তু profile save করা যায়নি; account rollback করা হয়েছে' });
  }

  return reply(200, { ok:true, auth_user_id:authUserId, profile_id:profile.id, phone:phoneE164 });
}

// ── Resolve (or create) the profile behind a registration/payment request ──
// Never trusts a client-sent profile_id/customer_id as-is; always looks the
// real row up by phone, and only creates a new account when a password was
// supplied (i.e. this genuinely is the registration flow, step 3).
async function resolveProfile(body) {
  const phoneE164 = normPhoneE164(body.phone);
  if (!phoneE164) return { error: 'phone required' };

  // Payment/invoice creation is NOT an account-registration endpoint.
  // A profile must already exist, created by createRegistration after a
  // server-verified BIYE OTP. This prevents payment requests from creating
  // Auth users or profiles and keeps password handling completely out of the
  // payment flow.
  const existing = await sbSelect(
    'profiles',
    `phone=eq.${encodeURIComponent(phoneE164)}&select=id,auth_user_id&limit=1`
  );
  if (!existing[0]) {
    return { error: 'profile not found — complete BIYE registration first' };
  }

  return { profileId: existing[0].id, created: false };
}

// How many *completed* match-view payments a profile already has — used to
// pick the next tier price server-side. Never trust a tier sent by the client.
async function resolveMatchViewPrice(profileId) {
  if (!profileId) return withVat(MATCH_VIEW_TIERS[0]);
  const rows = await sbSelect('payments',
    `profile_id=eq.${encodeURIComponent(profileId)}&payment_type=eq.match_view&status=eq.completed&select=id`);
  const nextTier = MATCH_VIEW_TIERS[Math.min(rows.length, MATCH_VIEW_TIERS.length - 1)];
  return withVat(nextTier);
}

// 01XXXXXXXXX display format for the numbers allowed to confirm cash OTPs —
// sent to the frontend so its dropdown never hardcodes/duplicates this list.
function cashConfirmNumbersDisplay() {
  return CASH_CONFIRM_PHONES.map(function (p) { return p.replace(/^880/, '0'); });
}

// Payment methods shown to a registered customer.
// The two cash numbers are COLLECTION/CONFIRMATION numbers — they are NOT
// customer allow-lists. Therefore Cash is available to every valid invoice.
// Provider-specific direct/manual methods are also shown when their merchant
// configuration exists; SSLCommerz remains available when configured.
function manualMethodsFor(phoneRaw) {
  const methods = ['cash', 'bkash_direct', 'nagad_direct', 'rocket_direct', 'bank_transfer', 'sslcommerz', 'google_pay', 'paypal'];
  return methods;
}

// ── CREATE INVOICE ──────────────────────────────────────────
async function createInvoice(body) {
  const resolved = await resolveProfile(body);
  if (resolved.error) {
    console.error('createInvoice: resolveProfile failed —', resolved.error, resolved.detail ? JSON.stringify(resolved.detail) : '');
    return reply(400, { ok: false, error: resolved.error });
  }
  const profileId = resolved.profileId;

  const pkg = PACKAGES[body.package_code] || PACKAGES.REG;
  const price = pkg.tiered ? await resolveMatchViewPrice(profileId) : pkg;
  const invoice_number = genInvoiceNumber();
  const transaction_id = genTxnId();
  const now = new Date().toISOString();

  const payment = await sbInsert('payments', {
    profile_id: profileId,
    transaction_id,
    payment_type: pkg.type,
    amount: price.total,
    currency: 'BDT',
    status: 'pending',
    created_at: now,
    updated_at: now,
  });
  if (!payment) return reply(500, { ok: false, error: 'could not create payment' });

  const invoice = await sbInsert('invoices', {
    profile_id: profileId,
    invoice_number,
    payment_id: payment.id,
    subtotal: price.subtotal,
    tax: price.tax,
    total: price.total,
    currency: 'BDT',
    status: 'pending',
    issued_at: now,
    created_at: now,
  });
  if (!invoice) return reply(500, { ok: false, error: 'could not create invoice' });

  let gateway_url = null;
  if (SSLC_STORE_ID && SSLC_STORE_PWD) {
    gateway_url = await buildSslczSession(invoice, payment, pkg, body);
  }

  const methods = manualMethodsFor(body.phone);
  return reply(200, {
    ok: true,
    invoice: { ...invoice, transaction_id, package_name: pkg.name },
    gateway_url,
    available_methods: methods,
    bkash_number: BKASH_MERCHANT_NUMBER || null,
    nagad_number: NAGAD_MERCHANT_NUMBER || null,
    rocket_number: ROCKET_MERCHANT_NUMBER || null,
    bank: {
      name: BANK_NAME || null,
      account_name: BANK_ACCOUNT_NAME || null,
      account_number: BANK_ACCOUNT_NUMBER || null,
      branch: BANK_BRANCH || null,
      routing: BANK_ROUTING || null,
    },
    google_pay_url: GOOGLE_PAY_URL || null,
    paypal_url: PAYPAL_CHECKOUT_URL || null,
    cash_confirm_numbers: cashConfirmNumbersDisplay(),
  });
}

// ── GET INVOICE STATUS ──────────────────────────────────────
async function getInvoice(body) {
  const { invoice_number } = body;
  if (!invoice_number) return reply(400, { ok: false, error: 'invoice_number required' });

  const rows = await sbSelect('invoices', `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`);
  const invoice = rows[0];
  if (!invoice) return reply(404, { ok: false, error: 'invoice not found' });

  const payments = await sbSelect('payments', `id=eq.${invoice.payment_id}&limit=1`);
  const payment = payments[0] || null;

  // invoices/payments carry no name/phone/email columns — pull those from
  // the linked profile so invoice.html has something to display.
  const profileRows = invoice.profile_id
    ? await sbSelect('profiles', `id=eq.${encodeURIComponent(invoice.profile_id)}&select=display_name,phone,email,profile_owner_type,member_code,guardian_name,guardian_relation&limit=1`)
    : [];
  const profile = profileRows[0] || null;
  const invoiceWithCustomer = {
    ...invoice,
    customer_name: profile ? profile.display_name : null,
    phone: profile ? normPhone(profile.phone) : null,
    customer_email: profile ? profile.email : null,
    profile_owner_type: profile ? profile.profile_owner_type : null,
    member_code: profile ? profile.member_code : null,
    father_name: profile && profile.guardian_relation === 'father' ? profile.guardian_name : null,
    guardian_name: profile ? profile.guardian_name : null,
    guardian_relation: profile ? profile.guardian_relation : null,
  };

  const methods = manualMethodsFor(profile ? profile.phone : '');

  let gateway_url = null;
  if (invoice.status === 'pending' && payment && SSLC_STORE_ID && SSLC_STORE_PWD) {
    const pkg = Object.values(PACKAGES).find(p => !p.tiered && p.total === invoice.total) || PACKAGES.REG;
    gateway_url = await buildSslczSession(invoice, payment, pkg, { name: invoiceWithCustomer.customer_name, email: invoiceWithCustomer.customer_email, phone: invoiceWithCustomer.phone });
  }

  return reply(200, {
    ok: true,
    invoice: invoiceWithCustomer,
    payment,
    gateway_url,
    available_methods: methods,
    bkash_number: BKASH_MERCHANT_NUMBER || null,
    nagad_number: NAGAD_MERCHANT_NUMBER || null,
    rocket_number: ROCKET_MERCHANT_NUMBER || null,
    bank: {
      name: BANK_NAME || null,
      account_name: BANK_ACCOUNT_NAME || null,
      account_number: BANK_ACCOUNT_NUMBER || null,
      branch: BANK_BRANCH || null,
      routing: BANK_ROUTING || null,
    },
    google_pay_url: GOOGLE_PAY_URL || null,
    paypal_url: PAYPAL_CHECKOUT_URL || null,
    cash_confirm_numbers: cashConfirmNumbersDisplay(),
  });
}

// ── BUILD SSLCOMMERZ SESSION ────────────────────────────────
async function buildSslczSession(invoice, payment, pkg, body) {
  const form = new URLSearchParams({
    store_id:    SSLC_STORE_ID,
    store_passwd: SSLC_STORE_PWD,
    total_amount: String(invoice.total),
    currency: 'BDT',
    tran_id:  payment.transaction_id,
    success_url: `${SITE_URL}/.netlify/functions/payment-webhook?redirect=success`,
    fail_url:    `${SITE_URL}/.netlify/functions/payment-webhook?redirect=fail`,
    cancel_url:  `${SITE_URL}/invoice.html?inv=${invoice.invoice_number}&cancelled=1`,
    ipn_url:     `${SITE_URL}/.netlify/functions/payment-webhook`,
    product_name: pkg.name,
    product_category: pkg.type,
    product_profile: 'general',
    cus_name:    body.name || 'BIYE Customer',
    cus_email:   body.email || 'customer@biye.ltd',
    cus_add1:    'Dhaka',
    cus_city:    'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone:   normPhone(body.phone) || '01700000000',
    shipping_method: 'NO',
  });
  try {
    const r = await fetch(SSLC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const d = await r.json().catch(() => null);
    return (d && d.status === 'SUCCESS' && d.GatewayPageURL) ? d.GatewayPageURL : null;
  } catch (e) {
    console.error('SSLCommerz error:', e.message);
    return null;
  }
}

// ── MANUAL PAYMENT CLAIM (cash / direct bKash) ───────────────
// This does NOT mark the payment completed. It records what the customer
// says they paid, then texts the admin (banker) a one-click confirm link.
// The admin checks their bKash app / cash-in-hand and only then confirms —
// see payment-webhook.js's adminConfirm handler for the completion step.
async function confirmManualPayment(body) {
  const { invoice_number, method, claim_reference, phone, cash_recipient } = body;
  const MANUAL_METHODS = ['cash', 'bkash_direct', 'nagad_direct', 'rocket_direct', 'bank_transfer'];

  if (!invoice_number) return reply(400, { ok: false, error: 'invoice_number required' });
  if (!MANUAL_METHODS.includes(method)) return reply(400, { ok: false, error: 'invalid manual payment method' });

  const customerPhone = normPhone(phone);
  if (!customerPhone) return reply(400, { ok: false, error: 'customer phone required' });

  const invRows = await sbSelect('invoices', `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`);
  const invoice = invRows[0];
  if (!invoice) return reply(404, { ok: false, error: 'invoice not found' });
  if (invoice.status !== 'pending') return reply(200, { ok: true, note: 'invoice already ' + invoice.status });

  // The invoice must belong to the submitting customer.
  const profRows = await sbSelect(
    'profiles',
    `id=eq.${encodeURIComponent(invoice.profile_id)}&select=phone&limit=1`
  );
  if (!profRows[0] || normPhone(profRows[0].phone) !== customerPhone) {
    return reply(403, { ok: false, error: 'phone number does not match this invoice' });
  }

  // Cash recipient is a collection number, not the customer's phone.
  let recipient = '';
  if (method === 'cash') {
    recipient = normPhone(cash_recipient || '');
    if (!recipient || !CASH_CONFIRM_PHONES.includes(recipient)) {
      return reply(400, {
        ok: false,
        error: 'valid cash collection number required',
        allowed_numbers: cashConfirmNumbersDisplay(),
      });
    }
  }

  const payRows = await sbSelect(
    'payments',
    `id=eq.${encodeURIComponent(invoice.payment_id)}&select=id,transaction_id,amount,currency,payment_method,status,profile_id&limit=1`
  );
  const payment = payRows[0];
  if (!payment) return reply(404, { ok: false, error: 'payment not found' });

  const now = new Date().toISOString();
  let reference = claim_reference || null;
  if (method === 'cash') {
    reference = `CASH_TO:${recipient.replace(/^880/, '0')}${claim_reference ? `|REF:${claim_reference}` : ''}`;
  }

  await sbUpdate('payments', `id=eq.${invoice.payment_id}`, {
    payment_method: method,
    gateway_response_reference: reference,
    updated_at: now,
  });

  const amount = payment.amount || invoice.total;
  const txn = payment.transaction_id || '';

  if (method === 'cash') {
    if (CASH_CONFIRM_PHONES.length === 0) {
      return reply(500, { ok: false, error: 'cash confirmation is not configured' });
    }

    // One OTP is generated for this cash claim and sent to the selected
    // collection number. The OTP is bound to this invoice/reference.
    const code = genOtp();
    const expires = new Date(Date.now() + 15 * 60000).toISOString();

    // Remove any older active verification code for the selected collector.
    await sbUpdate(
      'otp_codes',
      `phone=eq.${encodeURIComponent('+' + recipient)}&purpose=eq.verification&consumed_at=is.null`,
      { consumed_at: now }
    );

    const inserted = await sbInsert('otp_codes', {
      phone: '+' + recipient,
      purpose: 'verification',
      otp_hash: hashOtp(code),
      expires_at: expires,
      attempt_count: 0,
    }, false);

    if (!inserted) {
      return reply(500, { ok: false, error: 'could not create cash confirmation OTP' });
    }

    const smsMsg =
      `BIYE CASH CONFIRM: Invoice ${invoice_number}, Amount BDT ${amount}, ` +
      `Customer ${customerPhone.replace(/^880/, '0')}, Collection ${recipient.replace(/^880/, '0')}, ` +
      `Ref ${claim_reference || '—'}, OTP ${code}. Valid 15 minutes.`;

    try {
      const smsRes = await fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipient, msg: smsMsg }),
      });
      const smsData = await smsRes.json().catch(() => ({}));
      if (!smsData.sent) {
        return reply(502, { ok: false, error: 'OTP SMS could not be sent', detail: smsData });
      }
    } catch (e) {
      return reply(502, { ok: false, error: 'OTP SMS service unavailable' });
    }

    return reply(200, {
      ok: true,
      status: 'pending_otp_confirmation',
      invoice_number,
      amount,
      cash_recipient: recipient.replace(/^880/, '0'),
      message: 'OTP sent to the selected cash collection number.',
    });
  }

  // Manual non-cash claims remain pending until an authorised admin verifies
  // the actual transaction/transfer. No fake completion is allowed here.
  if (ADMIN_PHONE && ADMIN_SECRET) {
    const confirmUrl =
      `${SITE_URL}/.netlify/functions/payment-webhook?adminConfirm=1&txn=${encodeURIComponent(txn)}&secret=${encodeURIComponent(ADMIN_SECRET)}`;
    const labels = {
      bkash_direct: 'bKash',
      nagad_direct: 'Nagad',
      rocket_direct: 'Rocket',
      bank_transfer: 'Bank Transfer',
    };
    const msg =
      `BIYE ${labels[method] || method} payment claim: Invoice ${invoice_number}, ` +
      `Amount BDT ${amount}, Customer ${customerPhone.replace(/^880/, '0')}, ` +
      `Ref ${claim_reference || '—'}. Verify funds then confirm: ${confirmUrl}`;

    fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: ADMIN_PHONE, msg }),
    }).catch(() => {});
  }

  return reply(200, {
    ok: true,
    status: 'pending_review',
    invoice_number,
    amount,
    method,
  });
}

// ── CONFIRM CASH PAYMENT VIA OTP (entered by the admin/banker) ──────
async function confirmCashOtp(body) {
  const { invoice_number, phone, code } = body;
  if (!invoice_number || !phone || !code) {
    return reply(400, { ok: false, error: 'invoice_number, phone and code required' });
  }

  const collectorPhone = normPhone(phone);
  if (!CASH_CONFIRM_PHONES.includes(collectorPhone)) {
    return reply(403, { ok: false, error: 'this number is not authorised to confirm cash payments' });
  }

  const invRows = await sbSelect(
    'invoices',
    `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`
  );
  const invoice = invRows[0];
  if (!invoice) return reply(404, { ok: false, error: 'invoice not found' });
  if (invoice.status !== 'pending') {
    return reply(200, { ok: true, note: 'invoice already ' + invoice.status });
  }

  const payRows = await sbSelect(
    'payments',
    `id=eq.${encodeURIComponent(invoice.payment_id)}&select=id,profile_id,transaction_id,amount,currency,payment_method,gateway_response_reference,status&limit=1`
  );
  const payment = payRows[0];
  if (!payment) return reply(404, { ok: false, error: 'payment not found' });
  if (payment.payment_method !== 'cash') {
    return reply(400, { ok: false, error: 'this invoice is not a cash payment claim' });
  }

  // Ensure the OTP was issued to this exact collector for this exact cash claim.
  const ref = String(payment.gateway_response_reference || '');
  const recipientMatch = ref.match(/^CASH_TO:(\d{11,14})/);
  if (!recipientMatch || recipientMatch[1] !== collectorPhone.replace(/^880/, '0')) {
    return reply(403, { ok: false, error: 'collector number does not match the selected cash recipient' });
  }

  const q = await sbSelect(
    'otp_codes',
    `phone=eq.${encodeURIComponent('+' + collectorPhone)}&purpose=eq.verification&order=created_at.desc&limit=1`
  );
  const row = q[0];
  if (!row) return reply(400, { ok: false, error: 'কোনো কোড পাওয়া যায়নি — আবার চেষ্টা করুন' });
  if (row.consumed_at) return reply(400, { ok: false, error: 'এই কোড আগেই ব্যবহার হয়ে গেছে' });
  if ((row.attempt_count || 0) >= 5) return reply(400, { ok: false, error: 'অনেকবার ভুল হয়েছে — নতুন করে জমা দিতে বলুন' });
  if (new Date(row.expires_at) < new Date()) return reply(400, { ok: false, error: 'কোডের মেয়াদ শেষ' });

  if (row.otp_hash !== hashOtp(code)) {
    await sbUpdate('otp_codes', `id=eq.${row.id}`, {
      attempt_count: (row.attempt_count || 0) + 1,
    });
    return reply(400, { ok: false, error: 'কোডটি সঠিক নয়' });
  }

  const now = new Date().toISOString();

  // Complete payment only after the correct collector OTP is verified.
  const paymentUpdated = await sbUpdate('payments', `id=eq.${payment.id}`, {
    status: 'completed',
    paid_at: now,
    updated_at: now,
  });
  const invoiceUpdated = await sbUpdate('invoices', `id=eq.${invoice.id}`, { status: 'paid' });

  if (!paymentUpdated || !invoiceUpdated) {
    return reply(500, { ok: false, error: 'payment verification could not be completed safely' });
  }

  const existing = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(payment.id)}&limit=1`);
  const receipt = existing[0] || await sbInsert('receipts', {
    profile_id: payment.profile_id,
    payment_id: payment.id,
    receipt_number: 'RCP-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + Math.floor(1000 + Math.random()*9000),
    amount: payment.amount,
    currency: payment.currency || 'BDT',
    verification_status: 'verified',
    issued_at: now,
    created_at: now,
  });

  await sbUpdate('otp_codes', `id=eq.${row.id}`, { consumed_at: now });

  // Notify customer; do not expose the collector OTP again.
  const profRows = await sbSelect(
    'profiles',
    `id=eq.${payment.profile_id}&select=phone,email,display_name&limit=1`
  );
  const profile = profRows[0];

  if (profile) {
    const receiptUrl = `${SITE_URL}/receipt.html?payment_id=${encodeURIComponent(payment.id)}`;
    const smsTasks = [];
    const emailTasks = [];

    if (profile.phone) {
      smsTasks.push(fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profile.phone,
          msg: `BIYE: Cash payment verified. Invoice ${invoice_number}, Amount BDT ${payment.amount}, Receipt ${receipt ? receipt.receipt_number : ''}. ${receiptUrl}`,
        }),
      }).catch(() => null));
    }

    if (profile.email) {
      emailTasks.push(fetch(`${SITE_URL}/.netlify/functions/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: profile.email,
          subject: `BIYE Payment Receipt — ${receipt ? receipt.receipt_number : ''}`,
          html:
            `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto">` +
            `<h2 style="color:#E2136E">BIYE Payment Confirmed</h2>` +
            `<p>Your cash payment has been verified.</p>` +
            `<p><b>Invoice:</b> ${invoice_number}<br>` +
            `<b>Amount:</b> BDT ${payment.amount}<br>` +
            `<b>Receipt:</b> ${receipt ? receipt.receipt_number : '—'}</p>` +
            `<p><a href="${receiptUrl}">View Receipt</a></p></div>`,
        }),
      }).catch(() => null));
    }

    await Promise.all([...smsTasks, ...emailTasks]);
  }

  return reply(200, {
    ok: true,
    verified: true,
    invoice_number,
    amount: payment.amount,
    receipt_number: receipt ? receipt.receipt_number : null,
    receipt_url: `${SITE_URL}/receipt.html?payment_id=${encodeURIComponent(payment.id)}`,
  });
}

// ── LIST A CUSTOMER'S OWN PAYMENT HISTORY (for a dashboard "My Payments" link) ──
async function getMyPayments(body) {
  const { phone } = body;
  if (!phone) return reply(400, { ok: false, error: 'phone required' });
  const phoneE164 = normPhoneE164(phone);

  const profRows = await sbSelect('profiles', `phone=eq.${encodeURIComponent(phoneE164)}&select=id&limit=1`);
  if (!profRows[0]) return reply(404, { ok: false, error: 'profile not found' });
  const profileId = profRows[0].id;

  const payments = await sbSelect('payments',
    `profile_id=eq.${encodeURIComponent(profileId)}&select=id,transaction_id,gateway_transaction_id,payment_type,amount,currency,status,payment_method,paid_at,created_at&order=created_at.desc`);

  // Attach each payment's invoice number + receipt number, if any.
  const rows = [];
  for (const p of payments) {
    const invRows = await sbSelect('invoices', `payment_id=eq.${encodeURIComponent(p.id)}&select=invoice_number&limit=1`);
    const rcptRows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(p.id)}&select=receipt_number&limit=1`);
    rows.push({
      ...p,
      invoice_number: invRows[0] ? invRows[0].invoice_number : null,
      receipt_number: rcptRows[0] ? rcptRows[0].receipt_number : null,
    });
  }
  return reply(200, { ok: true, payments: rows });
}
// ── COMBINED DASHBOARD DATA (profile + payment history in one call) ──
async function getMyDashboard(body) {
  const { phone } = body;
  if (!phone) return reply(400, { ok: false, error: 'phone required' });
  const phoneE164 = normPhoneE164(phone);

  const profRows = await sbSelect('profiles',
    `phone=eq.${encodeURIComponent(phoneE164)}&select=id,display_name,gender,date_of_birth,division,district,education,profession,religion,marital_status,profile_completion,is_verified,member_code,profile_status,created_at&limit=1`);
  if (!profRows[0]) return reply(404, { ok: false, error: 'profile not found' });
  const profile = profRows[0];

  const payments = await sbSelect('payments',
    `profile_id=eq.${encodeURIComponent(profile.id)}&select=id,transaction_id,payment_type,amount,currency,status,payment_method,paid_at,created_at&order=created_at.desc&limit=25`);

  const rows = [];
  for (const p of payments) {
    const invRows = await sbSelect('invoices', `payment_id=eq.${encodeURIComponent(p.id)}&select=invoice_number&limit=1`);
    const rcptRows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(p.id)}&select=receipt_number&limit=1`);
    rows.push({ ...p, invoice_number: invRows[0] ? invRows[0].invoice_number : null, receipt_number: rcptRows[0] ? rcptRows[0].receipt_number : null });
  }

  return reply(200, { ok: true, profile, payments: rows });
}

// ── GET RECEIPT ─────────────────────────────────────────────
async function getReceipt(body) {
  const { transaction_id, invoice_number, payment_id } = body;

  // Resolve the payment row first — receipt.html can arrive with any of
  // payment_id / invoice_number / transaction_id.
  let payment = null;
  if (payment_id) {
    const rows = await sbSelect('payments', `id=eq.${encodeURIComponent(payment_id)}&limit=1`);
    payment = rows[0] || null;
  } else if (transaction_id) {
    const rows = await sbSelect('payments', `transaction_id=eq.${encodeURIComponent(transaction_id)}&limit=1`);
    payment = rows[0] || null;
  } else if (invoice_number) {
    const invRows = await sbSelect('invoices', `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`);
    if (invRows[0] && invRows[0].payment_id) {
      const rows = await sbSelect('payments', `id=eq.${encodeURIComponent(invRows[0].payment_id)}&limit=1`);
      payment = rows[0] || null;
    }
  }
  if (!payment) return reply(404, { ok: false, error: 'payment not found' });

  const receiptRows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(payment.id)}&limit=1`);
  const receipt = receiptRows[0] || null;
  if (!receipt) return reply(404, { ok: false, error: 'receipt not found — payment may still be pending' });

  const invRows2 = await sbSelect('invoices', `payment_id=eq.${encodeURIComponent(payment.id)}&limit=1`);
  const invoice = invRows2[0] || null;

  // Same customer enrichment as getInvoice — receipts/payments/invoices
  // carry no name/phone/email columns of their own.
  const profileRows = payment.profile_id
    ? await sbSelect('profiles', `id=eq.${encodeURIComponent(payment.profile_id)}&select=display_name,phone,email,profile_owner_type,member_code,guardian_name,guardian_relation&limit=1`)
    : [];
  const profile = profileRows[0] || null;
  const invoiceWithCustomer = {
    ...(invoice || {}),
    customer_name: profile ? profile.display_name : null,
    phone: profile ? normPhone(profile.phone) : null,
    customer_email: profile ? profile.email : null,
    profile_owner_type: profile ? profile.profile_owner_type : null,
    member_code: profile ? profile.member_code : null,
    father_name: profile && profile.guardian_relation === 'father' ? profile.guardian_name : null,
    guardian_name: profile ? profile.guardian_name : null,
    guardian_relation: profile ? profile.guardian_relation : null,
  };

  return reply(200, { ok: true, receipt, payment, invoice: invoiceWithCustomer });
}

// ── MAIN HANDLER ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  if (event.httpMethod === 'GET') {
    return reply(200, {
      ok: true, function: 'payment',
      supabase: SUPABASE_URL ? 'set' : 'MISSING',
      service_key: SERVICE_KEY ? 'set' : 'MISSING',
      sslcommerz: SSLC_STORE_ID ? 'set' : 'MISSING (sandbox mode)',
      mode: SSLC_IS_LIVE ? 'LIVE' : 'sandbox',
      cash_confirm_phones_configured: CASH_CONFIRM_PHONES.length,
      bkash_merchant_configured: !!BKASH_MERCHANT_NUMBER,
      nagad_merchant_configured: !!NAGAD_MERCHANT_NUMBER,
      rocket_merchant_configured: !!ROCKET_MERCHANT_NUMBER,
      bank_configured: !!(BANK_NAME && BANK_ACCOUNT_NUMBER),
      google_pay_configured: !!GOOGLE_PAY_URL,
      paypal_configured: !!PAYPAL_CHECKOUT_URL,
    });
  }

  if (!SERVICE_KEY || !SUPABASE_URL) {
    return reply(500, { ok: false, error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_KEY' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { ok: false, error: 'Bad JSON' }); }

  try {
    if (body.action === 'createRegistration')  return await createRegistration(body);
    if (body.action === 'createInvoice')        return await createInvoice(body);
    if (body.action === 'getInvoice')            return await getInvoice(body);
    if (body.action === 'getReceipt')            return await getReceipt(body);
    if (body.action === 'getMyPayments')         return await getMyPayments(body);
    if (body.action === 'getMyDashboard')        return await getMyDashboard(body);
    if (body.action === 'confirmManualPayment')  return await confirmManualPayment(body);
    if (body.action === 'confirmCashOtp')        return await confirmCashOtp(body);
    return reply(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('payment handler error:', e);
    return reply(500, { ok: false, error: String(e && e.message || e) });
  }
};
