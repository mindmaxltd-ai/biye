/**
 * BIYE.LTD — app.js
 * Global application bootstrap and orchestrator.
 * Does NOT contain business logic — delegates to modules.
 */
import { CONFIG } from './config.js';
import { DB } from './supabase.js';
import { Auth } from './auth.js';
import { I18n } from './i18n.js';
import { UI } from './ui.js';
import { A11y } from './accessibility.js';
import { ErrorMonitor } from './error-monitor.js';
import { Analytics } from './analytics.js';
import { PWA } from './pwa.js';
import { PrivacySecurity } from './privacy-security.js';

// Minimal global namespace for inter-module communication
window.BIYE = window.BIYE || {};

const PAGE_MAP = {
  'index.html': 'home', 'register.html': 'register', 'login.html': 'login',
  'dashboard.html': 'dashboard', 'questionnaire.html': 'questionnaire',
  'match-feed.html': 'matchFeed', 'profile.html': 'profile',
  'compatibility.html': 'compatibility', 'couple-studio.html': 'coupleStudio',
  'future-life.html': 'futureLife', 'messages.html': 'messages',
  'payment.html': 'payment', 'invoice.html': 'invoice', 'receipt.html': 'receipt',
  'kyc.html': 'kyc', 'knowledge.html': 'knowledge',
};

const PROTECTED_PAGES = new Set([
  'dashboard','questionnaire','matchFeed','profile','compatibility',
  'coupleStudio','futureLife','messages','payment','invoice','receipt','kyc',
]);

const App = {
  currentPage: null,

  async init() {
    // Install error monitoring first
    ErrorMonitor.install();

    // Detect current page
    const filename = window.location.pathname.split('/').pop() || 'index.html';
    this.currentPage = PAGE_MAP[filename] || filename.replace('.html', '');

    // Initialize shared modules
    await I18n.init();
    A11y.init();

    // Auth state
    const user = await Auth.init();

    // Protect pages
    if (PROTECTED_PAGES.has(this.currentPage) && !user) {
      await Auth.requireAuth(CONFIG.ROUTES.login);
      return;
    }

    // Redirect already-authed users away from login/register
    if (['login', 'register'].includes(this.currentPage) && user) {
      Auth.redirectIfAuthed(CONFIG.ROUTES.dashboard);
      return;
    }

    // URL safety check
    PrivacySecurity.checkUrlSafety();

    // PWA
    await PWA.init();

    // Analytics
    Analytics.init(true); // TODO: check consent preference
    Analytics.page(this.currentPage);

    // Expose UI to error monitor
    window.BIYE.ui = UI;
    window.BIYE.i18n = I18n;
    window.BIYE.auth = Auth;

    // Dispatch ready event for page-specific scripts
    document.dispatchEvent(new CustomEvent('biye:ready', { detail: { page: this.currentPage, user } }));

    // Listen for language changes — re-apply all translations
    document.addEventListener('biye:langChange', () => I18n._applyAll());

    // Listen for escape key — close modals
    document.addEventListener('biye:escapeKey', () => {
      document.querySelector('.biye-modal-overlay')?.remove();
    });
  },
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}

export { App };
