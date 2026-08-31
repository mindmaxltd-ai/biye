// netlify/functions/payment.js
// BIYE.LTD — Invoice creation → SSLCommerz → Receipt + SMS/Email
// Schema: invoices(id, profile_id, invoice_number, payment_id, subtotal, tax, total, currency, status, issued_at, created_at)
//         payments(id, profile_id, transaction_id, gateway_transaction_id, payment_type, amount, currency, status, payment_method, paid_at, created_at, updated_at)
//         receipts(id, profile_id, payment_id, receipt_number, amount, currency, verification_status, issued_at, created_at)

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

const PACKAGES = {
  REG:          { type: 'registration', name: 'BIYE Registration',       subtotal: 999,   tax: 50,  total: 1049 },
  MATCH_PACK:   { type: 'match_view',   name: 'Additional Match View',    subtotal: 333,   tax: 0,   total: 333  },
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
function genTxnId() {
  return 'TXN-' + Date.now() + '-' + Math.floor(100 + Math.random()*900);
}
function genReceiptNumber() {
  return 'RCP-' + Date.now() + '-' + Math.floor(100 + Math.random()*900);
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

// ── CREATE INVOICE ──────────────────────────────────────────
async function createInvoice(body) {
  const { customer_id, profile_id, package_code } = body;
  const pid = profile_id || customer_id;
  if (!pid) return reply(400, { ok: false, error: 'profile_id required' });

  const pkg = PACKAGES[package_code] || PACKAGES.REG;
  const invoice_number = genInvoiceNumber();
  const transaction_id = genTxnId();
  const now = new Date().toISOString();

  // 1. Create payment row first
  const payment = await sbInsert('payments', {
    profile_id: pid,
    transaction_id,
    payment_type: pkg.type,
    amount: pkg.total,
    currency: 'BDT',
    status: 'pending',
    created_at: now,
    updated_at: now,
  });
  if (!payment) return reply(500, { ok: false, error: 'could not create payment' });

  // 2. Create invoice row
  const invoice = await sbInsert('invoices', {
    profile_id: pid,
    invoice_number,
    payment_id: payment.id,
    subtotal: pkg.subtotal,
    tax: pkg.tax,
    total: pkg.total,
    currency: 'BDT',
    status: 'pending',
    issued_at: now,
    created_at: now,
  });
  if (!invoice) return reply(500, { ok: false, error: 'could not create invoice' });

  // 3. Build SSLCommerz gateway URL
  let gateway_url = null;
  if (SSLC_STORE_ID && SSLC_STORE_PWD) {
    gateway_url = await buildSslczSession(invoice, payment, pkg);
  }

  return reply(200, {
    ok: true,
    invoice: { ...invoice, transaction_id, package_name: pkg.name },
    gateway_url,
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

  let gateway_url = null;
  if (invoice.status === 'pending' && payment && SSLC_STORE_ID && SSLC_STORE_PWD) {
    const pkg = Object.values(PACKAGES).find(p => p.total === invoice.total) || PACKAGES.REG;
    gateway_url = await buildSslczSession(invoice, payment, pkg);
  }

  return reply(200, { ok: true, invoice, payment, gateway_url });
}

// ── BUILD SSLCOMMERZ SESSION ────────────────────────────────
async function buildSslczSession(invoice, payment, pkg) {
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
    cus_name:    'BIYE Customer',
    cus_email:   'customer@biye.ltd',
    cus_add1:    'Dhaka',
    cus_city:    'Dhaka',
    cus_country: 'Bangladesh',
    cus_phone:   '01700000000',
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

// ── GET RECEIPT ─────────────────────────────────────────────
async function getReceipt(body) {
  const { transaction_id, invoice_number } = body;

  let receipt = null;
  if (transaction_id) {
    const rows = await sbSelect('receipts', `payment_id=eq.${encodeURIComponent(transaction_id)}&limit=1`);
    receipt = rows[0];
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

// ── WEBHOOK: SSLCommerz callback → update payment + create receipt + SMS ──
async function handleWebhook(body) {
  const { tran_id, val_id, status, amount, store_amount } = body;
  if (!tran_id) return reply(400, { ok: false, error: 'tran_id required' });

  const payments = await sbSelect('payments', `transaction_id=eq.${encodeURIComponent(tran_id)}&limit=1`);
  const payment = payments[0];
  if (!payment) return reply(404, { ok: false, error: 'payment not found' });

  if (status !== 'VALID' && status !== 'VALIDATED') {
    await sbUpdate('payments', `id=eq.${payment.id}`, { status: 'failed', updated_at: new Date().toISOString() });
    await sbUpdate('invoices', `payment_id=eq.${payment.id}`, { status: 'void' });
    return reply(200, { ok: false, status: 'failed' });
  }

  const now = new Date().toISOString();

  // Update payment as completed
  await sbUpdate('payments', `id=eq.${payment.id}`, {
    status: 'completed',
    gateway_transaction_id: val_id || tran_id,
    paid_at: now,
    updated_at: now,
  });

  // Update invoice as paid
  await sbUpdate('invoices', `payment_id=eq.${payment.id}`, { status: 'paid' });

  // Create receipt
  const receipt_number = genReceiptNumber();
  const receipt = await sbInsert('receipts', {
    profile_id: payment.profile_id,
    payment_id: payment.id,
    receipt_number,
    amount: payment.amount,
    currency: 'BDT',
    verification_status: 'verified',
    issued_at: now,
    created_at: now,
  });

  // Send SMS confirmation
  try {
    const profile = (await sbSelect('profiles', `id=eq.${payment.profile_id}&select=phone,display_name&limit=1`))[0];
    if (profile && profile.phone) {
      const msg = `BIYE পেমেন্ট সম্পন্ন! রসিদ নং: ${receipt_number}। ধন্যবাদ ${profile.display_name || ''}।`;
      await fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: profile.phone, msg }),
      });

      // Send email if available
      if (profile.email) {
        await fetch(`${SITE_URL}/.netlify/functions/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: profile.email,
            subject: `BIYE Payment Receipt — ${receipt_number}`,
            html: `<h2>পেমেন্ট সম্পন্ন</h2><p>রসিদ নং: <strong>${receipt_number}</strong></p><p>পরিমাণ: ৳${payment.amount}</p>`,
          }),
        });
      }
    }
  } catch (e) {
    console.error('notification error:', e.message);
  }

  return reply(200, { ok: true, receipt_number, status: 'completed' });
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
    });
  }

  if (!SERVICE_KEY || !SUPABASE_URL) {
    return reply(500, { error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_KEY' });
  }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Bad JSON' }); }

  try {
    if (body.action === 'createInvoice') return await createInvoice(body);
    if (body.action === 'getInvoice')    return await getInvoice(body);
    if (body.action === 'getReceipt')    return await getReceipt(body);
    if (body.action === 'webhook')       return await handleWebhook(body);
    return reply(400, { error: 'unknown action' });
  } catch (e) {
    console.error('payment handler error:', e);
    return reply(500, { error: String(e && e.message || e) });
  }
};
