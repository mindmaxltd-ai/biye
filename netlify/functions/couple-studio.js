/**
 * BIYE.LTD — couple-studio.js
 * AI couple visualization. Both consents required. Always "Illustrative Only".
 * Never calls AI APIs directly — proxies through secure backend.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { CONFIG } from './config.js';
import { I18n } from './i18n.js';
import { ErrorMonitor } from './error-monitor.js';

const VIZ_ENDPOINT = '/.netlify/functions/visualize';

export const CoupleStudio = {
  async requestVisualization(matchId, profileAId, profileBId, scene, requesterProfileId) {
    PrivacySecurity.assertValidUUID(matchId);
    PrivacySecurity.assertValidUUID(requesterProfileId);

    if (!CONFIG.VISUALIZATION.scenes.includes(scene)) throw new Error('invalid_scene');

    // Verify both consents before proceeding
    const [consentA, consentB] = await Promise.all([
      PrivacySecurity.checkConsent(profileAId, 'visualization'),
      PrivacySecurity.checkConsent(profileBId, 'visualization'),
    ]);
    if (!consentA || !consentB) throw new Error('consent_required');

    // Log request
    const req = await DB.insert('visualization_requests', {
      requester_profile_id: requesterProfileId,
      match_id: matchId,
      scene,
      status: 'queued',
      moderation_status: 'pending',
    });

    // Request backend generation
    const res = await fetch(VIZ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'couple', matchId, scene, requestId: req?.[0]?.id }),
    });
    if (!res.ok) throw new Error('viz_request_failed');
    return res.json();
  },

  async loadVisualizations(matchId) {
    PrivacySecurity.assertValidUUID(matchId);
    return DB.select('couple_visualizations', {
      filters: { match_id: matchId },
      order: { column: 'created_at', asc: false },
    });
  },

  async getAssetUrl(visualizationId) {
    PrivacySecurity.assertValidUUID(visualizationId);
    const assets = await DB.select('visualization_assets', {
      filters: { visualization_id: visualizationId, moderation_status: 'approved' },
      limit: 1,
    });
    const asset = assets?.[0];
    if (!asset) return null;
    return PrivacySecurity.getPhotoUrl(asset.storage_bucket, asset.storage_path, 300);
  },

  /** Render visualization with mandatory disclaimer */
  renderWithDisclaimer(container, imgUrl) {
    if (!container) return;
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'biye-viz-wrapper';

    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = CONFIG.VISUALIZATION.disclaimer;
    img.style.maxWidth = '100%';
    img.style.borderRadius = '16px';

    const disclaimer = document.createElement('p');
    disclaimer.className = 'biye-viz-disclaimer';
    disclaimer.setAttribute('role', 'note');
    disclaimer.textContent = CONFIG.VISUALIZATION.disclaimer; // Always shown
    disclaimer.style.cssText = 'text-align:center;font-size:.75rem;color:rgba(20,20,20,.5);margin-top:.5rem;font-style:italic';

    wrapper.appendChild(img);
    wrapper.appendChild(disclaimer);
    container.appendChild(wrapper);
  },
};
