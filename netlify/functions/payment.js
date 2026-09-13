// netlify/functions/payment.js
// BIYE.LTD — Registration account creation + Invoice → SSLCommerz/manual → Receipt
// Schema (biye_schema.sql): profiles, invoices(profile_id,...), payments(profile_id,...), receipts(profile_id,...)
//
// Netlify env needed:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SSLC_STORE_ID, SSLC_STORE_PWD, SSLC_IS_LIVE       (SSLCommerz — optional; without it, gateway_url is null)
//   MANUAL_PAYMENT_PHONES   comma-separated phone numbers allowed to pay by cash
//                           e.g. "01767626653,01346098892"
//   BKASH_DIRECT_PHONES     comma-separated phone numbers allowed to pay by direct bKash
//                           e.g. "01346098892"
//   BKASH_MERCHANT_NUMBER   the personal/merchant bKash number customers send money to
//   ADMIN_PHONE             banker's own phone — gets an SMS with a one-click confirm link
//                           whenever someone submits a cash/bKash claim
//   ADMIN_SECRET            a long random string; only links built with this secret can
//                           confirm a manual payment (see payment-webhook.js)

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

const MANUAL_PAYMENT_PHONES = (process.env.MANUAL_PAYMENT_PHONES || '').split(',').map(normPhone).filter(Boolean);
const BKASH_DIRECT_PHONES   = (process.env.BKASH_DIRECT_PHONES || '').split(',').map(normPhone).filter(Boolean);
const BKASH_MERCHANT_NUMBER = process.env.BKASH_MERCHANT_NUMBER || '';
const ADMIN_PHONE           = process.env.ADMIN_PHONE || '';
const ADMIN_SECRET          = process.env.ADMIN_SECRET || '';

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

// ── Resolve (or create) the profile behind a registration/payment request ──
// Never trusts a client-sent profile_id/customer_id as-is; always looks the
// real row up by phone, and only creates a new account when a password was
// supplied (i.e. this genuinely is the registration flow, step 3).
async function resolveProfile(body) {
  const phoneE164 = normPhoneE164(body.phone);
  if (!phoneE164) return { error: 'phone required' };

  const existing = await sbSelect('profiles', `phone=eq.${encodeURIComponent(phoneE164)}&select=id&limit=1`);
  if (existing[0]) return { profileId: existing[0].id, created: false };

  // No profile yet. Only create one if this looks like a real registration
  // submission (name + password present) — otherwise we'd be guessing.
  if (!body.password || !body.name) {
    return { error: 'no profile found for this phone, and no registration details were provided to create one' };
  }
  if (!isStrongPassword(body.password)) {
    return { error: 'password must be at least 8 characters' };
  }

  // 1) Create the Supabase Auth user — password lives ONLY here, never in
  //    our own tables. phone_confirm:true because our own OTP step (via
  //    send-otp.js) already verified this number.
  const authRes = await authAdminCreateUser({
    phone: phoneE164,
    password: body.password,
    phone_confirm: true,
    user_metadata: { display_name: body.name },
  });
  if (!authRes.ok || !authRes.data || !authRes.data.id) {
    return { error: 'could not create account', detail: authRes.data };
  }
  const authUserId = authRes.data.id;

  // 2) Candidate gender/eligibility: derived the same way register.html's
  //    UI frames it — "looking for a bride" means the candidate is male,
  //    "looking for a groom" means the candidate is female.
  const gender = body.seeking_type === 'groom' ? 'female' : 'male';

  // date_of_birth is NOT NULL in the schema. Prefer an exact date if the
  // registration form collected one (body.dob, "YYYY-MM-DD"); only fall
  // back to approximating from age (Jan 1 of the birth year) when just an
  // age was given.
  let dob = null;
  if (body.dob && /^\d{4}-\d{2}-\d{2}$/.test(body.dob)) {
    dob = body.dob;
  } else {
    const age = parseInt(body.age, 10);
    if (age && age > 0 && age < 120) {
      dob = `${new Date().getFullYear() - age}-01-01`;
    }
  }

  const ownerType = body.owner_type === 'self' ? 'self' : 'guardian_assisted';

  const profile = await sbInsert('profiles', {
    auth_user_id: authUserId,
    display_name: body.name,
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
    // Roll back the auth user so we don't leave an orphaned login with no
    // profile behind it.
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUserId}`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
    }).catch(() => {});
    return { error: 'account was created but the profile could not be saved — please try again' };
  }

  return { profileId: profile.id, created: true };
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

// Which manual methods (beyond SSLCommerz) this phone is allowed to use.
// Configured via Netlify env — never hard-coded in source, so the allow-list
// can be changed without a deploy and isn't visible in the shipped frontend.
function manualMethodsFor(phoneRaw) {
  const phone = normPhone(phoneRaw);
  const methods = ['sslcommerz'];
  if (phone && MANUAL_PAYMENT_PHONES.includes(phone)) methods.push('cash');
  if (phone && BKASH_DIRECT_PHONES.includes(phone)) methods.push('bkash_direct');
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
    bkash_number: methods.includes('bkash_direct') ? BKASH_MERCHANT_NUMBER : null,
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

  return reply(200, { ok: true, invoice: invoiceWithCustomer, payment, gateway_url, available_methods: methods,
    bkash_number: methods.includes('bkash_direct') ? BKASH_MERCHANT_NUMBER : null });
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
  const { invoice_number, method, claim_reference, phone } = body;
  if (!invoice_number) return reply(400, { ok: false, error: 'invoice_number required' });
  if (!['cash', 'bkash_direct'].includes(method)) return reply(400, { ok: false, error: 'invalid method' });

  const allowed = manualMethodsFor(phone);
  if (!allowed.includes(method)) {
    return reply(403, { ok: false, error: 'this phone number is not enabled for that payment method' });
  }

  const invRows = await sbSelect('invoices', `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`);
  const invoice = invRows[0];
  if (!invoice) return reply(404, { ok: false, error: 'invoice not found' });
  if (invoice.status !== 'pending') return reply(200, { ok: true, note: 'invoice already ' + invoice.status });

  // Extra safety: the invoice's own profile must actually have this phone.
  const profRows = await sbSelect('profiles', `id=eq.${invoice.profile_id}&select=phone&limit=1`);
  if (!profRows[0] || normPhone(profRows[0].phone) !== normPhone(phone)) {
    return reply(403, { ok: false, error: 'phone number does not match this invoice' });
  }

  await sbUpdate('payments', `id=eq.${invoice.payment_id}`, {
    payment_method: method,
    gateway_response_reference: claim_reference || null,
    updated_at: new Date().toISOString(),
  });

  // Notify the admin with a one-click confirm link (GET request).
  if (ADMIN_PHONE && ADMIN_SECRET) {
    const payRows = await sbSelect('payments', `id=eq.${invoice.payment_id}&select=transaction_id,amount&limit=1`);
    const txn = payRows[0] ? payRows[0].transaction_id : '';
    const amount = payRows[0] ? payRows[0].amount : invoice.total;
    const confirmUrl = `${SITE_URL}/.netlify/functions/payment-webhook?adminConfirm=1&txn=${encodeURIComponent(txn)}&secret=${encodeURIComponent(ADMIN_SECRET)}`;
    const msg = `BIYE: ${method === 'cash' ? 'নগদ' : 'bKash'} পেমেন্ট দাবি — ৳${amount}, ফোন ${normPhone(phone)}, রেফ: ${claim_reference || '—'}. টাকা পেয়ে থাকলে কনফার্ম করুন: ${confirmUrl}`;
    fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: ADMIN_PHONE, msg }),
    }).catch(() => {});
  }

  return reply(200, { ok: true, status: 'pending_review' });
}

// ── GET RECEIPT ─────────────────────────────────────────────
async function getReceipt(body) {
  const { transaction_id, invoice_number } = body;

  let receipt = null;
  if (transaction_id) {
    const payRows = await sbSelect('payments', `transaction_id=eq.${encodeURIComponent(transaction_id)}&select=id&limit=1`);
    if (payRows[0]) {
      const rows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(payRows[0].id)}&limit=1`);
      receipt = rows[0];
    }
  } else if (invoice_number) {
    const invRows = await sbSelect('invoices', `invoice_number=eq.${encodeURIComponent(invoice_number)}&limit=1`);
    const inv = invRows[0];
    if (inv) {
      const rows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(inv.payment_id)}&limit=1`);
      receipt = rows[0];
    }
  }

  if (!receipt) return reply(404, { ok: false, error: 'receipt not found' });
  return reply(200, { ok: true, receipt });
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
      manual_payment_phones_configured: MANUAL_PAYMENT_PHONES.length,
      bkash_direct_phones_configured: BKASH_DIRECT_PHONES.length,
    });
  }

  if (!SERVICE_KEY || !SUPABASE_URL) {
    return reply(500, { ok: false, error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_KEY' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { ok: false, error: 'Bad JSON' }); }

  try {
    if (body.action === 'createInvoice')        return await createInvoice(body);
    if (body.action === 'getInvoice')            return await getInvoice(body);
    if (body.action === 'getReceipt')            return await getReceipt(body);
    if (body.action === 'confirmManualPayment')  return await confirmManualPayment(body);
    return reply(400, { ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('payment handler error:', e);
    return reply(500, { ok: false, error: String(e && e.message || e) });
  }
};
