/**
 * BIYE.LTD — preferences.js
 * Manages 30+ Desired Partner Priorities. Row-based, not hard-coded columns.
 */

import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';

export const Preferences = {
  /** Load all preferences for a profile */
  async load(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('user_preferences', {
      filters: { profile_id: profileId, active: true },
      order: { column: 'priority_rank', asc: true },
    });
  },

  /** Save or update a preference */
  async save(profileId, { preferenceCode, category, valueType = 'text', value, priorityRank, importance = 'flexible', source = 'self' }) {
    PrivacySecurity.assertOwnProfile(profileId);
    const row = {
      profile_id: profileId,
      preference_category: category,
      preference_code: preferenceCode,
      value_type: valueType,
      [valueType === 'number' ? 'value_number' : valueType === 'range' ? 'value_json' : 'value_text']:
        valueType === 'range' ? JSON.stringify(value) : value,
      priority_rank: priorityRank,
      importance,
      preference_strength: importance,
      preference_source: source,
      candidate_confirmed: source === 'self',
      active: true,
    };
    return DB.upsert('user_preferences', row, {
      onConflict: 'profile_id,preference_code,preference_source',
    });
  },

  /** Bulk save (used for onboarding 30-priority flow) */
  async saveBulk(profileId, prefs) {
    PrivacySecurity.assertOwnProfile(profileId);
    const rows = prefs.map((p, i) => ({
      profile_id: profileId,
      preference_category: p.category,
      preference_code: p.preferenceCode,
      value_type: p.valueType || 'text',
      value_text: p.valueType !== 'number' && p.valueType !== 'range' ? p.value : null,
      value_number: p.valueType === 'number' ? p.value : null,
      value_json: p.valueType === 'range' ? JSON.stringify(p.value) : null,
      priority_rank: p.priorityRank ?? i + 1,
      importance: p.importance || 'flexible',
      preference_strength: p.importance || 'flexible',
      preference_source: p.source || 'self',
      candidate_confirmed: (p.source || 'self') === 'self',
      active: true,
    }));
    return DB.upsert('user_preferences', rows, {
      onConflict: 'profile_id,preference_code,preference_source',
    });
  },

  /** Delete a preference */
  async remove(profileId, preferenceCode) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('user_preferences', { active: false }, {
      profile_id: profileId,
      preference_code: preferenceCode,
    });
  },

  /** Reorder priorities */
  async reorder(profileId, orderedCodes) {
    PrivacySecurity.assertOwnProfile(profileId);
    const updates = orderedCodes.map((code, i) =>
      DB.update('user_preferences', { priority_rank: i + 1 }, {
        profile_id: profileId, preference_code: code,
      })
    );
    return Promise.all(updates);
  },

  /** Confirm parent-entered preference as candidate's own */
  async confirmPreference(profileId, preferenceCode) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('user_preferences', { candidate_confirmed: true }, {
      profile_id: profileId, preference_code: preferenceCode,
    });
  },

  /** Standard 30 priority codes (seed list for UI) */
  STANDARD_CODES: [
    { code: 'pref.age', category: 'values', label: 'বয়স / Age', valueType: 'range' },
    { code: 'pref.height', category: 'values', label: 'উচ্চতা / Height', valueType: 'range' },
    { code: 'pref.education', category: 'values', label: 'শিক্ষা / Education', valueType: 'text' },
    { code: 'pref.profession', category: 'career', label: 'পেশা / Profession', valueType: 'text' },
    { code: 'pref.religion', category: 'religion', label: 'ধর্ম / Religion', valueType: 'text' },
    { code: 'pref.practice_level', category: 'religion', label: 'ধর্মচর্চা / Practice', valueType: 'text' },
    { code: 'pref.location', category: 'values', label: 'অবস্থান / Location', valueType: 'text' },
    { code: 'pref.appearance', category: 'values', label: 'চেহারা / Appearance', valueType: 'text' },
    { code: 'pref.family_values', category: 'family', label: 'পারিবারিক মূল্যবোধ / Family Values', valueType: 'text' },
    { code: 'pref.communication', category: 'communication', label: 'যোগাযোগ / Communication', valueType: 'text' },
    { code: 'pref.emotional_maturity', category: 'psychology', label: 'আবেগীয় পরিপক্কতা / EI', valueType: 'text' },
    { code: 'pref.finance', category: 'finance', label: 'আর্থিক স্থিতি / Finance', valueType: 'text' },
    { code: 'pref.children_desire', category: 'children', label: 'সন্তান পরিকল্পনা / Children', valueType: 'text' },
    { code: 'pref.parenting_style', category: 'parenting', label: 'সন্তান লালন-পালন / Parenting', valueType: 'text' },
    { code: 'pref.career_ambition', category: 'career', label: 'ক্যারিয়ার / Career', valueType: 'text' },
    { code: 'pref.lifestyle', category: 'values', label: 'জীবনধারা / Lifestyle', valueType: 'text' },
    { code: 'pref.trust', category: 'trust', label: 'বিশ্বাস / Trust', valueType: 'text' },
    { code: 'pref.commitment', category: 'values', label: 'প্রতিশ্রুতি / Commitment', valueType: 'text' },
    { code: 'pref.companionship', category: 'companionship', label: 'সঙ্গ / Companionship', valueType: 'text' },
    { code: 'pref.aging_attitude', category: 'aging', label: 'বার্ধক্য দৃষ্টিভঙ্গি / Aging', valueType: 'text' },
    { code: 'pref.retirement', category: 'retirement', label: 'অবসর পরিকল্পনা / Retirement', valueType: 'text' },
    { code: 'pref.resilience', category: 'resilience', label: 'স্থিতিস্থাপকতা / Resilience', valueType: 'text' },
    { code: 'pref.life_philosophy', category: 'values', label: 'জীবনদর্শন / Philosophy', valueType: 'text' },
    { code: 'pref.culture', category: 'culture', label: 'সংস্কৃতি / Culture', valueType: 'text' },
    { code: 'pref.humor', category: 'values', label: 'হাস্যরস / Humor', valueType: 'text' },
    { code: 'pref.conflict_style', category: 'conflict', label: 'দ্বন্দ্ব সমাধান / Conflict', valueType: 'text' },
    { code: 'pref.digital_habits', category: 'digital_life', label: 'ডিজিটাল অভ্যাস / Digital', valueType: 'text' },
    { code: 'pref.caregiving', category: 'caregiving', label: 'সেবা / Caregiving', valueType: 'text' },
    { code: 'pref.migration_open', category: 'migration', label: 'বিদেশে যাওয়া / Migration', valueType: 'text' },
    { code: 'pref.character', category: 'values', label: 'চরিত্র / Character', valueType: 'text' },
  ],
};
