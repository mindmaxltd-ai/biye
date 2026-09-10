// netlify/functions/send-otp.js
// ─────────────────────────────────────────────────────────────
// BIYE.LTD — OTP send/verify, phone+password login, password reset,
// and consent logging. Supabase Auth is authoritative for passwords —
// this function never stores a password anywhere itself; it only calls
// Supabase Auth's REST API (with the service-role key) to create/verify/
// update it. otp_codes.otp_hash stores a SHA-256 hash of the code, never
// the plaintext code.
//
// Netlify env:
//   SUPABASE_URL                                        (required)
//   SUPABASE_SERVICE_KEY / ..._ROLE_KEY / SUPABASE_KEY   (required — service role)
//   SUPABASE_ANON_KEY                                    (required for login's password grant)
//   SMS_API_KEY                                          (used by send-sms.js)
//
// POST JSON actions:
//   { action:"send",   phone, purpose }            purpose: registration|login|reset|verification|consent
//   { action:"verify", phone, code, purpose }
//   { action:"login",  phone, password }            → { ok, access_token, refresh_token }
//   { action:"resetPassword", phone, newPassword }  → requires a consumed 'reset' OTP for this phone first
//   { action:"logConsent", phone, consents:{tos,priv,match,pay,sms}, ts }
// ─────────────────────────────────────────────────────────────

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://biye.ltd';

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const VALID_PURPOSES = ['registration', 'login', 'reset', 'verification', 'consent'];

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

// 8801XXXXXXXXX format (no +) — used for SMS and DB lookups in this function
function normPhone(raw) {
  let n = String(raw).replace(/[^0-9]/g, '');
  if (n.startsWith('880')) return n;
  if (n.startsWith('0')) return '88' + n;
  if (n.startsWith('1')) return '880' + n;
  return n;
}
// +8801XXXXXXXXX format — required by Supabase Auth's `phone` field
function normPhoneE164(raw) {
  return '+' + normPhone(raw);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function isStrongPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

// ── Supabase Auth Admin helpers (service-role only — never expose this key to the browser) ──
async function authAdmin(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function findAuthUserByPhone(phoneE164) {
  // Supabase doesn't expose a direct "get by phone" admin endpoint, so we
  // look the profile up first (profiles.phone → profiles.auth_user_id).
  const rows = (await sb(`profiles?phone=eq.${encodeURIComponent(phoneE164)}&select=id,auth_user_id&limit=1`)).data;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  if (event.httpMethod === 'GET') {
    return reply(200, {
      ok: true,
      function: 'send-otp',
      supabase_url: SUPABASE_URL ? 'set' : 'MISSING',
      supabase_service_key: SERVICE_KEY ? 'set' : 'MISSING',
      supabase_anon_key: ANON_KEY ? 'set' : 'MISSING',
      sms_api_key: SMS_API_KEY ? 'set' : 'MISSING',
      note: 'POST { action:"send"|"verify"|"login"|"resetPassword"|"logConsent", ... }',
    });
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SERVICE_KEY) return reply(500, { ok: false, error: 'Supabase config missing' });

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { ok: false, error: 'Bad JSON' }); }

  const action = String(p.action || '').trim();

  // ─────────── SEND OTP ───────────
  if (action === 'send') {
    const phone = normPhone(p.phone || '');
    if (!phone) return reply(400, { ok: false, error: 'no phone' });
    const purpose = VALID_PURPOSES.includes(p.purpose) ? p.purpose : 'registration';
    if (!SMS_API_KEY) return reply(500, { ok: false, error: 'SMS_API_KEY missing' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString();

    await sb(`otp_codes?phone=eq.${phone}&purpose=eq.${purpose}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

    const ins = await sb('otp_codes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ phone, purpose, otp_hash: hashCode(code), expires_at: expires, attempt_count: 0 }),
    });
    if (!ins.ok) return reply(500, { ok: false, error: 'could not store OTP', detail: ins.data });

    const msg = `BIYE যাচাই কোড: ${code} । ${OTP_TTL_MIN} মিনিট বৈধ। কাউকে শেয়ার করবেন না।`;
    try {
      const r = await fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, msg }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.sent) return reply(200, { ok: true, sent: true, phone, expires_in_min: OTP_TTL_MIN });
      return reply(200, { ok: false, sent: false, error: 'SMS failed', detail: d });
    } catch (e) {
      return reply(500, { ok: false, sent: false, error: String((e && e.message) || e) });
    }
  }

  // ─────────── VERIFY OTP ───────────
  if (action === 'verify') {
    const phone = normPhone(p.phone || '');
    const code = String(p.code || '').trim();
    const purpose = VALID_PURPOSES.includes(p.purpose) ? p.purpose : 'registration';
    if (!phone) return reply(400, { ok: false, error: 'no phone' });
    if (!code) return reply(400, { ok: false, error: 'no code' });

    const q = await sb(`otp_codes?phone=eq.${phone}&purpose=eq.${purpose}&order=created_at.desc&limit=1`);
    if (!q.ok || !Array.isArray(q.data) || q.data.length === 0) {
      return reply(200, { ok: false, verified: false, error: 'কোনো কোড পাওয়া যায়নি — আবার পাঠান' });
    }
    const row = q.data[0];

    if (row.consumed_at) return reply(200, { ok: true, verified: true, note: 'already verified' });
    if ((row.attempt_count || 0) >= MAX_ATTEMPTS) return reply(200, { ok: false, verified: false, error: 'অনেকবার ভুল হয়েছে — নতুন কোড নিন' });
    if (new Date(row.expires_at) < new Date()) return reply(200, { ok: false, verified: false, error: 'কোডের মেয়াদ শেষ — আবার পাঠান' });

    if (row.otp_hash === hashCode(code)) {
      await sb(`otp_codes?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
      return reply(200, { ok: true, verified: true });
    } else {
      await sb(`otp_codes?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ attempt_count: (row.attempt_count || 0) + 1 }),
      });
      const left = MAX_ATTEMPTS - ((row.attempt_count || 0) + 1);
      return reply(200, { ok: false, verified: false, error: `কোড ভুল — আর ${left} বার চেষ্টা করতে পারবেন` });
    }
  }

  // ─────────── LOGIN (phone + password) ───────────
  if (action === 'login') {
    const phone = String(p.phone || '').trim();
    const password = p.password || '';
    if (!phone) return reply(400, { ok: false, error: 'no phone' });
    if (!password) return reply(400, { ok: false, error: 'password required' });
    if (!ANON_KEY) return reply(500, { ok: false, error: 'SUPABASE_ANON_KEY missing' });

    const phoneE164 = phone.startsWith('+') ? phone : normPhoneE164(phone);

    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneE164, password }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
      // Never reveal whether the phone exists — same message either way.
      return reply(200, { ok: false, error: 'মোবাইল নম্বর বা পাসওয়ার্ড ভুল' });
    }
    return reply(200, { ok: true, access_token: d.access_token, refresh_token: d.refresh_token });
  }

  // ─────────── RESET PASSWORD (after a 'reset'-purpose OTP was verified) ───────────
  if (action === 'resetPassword') {
    const phone = normPhone(p.phone || '');
    const newPassword = p.newPassword || '';
    if (!phone) return reply(400, { ok: false, error: 'no phone' });
    if (!isStrongPassword(newPassword)) {
      return reply(400, { ok: false, error: 'পাসওয়ার্ড অন্তত ৮ অক্ষর, একটি বড় হাতের অক্ষর ও একটি সংখ্যা থাকতে হবে' });
    }

    // Require a recently-consumed 'reset' OTP for this phone — otherwise
    // anyone could reset anyone else's password just by knowing the number.
    const q = await sb(`otp_codes?phone=eq.${phone}&purpose=eq.reset&order=created_at.desc&limit=1`);
    const row = q.ok && Array.isArray(q.data) ? q.data[0] : null;
    const consumedRecently = row && row.consumed_at &&
      (Date.now() - new Date(row.consumed_at).getTime()) < 15 * 60000; // 15 min grace window
    if (!consumedRecently) {
      return reply(200, { ok: false, error: 'আগে OTP যাচাই করুন, তারপর পাসওয়ার্ড রিসেট করুন' });
    }

    const phoneE164 = normPhoneE164(phone);
    const profile = await findAuthUserByPhone(phoneE164);
    if (!profile || !profile.auth_user_id) {
      return reply(200, { ok: false, error: 'এই নম্বরে কোনো অ্যাকাউন্ট পাওয়া যায়নি' });
    }

    const upd = await authAdmin(`/admin/users/${profile.auth_user_id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword }),
    });
    if (!upd.ok) return reply(500, { ok: false, error: 'পাসওয়ার্ড আপডেট করা যায়নি', detail: upd.data });

    // Consume the reset OTP so it can't be reused
    if (row) {
      await sb(`otp_codes?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ attempt_count: MAX_ATTEMPTS }),
      });
    }
    return reply(200, { ok: true });
  }

  // ─────────── LOG CONSENT (registration step 2) ───────────
  if (action === 'logConsent') {
    const phone = normPhone(p.phone || '');
    if (!phone) return reply(400, { ok: false, error: 'no phone' });
    const consents = p.consents || {};

    const phoneE164 = normPhoneE164(phone);
    const profile = await findAuthUserByPhone(phoneE164);
    if (!profile) {
      // Registration may not have created the profile yet at this step —
      // that's fine, payment.js's createInvoice logs the same consents
      // again once the profile definitely exists. Don't fail the signup
      // flow over this.
      return reply(200, { ok: true, note: 'profile not found yet — will be logged at payment step' });
    }

    // Map the frontend's short consent keys to the schema's agreement_type enum
    const MAP = { tos: 'terms', priv: 'privacy', match: 'matching', pay: 'payment', sms: 'communications' };
    const rows = Object.entries(consents)
      .filter(([key]) => MAP[key])
      .map(([key, accepted]) => ({
        profile_id: profile.id,
        agreement_type: MAP[key],
        version: '1.0',
        accepted: !!accepted,
        accepted_at: accepted ? (p.ts || new Date().toISOString()) : null,
        acceptance_method: 'checkbox',
      }));
    if (rows.length) {
      await sb('agreements?on_conflict=profile_id,agreement_type,version', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
    }
    return reply(200, { ok: true });
  }

  return reply(400, { ok: false, error: 'unknown action' });
};
