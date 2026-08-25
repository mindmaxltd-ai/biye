// ============================================================================
// BIYE.COM — Scoring Engine
// ============================================================================
// Implements the two-layer architecture from the business blueprint:
//   1. Rule Engine (10%)  — hard gates. A candidate that fails ANY gate is
//      excluded entirely before scoring — never just "scored low".
//   2. AI Engine (90%)    — weighted similarity across the 9 MIS categories,
//      using the category weights defined in metrics-config.js.
//
// Depends on metrics-config.js being loaded first (for category weights and
// metric type/option definitions). Works standalone in Node for testing too.
// ============================================================================

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./metrics-config.js'));
  } else {
    root.BiyeScoring = factory(root.BIYE_METRICS);
  }
})(typeof self !== 'undefined' ? self : this, function (BIYE_METRICS) {

  var METRICS_BY_ID = {};
  BIYE_METRICS.metrics.forEach(function (m) { METRICS_BY_ID[m.id] = m; });

  var CATEGORY_WEIGHTS = {};
  BIYE_METRICS.categories.forEach(function (c) { CATEGORY_WEIGHTS[c.id] = c; });

  // --------------------------------------------------------------------
  // Rule Engine — hard gates (10% of the MIS; pass/fail, not a score)
  // --------------------------------------------------------------------
  var RULE_GATES = [
    {
      id: 'gender_opposite',
      labelBn: 'বিপরীত লিঙ্গ',
      labelEn: 'Opposite gender',
      check: function (user, cand) {
        return user.answers.m002 && cand.answers.m002 && user.answers.m002 !== cand.answers.m002;
      }
    },
    {
      id: 'age_range',
      labelBn: 'বয়সের ব্যবধান ১০ বছরের মধ্যে',
      labelEn: 'Age gap within 10 years',
      check: function (user, cand) {
        return Math.abs((user.answers.m001 || 0) - (cand.answers.m001 || 0)) <= 10;
      }
    },
    {
      id: 'religion_preference',
      labelBn: 'ধর্ম পছন্দের সাথে মেলে',
      labelEn: 'Matches stated religion preference',
      check: function (user, cand) {
        // Driven by the user's stated *preference* (m127), not a rigid same-religion assumption.
        // "Any" / unset preference means no filtering on this gate.
        var pref = user.answers.m127;
        if (!pref || pref === 'Any') return true;
        return cand.answers.m003 === pref;
      }
    },
    {
      id: 'criminal_consent',
      labelBn: 'ক্রিমিনাল ভেরিফিকেশনে সম্মত',
      labelEn: 'Consents to criminal verification',
      check: function (user, cand) {
        return cand.answers.m104 === true;
      }
    },
    {
      id: 'previous_marriage_preference',
      labelBn: 'পূর্ববিবাহ সংক্রান্ত পছন্দ মেলে',
      labelEn: 'Matches previously-married preference',
      check: function (user, cand) {
        // Only filters if the user has an explicit dealbreaker (m135 === false)
        // and the candidate has been previously married (m101 divorce history true).
        if (user.answers.m135 === false && cand.answers.m101 === true) return false;
        return true;
      }
    },
    {
      id: 'has_children_preference',
      labelBn: 'সন্তান সংক্রান্ত পছন্দ মেলে',
      labelEn: 'Matches has-children preference',
      check: function (user, cand) {
        if (user.answers.m136 === false && cand.answers.m121 === true) return false;
        return true;
      }
    }
  ];

  function runRuleEngine(user, candidate) {
    var failures = [];
    RULE_GATES.forEach(function (gate) {
      var ok = false;
      try { ok = !!gate.check(user, candidate); } catch (e) { ok = false; }
      if (!ok) failures.push({ id: gate.id, labelBn: gate.labelBn, labelEn: gate.labelEn });
    });
    return { passed: failures.length === 0, failures: failures };
  }

  // --------------------------------------------------------------------
  // AI Engine — per-metric similarity, rolled up into category scores
  // --------------------------------------------------------------------
  function jaccard(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || (a.length === 0 && b.length === 0)) return null;
    var setA = {}, setB = {};
    a.forEach(function (x) { setA[x] = true; });
    b.forEach(function (x) { setB[x] = true; });
    var union = {}; Object.keys(setA).forEach(function(k){union[k]=true;}); Object.keys(setB).forEach(function(k){union[k]=true;});
    var unionSize = Object.keys(union).length;
    if (unionSize === 0) return null;
    var inter = 0;
    Object.keys(setA).forEach(function (k) { if (setB[k]) inter++; });
    return inter / unionSize;
  }

  // Returns similarity in [0,1], or null if not comparable (e.g. text fields, missing data)
  function metricSimilarity(metric, valA, valB) {
    if (valA === undefined || valB === undefined || valA === null || valB === null || valA === '' || valB === '') return null;

    switch (metric.type) {
      case 'number': {
        var span = (metric.max - metric.min) || 1;
        var diff = Math.abs(Number(valA) - Number(valB));
        return Math.max(0, 1 - diff / span);
      }
      case 'scale': {
        var diff5 = Math.abs(Number(valA) - Number(valB));
        return Math.max(0, 1 - diff5 / 4);
      }
      case 'boolean':
        return valA === valB ? 1 : 0;
      case 'select':
        return valA === valB ? 1 : 0.15; // some credit even on mismatch — rarely a binary dealbreaker
      case 'multiselect':
        var j = jaccard(valA, valB);
        return j === null ? null : j;
      case 'text':
      default:
        return null; // free text isn't auto-scored
    }
  }

  // Maps each AI-scored "Partner Preference" metric to the self-attribute metric
  // on the CANDIDATE's side it should be compared against. (m127, m135, m136 are
  // handled as Rule Engine gates instead — see RULE_GATES above — so they're
  // intentionally excluded here.)
  var PREFERENCE_TO_SELF = {
    m123: 'm010', // preferred height      -> candidate's height
    m124: 'm011', // preferred weight      -> candidate's weight
    m125: 'm114', // preferred complexion  -> candidate's complexion
    m126: 'm014', // preferred min. education -> candidate's education level
    m128: 'm115', // preferred profession category -> candidate's profession category
    m129: 'm028', // preferred introvert/extrovert -> candidate's introvert/extrovert
    m130: 'm116', // prefers partner with beard -> candidate has a beard
    m131: 'm117', // preferred city        -> candidate's city
    m132: 'm118', // preferred in-country/abroad -> candidate's residence
    m133: 'm119', // diaspora acceptable   -> candidate is diaspora
    m134: 'm120', // partner owning home important -> candidate owns residence
    m137: 'm122'  // preferred family structure -> candidate's family structure
  };

  function scoreCategory(catId, userAnswers, candAnswers) {
    if (catId === 'preference') return scorePreferenceCategory(userAnswers, candAnswers);
    var metrics = BIYE_METRICS.metrics.filter(function (m) { return m.cat === catId; });
    var total = 0, count = 0;
    var perMetric = [];
    metrics.forEach(function (m) {
      var sim = metricSimilarity(m, userAnswers[m.id], candAnswers[m.id]);
      if (sim !== null) {
        total += sim;
        count++;
        perMetric.push({ id: m.id, bn: m.bn, en: m.en, similarity: Math.round(sim * 100) });
      }
    });
    var avg = count > 0 ? (total / count) : 0.5; // neutral default if nothing comparable
    perMetric.sort(function (a, b) { return b.similarity - a.similarity; });
    return { score: avg, coveredMetrics: count, totalMetrics: metrics.length, topMetrics: perMetric.slice(0, 3), weakMetrics: perMetric.slice(-3).reverse() };
  }

  // Special scorer for the "Partner Preference" category: compares the user's
  // STATED PREFERENCE (asymmetric) against the candidate's actual self-attribute,
  // using the self-metric's type/options for the similarity calculation. Two
  // preference metrics with no direct self-equivalent ("No preference" style
  // fields already handled inline) are skipped gracefully.
  function scorePreferenceCategory(userAnswers, candAnswers) {
    var prefMetrics = BIYE_METRICS.metrics.filter(function (m) { return m.cat === 'preference'; });
    var total = 0, count = 0;
    var perMetric = [];
    prefMetrics.forEach(function (pm) {
      var selfId = PREFERENCE_TO_SELF[pm.id];
      if (!selfId) return; // m127/m135/m136 -> handled by Rule Engine, not scored here
      var selfMetric = METRICS_BY_ID[selfId];
      var prefVal = userAnswers[pm.id];
      var actualVal = candAnswers[selfId];
      if (prefVal === 'No preference' || prefVal === undefined || prefVal === '') return; // no preference stated -> skip, not penalized
      var sim = metricSimilarity(selfMetric, prefVal, actualVal);
      if (sim !== null) {
        total += sim;
        count++;
        perMetric.push({ id: pm.id, bn: pm.bn, en: pm.en, similarity: Math.round(sim * 100) });
      }
    });
    var avg = count > 0 ? (total / count) : 0.5;
    perMetric.sort(function (a, b) { return b.similarity - a.similarity; });
    return { score: avg, coveredMetrics: count, totalMetrics: prefMetrics.length, topMetrics: perMetric.slice(0, 3), weakMetrics: perMetric.slice(-3).reverse() };
  }

  function runAiEngine(user, candidate) {
    var breakdown = [];
    var weightedTotal = 0;
    var weightSum = 0;

    BIYE_METRICS.categories.forEach(function (c) {
      if (c.optional) return; // social layer: informational only, not part of MIS
      var res = scoreCategory(c.id, user.answers, candidate.answers);
      var pct = Math.round(res.score * 100);
      breakdown.push({
        cat: c.id, bn: c.bn, en: c.en, color: c.color, weight: c.weight,
        score: pct, coveredMetrics: res.coveredMetrics, totalMetrics: res.totalMetrics,
        topMetrics: res.topMetrics, weakMetrics: res.weakMetrics
      });
      weightedTotal += res.score * c.weight;
      weightSum += c.weight;
    });

    var overall = weightSum > 0 ? Math.round(weightedTotal / weightSum * 100) : 0;
    breakdown.sort(function (a, b) { return b.weight - a.weight; });
    return { overall: overall, breakdown: breakdown };
  }

  // --------------------------------------------------------------------
  // Score bands (Section 4.1 of the blueprint)
  // --------------------------------------------------------------------
  function scoreBand(pct) {
    if (pct >= 90) return { bn: 'সোলমেট', en: 'Soul Match', color: 'pink' };
    if (pct >= 80) return { bn: 'চমৎকার ম্যাচ', en: 'Excellent Match', color: 'purple' };
    if (pct >= 70) return { bn: 'শক্তিশালী ম্যাচ', en: 'Strong Match', color: 'blue' };
    if (pct >= 60) return { bn: 'সম্ভাব্য ম্যাচ', en: 'Potential Match', color: 'teal' };
    return { bn: 'সুপারিশকৃত নয়', en: 'Not Recommended', color: 'grey' };
  }

  // --------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------
  function computeMatch(user, candidate) {
    var rule = runRuleEngine(user, candidate);
    if (!rule.passed) {
      return {
        candidateId: candidate.id, passed: false, ruleFailures: rule.failures,
        score: 0, band: null, breakdown: []
      };
    }
    var ai = runAiEngine(user, candidate);
    return {
      candidateId: candidate.id, passed: true, ruleFailures: [],
      score: ai.overall, band: scoreBand(ai.overall), breakdown: ai.breakdown
    };
  }

  function rankMatches(user, candidates, opts) {
    opts = opts || {};
    var includeFailed = !!opts.includeFailed;
    var results = candidates.map(function (c) {
      var r = computeMatch(user, c);
      r.profile = c;
      return r;
    });
    var passed = results.filter(function (r) { return r.passed; });
    passed.sort(function (a, b) { return b.score - a.score; });
    if (includeFailed) {
      var failed = results.filter(function (r) { return !r.passed; });
      return passed.concat(failed);
    }
    return passed;
  }

  return {
    RULE_GATES: RULE_GATES,
    computeMatch: computeMatch,
    rankMatches: rankMatches,
    scoreBand: scoreBand,
    runRuleEngine: runRuleEngine,
    runAiEngine: runAiEngine,
    _internals: { metricSimilarity: metricSimilarity, scoreCategory: scoreCategory, jaccard: jaccard }
  };
});
