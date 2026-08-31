/**
 * BIYE.LTD — photos.js
 * Photo upload, validation, compression, secure storage. Max: 2 passport + 3 full.
 * Limit enforced BOTH here and in DB trigger fn_validate_photo_limit().
 */
import { DB } from './supabase.js';
import { CONFIG } from './config.js';
import { PrivacySecurity } from './privacy-security.js';
import { Validation } from './validation.js';
import { ErrorMonitor } from './error-monitor.js';

async function computeHash(file) {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function compressImage(file, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })), 'image/jpeg', quality);
    };
    img.src = url;
  });
}

export const Photos = {
  async loadPhotos(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('profile_photos', {
      columns: 'id,photo_type,is_primary,visibility,moderation_status,display_order,created_at',
      filters: { profile_id: profileId },
      order: { column: 'display_order', asc: true },
    });
  },

  async getPhotoUrl(photo) {
    if (!photo?.storage_path || !photo?.storage_bucket) return null;
    return PrivacySecurity.getPhotoUrl(photo.storage_bucket, photo.storage_path, 600);
  },

  async upload(profileId, file, photoType) {
    PrivacySecurity.assertOwnProfile(profileId);

    // Client-side validation (DB trigger also enforces)
    const { ok, typeOk, sizeOk } = Validation.photoFile(file);
    if (!typeOk) throw new Error('invalid_photo_type');
    if (!sizeOk) throw new Error('photo_too_large');

    // Check current count
    await this._assertPhotoLimit(profileId, photoType);

    // Compress before upload
    const compressed = await compressImage(file);
    const hash = await computeHash(compressed);
    const ext = 'jpg';
    const path = `${profileId}/${photoType}-${Date.now()}.${ext}`;

    // Upload to private storage
    await DB.storage.uploadPrivate(CONFIG.PHOTOS.storageBucket, path, compressed);

    // Save metadata (no storage path exposed publicly)
    const row = {
      profile_id: profileId,
      photo_type: photoType,
      storage_bucket: CONFIG.PHOTOS.storageBucket,
      storage_path: path,
      cryptographic_hash: hash, // SHA-256 fingerprint — NOT encryption
      hash_algorithm: 'sha256',
      file_size: compressed.size,
      mime_type: 'image/jpeg',
      is_primary: false,
      visibility: 'private',
      moderation_status: 'pending',
      consent_status: 'granted',
      display_order: 0,
    };
    const result = await DB.insert('profile_photos', row);
    return result?.[0];
  },

  async _assertPhotoLimit(profileId, photoType) {
    const photos = await this.loadPhotos(profileId);
    const isPassport = photoType.startsWith('passport');
    const count = photos.filter(p =>
      isPassport ? p.photo_type.startsWith('passport') : p.photo_type.startsWith('full')
    ).filter(p => !p.deleted_at).length;
    const limit = isPassport ? CONFIG.PHOTOS.passport.max : CONFIG.PHOTOS.full.max;
    if (count >= limit) throw new Error(`photo_limit_exceeded:${isPassport ? 'passport' : 'full'}`);
  },

  async setPrimary(profileId, photoId) {
    PrivacySecurity.assertOwnProfile(profileId);
    // Clear other primary
    await DB.update('profile_photos', { is_primary: false }, { profile_id: profileId });
    return DB.update('profile_photos', { is_primary: true }, { id: photoId, profile_id: profileId });
  },

  async deletePhoto(profileId, photoId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('profile_photos', { deleted_at: new Date().toISOString() }, {
      id: photoId, profile_id: profileId,
    });
  },

  renderPhotoGrid(container, photos, onSelect) {
    if (!container) return;
    container.innerHTML = '';
    const slots = [...CONFIG.PHOTOS.passport.types, ...CONFIG.PHOTOS.full.types];
    slots.forEach(type => {
      const photo = photos.find(p => p.photo_type === type);
      const slot = document.createElement('div');
      slot.className = `biye-photo-slot ${photo ? 'filled' : 'empty'}`;
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-label', `${type} photo`);
      slot.tabIndex = 0;
      if (!photo) {
        const plus = document.createElement('span');
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+';
        slot.appendChild(plus);
        slot.addEventListener('click', () => onSelect?.(type));
        slot.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(type); });
      } else {
        slot.dataset.photoId = photo.id;
        const badge = document.createElement('span');
        badge.className = 'biye-photo-type-badge';
        badge.textContent = type;
        slot.appendChild(badge);
      }
      container.appendChild(slot);
    });
  },
};
