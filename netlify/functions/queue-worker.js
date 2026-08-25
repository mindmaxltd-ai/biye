// netlify/functions/queue-worker.js
// ═══════════════════════════════════════════════════════════════════
// BIYE.COM — Queue Worker (ported from the SAR reference; logic unchanged)
// analysis_queue থেকে PENDING jobs নিয়ে analyze.js-এ পাঠায় — প্রতিটা job
// মানে "এই customer_id-এর জন্য নতুন করে ম্যাচ স্কোর হিসেব করো (scoring.js
// দিয়ে) এবং matches টেবিলে সংরক্ষণ করো"।
//
// pg_cron (বা অন্য কোনো scheduler) নিয়মিত এই ফাংশনকে POST করে চালানো হয়।
//
// Netlify env: SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET (ঐচ্ছিক), PUBLIC_SITE
//
// SQL (Supabase SQL editor):
/*
create table analysis_queue (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id),
  analysis_date date not null default current_date,
  status text default 'PENDING',   -- PENDING | RUNNING | COMPLETED | FAILED
  priority int default 5,
  worker_name text,
  retry_count int default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);
create index on analysis_queue(analysis_date, status);
*/
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY || '';
const CRON_SECRET  = process.env.CRON_SECRET || '';
const PUBLIC_SITE  = process.env.URL || process.env.PUBLIC_SITE || 'https://biye.ltd';

const SB = {
  apikey: SERVICE_KEY,
  Authorization: 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
};

const reply = (s, b) => ({
  statusCode: s,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(b),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return reply(200, {});

  let p = {};
  try { p = JSON.parse(event.body || '{}'); } catch {}
  if (CRON_SECRET && p.secret !== CRON_SECRET) return reply(401, { error: 'Unauthorized' });
  if (!SERVICE_KEY) return reply(500, { error: 'Missing SUPABASE_SERVICE_KEY' });

  const today  = p.date  || new Date().toISOString().slice(0, 10);
  const BATCH  = Math.min(parseInt(p.batch || '5'), 20);
  const worker = `worker-${Date.now()}`;

  try {
    const jobsR = await fetch(
      `${SUPABASE_URL}/rest/v1/analysis_queue?analysis_date=eq.${today}&status=eq.PENDING&select=id,customer_id,priority&order=priority.asc,created_at.asc&limit=${BATCH}`,
      { headers: SB }
    );
    const jobs = await jobsR.json().catch(() => []);
    if (!Array.isArray(jobs) || !jobs.length) {
      return reply(200, { done: true, note: 'সব job শেষ', date: today });
    }

    const results = { ok: 0, failed: 0, errors: [] };

    for (const job of jobs) {
      await fetch(`${SUPABASE_URL}/rest/v1/analysis_queue?id=eq.${job.id}`, {
        method:  'PATCH',
        headers: { ...SB, Prefer: 'return=minimal' },
        body: JSON.stringify({ status:'RUNNING', worker_name:worker, started_at:new Date().toISOString() }),
      }).catch(() => {});

      try {
        const ar = await fetch(`${PUBLIC_SITE}/.netlify/functions/analyze`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ action: 'analyzeOne', customer_id: job.customer_id }),
        });
        const ad = await ar.json().catch(() => ({}));

        if (ad.ok) {
          await fetch(`${SUPABASE_URL}/rest/v1/analysis_queue?id=eq.${job.id}`, {
            method:  'PATCH',
            headers: { ...SB, Prefer: 'return=minimal' },
            body: JSON.stringify({ status:'COMPLETED', finished_at:new Date().toISOString() }),
          }).catch(() => {});
          results.ok++;
        } else {
          throw new Error(ad.error || 'analyze returned ok:false');
        }

      } catch (e) {
        const retryCount = (job.retry_count || 0) + 1;
        await fetch(`${SUPABASE_URL}/rest/v1/analysis_queue?id=eq.${job.id}`, {
          method:  'PATCH',
          headers: { ...SB, Prefer: 'return=minimal' },
          body: JSON.stringify({
            status:        retryCount >= 3 ? 'FAILED' : 'PENDING',
            retry_count:   retryCount,
            error_message: e.message,
            finished_at:   new Date().toISOString(),
          }),
        }).catch(() => {});
        results.failed++;
        results.errors.push({ customer_id: job.customer_id, error: e.message });
      }

      // rate limit — একই patern SAR-এ ছিল, স্কোরিং হালকা হলেও Supabase-এ চাপ কমায়
      await new Promise(r => setTimeout(r, 300));
    }

    const moreR = await fetch(
      `${SUPABASE_URL}/rest/v1/analysis_queue?analysis_date=eq.${today}&status=eq.PENDING&select=id&limit=1`,
      { headers: SB }
    );
    const more = await moreR.json().catch(() => []);
    if (Array.isArray(more) && more.length > 0) {
      fetch(`${PUBLIC_SITE}/.netlify/functions/queue-worker`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ secret:CRON_SECRET, date:today, batch:BATCH }),
      }).catch(() => {});
    }

    return reply(200, { ...results, date:today, more_pending: Array.isArray(more)&&more.length>0 });

  } catch (e) {
    return reply(500, { error: String(e.message || e) });
  }
};
