// netlify/functions/send-otp.js
// ─────────────────────────────────────────────────────────────
// BIYE.LTD — OTP + অ্যাকাউন্ট (Supabase Auth) — এক ফাংশনে।
//
// actions (POST JSON):
//   send           { action:"send",   phone }                         → OTP SMS
//   verify         { action:"verify", phone, code, password? }        → OTP যাচাই;
//                    password থাকলে Supabase Auth-এ ইউজার তৈরি/আপডেট (registration)
//   resetPassword  { action:"resetPassword", phone, newPassword }     → শেষ ১০ মিনিটে
//                    OTP যাচাই হয়ে থাকলে নতুন পাসওয়ার্ড বসায়
//   link           { action:"link", access_token }                   → login-এর পর
//                    profiles.auth_user_id লিংক করে
//   logConsent     { action:"logConsent", phone, consents }          → consent_logs (best-effort)
//
// Login নিজে browser-এ supabase-js দিয়ে হয় (signInWithPassword) — প্রতিটি ইউজারের
// নিজের IP, তাই Supabase-এর rate limit সবার উপর একসাথে পড়ে না।
// ইউজারের Auth email = <8801XXXXXXXXX>@phone.biye.ltd  (ইউজার কখনো দেখে না)
//
// Netlify env:
//   SUPABASE_URL                                   (আবশ্যক)
//   SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY (আবশ্যক — admin API লাগে)
//   SMS_API_KEY                                    (send-sms.js ব্যবহার করে)
// ─────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  '';
const SMS_API_KEY = process.env.SMS_API_KEY || '';
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://biye.ltd';

const OTP_TTL_MIN = 5;
const MAX_ATTEMPTS = 5;
const VERIFIED_WINDOW_MIN = 10;          // OTP যাচাইয়ের পর কত মিনিট পাসওয়ার্ড সেট করা যাবে
const AUTH_EMAIL_DOMAIN = 'phone.biye.ltd';
const MIN_PW = 6;

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

function normPhone(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (n.startsWith('880')) return n;
  if (n.startsWith('0'))   return '88' + n;
  if (n.startsWith('1'))   return '880' + n;
  return n;
}
const validPhone = (p) => /^8801[3-9]\d{8}$/.test(p);
const authEmail = (phone) => `${phone}@${AUTH_EMAIL_DOMAIN}`;
const phoneVariants = (phone) => ['+' + phone, '0' + phone.slice(3), phone];

async function call(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
const sb   = (path, opts) => call(`${SUPABASE_URL}/rest/v1/${path}`, opts);
const auth = (path, opts) => call(`${SUPABASE_URL}/auth/v1/${path}`, opts);

// ── Auth helpers ─────────────────────────────────────────────
async function findAuthUserByEmail(email) {
  // admin list পেজ করে email দিয়ে খোঁজা (শুধু ইউজার আগে থেকে থাকলে লাগে)
  for (let page = 1; page <= 50; page++) {
    const r = await auth(`admin/users?page=${page}&per_page=1000`);
    const users = (r.data && r.data.users) || [];
    const hit = users.find(u => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 1000) break;
  }
  return null;
}

async function linkProfile(phone, userId) {
  const list = encodeURIComponent('(' + phoneVariants(phone).map(v => `"${v}"`).join(',') + ')');
  await sb(`profiles?phone=in.${list}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ auth_user_id: userId }),
  });
}

// ইউজার না থাকলে তৈরি, থাকলে পাসওয়ার্ড আপডেট। সরাসরি confirmed — কোনো ইমেইল যায় না।
async function upsertAuthUser(phone, password) {
  const email = authEmail(phone);
  const meta = { phone: '+' + phone };

  const c = await auth('admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: meta }),
  });
  let userId = c.ok && c.data && c.data.id;

  if (!userId) {
    const msg = JSON.stringify(c.data || '').toLowerCase();
    const exists = c.status === 422 || msg.includes('already') || msg.includes('exists');
    if (!exists) return { ok: false, error: 'অ্যাকাউন্ট তৈরি করা যায়নি', detail: c.data };

    const u = await findAuthUserByEmail(email);
    if (!u) return { ok: false, error: 'অ্যাকাউন্ট খুঁজে পাওয়া যায়নি' };
    const up = await auth(`admin/users/${u.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true, user_metadata: { ...(u.user_metadata || {}), ...meta } }),
    });
    if (!up.ok) return { ok: false, error: 'পাসওয়ার্ড সেট করা যায়নি', detail: up.data };
    userId = u.id;
  }

  await linkProfile(phone, userId);
  return { ok: true, user_id: userId };
}

// শেষ VERIFIED_WINDOW_MIN মিনিটে এই ফোনের OTP যাচাই হয়েছে কি না
async function recentlyVerified(phone) {
  const q = await sb(`otp_codes?phone=eq.${phone}&order=created_at.desc&limit=1`);
  const row = Array.isArray(q.data) && q.data[0];
  if (!row || !row.consumed_at) return null;
  if (Date.now() - new Date(row.consumed_at).getTime() > VERIFIED_WINDOW_MIN * 60000) return null;
  return row;
}

// ─────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  if (event.httpMethod === 'GET') {
    return reply(200, {
      ok: true,
      function: 'send-otp',
      supabase_url: SUPABASE_URL ? 'set' : 'MISSING',
      supabase_key: SUPABASE_KEY ? 'set' : 'MISSING',
      sms_api_key: SMS_API_KEY ? 'set' : 'MISSING',
      actions: ['send', 'verify', 'resetPassword', 'link', 'logConsent'],
    });
  }

  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'POST only' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return reply(500, { ok: false, error: 'Supabase config missing' });

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { ok: false, error: 'Bad JSON' }); }

  const action = String(p.action || '').trim();

  // ─────────── LINK (login-এর পর) ───────────
  if (action === 'link') {
    const token = String(p.access_token || '');
    if (!token) return reply(400, { ok: false, error: 'no token' });
    const u = await auth('user', { headers: { Authorization: 'Bearer ' + token } });
    const email = (u.ok && u.data && u.data.email) || '';
    const phone = email.endsWith('@' + AUTH_EMAIL_DOMAIN) ? email.split('@')[0] : '';
    if (!phone) return reply(401, { ok: false, error: 'invalid session' });
    await linkProfile(phone, u.data.id);
    return reply(200, { ok: true });
  }

  const phone = normPhone(p.phone);
  if (!validPhone(phone)) return reply(400, { ok: false, error: 'সঠিক মোবাইল নম্বর দিন' });

  // ─────────── SEND ───────────
  if (action === 'send') {
    if (!SMS_API_KEY) return reply(500, { ok: false, error: 'SMS_API_KEY missing' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString();

    await sb(`otp_codes?phone=eq.${phone}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });

    const ins = await sb('otp_codes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        phone, purpose: p.purpose === 'reset' ? 'reset' : 'registration',
        code, otp_hash: code, expires_at: expires, attempt_count: 0,
      }),
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
      return reply(200, { ok: false, sent: false, error: 'SMS পাঠানো যায়নি', detail: d });
    } catch (e) {
      return reply(500, { ok: false, sent: false, error: String((e && e.message) || e) });
    }
  }

  // ─────────── VERIFY (+ registration-এ অ্যাকাউন্ট তৈরি) ───────────
  if (action === 'verify') {
    const code = String(p.code || '').trim();
    const password = p.password != null ? String(p.password) : '';
    if (!code) return reply(400, { ok: false, verified: false, error: 'no code' });
    if (password && password.length < MIN_PW) {
      return reply(200, { ok: false, verified: false, error: `পাসওয়ার্ড কমপক্ষে ${MIN_PW} অক্ষরের হতে হবে` });
    }

    const q = await sb(`otp_codes?phone=eq.${phone}&order=created_at.desc&limit=1`);
    if (!q.ok || !Array.isArray(q.data) || q.data.length === 0) {
      return reply(200, { ok: false, verified: false, error: 'কোনো কোড পাওয়া যায়নি — আবার পাঠান' });
    }
    const row = q.data[0];

    if (row.consumed_at) {
      // আগেই যাচাই হয়েছে: শুধু একই কোড + সাম্প্রতিক হলে মানব (ডাবল-ক্লিক)। অন্যথায় নতুন কোড লাগবে।
      const fresh = Date.now() - new Date(row.consumed_at).getTime() <= VERIFIED_WINDOW_MIN * 60000;
      if (!(fresh && row.code === code)) {
        return reply(200, { ok: false, verified: false, error: 'এই কোড আগেই ব্যবহৃত — নতুন কোড নিন' });
      }
    } else {
      if ((row.attempt_count || 0) >= MAX_ATTEMPTS) return reply(200, { ok: false, verified: false, error: 'অনেকবার ভুল হয়েছে — নতুন কোড নিন' });
      if (new Date(row.expires_at) < new Date()) return reply(200, { ok: false, verified: false, error: 'কোডের মেয়াদ শেষ — আবার পাঠান' });

      if (row.code !== code) {
        await sb(`otp_codes?id=eq.${row.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ attempt_count: (row.attempt_count || 0) + 1 }),
        });
        const left = MAX_ATTEMPTS - ((row.attempt_count || 0) + 1);
        return reply(200, { ok: false, verified: false, error: `কোড ভুল — আর ${left} বার চেষ্টা করতে পারবেন` });
      }

      await sb(`otp_codes?id=eq.${row.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
    }

    if (password) {
      const a = await upsertAuthUser(phone, password);
      if (!a.ok) return reply(200, { ok: false, verified: false, error: a.error, detail: a.detail });
      return reply(200, { ok: true, verified: true, account: true });
    }
    return reply(200, { ok: true, verified: true });
  }

  // ─────────── RESET PASSWORD ───────────
  if (action === 'resetPassword') {
    const pw = String(p.newPassword || '');
    if (pw.length < MIN_PW) return reply(200, { ok: false, error: `পাসওয়ার্ড কমপক্ষে ${MIN_PW} অক্ষরের হতে হবে` });

    const row = await recentlyVerified(phone);
    if (!row) return reply(200, { ok: false, error: 'আগে OTP যাচাই করুন (১০ মিনিটের মধ্যে)' });

    const a = await upsertAuthUser(phone, pw);
    if (!a.ok) return reply(200, { ok: false, error: a.error, detail: a.detail });

    // একই OTP দিয়ে দ্বিতীয়বার রিসেট নয়
    await sb(`otp_codes?id=eq.${row.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return reply(200, { ok: true });
  }

  // ─────────── CONSENT LOG (best-effort) ───────────
  if (action === 'logConsent') {
    await sb('consent_logs', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ action: 'registration_consent', meta: { phone, consents: p.consents || {}, ts: p.ts || null } }),
    }).catch(() => {});
    return reply(200, { ok: true });
  }

  return reply(400, { ok: false, error: 'unknown action' });
};
