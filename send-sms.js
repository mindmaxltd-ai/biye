// netlify/functions/send-sms.js
// ─────────────────────────────────────────────────────────────
// BIYE.COM — sms.net.bd (Alpha SMS) দিয়ে SMS পাঠায়।
// (SAR প্রজেক্টের send-sms.js থেকে পোর্ট করা — লজিক অপরিবর্তিত,
//  শুধু ব্র্যান্ডিং/ডিফল্ট মান BIYE-এর জন্য আপডেট করা হয়েছে।)
//
// Netlify env variable:
//   SMS_API_KEY   — sms.net.bd panel → API page থেকে নেওয়া key (আবশ্যক)
//
// ঐচ্ছিক:
//   SMS_SENDER_ID — masking name (যেমন 'BIYE')।
//                   approve হওয়ার আগে খালি রাখুন; তখন default sender যাবে।
//
// ব্যবহার (POST JSON):
//   { "to": "8801XXXXXXXXX", "msg": "আপনার বার্তা" }
//   একাধিক নম্বর: { "to": "8801...,8801...", "msg": "..." }
//
// দ্রুত পরীক্ষা: ব্রাউজারে এই function-এর URL খুললে (GET) status দেখাবে।
// ─────────────────────────────────────────────────────────────

const SMS_API_KEY   = process.env.SMS_API_KEY || '';
const SMS_SENDER_ID = process.env.SMS_SENDER_ID || '';   // masking approve হলে বসান

const ENDPOINT = 'https://api.sms.net.bd/sendsms';

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

// বাংলাদেশি নম্বর পরিষ্কার করে 8801XXXXXXXXX ফরম্যাটে আনে
function normalizeNumbers(raw) {
  return String(raw)
    .split(',')
    .map(n => n.trim())
    .filter(Boolean)
    .map(n => {
      n = n.replace(/[^0-9]/g, '');
      if (n.startsWith('880')) return n;
      if (n.startsWith('0'))   return '88' + n;
      if (n.startsWith('1'))   return '880' + n;
      return n;
    })
    .join(',');
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {};
    if (q.to) {
      if (!SMS_API_KEY) return reply(500, { error: 'SMS key missing' });
      const to  = normalizeNumbers(q.to);
      const msg = q.msg || 'BIYE test';
      const form = new URLSearchParams();
      form.append('api_key', SMS_API_KEY);
      form.append('msg', msg);
      form.append('to', to);
      if (SMS_SENDER_ID) form.append('sender_id', SMS_SENDER_ID);
      try {
        const r = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: form.toString(),
        });
        const raw = await r.text();
        let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
        return reply(200, { test: true, sent_to: to, message_sent: msg, http_status: r.status, provider_response: data });
      } catch (e) {
        return reply(500, { test: true, error: String((e && e.message) || e) });
      }
    }
    return reply(200, {
      ok: true,
      function: 'send-sms',
      provider: 'sms.net.bd',
      sms_api_key: SMS_API_KEY ? 'set' : 'MISSING',
      sender_id: SMS_SENDER_ID || '(none — default sender)',
      note: 'test: ?to=017XXXXXXXX&msg=BIYE test',
    });
  }

  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST only' });
  if (!SMS_API_KEY) return reply(500, { error: 'SMS key missing — Netlify env-এ SMS_API_KEY বসান' });

  let p;
  try { p = JSON.parse(event.body || '{}'); }
  catch { return reply(400, { error: 'Bad JSON' }); }

  const to  = normalizeNumbers(p.to || '');
  const msg = p.msg || p.text || '';

  if (!to)  return reply(400, { error: 'no recipient (to)' });
  if (!msg) return reply(400, { error: 'no message (msg)' });

  const form = new URLSearchParams();
  form.append('api_key', SMS_API_KEY);
  form.append('msg', msg);
  form.append('to', to);
  if (SMS_SENDER_ID) form.append('sender_id', SMS_SENDER_ID);

  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const data = await r.json().catch(() => ({}));
    if (data && data.error === 0) {
      return reply(200, { sent: true, request_id: (data.data && data.data.request_id) || null, provider_msg: data.msg || 'ok' });
    }
    return reply(200, { sent: false, error: (data && data.msg) || 'SMS failed', detail: data });
  } catch (e) {
    return reply(500, { sent: false, error: String((e && e.message) || e) });
  }
};
