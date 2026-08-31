/**
 * BIYE.LTD — resilience-engine.js
 * Relationship resilience scenarios. Never claims future certainty. No divorce prediction.
 */
import { DB } from './supabase.js';
import { AIOrchestrator } from './ai-orchestrator.js';
import { PrivacySecurity } from './privacy-security.js';
import { I18n } from './i18n.js';
import { ErrorMonitor } from './error-monitor.js';

export const ResilienceEngine = {
  SCENARIOS: [
    'job_loss','financial_crisis','illness','relocation',
    'parent_care','child_challenges','grief','retirement',
    'major_life_change','family_conflict',
  ],

  async loadResilience(profileId, matchId = null) {
    PrivacySecurity.assertValidUUID(profileId);
    const filters = { profile_id: profileId };
    if (matchId) { PrivacySecurity.assertValidUUID(matchId); filters.match_id = matchId; }
    return DB.select('relationship_resilience', { filters });
  },

  async requestAnalysis(profileId, matchId) {
    return AIOrchestrator.queueJob(profileId, matchId, 'resilience_analysis', 5);
  },

  /** Format resilience data — always include limitations */
  formatScenario(data) {
    if (!data) return null;
    return {
      scenario: data.scenario,
      scenarioLabel: I18n.t(`resilience.${data.scenario}`) || data.scenario,
      protectiveFactors: data.protective_factors,
      discussionTopics: data.discussion_topics,
      riskAwareness: data.risk_awareness,
      limitations: data.limitations || I18n.t('resilience.limitations'),
      // No divorce probability. No certainty claims.
      disclaimer: I18n.t('resilience.disclaimer'),
    };
  },

  renderScenarios(container, scenarios) {
    if (!container) return;
    container.innerHTML = '';
    const disclaimer = document.createElement('div');
    disclaimer.className = 'biye-resilience-disclaimer';
    disclaimer.setAttribute('role', 'note');
    disclaimer.textContent = I18n.t('resilience.disclaimer');
    container.appendChild(disclaimer);

    (scenarios || []).forEach(raw => {
      const sc = this.formatScenario(raw);
      if (!sc) return;
      const card = document.createElement('div');
      card.className = 'biye-resilience-card';
      const title = document.createElement('h3');
      title.textContent = sc.scenarioLabel;
      card.appendChild(title);
      if (sc.discussionTopics) {
        const topics = document.createElement('p');
        topics.className = 'biye-resilience-topics';
        topics.textContent = typeof sc.discussionTopics === 'string' ?
          sc.discussionTopics : JSON.stringify(sc.discussionTopics);
        card.appendChild(topics);
      }
      if (sc.limitations) {
        const lim = document.createElement('p');
        lim.className = 'biye-resilience-limitations';
        lim.textContent = sc.limitations;
        card.appendChild(lim);
      }
      container.appendChild(card);
    });
  },
};
