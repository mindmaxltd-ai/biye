/**
 * BIYE.LTD — scoring.js
 * Display compatibility scores. NEVER modifies official scores — backend Rule Engine is authoritative.
 */
import { DB } from './supabase.js';
import { I18n } from './i18n.js';
import { PrivacySecurity } from './privacy-security.js';

export const Scoring = {
  /** Load compatibility report for a match */
  async loadReport(matchId, direction = 'mutual') {
    PrivacySecurity.assertValidUUID(matchId);
    return DB.select('compatibility_reports', {
      filters: { match_id: matchId, direction },
      single: true,
    });
  },

  /** Load individual dimensions */
  async loadDimensions(reportId) {
    PrivacySecurity.assertValidUUID(reportId);
    return DB.select('compatibility_dimensions', {
      filters: { report_id: reportId },
      order: { column: 'score', asc: false },
    });
  },

  /** Format score for display */
  formatScore(score) {
    if (score === null || score === undefined) return I18n.t('scoring.noScore');
    const n = Number(score);
    if (isNaN(n)) return '—';
    return `${Math.round(n)}%`;
  },

  /** Get alignment label */
  alignmentLabel(level) {
    const MAP = {
      excellent: { label: I18n.t('scoring.excellent'), color: '#00A651', icon: '✦' },
      good: { label: I18n.t('scoring.good'), color: '#2E7D32', icon: '✓' },
      moderate: { label: I18n.t('scoring.moderate'), color: '#D4AF37', icon: '~' },
      low: { label: I18n.t('scoring.low'), color: '#E65100', icon: '△' },
      conflict: { label: I18n.t('scoring.conflict'), color: '#C20F5E', icon: '!' },
      unknown: { label: I18n.t('scoring.unknown'), color: '#9E9E9E', icon: '?' },
    };
    return MAP[level] || MAP.unknown;
  },

  /** Render a score ring SVG */
  renderScoreRing(container, score, size = 80) {
    if (!container) return;
    const pct = Math.min(100, Math.max(0, Number(score) || 0));
    const r = (size / 2) - 8;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    container.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${this.formatScore(score)}">
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(20,20,20,.08)" stroke-width="7"/>
        <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none"
          stroke="url(#grad)" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${size/2} ${size/2})"/>
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#E2136E"/>
            <stop offset="100%" style="stop-color:#1565C0"/>
          </linearGradient>
        </defs>
        <text x="${size/2}" y="${size/2+5}" text-anchor="middle" font-size="14" font-weight="800" fill="#1A1A1A">${Math.round(pct)}</text>
      </svg>`;
  },

  /** Display disclaimer — scores are not guarantees */
  disclaimer() {
    return I18n.t('scoring.disclaimer');
  },
};
