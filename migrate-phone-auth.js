#!/usr/bin/env node
/**
 * BIYE.LTD — one-time migration from synthetic email login to real
 * Supabase Phone + Password authentication.
 *
 * SAFE BY DEFAULT: this script is DRY-RUN unless APPLY=1 is supplied.
 * It NEVER reads, exports, or changes passwords.
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY   (service_role key; server/terminal only)
 *
 * Usage:
 *   node migrate-phone-auth.js
 *   APPLY=1 node migrate-phone-auth.js
 */

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.env.APPLY === '1';
const PAGE_SIZE = 1000;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

function normPhone(raw) {
  let n = String(raw || '').replace(/[^0-9]/g, '');
  if (n.startsWith('880')) return n;
  if (n.startsWith('0')) return '88' + n;
  if (n.startsWith('1')) return '880' + n;
  return n;
}
function e164(raw) {
  const n = normPhone(raw);
  return n ? '+' + n : '';
}
function syntheticEmail(raw) {
  const p = e164(raw);
  return p ? `${p.replace('+', '')}@biye.ltd`.toLowerCase() : '';
}

async function rest(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function auth(path, opts = {}) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

async function getProfiles() {
  const q = 'select=id,phone,email,auth_user_id&order=id.asc';
  const r = await rest(`profiles?${q}`);
  if (!r.ok || !Array.isArray(r.data)) throw new Error(`profiles query failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data;
}

async function getAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const r = await auth(`/admin/users?page=${page}&per_page=${PAGE_SIZE}`);
    if (!r.ok || !r.data || !Array.isArray(r.data.users)) {
      throw new Error(`auth users query failed: ${r.status} ${JSON.stringify(r.data)}`);
    }
    users.push(...r.data.users);
    if (r.data.users.length < PAGE_SIZE) break;
  }
  return users;
}

function sameEmail(a, b) {
  return !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function findCandidates(profile, users) {
  const profilePhone = normPhone(profile.phone);
  const profileEmail = String(profile.email || '').trim().toLowerCase();
  const synth = syntheticEmail(profilePhone);

  const byId = profile.auth_user_id
    ? users.filter(u => String(u.id) === String(profile.auth_user_id))
    : [];
  if (byId.length === 1) {
    const u = byId[0];
    const up = normPhone(u.phone || u.user_metadata?.phone || '');
    if (!up || up === profilePhone) return { candidates: [u], reason: 'profile.auth_user_id' };
  }

  const matches = users.filter(u =>
    (u.phone && normPhone(u.phone) === profilePhone) ||
    (u.user_metadata && normPhone(u.user_metadata.phone) === profilePhone) ||
    sameEmail(u.email, profileEmail) ||
    sameEmail(u.email, synth)
  );

  return { candidates: matches, reason: 'phone/email/synthetic-email match' };
}

async function updateAuthUser(user, phone) {
  const metadata = { ...(user.user_metadata || {}), phone };
  return auth(`/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      phone,
      phone_confirm: true,
      user_metadata: metadata,
    }),
  });
}

async function updateProfile(profile, userId, phone) {
  return rest(`profiles?id=eq.${encodeURIComponent(profile.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ auth_user_id: userId, phone }),
  });
}

(async () => {
  console.log(`BIYE phone-auth migration — ${APPLY ? 'APPLY MODE' : 'DRY RUN'}`);
  if (!APPLY) console.log('No database changes will be made. Use APPLY=1 to write changes.');

  const [profiles, users] = await Promise.all([getProfiles(), getAllAuthUsers()]);
  console.log(`Profiles: ${profiles.length}; Auth users: ${users.length}`);

  let ready = 0, changed = 0, skipped = 0, conflicts = 0;

  for (const profile of profiles) {
    const phone = e164(profile.phone);
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) {
      skipped++;
      continue;
    }

    const { candidates, reason } = findCandidates(profile, users);
    if (candidates.length === 0) {
      console.log(`SKIP ${profile.id}: no Auth user found for ${phone}`);
      skipped++;
      continue;
    }
    if (candidates.length > 1) {
      console.log(`CONFLICT ${profile.id}: ${candidates.length} Auth users match ${phone}; no change`);
      conflicts++;
      continue;
    }

    const user = candidates[0];
    const occupiedByOtherPhone = user.phone && normPhone(user.phone) && normPhone(user.phone) !== normPhone(phone);
    if (occupiedByOtherPhone) {
      console.log(`CONFLICT ${profile.id}: Auth user ${user.id} already has another phone; no change`);
      conflicts++;
      continue;
    }

    const needsAuthUpdate = normPhone(user.phone || '') !== normPhone(phone) || user.phone_confirmed_at == null || normPhone(user.user_metadata?.phone || '') !== normPhone(phone);
    const needsProfileUpdate = String(profile.auth_user_id || '') !== String(user.id) || normPhone(profile.phone) !== normPhone(phone);

    if (!needsAuthUpdate && !needsProfileUpdate) {
      ready++;
      continue;
    }

    console.log(`${APPLY ? 'UPDATE' : 'WOULD UPDATE'} ${profile.id} -> Auth ${user.id} (${reason}) phone=${phone}`);

    if (APPLY) {
      const au = await updateAuthUser(user, phone);
      if (!au.ok) {
        console.log(`  Auth update FAILED: ${au.status} ${JSON.stringify(au.data)}`);
        skipped++;
        continue;
      }
      const pr = await updateProfile(profile, user.id, phone);
      if (!pr.ok) {
        console.log(`  Profile update FAILED: ${pr.status} ${JSON.stringify(pr.data)}`);
        skipped++;
        continue;
      }
      changed++;
    } else {
      changed++;
    }
  }

  console.log('--- SUMMARY ---');
  console.log({ ready, changed, skipped, conflicts, apply: APPLY });
  if (!APPLY) console.log('DRY RUN complete. Review conflicts, then run: APPLY=1 node migrate-phone-auth.js');
})().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
