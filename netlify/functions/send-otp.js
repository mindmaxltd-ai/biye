// netlify/functions/send-otp.js
// BIYE.LTD — OTP send & verify
// Works with schema: otp_codes(id, phone, email, purpose, otp_hash, code, expires_at, attempt_count, consumed_at, created_at)

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_ANON_KEY || '';
const SMS_API_KEY  = process.env.SMS_API_KEY || '';
const SITE_URL     = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://biye.ltd';

const OTP_TTL_MIN   = 10;
const MAX_ATTEMPTS  = 5;

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
  let n = String(raw).replace(/[^0-9]/g, '');
  if (n.startsWith('880')) return n;
  if (n.startsWith('0'))   return '88' + n;
  if (n.startsWith('1'))   return '880' + n;
  return n;
}

async function sb(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',

      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  // GET — health check
  if (event.httpMethod === 'GET') {
    return reply(200, {
      ok: true,
      function: 'send-otp',
      supabase_url: SUPABASE_URL ? 'set' : 'MISSING',
      supabase_key: SUPABASE_KEY ? 'set' : 'MISSING',
      sms_api_key:  SMS_API_KEY  ? 'set' : 'MISSING',
      note: 'POST { action:"send"|"verify"|"login"|"resetPassword", phone, code? }',
    });
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return reply(500, { error: 'Supabase config missing' });

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Bad JSON' }); }

  const action  = String(p.action || '').trim();
  const phone   = normPhone(p.phone || '');
  const purpose = p.purpose || action || 'registration';

  if (!phone) return reply(400, { error: 'phone required' });

  // ── SEND OTP ──────────────────────────────────────────────
  if (action === 'send') {
    if (!SMS_API_KEY) return reply(500, { error: 'SMS_API_KEY missing' });

    const code    = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60000).toISOString();

    // Delete old OTPs for this phone
    await sb(`otp_codes?phone=eq.${phone}&consumed_at=is.null`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    // Insert new OTP — matches our schema columns
    const ins = await sb('otp_codes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        phone,
        purpose,
        code,           // plaintext for now (schema has both code + otp_hash)
        otp_hash: code, // storing same value — hash in prod if needed
        expires_at: expires,
        attempt_count: 0,
      }),
    });

    if (!ins.ok) {
      return reply(500, { error: 'Could not store OTP', detail: ins.data });
    }

    // Send SMS
    const msg = `BIYE যাচাই কোড: ${code} । ${OTP_TTL_MIN} মিনিট বৈধ। কাউকে শেয়ার করবেন না।`;
    try {
      const r = await fetch(`${SITE_URL}/.netlify/functions/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, msg }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && d.sent) {
        return reply(200, { ok: true, sent: true, phone, expires_in_min: OTP_TTL_MIN });
      }
      return reply(200, { ok: false, sent: false, error: 'SMS failed', detail: d });
    } catch (e) {
      return reply(500, { ok: false, sent: false, error: String(e && e.message || e) });
    }
  }

  // ── VERIFY OTP ────────────────────────────────────────────
  if (action === 'verify') {
    const code = String(p.code || '').trim();
    if (!code) return reply(400, { error: 'code required' });

    const q = await sb(
      `otp_codes?phone=eq.${phone}&consumed_at=is.null&order=created_at.desc&limit=1`
    );

    if (!q.ok || !Array.isArray(q.data) || !q.data.length) {
      return reply(200, { ok: false, verified: false, error: 'কোনো কোড পাওয়া যায়নি — আবার পাঠান' });
    }
    const row = q.data[0];

    if (row.attempt_count >= MAX_ATTEMPTS) {
      return reply(200, { ok: false, verified: false, error: 'অনেকবার ভুল — নতুন কোড নিন' });
    }
    if (new Date(row.expires_at) < new Date()) {
      return reply(200, { ok: false, verified: false, error: 'কোডের মেয়াদ শেষ — আবার পাঠান' });
    }

    if (row.code === code || row.otp_hash === code) {
      // Mark consumed
      await sb(`otp_codes?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
      return reply(200, { ok: true, verified: true });
    }

    // Wrong code — increment attempts
    await sb(`otp_codes?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ attempt_count: (row.attempt_count || 0) + 1 }),
    });
    const left = MAX_ATTEMPTS - (row.attempt_count + 1);
    return reply(200, { ok: false, verified: false, error: `কোড ভুল — আর ${left} বার চেষ্টা করতে পারবেন` });
  }

  // ── LOGIN (phone + password via backend) ──────────────────
  if (action === 'login') {
    const password = p.password || '';
    if (!password) return reply(400, { error: 'password required' });

    const q = await sb(`profiles?phone=eq.${phone}&select=id,display_name,profile_status&limit=1`);
    if (!q.ok || !Array.isArray(q.data) || !q.data.length) {
      return reply(200, { ok: false, error: 'এই নম্বরে কোনো অ্যাকাউন্ট নেই' });
    }
    const profile = q.data[0];

    // Password check via Supabase Auth
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone, password }),
    });
    const authData = await authRes.json().catch(() => ({}));

    if (!authRes.ok || !authData.access_token) {
      return reply(200, { ok: false, error: 'ফোন নম্বর বা পাসওয়ার্ড ভুল' });
    }

    return reply(200, {
      ok: true,
      access_token: authData.access_token,
      refresh_token: authData.refresh_token,
      profile_id: profile.id,
      display_name: profile.display_name,
    });
  }

  // ── RESET PASSWORD ────────────────────────────────────────
  if (action === 'resetPassword') {
    const newPassword = p.newPassword || '';
    if (!newPassword || newPassword.length < 8) {
      return reply(400, { error: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে' });
    }

    // Get user by phone from auth
    const listRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?filter=phone%3D${encodeURIComponent(phone)}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    const listData = await listRes.json().catch(() => ({}));
    const user = listData.users && listData.users[0];
    if (!user) return reply(200, { ok: false, error: 'ব্যবহারকারী পাওয়া যায়নি' });

    const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password: newPassword }),
    });
    const updateData = await updateRes.json().catch(() => ({}));
    if (!updateRes.ok) {
      return reply(500, { ok: false, error: 'পাসওয়ার্ড পরিবর্তন ব্যর্থ', detail: updateData });
    }
    return reply(200, { ok: true, message: 'পাসওয়ার্ড পরিবর্তন হয়েছে' });
  }

  return reply(400, { error: `unknown action: ${action}` });
};
