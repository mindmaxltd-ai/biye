/**
 * BIYE.LTD — matching.js
 * Match retrieval, interactions (save/like/block), match views.
 * Official score always comes from backend — never calculated in browser.
 */

import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';
import { Notifications } from './notifications.js';

const PAGE_SIZE = 10;

export const Matching = {
  /** Load matches for current profile */
  async loadMatches(profileId, { page = 0, status = 'active' } = {}) {
    PrivacySecurity.assertValidUUID(profileId);
    try {
      const { data, error } = await DB.client
        .from('safe_match_summary') // Uses secure view — strips private fields
        .select('*')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return data || [];
    } catch (e) {
      ErrorMonitor.capture(e, 'matching.loadMatches');
      return [];
    }
  },

  /** Consume a match view (uses transaction-safe RPC) */
  async viewMatch(profileId, matchId, paymentId = null) {
    PrivacySecurity.assertValidUUID(profileId);
    PrivacySecurity.assertValidUUID(matchId);
    try {
      const result = await DB.rpc('fn_consume_match_view', {
        p_profile_id: profileId,
        p_match_id: matchId,
        p_payment_id: paymentId,
      });
      return result;
    } catch (e) {
      ErrorMonitor.capture(e, 'matching.viewMatch');
      throw e;
    }
  },

  /** Check remaining free views */
  async getFreeViewsRemaining(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    try {
      const data = await DB.select('available_match_views', { single: true });
      return data?.free_views_remaining ?? 0;
    } catch (e) {
      ErrorMonitor.capture(e, 'matching.getFreeViews');
      return 0;
    }
  },

  /** Record an interaction */
  async interact(actorId, targetId, type, matchId = null) {
    PrivacySecurity.assertValidUUID(actorId);
    PrivacySecurity.assertValidUUID(targetId);
    if (actorId === targetId) throw new Error('Cannot interact with own profile');

    const row = {
      actor_profile_id: actorId,
      target_profile_id: targetId,
      match_id: matchId,
      interaction_type: type,
      status: 'active',
    };

    try {
      const result = await DB.upsert('interactions', row, {
        onConflict: 'actor_profile_id,target_profile_id,interaction_type',
      });

      // Notify on save/like — but NEVER auto-start conversation
      if (['save', 'like', 'interest'].includes(type)) {
        await Notifications.createEvent(targetId, 'profile_saved', { actorId, type });
      }
      return result;
    } catch (e) {
      ErrorMonitor.capture(e, 'matching.interact');
      throw e;
    }
  },

  async saveMatch(actorId, targetId, matchId) {
    return this.interact(actorId, targetId, 'save', matchId);
  },

  async likeMatch(actorId, targetId, matchId) {
    return this.interact(actorId, targetId, 'like', matchId);
  },

  async blockProfile(actorId, targetId) {
    return this.interact(actorId, targetId, 'block', null);
  },

  async reportProfile(actorId, targetId, reason) {
    await this.interact(actorId, targetId, 'report', null);
    // Log to security_events for review
    try {
      await DB.insert('security_events', {
        profile_id: actorId,
        event_type: 'report_submitted',
        severity: 'warning',
        metadata: { target: targetId, reason },
      });
    } catch {}
  },

  /** Load saved/liked profiles */
  async loadSaved(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('interactions', {
      columns: 'id,target_profile_id,interaction_type,created_at',
      filters: { actor_profile_id: profileId, interaction_type: 'save', status: 'active' },
      order: { column: 'created_at', asc: false },
    });
  },

  /** Load blocked profiles */
  async loadBlocked(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    return DB.select('interactions', {
      columns: 'id,target_profile_id,created_at',
      filters: { actor_profile_id: profileId, interaction_type: 'block', status: 'active' },
    });
  },

  /** Remove block */
  async unblock(actorId, targetId) {
    PrivacySecurity.assertOwnProfile(actorId);
    return DB.update('interactions', { status: 'removed' }, {
      actor_profile_id: actorId,
      target_profile_id: targetId,
      interaction_type: 'block',
    });
  },

  /** Check if A and B have mutual interest */
  async checkMutualInterest(profileA, profileB) {
    const [a, b] = await Promise.all([
      DB.select('interactions', {
        filters: { actor_profile_id: profileA, target_profile_id: profileB, interaction_type: 'interest' },
        limit: 1,
      }),
      DB.select('interactions', {
        filters: { actor_profile_id: profileB, target_profile_id: profileA, interaction_type: 'interest' },
        limit: 1,
      }),
    ]);
    return a?.length > 0 && b?.length > 0;
  },
};
