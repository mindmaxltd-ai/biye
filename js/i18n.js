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

    // ── payment.html (checkout) ──
    'payment.title': 'নিরাপদ চেকআউট', 'payment.subtitle': 'আপনার পেমেন্ট পুরো সময় সুরক্ষিত থাকে।',
    'payment.whatBuying': 'আপনি কী কিনছেন?',
    'payment.reg.name': 'BIYE রেজিস্ট্রেশন (লাইফটাইম)',
    'payment.reg.desc': 'একবারের পেমেন্ট। কখনো নবায়ন করতে হবে না।',
    'payment.reg.badge': 'এককালীন · আজীবন',
    'payment.matchView.name': 'অতিরিক্ত ম্যাচ ভিউ',
    'payment.matchView.desc': 'একটি প্রোফাইল সম্পূর্ণরূপে দেখুন। দাম প্রতিটি কেনাকাটার সাথে বাড়ে।',
    'payment.matchView.badge': 'পরেরটির দাম',
    'payment.manual.name': 'ম্যানুয়াল ম্যাচমেকিং অনুরোধ',
    'payment.manual.desc': 'আমাদের টিম সরাসরি আপনার জন্য সম্ভাব্য মিল খুঁজে দেখবে।',
    'payment.suggestion.name': 'AI ম্যাচ সাজেশন',
    'payment.suggestion.desc': 'একটি দ্রুত, AI-চালিত মিলের পরামর্শ।',
    'payment.summary': 'অর্ডার সারাংশ', 'payment.item': 'পণ্য', 'payment.subtotal': 'সাবটোটাল',
    'payment.discount': 'ছাড়', 'payment.vat': 'ভ্যাট (৫%)',
    'payment.security': 'BIYE কখনো আপনার কার্ড পিন, OTP বা ব্যাংকিং পাসওয়ার্ড চ্যাট/কলে চাইবে না।',
    'payment.trustTitle': 'এই পেমেন্ট কেন নিরাপদ?',
    'payment.trust1': 'এনক্রিপ্টেড সংযোগ', 'payment.trust2': 'নিরাপদ পেমেন্ট গেটওয়ে (SSLCommerz)',
    'payment.trust3': 'সার্ভার-সাইড যাচাইকরণ', 'payment.trust4': 'পেমেন্টের আগে ইনভয়েস তৈরি হয়',
    'payment.trust5': 'সফল পেমেন্টের পর রসিদ',
    'payment.noRefresh': 'যাচাই করার সময় পেজ বন্ধ বা রিফ্রেশ করবেন না।',
    'payment.creatingInvoice': 'ইনভয়েস তৈরি হচ্ছে...', 'payment.redirecting': 'গেটওয়েতে পাঠানো হচ্ছে...',
    'payment.processing': 'পেমেন্ট প্রক্রিয়াকরণ হচ্ছে...', 'payment.failed': 'পেমেন্ট সম্পন্ন হয়নি।',
    'payment.error': 'ইনভয়েস তৈরি করা যায়নি। আবার চেষ্টা করুন।',
    'payment.gatewayUnavailable': 'গেটওয়েতে সংযোগ করা যায়নি। আপনার ইনভয়েস সংরক্ষিত আছে — পরে চেষ্টা করুন।',
    'payment.payBtn': 'নিরাপদে পরিশোধ করুন',
    'payment.alreadyRegistered': 'আপনি ইতিমধ্যে নিবন্ধিত ও লাইফটাইম সক্রিয়।',
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

    // ── payment.html (checkout) ──
    'payment.title': 'Secure Checkout', 'payment.subtitle': 'Your account is protected throughout this payment.',
    'payment.whatBuying': 'What am I paying for?',
    'payment.reg.name': 'BIYE Registration (Lifetime)',
    'payment.reg.desc': 'One-time payment. No renewal, ever.',
    'payment.reg.badge': 'One-time · Lifetime',
    'payment.matchView.name': 'Additional Match View',
    'payment.matchView.desc': 'See one full match profile. Price increases with each purchase.',
    'payment.matchView.badge': 'Next one costs',
    'payment.manual.name': 'Manual Matchmaking Request',
    'payment.manual.desc': 'Our team personally looks for potential matches for you.',
    'payment.suggestion.name': 'AI Match Suggestion',
    'payment.suggestion.desc': 'A quick, AI-generated match suggestion.',
    'payment.summary': 'Order Summary', 'payment.item': 'Item', 'payment.subtotal': 'Subtotal',
    'payment.discount': 'Discount', 'payment.vat': 'VAT (5%)',
    'payment.security': 'BIYE will never ask for your card PIN, OTP, or banking password by chat or call.',
    'payment.trustTitle': 'Why is this payment secure?',
    'payment.trust1': 'Encrypted connection', 'payment.trust2': 'Secure payment gateway (SSLCommerz)',
    'payment.trust3': 'Server-side verification', 'payment.trust4': 'Invoice generated before payment',
    'payment.trust5': 'Receipt after successful payment',
    'payment.noRefresh': "Please don't close or refresh while we confirm your payment.",
    'payment.creatingInvoice': 'Creating your invoice...', 'payment.redirecting': 'Redirecting to gateway...',
    'payment.processing': 'Processing your payment...', 'payment.failed': 'Payment was not completed.',
    'payment.error': 'Could not create invoice. Please try again.',
    'payment.gatewayUnavailable': "We couldn't connect to the payment gateway. Your invoice is still safe — please try again.",
    'payment.payBtn': 'Pay Securely',
    'payment.alreadyRegistered': "You're already registered — lifetime access is active.",
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
