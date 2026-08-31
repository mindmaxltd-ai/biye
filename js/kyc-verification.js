/**
 * BIYE.LTD — kyc-verification.js
 * KYC form, document upload, verification status. Documents always private.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { Validation } from './validation.js';
import { ErrorMonitor } from './error-monitor.js';
import { CONFIG } from './config.js';

export const KYCVerification = {
  async loadStatus(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('verification', {
      filters: { profile_id: profileId },
      order: { column: 'created_at', asc: false },
    });
  },

  async submitDocumentRef(profileId, type, documentStoragePath, meta = {}) {
    PrivacySecurity.assertOwnProfile(profileId);
    // Only store reference — actual document in private storage
    return DB.insert('verification', {
      profile_id: profileId,
      verification_type: type,
      status: 'pending',
      document_reference: documentStoragePath, // Private path only
      submitted_at: new Date().toISOString(),
      metadata: meta,
    });
  },

  async uploadDocument(profileId, file, type) {
    PrivacySecurity.assertOwnProfile(profileId);
    const { typeOk } = Validation.photoFile(file);
    if (!typeOk) throw new Error('invalid_document_type');

    const path = `kyc/${profileId}/${type}-${Date.now()}.jpg`;
    await DB.storage.uploadPrivate('kyc-documents', path, file);
    // Store only the reference — never expose the path publicly
    return this.submitDocumentRef(profileId, type, path);
  },

  /** Distinguished display name vs legal name */
  async updateLegalName(profileId, legalName) {
    PrivacySecurity.assertOwnProfile(profileId);
    if (!Validation.name(legalName)) throw new Error('invalid_name');
    return DB.update('profiles', { registered_legal_name: legalName }, { id: profileId });
  },

  renderStatusBadge(status) {
    const MAP = {
      not_submitted: { label: 'Not Submitted', color: '#9E9E9E' },
      pending: { label: 'Pending Review', color: '#D4AF37' },
      under_review: { label: 'Under Review', color: '#1565C0' },
      verified: { label: 'Verified ✓', color: '#00A651' },
      rejected: { label: 'Rejected', color: '#C20F5E' },
    };
    const info = MAP[status] || MAP.not_submitted;
    const badge = document.createElement('span');
    badge.className = 'biye-kyc-badge';
    badge.textContent = info.label;
    badge.style.cssText = `background:${info.color}20;color:${info.color};padding:.2rem .65rem;border-radius:50px;font-size:.75rem;font-weight:700`;
    return badge;
  },
};
