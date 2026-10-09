/**
 * BIYE.LTD — config.js
 * Central application configuration.
 * NEVER put service-role keys, AI secrets, or payment secrets here.
 */

export const CONFIG = {
  APP: {
    name: 'BIYE',
    fullName: 'Bonding through Intelligent Yield of Emotions',
    tagline: 'Science of Marriage. Trust for Life.',
    domain: 'biye.ltd',
    version: '1.0.0',
    env: window.location.hostname === 'biye.ltd' ? 'production' : 'development',
  },

  SUPABASE: {
    url: 'https://hjbvmzashhzazlpgjhof.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqYnZtemFzaGh6YXpscGdqaG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMTQ4OTYsImV4cCI6MjA5OTU5MDg5Nn0.vneEXDY2P2MOnFdFJtPAms_qGq_OGU3xQeHInD5k75E',   // Browser-safe anon key only
  },

  PRICING: {
    registrationFee: 999,
    registrationVat: 0.05,
    get registrationTotal() { return Math.round(this.registrationFee * (1 + this.registrationVat)); },
    freeMatchViews: 2,
    additionalMatchViewFee: 333,
    currency: 'BDT',
    currencySymbol: '৳',
  },

  PHOTOS: {
    passport: { max: 2, types: ['passport_1', 'passport_2'] },
    full: { max: 3, types: ['full_1', 'full_2', 'full_3'] },
    maxSizeBytes: 5 * 1024 * 1024, // 5MB
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    storageBucket: 'profile-photos', // Private bucket
  },

  LANGUAGES: {
    supported: ['bn', 'en', 'hi', 'ar', 'zh'],
    default: 'bn',
    rtl: ['ar'],
    labels: { bn: 'বাংলা', en: 'English', hi: 'हिन्दी', ar: 'العربية', zh: '中文' },
  },

  QUESTIONNAIRE: {
    minAnswersForMatching: 30,
    batchSize: 10,          // Load N questions at a time
    autoSaveDebounceMs: 800,
  },

  VISUALIZATION: {
    allowedAges: [25, 30, 35, 40, 45, 50, 60, 70],
    scenes: ['standing', 'sitting', 'walking', 'formal', 'casual', 'traditional', 'outdoor'],
    disclaimer: 'AI Visualization — Illustrative Only',
  },

  ROUTES: {
    home: '/index.html',
    register: '/register.html',
    login: '/login.html',
    dashboard: '/dashboard.html',
    questionnaire: '/questionnaire.html',
    matchFeed: '/match-feed.html',
    profile: '/profile.html',
  },

  PAYMENT: {
    gatewayEndpoint: '/.netlify/functions/payment',
    verifyEndpoint: '/.netlify/functions/payment-verify',
    webhookEndpoint: '/.netlify/functions/payment-webhook',
  },

  FEATURES: {
    voiceInput: true,
    coupleStudio: true,
    futureLife: true,
    genomicScreening: false, // Phase 2
    realtimeMessages: true,
  },

  SECURITY: {
    sessionKey: 'biye_lang',  // Only non-sensitive UI prefs in localStorage
    maxLoginAttempts: 5,
    otpExpiryMinutes: 10,
  },
};
