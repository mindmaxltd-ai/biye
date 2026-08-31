/**
 * BIYE.LTD — i18n.js
 * Multilingual support: bn, en, hi, ar, zh. RTL for Arabic.
 */

import { CONFIG } from './config.js';

const _translations = {};
let _lang = 'bn';

// Translations loaded lazily per language
const TRANSLATION_MODULES = {
  bn: () => import('./translations/bn.js').then(m => m.default),
  en: () => import('./translations/en.js').then(m => m.default),
  hi: () => import('./translations/hi.js').then(m => m.default),
  ar: () => import('./translations/ar.js').then(m => m.default),
  zh: () => import('./translations/zh.js').then(m => m.default),
};

// Inline fallback translations (Bengali + English essentials)
const FALLBACK = {
  bn: {
    'app.name': 'বিয়ে', 'app.tagline': 'বিবাহের বিজ্ঞান। জীবনের আস্থা।',
    'nav.login': 'লগইন', 'nav.register': 'নিবন্ধন', 'nav.logout': 'লগআউট',
    'nav.dashboard': 'ড্যাশবোর্ড', 'nav.profile': 'প্রোফাইল',
    'auth.login': 'লগইন করুন', 'auth.register': 'অ্যাকাউন্ট তৈরি করুন',
    'auth.phone': 'মোবাইল নম্বর', 'auth.password': 'পাসওয়ার্ড',
    'auth.forgotPassword': 'পাসওয়ার্ড ভুলে গেছেন?',
    'auth.rememberMe': 'মনে রাখুন', 'auth.sendOtp': 'কোড পাঠান',
    'auth.verifyOtp': 'যাচাই করুন', 'auth.newPassword': 'নতুন পাসওয়ার্ড',
    'err.required': 'এই তথ্যটি আবশ্যক', 'err.phone': 'সঠিক মোবাইল নম্বর দিন',
    'err.password': 'পাসওয়ার্ড অন্তত ৮ অক্ষর হতে হবে',
    'err.generic': 'কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।',
    'loading': 'লোড হচ্ছে...', 'saving': 'সংরক্ষণ হচ্ছে...',
    'questionnaire.next': 'পরবর্তী', 'questionnaire.prev': 'পূর্ববর্তী',
    'questionnaire.skip': 'এড়িয়ে যান', 'questionnaire.notSure': 'নিশ্চিত নই',
    'questionnaire.preferNot': 'বলতে চাই না',
    'match.save': 'সংরক্ষণ', 'match.like': 'পছন্দ', 'match.block': 'ব্লক',
    'payment.pay': 'পেমেন্ট করুন', 'payment.total': 'মোট',
    'viz.disclaimer': 'AI ভিজুয়ালাইজেশন — শুধুমাত্র চিত্রিত',
  },
  en: {
    'app.name': 'BIYE', 'app.tagline': 'Science of Marriage. Trust for Life.',
    'nav.login': 'Login', 'nav.register': 'Register', 'nav.logout': 'Logout',
    'nav.dashboard': 'Dashboard', 'nav.profile': 'Profile',
    'auth.login': 'Login', 'auth.register': 'Create Account',
    'auth.phone': 'Mobile Number', 'auth.password': 'Password',
    'auth.forgotPassword': 'Forgot password?',
    'auth.rememberMe': 'Remember me', 'auth.sendOtp': 'Send Code',
    'auth.verifyOtp': 'Verify', 'auth.newPassword': 'New Password',
    'err.required': 'This field is required', 'err.phone': 'Enter a valid mobile number',
    'err.password': 'Password must be at least 8 characters',
    'err.generic': 'Something went wrong. Please try again.',
    'loading': 'Loading...', 'saving': 'Saving...',
    'questionnaire.next': 'Next', 'questionnaire.prev': 'Previous',
    'questionnaire.skip': 'Skip', 'questionnaire.notSure': 'Not sure',
    'questionnaire.preferNot': 'Prefer not to answer',
    'match.save': 'Save', 'match.like': 'Like', 'match.block': 'Block',
    'payment.pay': 'Pay Now', 'payment.total': 'Total',
    'viz.disclaimer': 'AI Visualization — Illustrative Only',
  },
};

export const I18n = {
  get lang() { return _lang; },
  get isRTL() { return CONFIG.LANGUAGES.rtl.includes(_lang); },

  /** Initialize language from storage or browser */
  async init() {
    let saved = 'bn';
    try { saved = localStorage.getItem('biye_lang') || 'bn'; } catch {}
    const supported = CONFIG.LANGUAGES.supported;
    const lang = supported.includes(saved) ? saved :
      supported.find(l => navigator.language?.startsWith(l)) || CONFIG.LANGUAGES.default;
    await this.setLang(lang, false);
  },

  /** Switch language and re-render all i18n elements */
  async setLang(lang, persist = true) {
    if (!CONFIG.LANGUAGES.supported.includes(lang)) return;
    _lang = lang;

    // Load translations if not cached
    if (!_translations[lang]) {
      try {
        _translations[lang] = TRANSLATION_MODULES[lang]
          ? await TRANSLATION_MODULES[lang]()
          : {};
      } catch {
        _translations[lang] = {}; // Use fallback
      }
      // Merge fallback
      _translations[lang] = { ...FALLBACK[lang] || {}, ..._translations[lang] };
    }

    // Apply to document
    document.documentElement.lang = lang;
    document.documentElement.dir = this.isRTL ? 'rtl' : 'ltr';
    this._applyAll();

    if (persist) {
      try { localStorage.setItem('biye_lang', lang); } catch {}
    }

    // Dispatch event for other modules to react
    document.dispatchEvent(new CustomEvent('biye:langChange', { detail: { lang } }));
  },

  /** Get translated string */
  t(key, vars = {}) {
    const dict = _translations[_lang] || _translations.bn || FALLBACK.bn;
    let str = dict[key] ?? FALLBACK.en[key] ?? key;
    Object.entries(vars).forEach(([k, v]) => {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
    return str;
  },

  /** Apply translations to all [data-i18n] elements */
  _applyAll() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key) el.textContent = this.t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = this.t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', this.t(el.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
  },

  /** Update a single element */
  applyTo(el) {
    if (el.dataset.i18n) el.textContent = this.t(el.dataset.i18n);
    if (el.dataset.i18nPlaceholder) el.placeholder = this.t(el.dataset.i18nPlaceholder);
    if (el.dataset.i18nAria) el.setAttribute('aria-label', this.t(el.dataset.i18nAria));
    el.querySelectorAll('[data-i18n]').forEach(child => {
      child.textContent = this.t(child.dataset.i18n);
    });
  },
};

// Shorthand
export const t = (key, vars) => I18n.t(key, vars);
