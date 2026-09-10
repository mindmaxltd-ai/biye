// netlify/functions/payment-webhook.js
// ─────────────────────────────────────────────────────────────
// BIYE.LTD — Gateway Webhook / IPN Receiver + manual-payment admin confirm
//
// Two entry points:
//   1) POST from SSLCommerz (IPN / success / fail redirect) — verifies the
//      payment, marks it completed, creates the receipt, and sends the
//      welcome SMS + email.
//   2) GET  ?adminConfirm=1&txn=...&secret=...  — the one-click link the
//      banker gets by SMS after a customer claims a cash/bKash-direct
//      payment (see payment.js's confirmManualPayment). Finishes the same
//      way as (1): completed → receipt → welcome SMS + email.
//
// Schema (biye_schema.sql): payments(profile_id, transaction_id,
// gateway_transaction_id, payment_type, amount, status, payment_method,
// gateway_response_reference, paid_at), invoices(profile_id, payment_id,
// subtotal, tax, total, status), receipts(profile_id, payment_id,
// receipt_number, amount, verification_status).
//
// Netlify env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SSLC_STORE_ID, SSLC_STORE_PWD, SSLC_IS_LIVE   (must match payment.js)
//   ADMIN_SECRET                                   (must match payment.js)
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SSLCZ_PASSWD = process.env.SSLC_STORE_PWD || '';
const SSLC_STORE_ID = process.env.SSLC_STORE_ID || '';
const SSLC_IS_LIVE = process.env.SSLC_IS_LIVE === 'true';
const SSLC_VALIDATE = SSLC_IS_LIVE
  ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
  : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';
const SITE_URL = process.env.URL || process.env.SITE_URL || 'https://biye.ltd';
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';

const SB = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };
const enc = (v) => encodeURIComponent(v);

const REG_FACILITIES = [
  ['অসীমিত AI + EI ম্যাচ দেখা', 'Unlimited AI + EI match views'],
  ['সব ম্যাচের সাথে যোগাযোগের তথ্য উন্মুক্ত', 'Contact details unlocked for every match'],
  ['ভেরিফায়েড ব্যাজ', 'Verified badge on your profile'],
  ['সম্পূর্ণ কম্প্যাটিবিলিটি রিপোর্ট', 'Full compatibility reports'],
  ['অগ্রাধিকার সাপোর্ট', 'Priority support'],
  ['অভিভাবক ড্যাশবোর্ড', 'Guardian dashboard access'],
  ['আজীবন বৈধতা — কখনো নবায়ন লাগবে না', 'Lifetime validity — no renewal, ever'],
];

function redirectHtml(url, msg) {
  return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="1;url=${url}">
<style>body{font-family:'Hind Siliguri',sans-serif;background:#FAFAFC;color:#1A1A1A;display:flex;flex-direction:column;
align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}
.s{width:42px;height:42px;border:3px solid rgba(106,45,168,.2);border-top-color:#6A2DA8;
border-radius:50%;animation:sp .8s linear infinite;margin-bottom:18px}
@keyframes sp{to{transform:rotate(360deg)}}a{color:#E2136E}</style></head>
<body><div class="s"></div><p>${msg}</p>
<p style="font-size:13px;opacity:.6">স্বয়ংক্রিয়ভাবে না গেলে <a href="${url}">এখানে ক্লিক করুন</a></p>
<script>setTimeout(function(){location.href=${JSON.stringify(url)}},1000)</script></body></html>`;
}

const reply = (status, body, isHtml) => ({
  statusCode: status,
  headers: { 'Content-Type': isHtml ? 'text/html; charset=utf-8' : 'application/json',
             'Access-Control-Allow-Origin': '*' },
  body: isHtml ? body : JSON.stringify(body),
});

function parseBody(event) {
  const ct = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  const raw = event.body || '';
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  const out = {};
  raw.split('&').forEach(pair => {
    const [k, v] = pair.split('=');
    if (k) out[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
  });
  return out;
}

async function sbSelect(table, query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB });
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d : [];
}
async function sbUpdate(table, query, row) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
  return r.ok;
}
async function sbInsert(table, row, returnRow = true) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...SB, Prefer: returnRow ? 'return=representation' : 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!returnRow) return r.ok;
  const d = await r.json().catch(() => []);
  return Array.isArray(d) ? d[0] : null;
}
function genReceiptNumber() {
  return 'RCP-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(1000 + Math.random() * 9000);
}

// ── Finish a payment: mark completed, create the receipt, notify the customer ──
async function completePayment(payment, methodOverride) {
  const now = new Date().toISOString();

  await sbUpdate('payments', `id=eq.${enc(payment.id)}`, {
    status: 'completed',
    payment_method: methodOverride || payment.payment_method || 'sslcommerz',
    paid_at: now,
    updated_at: now,
  });

  const invRows = await sbSelect('invoices', `payment_id=eq.${enc(payment.id)}&limit=1`);
  const invoice = invRows[0];
  if (invoice) await sbUpdate('invoices', `id=eq.${enc(invoice.id)}`, { status: 'paid' });

  const existingReceipt = await sbSelect('receipts', `payment_id=eq.${enc(payment.id)}&limit=1`);
  let receipt = existingReceipt[0];
  if (!receipt) {
    receipt = await sbInsert('receipts', {
      profile_id: payment.profile_id,
      payment_id: payment.id,
      receipt_number: genReceiptNumber(),
      amount: payment.amount,
      currency: payment.currency || 'BDT',
      verification_status: 'verified',
      issued_at: now,
      created_at: now,
    });
  }

  if (payment.profile_id) {
    await sendWelcomeConfirmation(payment, receipt).catch(err => console.error('notification error:', err.message));
  }
  return receipt;
}

// ── SMS + email confirmation: receipt link, facilities, and policy summary ──
async function sendWelcomeConfirmation(payment, receipt) {
  const profRows = await sbSelect('profiles', `id=eq.${enc(payment.profile_id)}&select=phone,email,display_name&limit=1`);
  const profile = profRows[0];
  if (!profile) return;

  const receiptUrl = `${SITE_URL}/receipt.html?payment_id=${enc(payment.id)}`;
  const isRegistration = payment.payment_type === 'registration';

  if (profile.phone) {
    const smsMsg = isRegistration
      ? `BIYE-তে স্বাগতম, ${profile.display_name || ''}! আপনার লাইফটাইম রেজিস্ট্রেশন সম্পন্ন। রসিদ: ${receipt ? receipt.receipt_number : ''} — ${receiptUrl}`
      : `BIYE পেমেন্ট সম্পন্ন! রসিদ: ${receipt ? receipt.receipt_number : ''}, পরিমাণ ৳${payment.amount} — ${receiptUrl}`;
    await fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: profile.phone, msg: smsMsg }),
    }).catch(() => {});
  }

  if (profile.email) {
    const facilitiesHtml = isRegistration
      ? `<h3>আপনার লাইফটাইম রেজিস্ট্রেশনে যা যা আছে</h3><ul>` +
        REG_FACILITIES.map(([bn, en]) => `<li>${bn} <span style="color:#888">(${en})</span></li>`).join('') +
        `</ul>`
      : '';

    const html = `
      <div style="font-family:'Hind Siliguri',Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A">
        <h2 style="color:#E2136E">BIYE-তে স্বাগতম, ${profile.display_name || ''}!</h2>
        <p>আপনার পেমেন্ট সফলভাবে সম্পন্ন হয়েছে।</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#666">রসিদ নং</td><td style="text-align:right;font-weight:700">${receipt ? receipt.receipt_number : '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#666">পরিমাণ</td><td style="text-align:right;font-weight:700">৳${payment.amount}</td></tr>
          <tr><td style="padding:6px 0;color:#666">পদ্ধতি</td><td style="text-align:right">${payment.payment_method || 'SSLCommerz'}</td></tr>
        </table>
        <p><a href="${receiptUrl}" style="background:#E2136E;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">রসিদ দেখুন</a></p>
        ${facilitiesHtml}
        <h3>নিয়ম ও শর্তাবলী (সংক্ষেপে)</h3>
        <ul>
          <li>আপনার প্রোফাইলের তথ্য যাচাইযোগ্য ও সঠিক হতে হবে; মিথ্যা তথ্য দিলে অ্যাকাউন্ট স্থগিত হতে পারে।</li>
          <li>যোগাযোগের তথ্য শুধুমাত্র পারস্পরিক আগ্রহ প্রকাশের পরেই উন্মুক্ত হয়।</li>
          <li>রেজিস্ট্রেশন ফি অ-ফেরতযোগ্য, তবে পরিষেবাজনিত ত্রুটির ক্ষেত্রে যোগাযোগ করুন।</li>
          <li>আপনার ব্যক্তিগত তথ্য গোপনীয়তা নীতি অনুযায়ী সংরক্ষিত ও ব্যবহৃত হয়; সম্মতি যেকোনো সময় প্রত্যাহার করা যায়।</li>
        </ul>
        <p style="font-size:12px;color:#888">প্রশ্ন থাকলে এই ইমেইলে রিপ্লাই করুন অথবা BIYE সাপোর্টে যোগাযোগ করুন।</p>
      </div>`;

    await fetch(`${SITE_URL}/.netlify/functions/send-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: profile.email,
        subject: isRegistration ? 'BIYE-তে স্বাগতম — রেজিস্ট্রেশন সম্পন্ন' : `BIYE Payment Receipt — ${receipt ? receipt.receipt_number : ''}`,
        html,
      }),
    }).catch(() => {});
  }
}

// ── Admin's one-click confirm link for cash / direct-bKash claims ──
async function adminConfirm(qs) {
  if (!ADMIN_SECRET || qs.secret !== ADMIN_SECRET) {
    return reply(403, redirectHtml(`${SITE_URL}/index.html`, 'অবৈধ লিংক'), true);
  }
  const txn = qs.txn;
  if (!txn) return reply(400, { ok: false, error: 'txn required' });

  const rows = await sbSelect('payments', `transaction_id=eq.${enc(txn)}&limit=1`);
  const payment = rows[0];
  if (!payment) return reply(404, { ok: false, error: 'payment not found' });
  if (payment.status === 'completed') {
    return reply(200, `<!DOCTYPE html><meta charset="UTF-8"><body style="font-family:sans-serif;text-align:center;padding:60px">✅ এই পেমেন্ট আগেই কনফার্ম করা হয়েছে।</body>`, true);
  }

  await completePayment(payment);
  return reply(200, `<!DOCTYPE html><meta charset="UTF-8"><body style="font-family:sans-serif;text-align:center;padding:60px">✅ পেমেন্ট কনফার্ম করা হয়েছে এবং গ্রাহককে জানানো হয়েছে।</body>`, true);
}

// ── SSLCommerz IPN / redirect ────────────────────────────────
async function handleGatewayWebhook(event) {
  const qs = event.queryStringParameters || {};
  const isBrowserRedirect = qs.redirect === 'success' || qs.redirect === 'fail';
  const data = parseBody(event);

  const txnId = data.tran_id || data.transaction_id || null;
  const rawStatus = data.status || '';
  const paidAmount = data.amount != null ? Number(data.amount) : null;
  const valId = data.val_id || null;
  const isSuccess = /valid|success|completed/i.test(String(rawStatus));

  if (!txnId) return reply(400, { ok: false, error: 'transaction id missing in webhook' });

  const rows = await sbSelect('payments', `transaction_id=eq.${enc(txnId)}&limit=1`);
  const payment = rows[0];
  if (!payment) {
    if (isBrowserRedirect) return reply(200, redirectHtml(`${SITE_URL}/invoice.html?inv=${enc(txnId)}`, 'ইনভয়েস খোঁজা হচ্ছে...'), true);
    return reply(404, { ok: false, error: 'payment not found for ' + txnId });
  }

  // Verify with SSLCommerz's own validation API — never trust the redirect/IPN alone.
  let verifiedOk = isSuccess;
  if (valId && SSLCZ_PASSWD) {
    try {
      const vurl = `${SSLC_VALIDATE}?val_id=${enc(valId)}&store_id=${enc(data.store_id || SSLC_STORE_ID)}&store_passwd=${enc(SSLCZ_PASSWD)}&format=json`;
      const vr = await fetch(vurl).then(r => r.json()).catch(() => null);
      if (vr) {
        verifiedOk = /valid/i.test(String(vr.status));
        if (verifiedOk && vr.amount != null && Math.abs(Number(payment.amount) - Number(vr.amount)) > 1) verifiedOk = false;
      }
    } catch (_) { /* fall back to amount check below */ }
  }
  if (verifiedOk && paidAmount != null && Math.abs(Number(payment.amount) - paidAmount) > 1) verifiedOk = false;

  if (!verifiedOk) {
    await sbUpdate('payments', `id=eq.${enc(payment.id)}`, { status: 'failed', updated_at: new Date().toISOString() });
    const invRows = await sbSelect('invoices', `payment_id=eq.${enc(payment.id)}&limit=1`);
    if (invRows[0]) await sbUpdate('invoices', `id=eq.${enc(invRows[0].id)}`, { status: 'void' });
    if (isBrowserRedirect) return reply(200, redirectHtml(`${SITE_URL}/invoice.html?inv=${enc(txnId)}&failed=1`, '❌ পেমেন্ট সম্পন্ন হয়নি'), true);
    return reply(200, { ok: true, verified: false, status: 'failed' });
  }

  await sbUpdate('payments', `id=eq.${enc(payment.id)}`, { gateway_transaction_id: valId || txnId });
  await completePayment({ ...payment, gateway_transaction_id: valId || txnId }, 'sslcommerz');

  if (isBrowserRedirect) {
    return reply(200, redirectHtml(`${SITE_URL}/receipt.html?payment_id=${enc(payment.id)}`, '✅ পেমেন্ট সফল! রসিদ প্রস্তুত হচ্ছে...'), true);
  }
  return reply(200, { ok: true, verified: true, status: 'completed' });
}

// ── MAIN HANDLER ─────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (!SERVICE_KEY) return reply(500, { error: 'Missing SUPABASE_SERVICE_KEY' });

  const qs = event.queryStringParameters || {};
  if (event.httpMethod === 'GET' && qs.adminConfirm === '1') {
    return await adminConfirm(qs);
  }

  try {
    return await handleGatewayWebhook(event);
  } catch (err) {
    return reply(500, { error: String((err && err.message) || err) });
  }
};
