/**
 * BIYE.LTD — ei-engine.js
 * Emotional Intelligence insights. Never diagnoses — only insights and discussion topics.
 */
import { DB } from './supabase.js';
import { AIOrchestrator } from './ai-orchestrator.js';
import { PrivacySecurity } from './privacy-security.js';
import { I18n } from './i18n.js';
import { ErrorMonitor } from './error-monitor.js';

export const EIEngine = {
  INSIGHT_TYPES: [
    'communication_style','emotional_needs','empathy_level',
    'repair_style','listening_style','emotional_expression','relationship_pattern',
  ],

  async loadInsights(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('ei_insights', {
      filters: { profile_id: profileId, visibility: 'private' },
      order: { column: 'created_at', asc: false },
    });
  },

  async requestAnalysis(profileId) {
    return AIOrchestrator.queueJob(profileId, null, 'ei_analysis', 6);
  },

  /** Format insight for display — no clinical language */
  formatInsight(insight) {
    if (!insight) return null;
    const LABELS = {
      communication_style: I18n.t('ei.communicationStyle'),
      emotional_needs: I18n.t('ei.emotionalNeeds'),
      empathy_level: I18n.t('ei.empathy'),
      repair_style: I18n.t('ei.repairStyle'),
      listening_style: I18n.t('ei.listeningStyle'),
    };
    return {
      type: insight.insight_type,
      label: LABELS[insight.insight_type] || insight.insight_type,
      result: insight.result,
      confidence: insight.confidence,
      disclaimer: I18n.t('ei.disclaimer'), // "This is an insight, not a diagnosis."
    };
  },

  renderInsights(container, insights) {
    if (!container) return;
    container.innerHTML = '';
    if (!insights?.length) {
      container.textContent = I18n.t('ei.noInsights');
      return;
    }
    const disclaimer = document.createElement('p');
    disclaimer.className = 'biye-ei-disclaimer';
    disclaimer.textContent = I18n.t('ei.disclaimer');
    container.appendChild(disclaimer);

    insights.forEach(raw => {
      const insight = this.formatInsight(raw);
      if (!insight) return;
      const card = document.createElement('div');
      card.className = 'biye-ei-card';
      const label = document.createElement('h3');
      label.textContent = insight.label;
      const result = document.createElement('p');
      // result.result is backend-generated text
      result.textContent = typeof insight.result === 'string' ? insight.result :
        JSON.stringify(insight.result);
      card.appendChild(label);
      card.appendChild(result);
      container.appendChild(card);
    });
  },
};
