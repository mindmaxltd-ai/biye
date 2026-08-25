// netlify/functions/payment.js
// ─────────────────────────────────────────────────────────────
// BIYE.COM — Invoice creation & lookup.
// payment.html calls this with action:'createInvoice' to start a purchase;
// invoice.html polls action:'getInvoice' while the gateway processes it;
// receipt.html calls action:'getReceipt' once payment-webhook.js has
// marked the payment SUCCESS.
//
// This function only WRITES invoices (status PENDING) and READS
// invoices/receipts. It never marks a payment SUCCESS itself — only
// payment-webhook.js (the gateway callback) does that, after verifying
// the transaction with the gateway.
//
// Netlify env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SSLC_STORE_ID, SSLC_STORE_PWD        (your BIYE SSLCommerz store — NOT shared with any other project)
//   SSLC_IS_LIVE                          ('true' in production, unset/false in sandbox)
//   URL / SITE_URL                        (Netlify sets URL automatically)
//
// SQL — run once in the Supabase SQL editor (extends the schema from
// supabase-client.js with the tables this function needs):
/*
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique not null,
  customer_id uuid references profiles(id),
  type text not null,             -- REGISTRATION | SUBSCRIPTION | MATCH_PACK
  package_code text,
  package_name text,
  amount numeric,
  discount numeric default 0,
  vat numeric default 0,
  total_amount numeric not null,
  status text default 'PENDING',  -- PENDING | SUCCESS | FAILED
  meta_json jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id),
  customer_id uuid references profiles(id),
  transaction_id text unique not null,
  gateway_txn_id text,
  final_amount numeric,
  paid_amount numeric,
  status text default 'PENDING',
  verification_status text default 'UNVERIFIED',
  verified_at timestamptz,
  verified_by text,
  gateway_response_json jsonb,
  created_at timestamptz default now()
);
create table payment_receipts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id),
  invoice_id uuid references invoices(id),
  payment_id uuid references payments(id),
  receipt_number text unique not null,
  transaction_id text,
  amount numeric,
  package_name text,
  receipt_type text,
  expires_at timestamptz,
  created_at timestamptz default now()
);
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id),
  invoice_id uuid references invoices(id),
  plan text,
  amount_paid numeric,
  end_date date,
  status text default 'active',
  created_at timestamptz default now()
);
*/
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const SITE_URL      = process.env.URL || process.env.SITE_URL || 'https://biye.ltd';
const SSLC_STORE_ID = process.env.SSLC_STORE_ID || '';
const SSLC_STORE_PWD = process.env.SSLC_STORE_PWD || '';
const SSLC_IS_LIVE  = process.env.SSLC_IS_LIVE === 'true';
const SSLC_API = SSLC_IS_LIVE
  ? 'https://securepay.sslcommerz.com/gwprocess/v4/api.php'
  : 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php';

const SB = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };
const enc = (v) => encodeURIComponent(v);

// BIYE package catalogue (Section 8.3 of the business blueprint).
// package_code -> { type, name, orig, price }. "orig" is the pre-discount
// list price shown struck-through; "price" is what's actually charged.
const PACKAGES = {
  REG:          { type: 'REGISTRATION', name: 'রেজিস্ট্রেশন ফি',            orig: 999,    price: 999 },
  MATCH_PACK:   { type: 'MATCH_PACK',   name: 'অতিরিক্ত ম্যাচ প্যাকেজ',      orig: 333,    price: 333 },
  SUB_SILVER:   { type: 'SUBSCRIPTION', name: 'সিলভার মেম্বারশিপ (১ বছর)',  orig: 4999,   price: 4999 },
  SUB_GOLD:     { type: 'SUBSCRIPTION', name: 'গোল্ড মেম্বারশিপ (১ বছর)',   orig: 9999,   price: 9999 },
  SUB_PLATINUM: { type: 'SUBSCRIPTION', name: 'প্ল্যাটিনাম মেম্বারশিপ (১ বছর)', orig: 24999, price: 24999 },
};

const reply = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body),
});

async function sbSelect(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d : [];
}
async function sbInsert(table, row, returnRow) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB, Prefer: returnRow ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!returnRow) return null;
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d[0] : null;
}

function genInvoiceNumber() {
  return 'INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
}
function genTxnId() {
  return 'TXN-' + Date.now() + '-' + Math.floor(100 + Math.random() * 900);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SERVICE_KEY || !SUPABASE_URL) return reply(500, { error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_KEY' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: 'Bad JSON' }); }

  try {
    if (body.action === 'createInvoice') return await createInvoice(body);
    if (body.action === 'getInvoice')    return await getInvoice(body);
    if (body.action === 'getReceipt')    return await getReceipt(body);
    return reply(400, { error: 'unknown action' });
  } catch (e) {
    return reply(500, { error: String((e && e.message) || e) });
  }
};

async function createInvoice(body) {
  const { customer_id, package_code } = body;
  if (!customer_id) return reply(400, { ok: false, error: 'customer_id required' });
  const pkg = PACKAGES[package_code];
  if (!pkg) return reply(400, { ok: false, error: 'unknown package_code' });

  const discount = Math.max(0, pkg.orig - pkg.price);
  const vat = Math.round(pkg.price * 0.05);
  const total = pkg.price + vat;
  const invoice_number = genInvoiceNumber();

  const invoice = await sbInsert('invoices', {
    invoice_number, customer_id, type: pkg.type,
    package_code, package_name: pkg.name,
    amount: pkg.orig, discount, vat, total_amount: total,
    status: 'PENDING',
  }, true);
  if (!invoice) return reply(500, { ok: false, error: 'could not create invoice' });

  // payment row (holds the transaction_id the gateway will echo back)
  const transaction_id = genTxnId();
  await sbInsert('payments', {
    invoice_id: invoice.id, customer_id, transaction_id,
    final_amount: total, status: 'PENDING', verification_status: 'UNVERIFIED',
  });

  return reply(200, { ok: true, invoice: { ...invoice, transaction_id } });
}

async function getInvoice(body) {
  const { invoice_number } = body;
  if (!invoice_number) return reply(400, { ok: false, error: 'invoice_number required' });
  const rows = await sbSelect('invoices', `invoice_number=eq.${enc(invoice_number)}&select=*&limit=1`);
  const invoice = rows[0];
  if (!invoice) return reply(404, { ok: false, error: 'invoice not found' });
  const pay = (await sbSelect('payments', `invoice_id=eq.${enc(invoice.id)}&select=*&order=created_at.desc&limit=1`))[0] || null;

  // Build the SSLCommerz session URL if this invoice is still pending and
  // a gateway store is configured — invoice.html redirects the browser here.
  let gatewayUrl = null;
  if (invoice.status === 'PENDING' && pay && SSLC_STORE_ID && SSLC_STORE_PWD) {
    gatewayUrl = await buildSslczSession(invoice, pay);
  }

  return reply(200, { ok: true, invoice, payment: pay, gateway_url: gatewayUrl });
}

async function getReceipt(body) {
  const { transaction_id } = body;
  if (!transaction_id) return reply(400, { ok: false, error: 'transaction_id required' });
  const rows = await sbSelect('payment_receipts', `transaction_id=eq.${enc(transaction_id)}&select=*&limit=1`);
  const receipt = rows[0];
  if (!receipt) return reply(404, { ok: false, error: 'receipt not found (payment may still be processing)' });
  return reply(200, { ok: true, receipt });
}

// Creates an SSLCommerz session and returns the redirect URL the customer's
// browser should be sent to. Requires your own BIYE store credentials —
// never reuse another project's SSLC_STORE_ID/SSLC_STORE_PWD.
async function buildSslczSession(invoice, pay) {
  const form = new URLSearchParams({
    store_id: SSLC_STORE_ID,
    store_passwd: SSLC_STORE_PWD,
    total_amount: String(pay.final_amount),
    currency: 'BDT',
    tran_id: pay.transaction_id,
    success_url: `${SITE_URL}/.netlify/functions/payment-webhook?redirect=success`,
    fail_url: `${SITE_URL}/.netlify/functions/payment-webhook?redirect=fail`,
    cancel_url: `${SITE_URL}/invoice.html?inv=${invoice.invoice_number}&cancelled=1`,
    ipn_url: `${SITE_URL}/.netlify/functions/payment-webhook`,
    product_name: invoice.package_name,
    product_category: invoice.type,
    product_profile: 'general',
    cus_name: 'BIYE Customer',
    cus_email: 'customer@biye.ltd',
    cus_add1: 'Dhaka', cus_city: 'Dhaka', cus_country: 'Bangladesh', cus_phone: '01700000000',
    shipping_method: 'NO',
  });
  try {
    const r = await fetch(SSLC_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
    const d = await r.json().catch(() => null);
    return (d && d.status === 'SUCCESS' && d.GatewayPageURL) ? d.GatewayPageURL : null;
  } catch (e) {
    console.error('sslcz session error:', e.message);
    return null;
  }
}
