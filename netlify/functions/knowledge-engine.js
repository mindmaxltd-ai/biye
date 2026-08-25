/**
 * BIYE.LTD — knowledge-engine.js
 * Marriage Knowledge Universe: domains, concepts, evidence, religious refs, cultural context.
 * Science, Religion, Scholarship, Culture, Myth are always kept distinct.
 */
import { DB } from './supabase.js';
import { I18n } from './i18n.js';
import { ErrorMonitor } from './error-monitor.js';

export const KnowledgeEngine = {
  async loadDomains() {
    return DB.select('knowledge_domains', { filters: { active: true }, order: { column: 'sort_order', asc: true } });
  },

  async loadSubdomains(domainId) {
    return DB.select('knowledge_subdomains', { filters: { domain_id: domainId, active: true }, order: { column: 'sort_order', asc: true } });
  },

  async loadConcepts(domainId, { subdomainId, type, page = 0 } = {}) {
    try {
      let q = DB.client.from('knowledge_concepts')
        .select('id,concept_code,name_key,description_key,concept_type,evidence_class,domain_id,subdomain_id')
        .eq('active', true).eq('domain_id', domainId)
        .range(page * 20, (page + 1) * 20 - 1);
      if (subdomainId) q = q.eq('subdomain_id', subdomainId);
      if (type) q = q.eq('concept_type', type);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) { ErrorMonitor.capture(e, 'knowledge.loadConcepts'); return []; }
  },

  async loadConcept(conceptId) {
    return DB.select('knowledge_concepts', { filters: { id: conceptId }, single: true });
  },

  async loadEvidence(conceptId) {
    try {
      const { data, error } = await DB.client
        .from('knowledge_evidence')
        .select('id,claim,evidence_type,evidence_strength,limitations,knowledge_sources(title,author,reliability_level,url)')
        .eq('concept_id', conceptId)
        .eq('review_status', 'approved');
      if (error) throw error;
      return data || [];
    } catch (e) { ErrorMonitor.capture(e, 'knowledge.loadEvidence'); return []; }
  },

  async loadReligiousRef(tradition) {
    return DB.select('knowledge_religious_references', { filters: { tradition } });
  },

  async loadCulturalContext(conceptId) {
    return DB.select('knowledge_cultural_contexts', { filters: { concept_id: conceptId } });
  },

  /** Format evidence for display — type always shown */
  formatEvidence(evidence) {
    const TYPE_LABELS = {
      scientific: { label: I18n.t('evidence.scientific'), badge: '#1565C0', important: true },
      clinical: { label: I18n.t('evidence.clinical'), badge: '#00897B', important: true },
      scriptural: { label: I18n.t('evidence.scriptural'), badge: '#6A2DA8', important: false },
      scholarly: { label: I18n.t('evidence.scholarly'), badge: '#5D4037', important: false },
      cultural: { label: I18n.t('evidence.cultural'), badge: '#E65100', important: false },
      folklore: { label: I18n.t('evidence.folklore'), badge: '#9E9E9E', important: false },
      myth: { label: I18n.t('evidence.myth'), badge: '#9E9E9E', important: false },
    };
    return evidence.map(e => ({
      ...e,
      typeInfo: TYPE_LABELS[e.evidence_type] || { label: e.evidence_type, badge: '#9E9E9E' },
    }));
  },

  /** Search concepts */
  async search(query, { domainId } = {}) {
    if (!query || query.length < 2) return [];
    try {
      let q = DB.client.from('knowledge_concepts')
        .select('id,concept_code,name_key,concept_type,domain_id')
        .eq('active', true)
        .ilike('concept_code', `%${query}%`)
        .limit(20);
      if (domainId) q = q.eq('domain_id', domainId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) { ErrorMonitor.capture(e, 'knowledge.search'); return []; }
  },
};
