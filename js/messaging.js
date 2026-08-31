/**
 * BIYE.LTD — messaging.js
 * Conversations and messages. Access enforced by Supabase RLS — participants only.
 */
import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { Validation } from './validation.js';
import { ErrorMonitor } from './error-monitor.js';

let _msgChannel = null;

export const Messaging = {
  async loadConversations(profileId) {
    PrivacySecurity.assertValidUUID(profileId);
    try {
      const { data, error } = await DB.client
        .from('conversations')
        .select('id,match_id,status,started_at,updated_at')
        .contains('participants', [profileId])
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { ErrorMonitor.capture(e, 'messaging.loadConversations'); return []; }
  },

  async loadMessages(conversationId, { page = 0 } = {}) {
    PrivacySecurity.assertValidUUID(conversationId);
    return DB.select('messages', {
      columns: 'id,sender_profile_id,message_type,body,delivery_status,read_at,created_at',
      filters: { conversation_id: conversationId },
      order: { column: 'created_at', asc: false },
      limit: 30,
    });
  },

  async sendMessage(conversationId, senderProfileId, body, type = 'text') {
    PrivacySecurity.assertValidUUID(conversationId);
    if (!body?.trim()) throw new Error('empty_message');
    const safeBody = Validation.sanitize(body.trim().slice(0, 2000));
    return DB.insert('messages', {
      conversation_id: conversationId,
      sender_profile_id: senderProfileId,
      message_type: type,
      body: safeBody,
      delivery_status: 'sent',
    });
  },

  async markRead(conversationId, profileId) {
    return DB.update('messages', { read_at: new Date().toISOString() }, {
      conversation_id: conversationId,
    });
  },

  async deleteMessage(messageId, profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.update('messages', { deleted_at: new Date().toISOString() }, {
      id: messageId, sender_profile_id: profileId,
    });
  },

  /** Subscribe to new messages in a conversation */
  subscribeToConversation(conversationId, onNew) {
    if (_msgChannel) DB.removeChannel(_msgChannel);
    _msgChannel = DB.channel(`msgs:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, payload => { onNew?.(payload.new); })
      .subscribe();
    return _msgChannel;
  },

  unsubscribe() {
    if (_msgChannel) { DB.removeChannel(_msgChannel); _msgChannel = null; }
  },

  renderMessage(msg, isOwn) {
    const el = document.createElement('div');
    el.className = `biye-msg ${isOwn ? 'own' : 'other'}`;
    el.setAttribute('role', 'listitem');
    const bubble = document.createElement('div');
    bubble.className = 'biye-msg-bubble';
    bubble.textContent = msg.body; // textContent — safe
    const time = document.createElement('time');
    time.className = 'biye-msg-time';
    time.textContent = new Date(msg.created_at).toLocaleTimeString();
    el.appendChild(bubble);
    el.appendChild(time);
    return el;
  },
};
