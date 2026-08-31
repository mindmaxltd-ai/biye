/**
 * BIYE.LTD — analytics.js
 * Privacy-aware product analytics. Never tracks sensitive data.
 */
import { CONFIG } from './config.js';

const SAFE_EVENTS = new Set([
  'page_view','registration_started','registration_completed',
  'questionnaire_started','question_answered','questionnaire_completed',
  'match_viewed','match_saved','compatibility_viewed',
  'visualization_requested','payment_started','payment_completed',
  'login_success','logout','language_changed',
]);

const BLOCKED_FIELDS = [
  'phone','email','password','otp','nid','health','genetic',
  'body','message','answer_text','legal_name',
];

export const Analytics = {
  _queue: [],
  _consentGranted: false,

  init(consentGranted = false) {
    this._consentGranted = consentGranted;
  },

  track(event, properties = {}) {
    if (!SAFE_EVENTS.has(event)) return; // Only safe events
    if (!this._consentGranted) return;

    // Strip any sensitive fields
    const safe = {};
    Object.entries(properties).forEach(([k, v]) => {
      if (!BLOCKED_FIELDS.some(b => k.toLowerCase().includes(b))) {
        safe[k] = v;
      }
    });

    const entry = {
      event,
      properties: safe,
      lang: (() => { try { return localStorage.getItem('biye_lang') || 'bn'; } catch { return 'bn'; } })(),
      ts: new Date().toISOString(),
      env: CONFIG.APP.env,
    };

    this._queue.push(entry);
    if (CONFIG.APP.env === 'development') {
      console.debug('[BIYE Analytics]', entry);
    }
    // Flush in batches
    if (this._queue.length >= 10) this._flush();
  },

  page(pageName) { this.track('page_view', { page: pageName }); },

  async _flush() {
    const batch = [...this._queue];
    this._queue = [];
    // Send to privacy-safe analytics endpoint if configured
    // Never send to third-party without consent
    if (CONFIG.APP.env === 'production' && batch.length) {
      try {
        await fetch('/.netlify/functions/analytics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
        });
      } catch {}
    }
  },
};
