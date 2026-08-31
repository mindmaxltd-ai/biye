/**
 * BIYE.LTD — notifications.js
 * In-app, email, SMS notifications. Save ≠ auto-message.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';
import { I18n } from './i18n.js';

let _realtimeChannel = null;

export const Notifications = {
  async load(profileId, { unreadOnly = false, limit = 20 } = {}) {
    PrivacySecurity.assertValidUUID(profileId);
    const filters = { recipient_profile_id: profileId };
    if (unreadOnly) filters.read_at = null; // IS NULL
    return DB.select('notifications', {
      filters,
      order: { column: 'created_at', asc: false },
      limit,
    });
  },

  async markRead(notificationId) {
    return DB.update('notifications', { read_at: new Date().toISOString() }, { id: notificationId });
  },

  async markAllRead(profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('notifications',
      { read_at: new Date().toISOString() },
      { recipient_profile_id: profileId }
    );
  },

  /** Create a notification event (usually called by other modules) */
  async createEvent(recipientId, eventType, meta = {}) {
    try {
      PrivacySecurity.assertValidUUID(recipientId);
      await DB.insert('notifications', {
        recipient_profile_id: recipientId,
        event_type: eventType,
        title: I18n.t(`notif.${eventType}.title`),
        body: I18n.t(`notif.${eventType}.body`),
        channel: 'in_app',
        delivery_status: 'pending',
        related_match_id: meta.matchId || null,
        related_interaction_id: meta.interactionId || null,
      });
    } catch (e) { /* non-blocking */ }
  },

  async getUnreadCount(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    try {
      const { count, error } = await DB.client
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_profile_id', profileId)
        .is('read_at', null);
      if (error) throw error;
      return count || 0;
    } catch (e) { return 0; }
  },

  /** Subscribe to realtime notifications */
  subscribeRealtime(profileId, onNew) {
    PrivacySecurity.assertValidUUID(profileId);
    if (_realtimeChannel) DB.removeChannel(_realtimeChannel);
    _realtimeChannel = DB.channel(`notifs:${profileId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_profile_id=eq.${profileId}`,
      }, payload => { onNew?.(payload.new); })
      .subscribe();
    return _realtimeChannel;
  },

  unsubscribeRealtime() {
    if (_realtimeChannel) {
      DB.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
    }
  },

  renderBell(container, count) {
    if (!container) return;
    container.textContent = '';
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🔔';
    container.appendChild(icon);
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'biye-notif-badge';
      badge.setAttribute('aria-label', `${count} unread`);
      badge.textContent = count > 99 ? '99+' : count;
      container.appendChild(badge);
    }
    container.setAttribute('aria-label', `Notifications: ${count} unread`);
  },
};
