/**
 * BIYE.LTD — auth.js
 * Authentication: phone+password login, OTP reset, session management.
 * Supabase Auth is authoritative. Never store passwords or OTPs in browser.
 */

import { DB } from './supabase.js';
import { CONFIG } from './config.js';
import { ErrorMonitor } from './error-monitor.js';
import { Validation } from './validation.js';

// ── Internal state ─────────────────────────────────────────
let _currentUser = null;
let _authListeners = [];

// ── Helpers ────────────────────────────────────────────────
function normPhone(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('880')) return '+' + digits;
  if (digits.startsWith('0')) return '+88' + digits;
  if (digits.startsWith('1')) return '+880' + digits;
  return '+' + digits;
}

async function callBackend(action, body) {
  const res = await fetch('/.netlify/functions/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  if (!res.ok) throw new Error(`Backend ${action} failed: ${res.status}`);
  return res.json();
}

// ── Public API ─────────────────────────────────────────────
export const Auth = {
  /** Current authenticated user */
  get currentUser() { return _currentUser; },

  /** Initialize — restore session on page load */
  async init() {
    const session = await DB.getSession();
    if (session?.user) {
      _currentUser = session.user;
      _notifyListeners('SIGNED_IN', session);
    }
    DB.onAuthStateChange((event, session) => {
      _currentUser = session?.user ?? null;
      _notifyListeners(event, session);
    });
    return _currentUser;
  },

  /** Login with phone + password via backend */
  async loginWithPassword(phone, password) {
    const normalised = normPhone(phone);
    if (!Validation.phone(normalised)) throw new Error('invalid_phone');
    if (!password) throw new Error('password_required');

    const result = await callBackend('login', { phone: normalised, password });
    if (!result.ok) throw new Error(result.error || 'login_failed');

    // Backend returns a Supabase session token after verifying credentials
    if (result.access_token) {
      const { error } = await DB.client.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (error) throw error;
    }
    return result;
  },

  /** Send OTP to phone (for reset) */
  async sendResetOtp(phone) {
    const normalised = normPhone(phone);
    if (!Validation.phone(normalised)) throw new Error('invalid_phone');
    const result = await callBackend('send', { phone: normalised, purpose: 'reset' });
    if (!result.ok) throw new Error(result.error || 'otp_send_failed');
    return result;
  },

  /** Verify OTP */
  async verifyOtp(phone, code, purpose = 'reset') {
    const normalised = normPhone(phone);
    const result = await callBackend('verify', { phone: normalised, code, purpose });
    if (!result.ok) throw new Error(result.error || 'otp_invalid');
    return result;
  },

  /** Reset password after OTP verified */
  async resetPassword(phone, newPassword) {
    const normalised = normPhone(phone);
    if (!Validation.password(newPassword)) throw new Error('password_weak');
    const result = await callBackend('resetPassword', { phone: normalised, newPassword });
    if (!result.ok) throw new Error(result.error || 'reset_failed');
    return result;
  },

  /** Register: send OTP for new phone */
  async registerSendOtp(phone) {
    const normalised = normPhone(phone);
    if (!Validation.phone(normalised)) throw new Error('invalid_phone');
    const result = await callBackend('send', { phone: normalised, purpose: 'registration' });
    if (!result.ok) throw new Error(result.error || 'otp_send_failed');
    return result;
  },

  /** Verify registration OTP */
  async registerVerifyOtp(phone, code) {
    return this.verifyOtp(phone, code, 'registration');
  },

  /** Log consent agreements */
  async logConsents(profileId, consents) {
    const rows = Object.entries(consents).map(([type, accepted]) => ({
      profile_id: profileId,
      agreement_type: type,
      version: '1.0',
      accepted: !!accepted,
      accepted_at: accepted ? new Date().toISOString() : null,
      acceptance_method: 'checkbox',
    }));
    await DB.upsert('agreements', rows, { onConflict: 'profile_id,agreement_type,version' });
  },

  /** Logout */
  async logout() {
    try {
      await DB.client.auth.signOut();
      _currentUser = null;
    } catch (e) {
      ErrorMonitor.capture(e, 'auth.logout');
    } finally {
      window.location.href = CONFIG.ROUTES.login;
    }
  },

  /** Check if authenticated, redirect if not */
  async requireAuth(redirectUrl = CONFIG.ROUTES.login) {
    const user = await DB.getUser();
    if (!user) {
      window.location.href = redirectUrl + '?reason=expired';
      return null;
    }
    _currentUser = user;
    return user;
  },

  /** Redirect if already authenticated */
  async redirectIfAuthed(destination = CONFIG.ROUTES.dashboard) {
    const user = await DB.getUser();
    if (user) window.location.href = destination;
  },

  /** Subscribe to auth state changes */
  onChange(listener) {
    _authListeners.push(listener);
    return () => { _authListeners = _authListeners.filter(l => l !== listener); };
  },

  /** Log security event */
  async logSecurityEvent(type, meta = {}) {
    try {
      await DB.insert('security_events', {
        profile_id: _currentUser?.id ?? null,
        event_type: type,
        severity: meta.severity || 'info',
        metadata: meta,
      });
    } catch (e) { /* non-blocking */ }
  },
};

function _notifyListeners(event, session) {
  _authListeners.forEach(fn => { try { fn(event, session); } catch {} });
}
