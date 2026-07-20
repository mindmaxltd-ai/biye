// ============================================================================
// BIYE.COM — Supabase Data Layer
// ============================================================================
// HOW TO CONNECT A REAL PROJECT:
// 1. Create a project at https://supabase.com
// 2. Run the SQL schema at the bottom of this file (in the Supabase SQL editor)
// 3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your project's values
//    (Settings -> API in the Supabase dashboard)
// 4. Create a Storage bucket named "kyc-documents" (private) and one named
//    "profile-photos" (public read) in Supabase Storage
//
// Until real keys are set, every page runs in DEMO MODE: all reads/writes
// go to an in-memory store (window.__BIYE_DEMO_STORE) instead of a real
// database, so the prototype still works end-to-end for demos/testing —
// but nothing is actually persisted between page loads or devices.
// ============================================================================

const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const BIYE_DEMO_MODE = SUPABASE_URL.indexOf('YOUR_') === 0 || SUPABASE_ANON_KEY.indexOf('YOUR_') === 0;

var _supaClient = null;
if (!BIYE_DEMO_MODE && typeof supabase !== 'undefined') {
  _supaClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ---------------------------------------------------------------------------
// Demo-mode in-memory store (only used when BIYE_DEMO_MODE is true)
// ---------------------------------------------------------------------------
window.__BIYE_DEMO_STORE = window.__BIYE_DEMO_STORE || {
  session: { userId: 'demo-user-001', phone: '+8801XXXXXXXXX', email: 'demo@biye.com' },
  profile: {
    id: 'demo-user-001', name: 'Demo User', kycLevel: 3, kycTotal: 7,
    misAvg: 0, photoUrl: null, createdAt: new Date().toISOString()
  },
  kycDocs: {},
  answers: {},
  matches: DEMO_MATCHES_FALLBACK()
};

function DEMO_MATCHES_FALLBACK(){
  return [
    { id:'u1', name:'Nusrat J.', age:27, city:'Dhaka', score:94, verified:true, photoUrl:null },
    { id:'u2', name:'Farhan A.', age:30, city:'Chattogram', score:89, verified:true, photoUrl:null },
    { id:'u3', name:'Mim R.', age:26, city:'Sylhet', score:85, verified:true, photoUrl:null },
    { id:'u4', name:'Tanvir H.', age:29, city:'Dhaka', score:81, verified:false, photoUrl:null },
    { id:'u5', name:'Ayesha K.', age:28, city:'Khulna', score:78, verified:true, photoUrl:null }
  ];
}

// ---------------------------------------------------------------------------
// BiyeDB — the single data-access object every page should use.
// Same method names/shapes whether running live on Supabase or in demo mode.
// ---------------------------------------------------------------------------
const BiyeDB = {

  demoMode: BIYE_DEMO_MODE,

  // ---- Auth ----
  async signUpWithPhone(phone){
    if (BIYE_DEMO_MODE) {
      window.__BIYE_DEMO_STORE.session.phone = phone;
      return { user: window.__BIYE_DEMO_STORE.session, error: null };
    }
    return await _supaClient.auth.signInWithOtp({ phone: phone });
  },

  async verifyOtp(phone, token){
    if (BIYE_DEMO_MODE) {
      return { session: window.__BIYE_DEMO_STORE.session, error: null };
    }
    return await _supaClient.auth.verifyOtp({ phone: phone, token: token, type: 'sms' });
  },

  async getCurrentUser(){
    if (BIYE_DEMO_MODE) return window.__BIYE_DEMO_STORE.session;
    const { data } = await _supaClient.auth.getUser();
    return data ? data.user : null;
  },

  async signOut(){
    if (BIYE_DEMO_MODE) return { error: null };
    return await _supaClient.auth.signOut();
  },

  // ---- Profile ----
  async getProfile(userId){
    if (BIYE_DEMO_MODE) return window.__BIYE_DEMO_STORE.profile;
    const { data, error } = await _supaClient.from('profiles').select('*').eq('id', userId).single();
    if (error) console.error('getProfile error:', error);
    return data;
  },

  async updateProfile(userId, patch){
    if (BIYE_DEMO_MODE) {
      Object.assign(window.__BIYE_DEMO_STORE.profile, patch);
      return { data: window.__BIYE_DEMO_STORE.profile, error: null };
    }
    return await _supaClient.from('profiles').update(patch).eq('id', userId);
  },

  // ---- KYC documents (Storage + verifications table) ----
  async uploadKycDocument(userId, docType, file){
    if (BIYE_DEMO_MODE) {
      window.__BIYE_DEMO_STORE.kycDocs[docType] = URL.createObjectURL(file);
      return { path: 'demo/' + docType, error: null };
    }
    const path = userId + '/' + docType + '-' + Date.now() + '.' + (file.name.split('.').pop() || 'jpg');
    const { data, error } = await _supaClient.storage.from('kyc-documents').upload(path, file);
    if (!error) {
      await _supaClient.from('verifications').insert({
        user_id: userId, doc_type: docType, storage_path: path, status: 'pending'
      });
    }
    return { data, error };
  },

  async getKycStatus(userId){
    if (BIYE_DEMO_MODE) {
      return { level: window.__BIYE_DEMO_STORE.profile.kycLevel, total: 7 };
    }
    const { data, error } = await _supaClient.from('verifications').select('*').eq('user_id', userId);
    if (error) { console.error(error); return { level: 0, total: 7 }; }
    return { level: data.filter(function(d){ return d.status === 'approved'; }).length, total: 7 };
  },

  // ---- Questionnaire answers ----
  async saveAnswer(userId, metricId, value){
    if (BIYE_DEMO_MODE) {
      window.__BIYE_DEMO_STORE.answers[metricId] = value;
      return { error: null };
    }
    return await _supaClient.from('metrics_answers').upsert({
      user_id: userId, metric_id: metricId, value: JSON.stringify(value), updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,metric_id' });
  },

  async saveAllAnswers(userId, answersObj){
    if (BIYE_DEMO_MODE) {
      Object.assign(window.__BIYE_DEMO_STORE.answers, answersObj);
      return { error: null };
    }
    const rows = Object.keys(answersObj).map(function(k){
      return { user_id: userId, metric_id: k, value: JSON.stringify(answersObj[k]), updated_at: new Date().toISOString() };
    });
    return await _supaClient.from('metrics_answers').upsert(rows, { onConflict: 'user_id,metric_id' });
  },

  async getAnswers(userId){
    if (BIYE_DEMO_MODE) return window.__BIYE_DEMO_STORE.answers;
    const { data, error } = await _supaClient.from('metrics_answers').select('*').eq('user_id', userId);
    if (error) { console.error(error); return {}; }
    const out = {};
    data.forEach(function(row){ out[row.metric_id] = JSON.parse(row.value); });
    return out;
  },

  // ---- Matches (produced by the scoring engine — see scoring.js) ----
  async getMatches(userId){
    if (BIYE_DEMO_MODE) return window.__BIYE_DEMO_STORE.matches;
    const { data, error } = await _supaClient.from('matches')
      .select('*, matched_profile:profiles!matches_matched_user_id_fkey(*)')
      .eq('user_id', userId).order('score', { ascending: false });
    if (error) { console.error(error); return []; }
    return data;
  },

  async getMatchDetail(userId, matchedUserId){
    if (BIYE_DEMO_MODE) {
      return window.__BIYE_DEMO_STORE.matches.find(function(m){ return m.id === matchedUserId; }) || null;
    }
    const { data, error } = await _supaClient.from('matches')
      .select('*, matched_profile:profiles!matches_matched_user_id_fkey(*)')
      .eq('user_id', userId).eq('matched_user_id', matchedUserId).single();
    if (error) { console.error(error); return null; }
    return data;
  },

  // ---- Consent ledger (blockchain-anchored, hash recorded on write) ----
  async logConsent(userId, action, meta){
    if (BIYE_DEMO_MODE) {
      console.log('[demo consent log]', action, meta);
      return { error: null };
    }
    return await _supaClient.from('consent_logs').insert({
      user_id: userId, action: action, meta: meta, created_at: new Date().toISOString()
    });
  }
};

// Expose on window explicitly — top-level `const` does not auto-attach to
// `window` the way `var` does, so pages loading this via <script src> need this.
window.BiyeDB = BiyeDB;
window.BIYE_DEMO_MODE = BIYE_DEMO_MODE;

// ---------------------------------------------------------------------------
// SQL schema — run this once in the Supabase SQL editor for a real project.
// ---------------------------------------------------------------------------
/*
create table profiles (
  id uuid primary key references auth.users(id),
  name text,
  phone text,
  email text,
  kyc_level int default 0,
  mis_avg numeric default 0,
  photo_url text,
  created_at timestamptz default now()
);

create table verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  doc_type text,
  storage_path text,
  status text default 'pending', -- pending | approved | rejected
  created_at timestamptz default now()
);

create table metrics_answers (
  user_id uuid references profiles(id),
  metric_id text,
  value jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, metric_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  matched_user_id uuid references profiles(id),
  score numeric,
  rule_pass boolean,
  breakdown jsonb,
  created_at timestamptz default now()
);

create table consent_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  action text,
  meta jsonb,
  created_at timestamptz default now()
);

-- Row Level Security: users should only read/write their own rows.
alter table profiles enable row level security;
alter table metrics_answers enable row level security;
alter table verifications enable row level security;
alter table consent_logs enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own answers" on metrics_answers for all using (auth.uid() = user_id);
create policy "own verifications" on verifications for all using (auth.uid() = user_id);
create policy "own consent logs" on consent_logs for all using (auth.uid() = user_id);
*/
