// netlify/functions/analyze.js
// ═══════════════════════════════════════════════════════════════════
// BIYE.COM — Match Analysis (server-side)
//
// This is BIYE's equivalent of SAR's analyze.js + sar_rule_engine.js —
// but instead of porting SAR's 75KB *health*-analysis rule engine
// (irrelevant to a matrimonial platform), this function simply runs
// BIYE's OWN existing Rule Engine + AI Engine — scoring.js — server-side,
// against real candidate data pulled from Supabase, instead of the
// browser-only mock-data.js used for the client-side prototype pages.
//
// Same architecture pattern as SAR (queue-worker.js dispatches jobs here,
// one customer_id at a time), just a different scoring engine underneath.
//
// REPO LAYOUT THIS ASSUMES:
//   /metrics-config.js     (repo root, also used by questionnaire.html etc.)
//   /scoring.js            (repo root, also used by match-feed.html etc.)
//   /netlify/functions/analyze.js   (this file)
// If your Netlify function bundler needs a different relative path,
// adjust the two require() lines below accordingly.
//
// Netlify env: SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// Uses the `matches` and `metrics_answers` tables already defined in
// supabase-client.js's schema comment — no new tables needed.
// ═══════════════════════════════════════════════════════════════════

const BIYE_METRICS = require('../metrics-config.js');
const BiyeScoring   = require('../scoring.js');

const SUPA_URL = process.env.SUPABASE_URL || '';
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SB = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' };

// একবারে সর্বোচ্চ কতজন opposite-gender candidate-এর বিপরীতে স্কোর করা হবে।
// পুরো ইউজারবেসের বিপরীতে করলে বড় স্কেলে খরচ/সময় বেড়ে যাবে — বাস্তবে এখানে
// শহর/বয়স-রেঞ্জ দিয়ে candidate pool আগে থেকে সংকুচিত করাই ভালো অনুশীলন
// (নিচের candidatePool() ফাংশনে সেই জায়গাটা চিহ্নিত করা আছে)।
const CANDIDATE_POOL_LIMIT = 300;
const TOP_MATCHES_TO_SAVE = 30; // rank করার পর শুধু সেরা ৩০টা matches টেবিলে রাখি

exports.handler = async (event) => {
  if (!SUPA_KEY) { console.error('Missing SUPABASE_SERVICE_KEY'); return { statusCode: 500, body: 'Missing SUPABASE_SERVICE_KEY' }; }

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  try {
    if (body.action === 'analyzeOne' && body.customer_id) {
      const result = await analyzeOne(body.customer_id);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    }
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: 'expected {action:"analyzeOne", customer_id}' }) };
  } catch (e) {
    console.error('analyze fatal error:', e.message);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};

async function analyzeOne(customerId) {
  const user = await loadProfileWithAnswers(customerId);
  if (!user) return { ok: false, error: 'customer not found: ' + customerId };
  if (!user.answers || !user.answers.m002) {
    return { ok: false, error: 'customer has not completed enough of the questionnaire yet (missing gender/m002)' };
  }

  const candidates = await candidatePool(user);
  if (candidates.length === 0) {
    return { ok: true, customer_id: customerId, matches_saved: 0, note: 'no eligible candidates in pool' };
  }

  const ranked = BiyeScoring.rankMatches(user, candidates, { includeFailed: false });
  const top = ranked.slice(0, TOP_MATCHES_TO_SAVE);

  // Idempotent upsert: প্রতিদিন re-run করলে পুরনো স্কোর ওভাররাইট হবে, ডুপ্লিকেট রো জমবে না।
  // (matches টেবিলে (user_id, matched_user_id) ইউনিক কনস্ট্রেইন্ট থাকা দরকার — নিচের
  //  SQL কমেন্টে যোগ করা আছে।)
  const rows = top.map(r => ({
    user_id: user.id,
    matched_user_id: r.profile.id,
    score: r.score,
    rule_pass: true,
    breakdown: r.breakdown,
    created_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    await sbUpsert('matches', rows, 'user_id,matched_user_id');
  }

  return { ok: true, customer_id: customerId, candidates_scored: candidates.length, matches_saved: rows.length, top_score: top[0] ? top[0].score : null };
}

// ── ইউজারের প্রোফাইল + metrics_answers একত্র করে scoring.js-এর প্রত্যাশিত
//    { id, answers: {m001: val, ...} } আকারে সাজায় ──
async function loadProfileWithAnswers(customerId) {
  const prof = await sbGetOne(`/rest/v1/profiles?id=eq.${customerId}&select=id,name,gender_hint&limit=1`);
  if (!prof) return null;
  const answers = await loadAnswers(customerId);
  return { id: prof.id, name: prof.name, answers };
}

async function loadAnswers(customerId) {
  const rows = await sbGet(`/rest/v1/metrics_answers?user_id=eq.${customerId}&select=metric_id,value`);
  const out = {};
  if (Array.isArray(rows)) {
    for (const row of rows) {
      // supabase-client.js যেভাবে সেভ করে (JSON.stringify করে jsonb কলামে),
      // সেভাবেই এখানে ফেরত পার্স করা হচ্ছে — দুই জায়গার এনকোডিং মিলিয়ে রাখা জরুরি।
      try { out[row.metric_id] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
      catch { out[row.metric_id] = row.value; }
    }
  }
  return out;
}

// ── candidate pool: বিপরীত লিঙ্গ, active, ইউজার বাদে — Rule Engine বাকিটা
//    ফিল্টার করবে (ধর্ম, বয়স, ইত্যাদি)। বড় স্কেলে এখানেই শহর/বয়স-রেঞ্জ
//    দিয়ে prefilter করলে খরচ অনেক কমবে — এখন শুধু gender+active দিয়ে সংকুচিত। ──
async function candidatePool(user) {
  const myGender = user.answers.m002;
  const oppositeGender = myGender === 'Male' ? 'Female' : 'Male';

  const profiles = await sbGet(
    `/rest/v1/profiles?id=neq.${user.id}&is_active=eq.true&select=id,name&limit=${CANDIDATE_POOL_LIMIT}`
  );
  if (!Array.isArray(profiles) || profiles.length === 0) return [];

  const withAnswers = await Promise.all(profiles.map(async (p) => {
    const answers = await loadAnswers(p.id);
    return { id: p.id, name: p.name, answers };
  }));

  // gender ফিল্টার এখানেই করে ফেলি (DB কলাম না থাকায় metrics_answers থেকে
  // পড়তে হচ্ছে; আসল প্রোডাকশনে profiles টেবিলে একটা indexed gender কলাম
  // থাকলে এই ধাপ আরও দ্রুত হবে)
  return withAnswers.filter(c => c.answers.m002 === oppositeGender);
}

async function sbGet(path) {
  const r = await fetch(`${SUPA_URL}${path}`, { headers: SB });
  return r.json().catch(() => []);
}
async function sbGetOne(path) {
  const d = await sbGet(path);
  return Array.isArray(d) ? d[0] : null;
}
async function sbUpsert(table, rows, conflictCols) {
  await fetch(`${SUPA_URL}/rest/v1/${table}?on_conflict=${conflictCols}`, {
    method: 'POST',
    headers: { ...SB, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  }).catch(e => console.error('sbUpsert error:', e.message));
}

/* SQL — add a uniqueness constraint so the upsert above is truly idempotent:
alter table matches add constraint matches_user_matched_unique unique (user_id, matched_user_id);
*/
