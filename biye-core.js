// ═══════════════════════════════════════════════════════════════════
// BIYE CORE — একমাত্র শেয়ার্ড ডেটা লেয়ার, সব পেজ এটাই ব্যবহার করবে
// Auth (phone + password, Supabase Auth ছাড়া) + session + Supabase CRUD
// ═══════════════════════════════════════════════════════════════════
var BIYE = (function(){
  var SUPA_URL  = 'https://hjbvmzashhzazlpgjhof.supabase.co';
  var SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqYnZtemFzaGh6YXpscGdqaG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTQ4OTYsImV4cCI6MjA5OTU5MDg5Nn0.vneEXDY2P2MOnFdFJtPAms_qGq_OGU3xQeHInD5k75E';
  var _sb = null;
  if (typeof supabase !== 'undefined') _sb = supabase.createClient(SUPA_URL, SUPA_ANON);

  // ── পাসওয়ার্ড হ্যাশ (SHA-256, browser SubtleCrypto) ──
  async function sha256(str){
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,'0'); }).join('');
  }

  function normPhone(raw){
    var n = String(raw||'').replace(/[^0-9]/g,'');
    if (n.startsWith('880')) return '+' + n;
    if (n.startsWith('0'))   return '+88' + n;
    if (n.startsWith('1'))   return '+880' + n;
    return raw;
  }

  // ── Session (localStorage: biye_session) ──
  function getSession(){
    try{ return JSON.parse(localStorage.getItem('biye_session')||'null'); }
    catch(e){ return null; }
  }
  function setSession(data){ localStorage.setItem('biye_session', JSON.stringify(data)); }
  function clearSession(){ localStorage.removeItem('biye_session'); }
  function requireLogin(){
    if(!getSession()){ window.location.href = 'index.html'; return false; }
    return true;
  }
  function logout(){ clearSession(); window.location.href = 'index.html'; }

  // ── Auth: registration ও login সরাসরি profiles টেবিলে (Supabase Auth ব্যবহার হয় না,
  //    তাই কোনো confirmation ইমেইল যায় না — rate-limit সমস্যা এড়ানো হয়েছে) ──
  var auth = {
    async register(opts){
      // opts: {name, phone, age, gender, email, password}
      if(!_sb) return {error:{message:'Supabase সংযোগ নেই'}};
      var phone = normPhone(opts.phone);

      var chk = await _sb.from('profiles').select('id').eq('phone', phone).maybeSingle();
      if(chk.data) return {error:{message:'এই ফোন নম্বরে আগেই অ্যাকাউন্ট আছে'}};

      var pwHash = await sha256(opts.password);
      var uid = (crypto.randomUUID) ? crypto.randomUUID() : ('u-'+Date.now()+'-'+Math.random().toString(36).slice(2));

      var ins = await _sb.from('profiles').insert({
        id: uid, name: opts.name, phone: phone, email: opts.email||null,
        gender_hint: opts.gender||null, is_active: true, kyc_level: 0
      });
      if(ins.error) return {error: ins.error};

      var rows = [{user_id:uid, metric_id:'m_pw', value: pwHash}];
      if(opts.age) rows.push({user_id:uid, metric_id:'m001', value: opts.age});
      if(opts.gender) rows.push({user_id:uid, metric_id:'m002', value: opts.gender});
      await _sb.from('metrics_answers').upsert(rows, {onConflict:'user_id,metric_id'});

      return {uid: uid, phone: phone, error: null};
    },

    async login(phoneOrId, password){
      if(!_sb) return {error:{message:'Supabase সংযোগ নেই'}};
      var phone = normPhone(phoneOrId);

      var pr = await _sb.from('profiles').select('id,name,email,phone,kyc_level').eq('phone', phone).maybeSingle();
      if(!pr.data) return {error:{message:'এই নম্বরে কোনো অ্যাকাউন্ট নেই'}};

      var pwHash = await sha256(password);
      var pwR = await _sb.from('metrics_answers').select('value').eq('user_id',pr.data.id).eq('metric_id','m_pw').maybeSingle();
      if(!pwR.data || pwR.data.value !== pwHash) return {error:{message:'পাসওয়ার্ড ভুল'}};

      var sess = {uid:pr.data.id, phone:pr.data.phone, email:pr.data.email, name:pr.data.name};
      setSession(sess);
      return {session: sess, error: null};
    },

    async sendPhoneOtp(phone){
      var r = await fetch('/.netlify/functions/send-otp', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'send', phone: phone})
      });
      return r.json();
    },

    async verifyPhoneOtp(phone, code){
      var r = await fetch('/.netlify/functions/send-otp', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'verify', phone: phone, code: code})
      });
      return r.json();
    },

    sha256: sha256,
    normPhone: normPhone
  };

  // ── ডেটা লেয়ার — সব পেজ এখান থেকেই Supabase-এ read/write করে ──
  var db = {
    client: function(){ return _sb; },

    async getProfile(uid){
      if(!_sb) return null;
      var r = await _sb.from('profiles').select('*').eq('id',uid).single();
      return r.data || null;
    },

    async updateProfile(uid, data){
      if(!_sb) return;
      await _sb.from('profiles').update(data).eq('id',uid);
    },

    async getAnswers(uid){
      if(!_sb) return {};
      var r = await _sb.from('metrics_answers').select('metric_id,value').eq('user_id',uid);
      var out = {};
      if(r.data) r.data.forEach(function(row){
        if(row.metric_id === 'm_pw') return; // পাসওয়ার্ড হ্যাশ বাদ
        try{ out[row.metric_id] = typeof row.value==='string' ? JSON.parse(row.value) : row.value; }
        catch(e){ out[row.metric_id] = row.value; }
      });
      return out;
    },

    async saveAnswer(uid, metricId, value){
      if(!_sb) return;
      await _sb.from('metrics_answers').upsert(
        {user_id:uid, metric_id:metricId, value:value},
        {onConflict:'user_id,metric_id'}
      );
    },

    async saveAnswers(uid, answersObj){
      if(!_sb||!uid) return;
      var rows = Object.keys(answersObj).map(function(k){ return {user_id:uid, metric_id:k, value:answersObj[k]}; });
      if(rows.length) await _sb.from('metrics_answers').upsert(rows, {onConflict:'user_id,metric_id'});
    },

    // Real matches টেবিল থেকে (analyze.js / scoring.js সার্ভার-সাইড এখানে লেখে)
    async getMatches(uid){
      if(!_sb) return [];
      var r = await _sb.from('matches').select('score,matched_user_id,breakdown,rule_pass')
        .eq('user_id',uid).order('score',{ascending:false}).limit(30);
      if(!r.data || !r.data.length) return [];
      var ids = r.data.map(function(m){ return m.matched_user_id; });
      var pr = await _sb.from('profiles').select('id,name,gender_hint,kyc_level').in('id',ids);
      var pMap = {};
      if(pr.data) pr.data.forEach(function(p){ pMap[p.id]=p; });
      var ansRows = await _sb.from('metrics_answers').select('user_id,metric_id,value').in('user_id',ids).in('metric_id',['m001','m008']);
      var ageCity = {};
      if(ansRows.data) ansRows.data.forEach(function(a){
        ageCity[a.user_id] = ageCity[a.user_id]||{};
        if(a.metric_id==='m001') ageCity[a.user_id].age = a.value;
        if(a.metric_id==='m008') ageCity[a.user_id].city = a.value;
      });
      return r.data.map(function(m){
        var p = pMap[m.matched_user_id]||{};
        var extra = ageCity[m.matched_user_id]||{};
        return {
          id: m.matched_user_id, name: p.name||'User', age: extra.age||0, city: extra.city||'',
          score: m.score||0, verified: (p.kyc_level||0)>=2, gender: p.gender_hint,
          breakdown: m.breakdown, rulePass: m.rule_pass
        };
      });
    },

    async getMatchDetail(uid, matchedUid){
      if(!_sb) return null;
      var r = await _sb.from('matches').select('score,matched_user_id,breakdown,rule_pass')
        .eq('user_id',uid).eq('matched_user_id',matchedUid).single();
      if(!r.data) return null;
      var p = await _sb.from('profiles').select('id,name,gender_hint,kyc_level').eq('id',matchedUid).single();
      var ans = await this.getAnswers(matchedUid);
      return {
        id: matchedUid, name: (p.data&&p.data.name)||'User', verified: (p.data&&p.data.kyc_level>=2),
        score: r.data.score, breakdown: r.data.breakdown, rulePass: r.data.rule_pass, answers: ans
      };
    },

    async getVerifications(uid){
      if(!_sb) return [];
      var r = await _sb.from('verifications').select('doc_type,status').eq('user_id',uid);
      return r.data || [];
    },

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

    async updateKycLevel(uid, level){
      if(!_sb) return;
      await _sb.from('profiles').update({kyc_level:level}).eq('id',uid);
    },

    async logConsent(uid, action, meta){
      if(!_sb) return;
      try{ await _sb.from('consent_logs').insert({user_id:uid, action:action, meta:meta||{}}); }
      catch(e){}
    },

    async getSubscription(uid){
      if(!_sb) return null;
      var r = await _sb.from('subscriptions').select('*').eq('customer_id',uid).eq('status','active')
        .order('created_at',{ascending:false}).limit(1).maybeSingle();
      return r.data || null;
    },

    // ── Payment flow ──
    async createInvoice(customerId, packageCode){
      var r = await fetch('/.netlify/functions/payment', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'createInvoice', customer_id:customerId, package_code:packageCode})
      });
      return r.json();
    },
    async getInvoice(invoiceNumber){
      var r = await fetch('/.netlify/functions/payment', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'getInvoice', invoice_number:invoiceNumber})
      });
      return r.json();
    },
    async getReceipt(transactionId){
      var r = await fetch('/.netlify/functions/payment', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({action:'getReceipt', transaction_id:transactionId})
      });
      return r.json();
    }
  };

  return { auth: auth, db: db, getSession: getSession, setSession: setSession,
           clearSession: clearSession, requireLogin: requireLogin, logout: logout,
           sha256: sha256, normPhone: normPhone };
})();
