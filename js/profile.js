/**
 * BIYE.LTD — profile.js
 * Profile CRUD. Never expose restricted fields (phone, email, legal_name) publicly.
 */

import { DB } from './supabase.js';
import { Auth } from './auth.js';
import { ErrorMonitor } from './error-monitor.js';
import { PrivacySecurity } from './privacy-security.js';

// Private fields — never expose in public queries
const PRIVATE_FIELDS = ['phone', 'email', 'registered_legal_name', 'auth_user_id'];
const PUBLIC_FIELDS = 'id,display_name,gender,date_of_birth,division,district,education,profession,religion,marital_status,profile_completion,intelligence_depth,is_verified,profile_status,visibility';

export const Profile = {
  _cache: null,

  /** Load current user's own profile */
  async loadOwn() {
    const user = await DB.getUser();
    if (!user) return null;
    try {
      const data = await DB.select('profiles', {
        filters: { auth_user_id: user.id },
        single: true,
      });
      this._cache = data;
      return data;
    } catch (e) {
      ErrorMonitor.capture(e, 'profile.loadOwn');
      return null;
    }
  },

  get cached() { return this._cache; },

  /** Load safe public profile (strips private fields) */
  async loadPublic(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    try {
      const data = await DB.rpc('fn_safe_profile_access', { p_profile_id: profileId });
      return data;
    } catch (e) {
      ErrorMonitor.capture(e, 'profile.loadPublic');
      return null;
    }
  },

  /** Create profile for new user */
  async create({ displayName, gender, dateOfBirth, phone, profileOwnerType = 'self', createdByProfileId = null }) {
    const user = await DB.getUser();
    if (!user) throw new Error('not_authenticated');
    const row = {
      auth_user_id: user.id,
      display_name: displayName,
      gender,
      date_of_birth: dateOfBirth,
      phone,
      profile_owner_type: profileOwnerType,
      created_by_profile_id: createdByProfileId,
      candidate_consent_status: profileOwnerType === 'self' ? 'granted' : 'pending',
      candidate_consent_at: profileOwnerType === 'self' ? new Date().toISOString() : null,
      profile_status: 'draft',
    };
    const result = await DB.insert('profiles', row);
    this._cache = result?.[0];
    return this._cache;
  },

  /** Update profile fields */
  async update(profileId, updates) {
    PrivacySecurity.assertOwnProfile(profileId);
    // Strip any attempt to update private auth fields
    const safe = { ...updates };
    delete safe.auth_user_id;
    delete safe.id;
    safe.updated_at = new Date().toISOString();
    const result = await DB.update('profiles', safe, { id: profileId });
    if (result?.[0]) this._cache = { ...this._cache, ...result[0] };
    return result?.[0];
  },

  /** Calculate and update profile completion percentage */
  async updateCompletion(profileId) {
    const profile = this._cache || await this.loadOwn();
    if (!profile) return 0;
    const fields = ['display_name', 'gender', 'date_of_birth', 'division', 'education', 'profession', 'religion'];
    const filled = fields.filter(f => !!profile[f]).length;
    const pct = Math.round((filled / fields.length) * 100);
    await this.update(profileId, { profile_completion: pct });
    return pct;
  },

  /** Check if profile is complete enough for matching */
  isMatchReady(profile) {
    return profile?.profile_completion >= 30 && profile?.is_verified;
  },

  /** Transition parent-created profile to candidate ownership */
  async claimOwnership(profileId) {
    return this.update(profileId, {
      profile_owner_type: 'self',
      candidate_consent_status: 'granted',
      candidate_consent_at: new Date().toISOString(),
    });
  },

  /** Soft delete */
  async requestDeletion(profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return this.update(profileId, {
      profile_status: 'deleted',
      deleted_at: new Date().toISOString(),
    });
  },

  /** Safely display profile — strips private data */
  stripPrivate(profile) {
    if (!profile) return null;
    const safe = { ...profile };
    PRIVATE_FIELDS.forEach(f => delete safe[f]);
    return safe;
  },

  /** Get age from date_of_birth */
  getAge(dob) {
    if (!dob) return null;
    const ms = Date.now() - new Date(dob).getTime();
    return Math.floor(ms / (365.25 * 24 * 3600 * 1000));
  },
};
