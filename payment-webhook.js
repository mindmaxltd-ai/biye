// netlify/functions/payment-webhook.js
// ─────────────────────────────────────────────────────────────
// BIYE.COM — Gateway Webhook / IPN Receiver
// পেমেন্ট গেটওয়ে (SSLCommerz IPN, success/fail redirect) এখানে POST করে।
// এটি signature/val_id যাচাই করে → payments+invoices আপডেট করে →
// SUCCESS হলে receipt তৈরি করে এবং profile-এ registration/membership
// প্রতিফলিত করে।
//
// গেটওয়ে কনফিগে এই URL দিন (IPN / callback URL হিসেবে):
//   https://<your-site>.netlify.app/.netlify/functions/payment-webhook
//
// Netlify env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//   SSLC_STORE_ID, SSLC_STORE_PWD   (payment.js-এর সাথে একই মান হতে হবে)
//   SSLC_IS_LIVE
//
// SQL — payment.js-এর স্কিমার ওপর profiles টেবিলে এই কলামগুলো দরকার
// (একবার Supabase SQL editor-এ রান করুন, যদি আগে থেকে না থাকে):
/*
alter table profiles add column if not exists registration_fee_paid boolean default false;
alter table profiles add column if not exists membership_tier text;              -- SILVER | GOLD | PLATINUM
alter table profiles add column if not exists membership_expiry date;
alter table profiles add column if not exists match_pack_credits int default 0;  -- MATCH_PACK কেনার প্রতিফলন
*/
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const SSLCZ_PASSWD = process.env.SSLC_STORE_PWD || '';
const SSLC_STORE_ID = process.env.SSLC_STORE_ID || '';
const SSLC_IS_LIVE = process.env.SSLC_IS_LIVE === 'true';
const SSLC_VALIDATE = SSLC_IS_LIVE
  ? 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php'
  : 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php';
const SITE_URL = process.env.URL || process.env.SITE_URL || 'https://biye.ltd';

const SB = { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json' };
const enc = (v) => encodeURIComponent(v);

// ── গ্রাহকের ব্রাউজারকে নির্দিষ্ট পেজে পাঠানোর HTML ──
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

// gateway পাঠায় form-urlencoded; নিজস্ব টেস্ট কল JSON হতে পারে
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
  return fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
}
async function sbInsert(table, row) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST', headers: { ...SB, Prefer: 'return=minimal' }, body: JSON.stringify(row),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});
  if (!SERVICE_KEY) return reply(500, { error: 'Missing SUPABASE_SERVICE_KEY' });

  const qs = event.queryStringParameters || {};
  const isBrowserRedirect = qs.redirect === 'success' || qs.redirect === 'fail';

  const data = parseBody(event);

  // SSLCommerz: tran_id, status (VALID/FAILED/CANCELLED), amount, val_id, bank_tran_id
  const txnId = data.transaction_id || data.tran_id || null;
  const rawStatus = data.gateway_status || data.status || '';
  const paidAmount = data.amount || data.paid_amount || null;
  const gatewayTxn = data.bank_tran_id || data.val_id || null;
  const isSuccess = /valid|success|completed/i.test(String(rawStatus));

  if (!txnId) return reply(400, { error: 'transaction id missing in webhook' });

  try {
    const pay = (await sbSelect('payments', `transaction_id=eq.${enc(txnId)}&select=*&order=created_at.desc&limit=1`))[0];
    if (!pay) {
      if (isBrowserRedirect) return reply(200, redirectHtml(`${SITE_URL}/receipt.html?txn=${enc(txnId)}`, 'রিসিট খোঁজা হচ্ছে...'), true);
      return reply(404, { ok: false, error: 'payment not found for ' + txnId });
    }

    // ── SSLCommerz validation API দিয়ে val_id যাচাই (প্রকৃত নিশ্চিতকরণ) ──
    let verifiedOk = isSuccess;
    if (data.val_id && SSLCZ_PASSWD) {
      try {
        const vurl = `${SSLC_VALIDATE}?val_id=${enc(data.val_id)}&store_id=${enc(data.store_id || SSLC_STORE_ID)}&store_passwd=${enc(SSLCZ_PASSWD)}&format=json`;
        const vr = await fetch(vurl).then(r => r.json()).catch(() => null);
        if (vr) {
          verifiedOk = /valid/i.test(String(vr.status));
          if (verifiedOk && vr.amount != null) {
            const expected = Number(pay.final_amount || 0);
            if (expected > 0 && Math.abs(expected - Number(vr.amount)) > 1) verifiedOk = false;
          }
        }
      } catch (_) { /* fallback to amount check below */ }
    }
    if (verifiedOk && paidAmount != null) {
      const expected = Number(pay.final_amount || 0);
      const got = Number(paidAmount);
      if (expected > 0 && Math.abs(expected - got) > 1) verifiedOk = false; // ৳1 সহনশীলতা
    }

    await sbUpdate('payments', `id=eq.${enc(pay.id)}`, {
      paid_amount: paidAmount != null ? Number(paidAmount) : pay.final_amount,
      gateway_txn_id: gatewayTxn,
      status: verifiedOk ? 'SUCCESS' : 'FAILED',
      verification_status: verifiedOk ? 'VERIFIED' : 'REJECTED',
      verified_at: new Date().toISOString(),
      verified_by: 'gateway_webhook',
      gateway_response_json: { ...(pay.gateway_response_json || {}), ipn: data, at: new Date().toISOString() },
    });
    await sbUpdate('invoices', `id=eq.${enc(pay.invoice_id)}`,
      { status: verifiedOk ? 'SUCCESS' : 'FAILED', updated_at: new Date().toISOString() });

    if (!verifiedOk) {
      if (isBrowserRedirect) {
        return reply(200, redirectHtml(`${SITE_URL}/invoice.html?inv=${enc(txnId)}&failed=1`, '❌ পেমেন্ট সম্পন্ন হয়নি'), true);
      }
      return reply(200, { ok: true, verified: false, status: 'FAILED' });
    }

    // ── SUCCESS → receipt + profile আপডেট (registration/membership/match pack) ──
    const inv = (await sbSelect('invoices', `id=eq.${enc(pay.invoice_id)}&select=*&limit=1`))[0];
    if (inv) {
      const existing = await sbSelect('payment_receipts', `invoice_id=eq.${enc(inv.id)}&select=receipt_number&limit=1`);
      if (!existing.length) {
        const rcpNum = 'RCP-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') +
          '-' + Math.floor(1000 + Math.random() * 9000);
        await sbInsert('payment_receipts', {
          customer_id: inv.customer_id, invoice_id: inv.id, payment_id: pay.id,
          receipt_number: rcpNum, transaction_id: pay.transaction_id,
          amount: inv.total_amount, package_name: inv.package_name,
          receipt_type: inv.type.toLowerCase(),
          expires_at: new Date(Date.now() + 90 * 864e5).toISOString(),
        }).catch(() => {});
      }

      if (inv.type === 'REGISTRATION') {
        await sbUpdate('profiles', `id=eq.${enc(inv.customer_id)}`,
          { registration_fee_paid: true }).catch(() => {});

      } else if (inv.type === 'SUBSCRIPTION') {
        const tier = { SUB_SILVER: 'SILVER', SUB_GOLD: 'GOLD', SUB_PLATINUM: 'PLATINUM' }[inv.package_code] || 'SILVER';
        const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1); // সব মেম্বারশিপ প্যাকেজ ১ বছরের (Section 8.3)
        await sbUpdate('profiles', `id=eq.${enc(inv.customer_id)}`, {
          membership_tier: tier,
          membership_expiry: expiry.toISOString().slice(0, 10),
        }).catch(() => {});
        await sbInsert('subscriptions', {
          customer_id: inv.customer_id, invoice_id: inv.id, plan: inv.package_code,
          amount_paid: inv.total_amount, end_date: expiry.toISOString().slice(0, 10), status: 'active',
        }).catch(() => {});

      } else if (inv.type === 'MATCH_PACK') {
        // অতিরিক্ত ম্যাচ প্যাকেজ কেনা — বর্তমান ক্রেডিট এক ধাপে বাড়ানো (read-then-write;
        // race condition-এর ঝুঁকি খুবই কম এই ভলিউমে, বেশি হলে Postgres RPC-এ সরানো ভালো)।
        const prof = (await sbSelect('profiles', `id=eq.${enc(inv.customer_id)}&select=match_pack_credits&limit=1`))[0];
        const current = (prof && prof.match_pack_credits) || 0;
        await sbUpdate('profiles', `id=eq.${enc(inv.customer_id)}`,
          { match_pack_credits: current + 5 }).catch(() => {}); // প্রতি প্যাকেজে ৫টা নতুন AI ম্যাচ
      }
    }

    if (isBrowserRedirect) {
      return reply(200, redirectHtml(`${SITE_URL}/receipt.html?txn=${enc(txnId)}`, '✅ পেমেন্ট সফল! রিসিট প্রস্তুত হচ্ছে...'), true);
    }
    return reply(200, { ok: true, verified: true, status: 'SUCCESS' });
  } catch (err) {
    return reply(500, { error: String((err && err.message) || err) });
  }
};
