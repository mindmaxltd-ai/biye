/**
 * BIYE.LTD — future-life.js
 * Future-age illustrative visualization. Never predicts health, lifespan, or divorce.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { CONFIG } from './config.js';
import { I18n } from './i18n.js';
import { ErrorMonitor } from './error-monitor.js';

const VIZ_ENDPOINT = '/.netlify/functions/visualize';

export const FutureLife = {
  async requestSimulation(profileId, matchId, targetAge) {
    PrivacySecurity.assertValidUUID(profileId);
    if (!CONFIG.VISUALIZATION.allowedAges.includes(targetAge)) throw new Error('invalid_age');

    const hasConsent = await PrivacySecurity.checkConsent(profileId, 'visualization');
    if (!hasConsent) throw new Error('consent_required');

    const sim = await DB.insert('future_age_simulations', {
      profile_id: profileId,
      match_id: matchId,
      target_age: targetAge,
      consent: true,
      illustrative_only: true, // Always true
      status: 'queued',
    });

    const res = await fetch(VIZ_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'future_age', profileId, targetAge, simId: sim?.[0]?.id }),
    });
    if (!res.ok) throw new Error('sim_request_failed');
    return res.json();
  },

  async loadSimulations(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('future_age_simulations', {
      filters: { profile_id: profileId },
      order: { column: 'created_at', asc: false },
    });
  },

  renderAgeSelector(container, onSelect) {
    if (!container) return;
    container.innerHTML = '';
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', I18n.t('futureLife.selectAge'));

    CONFIG.VISUALIZATION.allowedAges.forEach(age => {
      const btn = document.createElement('button');
      btn.className = 'biye-age-btn';
      btn.textContent = `${age}`;
      btn.setAttribute('aria-label', I18n.t('futureLife.ageLabel', { age }));
      btn.addEventListener('click', () => {
        container.querySelectorAll('.biye-age-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        onSelect?.(age);
      });
      container.appendChild(btn);
    });

    // Mandatory disclaimer
    const dis = document.createElement('p');
    dis.className = 'biye-viz-disclaimer';
    dis.setAttribute('role', 'note');
    dis.textContent = CONFIG.VISUALIZATION.disclaimer;
    container.appendChild(dis);
  },
};
