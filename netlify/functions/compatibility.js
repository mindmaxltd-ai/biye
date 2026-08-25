/**
 * BIYE.LTD — compatibility.js
 * Retrieve and display compatibility reports and dimensions.
 * Compatibility is informational — never claim certainty.
 */
import { DB } from './supabase.js';
import { Scoring } from './scoring.js';
import { I18n } from './i18n.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';

export const Compatibility = {
  async loadFull(matchId) {
    PrivacySecurity.assertValidUUID(matchId);
    try {
      const [report, dims, explanations] = await Promise.all([
        Scoring.loadReport(matchId, 'mutual'),
        DB.select('compatibility_dimensions', {
          filters: { report_id: matchId },
          order: { column: 'score', asc: false },
        }).catch(() => []),
        DB.select('ai_explanations', {
          filters: { match_id: matchId, visibility: 'private' },
        }).catch(() => []),
      ]);
      return { report, dims, explanations };
    } catch (e) {
      ErrorMonitor.capture(e, 'compatibility.loadFull');
      return { report: null, dims: [], explanations: [] };
    }
  },

  /** Render dimensions list into container */
  renderDimensions(container, dims) {
    if (!container) return;
    container.innerHTML = '';
    if (!dims?.length) {
      container.textContent = I18n.t('compatibility.noDims');
      return;
    }
    dims.forEach(dim => {
      const row = document.createElement('div');
      row.className = 'biye-compat-dim';
      row.setAttribute('role', 'listitem');
      const align = Scoring.alignmentLabel(dim.alignment_level);

      const nameEl = document.createElement('span');
      nameEl.className = 'biye-dim-name';
      nameEl.textContent = I18n.t(`dim.${dim.dimension_code}`) || dim.dimension_code;

      const barWrap = document.createElement('div');
      barWrap.className = 'biye-dim-bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'biye-dim-bar';
      bar.style.cssText = `width:${dim.score || 0}%;background:${align.color};border-radius:4px;height:6px`;
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuenow', dim.score || 0);
      bar.setAttribute('aria-label', `${nameEl.textContent}: ${dim.score || 0}%`);
      barWrap.appendChild(bar);

      const scoreEl = document.createElement('span');
      scoreEl.className = 'biye-dim-score';
      scoreEl.textContent = Scoring.formatScore(dim.score);
      scoreEl.style.color = align.color;

      row.appendChild(nameEl);
      row.appendChild(barWrap);
      row.appendChild(scoreEl);

      if (dim.explanation) {
        const tip = document.createElement('p');
        tip.className = 'biye-dim-tip';
        tip.textContent = dim.explanation; // Backend-generated text
        row.appendChild(tip);
      }
      container.appendChild(row);
    });
  },

  /** Show information gap notice */
  renderInfoGaps(container, completeness) {
    if (!container || completeness >= 0.8) return;
    const notice = document.createElement('div');
    notice.className = 'biye-compat-gap-notice';
    notice.setAttribute('role', 'note');
    notice.textContent = I18n.t('compatibility.gapNotice');
    container.prepend(notice);
  },
};
