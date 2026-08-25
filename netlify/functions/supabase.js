/**
 * BIYE.LTD — supabase.js
 * Central Supabase client. Single source of truth for all DB communication.
 * Never initialize Supabase elsewhere.
 */

import { CONFIG } from './config.js';
import { ErrorMonitor } from './error-monitor.js';

let _client = null;

/** Initialize and return singleton Supabase client */
function getClient() {
  if (_client) return _client;
  if (!window.supabase) throw new Error('Supabase SDK not loaded');
  _client = window.supabase.createClient(CONFIG.SUPABASE.url, CONFIG.SUPABASE.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return _client;
}

export const DB = {
  get client() { return getClient(); },

  // ── Auth helpers ─────────────────────────────────────────
  async getSession() {
    try {
      const { data, error } = await getClient().auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (e) { ErrorMonitor.capture(e, 'supabase.getSession'); return null; }
  },

  async getUser() {
    try {
      const { data, error } = await getClient().auth.getUser();
      if (error) throw error;
      return data.user;
    } catch (e) { ErrorMonitor.capture(e, 'supabase.getUser'); return null; }
  },

  onAuthStateChange(callback) {
    return getClient().auth.onAuthStateChange(callback);
  },

  // ── Query helpers ─────────────────────────────────────────
  async select(table, { columns = '*', filters = {}, single = false, limit, order } = {}) {
    try {
      let q = getClient().from(table).select(columns);
      Object.entries(filters).forEach(([col, val]) => {
        if (val === null) q = q.is(col, null);
        else q = q.eq(col, val);
      });
      if (order) q = q.order(order.column, { ascending: order.asc ?? true });
      if (limit) q = q.limit(limit);
      if (single) q = q.single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    } catch (e) { ErrorMonitor.capture(e, `supabase.select:${table}`); throw e; }
  },

  async insert(table, row, { returning = true } = {}) {
    try {
      let q = getClient().from(table).insert(row);
      if (returning) q = q.select();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    } catch (e) { ErrorMonitor.capture(e, `supabase.insert:${table}`); throw e; }
  },

  async update(table, updates, filters = {}) {
    try {
      let q = getClient().from(table).update(updates);
      Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
      const { data, error } = await q.select();
      if (error) throw error;
      return data;
    } catch (e) { ErrorMonitor.capture(e, `supabase.update:${table}`); throw e; }
  },

  async upsert(table, row, { onConflict } = {}) {
    try {
      let q = getClient().from(table).upsert(row, onConflict ? { onConflict } : {});
      const { data, error } = await q.select();
      if (error) throw error;
      return data;
    } catch (e) { ErrorMonitor.capture(e, `supabase.upsert:${table}`); throw e; }
  },

  async delete(table, filters = {}) {
    try {
      let q = getClient().from(table).delete();
      Object.entries(filters).forEach(([col, val]) => { q = q.eq(col, val); });
      const { error } = await q;
      if (error) throw error;
      return true;
    } catch (e) { ErrorMonitor.capture(e, `supabase.delete:${table}`); throw e; }
  },

  async rpc(fnName, params = {}) {
    try {
      const { data, error } = await getClient().rpc(fnName, params);
      if (error) throw error;
      return data;
    } catch (e) { ErrorMonitor.capture(e, `supabase.rpc:${fnName}`); throw e; }
  },

  // ── Storage helpers ───────────────────────────────────────
  storage: {
    async uploadPrivate(bucket, path, file) {
      try {
        const { data, error } = await getClient().storage.from(bucket).upload(path, file, {
          upsert: false, cacheControl: '3600',
        });
        if (error) throw error;
        return data;
      } catch (e) { ErrorMonitor.capture(e, 'supabase.storage.upload'); throw e; }
    },

    async getSignedUrl(bucket, path, expiresIn = 300) {
      try {
        const { data, error } = await getClient().storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error) throw error;
        return data.signedUrl;
      } catch (e) { ErrorMonitor.capture(e, 'supabase.storage.signedUrl'); throw e; }
    },

    async remove(bucket, paths) {
      try {
        const { error } = await getClient().storage.from(bucket).remove(paths);
        if (error) throw error;
        return true;
      } catch (e) { ErrorMonitor.capture(e, 'supabase.storage.remove'); throw e; }
    },
  },

  // ── Realtime ──────────────────────────────────────────────
  channel(name) { return getClient().channel(name); },
  removeChannel(ch) { return getClient().removeChannel(ch); },
};
