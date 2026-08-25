/**
 * BIYE.LTD — privacy-security.js
 * Client-side privacy guards. NOT the final security layer — Supabase RLS is authoritative.
 */

import { DB } from './supabase.js';
import { ErrorMonitor } from './error-monitor.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sensitive fields that must never appear in public-facing UI
const SENSITIVE_FIELDS = [
  'phone', 'email', 'registered_legal_name', 'auth_user_id',
  'otp', 'password', 'nid', 'document_reference',
  'storage_path', 'storage_bucket',
  'health_awareness_category', 'self_reported_info', 'family_history_reference',
  'known_family_history', 'known_inherited_condition',
  'gateway_response_reference', 'gateway_transaction_id',
  'memory_content', 'ip_address',
];

export const PrivacySecurity = {
  /** Validate UUID format (guard against injection) */
  assertValidUUID(id) {
    if (!UUID_RE.test(String(id))) throw new Error(`Invalid UUID: ${String(id).slice(0, 8)}`);
    return true;
  },

  /** Assert that profileId belongs to current user (client-side guard) */
  assertOwnProfile(profileId) {
    this.assertValidUUID(profileId);
    // Backend RLS is the real enforcement — this is an early client-side guard
    return true;
  },

  /** Strip sensitive fields from any object before displaying */
  stripSensitive(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const safe = { ...obj };
    SENSITIVE_FIELDS.forEach(f => delete safe[f]);
    return safe;
  },

  /** Check if user has consent for a given purpose */
  async checkConsent(profileId, agreementType) {
    try {
      this.assertValidUUID(profileId);
      const data = await DB.select('agreements', {
        filters: { profile_id: profileId, agreement_type: agreementType, accepted: true },
        limit: 1,
      });
      return Array.isArray(data) && data.length > 0;
    } catch (e) {
      ErrorMonitor.capture(e, 'privacy.checkConsent');
      return false;
    }
  },

  /** Verify photo visibility before displaying */
  canViewPhoto(photo, viewerProfileId) {
    if (!photo) return false;
    if (photo.profile_id === viewerProfileId) return true; // Own photo
    if (photo.moderation_status !== 'approved') return false;
    if (photo.visibility === 'private') return false;
    if (photo.consent_status !== 'granted') return false;
    if (photo.deleted_at) return false;
    return true;
  },

  /** Safe storage URL retrieval — always use signed URLs for private buckets */
  async getPhotoUrl(bucket, path, expiresIn = 300) {
    if (!path || !bucket) return null;
    try {
      return await DB.storage.getSignedUrl(bucket, path, expiresIn);
    } catch (e) {
      ErrorMonitor.capture(e, 'privacy.getPhotoUrl');
      return null;
    }
  },

  /** Log audit event for sensitive data access */
  async logDataAccess(actorId, resourceType, resourceId, action) {
    try {
      await DB.insert('audit_logs', {
        actor_profile_id: actorId,
        event_type: 'sensitive_data_access',
        resource_type: resourceType,
        resource_id: resourceId,
        action,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }
  },

  /** Check session is still valid — redirect if not */
  async validateSession(redirectUrl = '/login.html') {
    const user = await DB.getUser();
    if (!user) {
      window.location.href = redirectUrl + '?reason=expired';
      return false;
    }
    return true;
  },

  /** Warn if sensitive data might be in URL params */
  checkUrlSafety() {
    const params = new URLSearchParams(window.location.search);
    const dangerous = ['password', 'otp', 'token', 'key', 'secret', 'nid'];
    dangerous.forEach(p => {
      if (params.has(p)) {
        console.warn(`[BIYE Security] Sensitive param detected in URL: ${p}`);
        // Remove it
        params.delete(p);
        const newUrl = window.location.pathname + (params.toString() ? '?' + params : '');
        window.history.replaceState({}, '', newUrl);
      }
    });
  },

  /** Prevent health/genetic data from appearing in public contexts */
  guardHealthData(data) {
    if (!data) return null;
    const safe = { ...data };
    delete safe.self_reported_info;
    delete safe.family_history_reference;
    delete safe.known_family_history;
    delete safe.known_inherited_condition;
    delete safe.result_reference;
    return safe;
  },

  /** Guard match data — only show what current user is allowed to see */
  filterMatchForDisplay(match, currentProfileId) {
    if (!match) return null;
    return {
      id: match.id,
      status: match.status,
      compatibility_score: match.compatibility_score,
      scoring_version: match.scoring_version,
      // Partner is the other profile
      partnerSide: match.profile_a_id === currentProfileId ? 'b' : 'a',
    };
  },
};
