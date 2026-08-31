/**
 * BIYE.LTD — ai-orchestrator.js
 * Coordinates AI jobs via secure backend. NEVER calls AI APIs directly from browser.
 * No AI secrets in this file.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';

const AI_ENDPOINT = '/.netlify/functions/analyze';

export const AIOrchestrator = {
  /** Submit a job to the backend analysis queue */
  async queueJob(profileId, matchId, jobType, priority = 5) {
    if (profileId) PrivacySecurity.assertValidUUID(profileId);
    if (matchId) PrivacySecurity.assertValidUUID(matchId);
    return DB.insert('analysis_queue', {
      profile_id: profileId,
      match_id: matchId,
      job_type: jobType,
      priority,
      status: 'queued',
      scheduled_at: new Date().toISOString(),
    });
  },

  /** Trigger secure backend AI analysis */
  async requestAnalysis(type, { profileId, matchId } = {}) {
    try {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, profileId, matchId }),
      });
      if (!res.ok) throw new Error(`AI request failed: ${res.status}`);
      return res.json();
    } catch (e) {
      ErrorMonitor.capture(e, 'ai.requestAnalysis');
      throw e;
    }
  },

  /** Poll for job completion */
  async pollJob(queueId, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const job = await DB.select('analysis_queue', { filters: { id: queueId }, single: true });
      if (job?.status === 'completed') return job;
      if (job?.status === 'failed') throw new Error(job.error_message || 'Job failed');
      await new Promise(r => setTimeout(r, 2000));
    }
    throw new Error('Analysis timeout');
  },

  /** Load AI explanations for a match (already generated) */
  async loadExplanations(matchId) {
    PrivacySecurity.assertValidUUID(matchId);
    return DB.select('ai_explanations', {
      filters: { match_id: matchId, visibility: 'private' },
    });
  },

  /** Load AI memory for current user */
  async loadMemory(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('ai_memory', {
      filters: { profile_id: profileId, consent_status: 'granted' },
      columns: 'id,memory_type,source,created_at',
    });
  },

  /** Delete AI memory entry — user-controlled */
  async deleteMemory(profileId, memoryId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('ai_memory', { deleted_at: new Date().toISOString() }, {
      id: memoryId, profile_id: profileId,
    });
  },

  /** Format AI explanation safely — add mandatory disclaimer */
  formatExplanation(explanation) {
    if (!explanation) return null;
    return {
      statement: explanation.statement,
      confidence: explanation.confidence,
      limitations: explanation.limitations || 'AI analysis has limitations and is not a guarantee.',
      model: explanation.model_version,
      // Never expose internal IDs or source references directly
    };
  },
};
