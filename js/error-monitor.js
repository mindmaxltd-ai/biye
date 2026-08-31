/**
 * BIYE.LTD — error-monitor.js
 * Centralized error handling. Never expose stack traces, SQL, or API keys to users.
 */

const USER_MESSAGES = {
  bn: {
    network: 'ইন্টারনেট সংযোগ পরীক্ষা করুন এবং আবার চেষ্টা করুন।',
    auth: 'লগইন সমস্যা হয়েছে। আবার চেষ্টা করুন।',
    payment: 'পেমেন্টে সমস্যা হয়েছে। আবার চেষ্টা করুন।',
    upload: 'ফাইল আপলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।',
    questionnaire: 'উত্তর সংরক্ষণে সমস্যা হয়েছে।',
    ai: 'AI বিশ্লেষণ সম্পন্ন হয়নি। পরে আবার চেষ্টা করুন।',
    generic: 'কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।',
    rls: 'এই তথ্য দেখার অনুমতি নেই।',
  },
  en: {
    network: 'Check your internet connection and try again.',
    auth: 'Authentication error. Please try again.',
    payment: 'Payment error occurred. Please try again.',
    upload: 'File upload failed. Please try again.',
    questionnaire: 'Could not save your answer.',
    ai: 'AI analysis could not complete. Please try later.',
    generic: 'Something went wrong. Please try again.',
    rls: 'You do not have permission to view this.',
  },
};

const _log = [];

function getLang() {
  try { return localStorage.getItem('biye_lang') || 'bn'; } catch { return 'bn'; }
}

function classify(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('offline')) return 'network';
  if (msg.includes('auth') || msg.includes('jwt') || msg.includes('session')) return 'auth';
  if (msg.includes('payment') || msg.includes('gateway')) return 'payment';
  if (msg.includes('storage') || msg.includes('upload')) return 'upload';
  if (msg.includes('rls') || msg.includes('policy') || msg.includes('permission')) return 'rls';
  return 'generic';
}

export const ErrorMonitor = {
  /** Capture and log error safely — never expose sensitive details */
  capture(error, context = '', meta = {}) {
    const type = classify(error);
    const entry = {
      type,
      context,
      code: error?.code,
      hint: error?.hint,
      ts: new Date().toISOString(),
      // Never log: stack trace content that reveals DB/API details
    };
    _log.push(entry);
    if (_log.length > 100) _log.shift(); // Keep last 100

    // Dev-only logging
    if (window.location.hostname !== 'biye.ltd') {
      console.error(`[BIYE Error] ${context}:`, error?.message, meta);
    }

    return entry;
  },

  /** Get user-friendly message */
  userMessage(error, context = '') {
    const lang = getLang();
    const messages = USER_MESSAGES[lang] || USER_MESSAGES.en;
    const type = classify(error);
    return messages[type] || messages.generic;
  },

  /** Show error in UI — delegates to ui.js toast if available */
  show(error, context = '') {
    const entry = this.capture(error, context);
    const msg = this.userMessage(error, context);
    // Use global toast if available, else console
    if (window.BIYE?.ui?.toast) {
      window.BIYE.ui.toast(msg, 'error');
    } else {
      console.warn('[BIYE]', msg);
    }
    return msg;
  },

  /** Get safe diagnostic log (no sensitive data) */
  getSafeLog() {
    return _log.map(e => ({ type: e.type, context: e.context, ts: e.ts }));
  },

  /** Install global unhandled error listeners */
  install() {
    window.addEventListener('error', (e) => {
      this.capture(e.error, 'window.onerror');
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.capture(e.reason, 'unhandledrejection');
    });
  },
};
