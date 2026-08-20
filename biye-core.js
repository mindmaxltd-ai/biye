// ═══════════════════════════════════════════════════════
// BIYE CORE — Shared across all pages
// Supabase connection + session + user data
// ═══════════════════════════════════════════════════════
var BIYE = (function(){
  var SUPA_URL  = 'https://hjbvmzashhzazlpgjhof.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqYnZtemFzaGh6YXpscGdqaG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTQ4OTYsImV4cCI6MjA5OTU5MDg5Nn0.vneEXDY2P2MOnFdFJtPAms_qGq_OGU3xQeHInD5k75E';
  var _sb = null;
  if(typeof supabase !== 'undefined') _sb = supabase.createClient(SUPA_URL, SUPA_ANON);

  // ── Session ──
  function getSession(){
    try{ return JSON.parse(localStorage.getItem('biye_session')||'null'); }
    catch(e){ return null; }
  }
  function setSession(data){ localStorage.setItem('biye_session', JSON.stringify(data)); }
  function clearSession(){ localStorage.removeItem('biye_session'); }
  function requireLogin(){
    if(!getSession()){ window.location.href='index.html'; return false; }
    return true;
  }

  // ── Supabase helpers ──
  var db = {
    // Get current user profile
    async getProfile(uid){
      if(!_sb) return null;
      var r = await _sb.from('profiles').select('*').eq('id',uid).single();
      return r.data || null;
    },

    // Update profile
    async updateProfile(uid, data){
      if(!_sb) return;
      await _sb.from('profiles').update(data).eq('id',uid);
    },

    // Get all metrics answers
    async getAnswers(uid){
      if(!_sb) return {};
      var r = await _sb.from('metrics_answers').select('metric_id,value').eq('user_id',uid);
      var out = {};
      if(r.data) r.data.forEach(function(row){
        try{ out[row.metric_id] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; }
        catch(e){ out[row.metric_id] = row.value; }
      });
      return out;
    },

    // Save single answer
    async saveAnswer(uid, metricId, value){
      if(!_sb) return;
      await _sb.from('metrics_answers').upsert(
        {user_id:uid, metric_id:metricId, value:value},
        {onConflict:'user_id,metric_id'}
      );
    },

    // Save multiple answers at once
    async saveAnswers(uid, answersObj){
      if(!_sb||!uid) return;
      var rows = Object.keys(answersObj).map(function(k){
        return {user_id:uid, metric_id:k, value:answersObj[k]};
      });
      if(rows.length) await _sb.from('metrics_answers').upsert(rows,{onConflict:'user_id,metric_id'});
    },

    // Get matches
    async getMatches(uid){
      if(!_sb) return [];
      var r = await _sb.from('matches').select('score,matched_user_id,breakdown').eq('user_id',uid).order('score',{ascending:false}).limit(20);
      if(!r.data||!r.data.length) return [];
      var ids = r.data.map(function(m){return m.matched_user_id;});
      var pr = await _sb.from('profiles').select('id,name,gender_hint,kyc_level').in('id',ids);
      var pMap = {};
      if(pr.data) pr.data.forEach(function(p){pMap[p.id]=p;});
      return r.data.map(function(m){
        var p = pMap[m.matched_user_id]||{};
        return {id:m.matched_user_id, name:p.name||'User', score:m.score||0, verified:(p.kyc_level||0)>=2, gender:p.gender_hint, breakdown:m.breakdown};
      });
    },

    // Get KYC/verifications status
    async getVerifications(uid){
      if(!_sb) return [];
      var r = await _sb.from('verifications').select('doc_type,status').eq('user_id',uid);
      return r.data || [];
    },

    // Upload KYC doc
    async uploadKycDoc(uid, docType, file){
      if(!_sb) return null;
      var ext = file.name.split('.').pop()||'jpg';
      var path = uid+'/'+docType+'-'+Date.now()+'.'+ext;
      var up = await _sb.storage.from('kyc-documents').upload(path, file, {upsert:true});
      if(up.error) throw new Error(up.error.message);
      await _sb.from('verifications').upsert(
        {user_id:uid, doc_type:docType, storage_path:path, status:'pending'},
        {onConflict:'user_id,doc_type'}
      );
      return path;
    },

    // Update KYC level
    async updateKycLevel(uid, level){
      if(!_sb) return;
      await _sb.from('profiles').update({kyc_level:level}).eq('id',uid);
    },

    // Log consent
    async logConsent(uid, action, meta){
      if(!_sb) return;
      try{ await _sb.from('consent_logs').insert({user_id:uid, action:action, meta:meta||{}}); }
      catch(e){}
    },

    // Get subscriptions
    async getSubscription(uid){
      if(!_sb) return null;
      var r = await _sb.from('subscriptions').select('*').eq('customer_id',uid).eq('status','active').order('created_at',{ascending:false}).limit(1).single();
      return r.data || null;
    },

    // Raw supabase client (for advanced use)
    client: function(){ return _sb; }
  };

  function logout(){
    clearSession();
    window.location.href = 'index.html';
  }

  return {
    db: db,
    getSession: getSession,
    setSession: setSession,
    requireLogin: requireLogin,
    logout: logout
  };
})();
