/**
 * BIYE.LTD — pwa.js
 * Service worker, install prompt, offline shell. Never cache sensitive data.
 */
export const PWA = {
  _deferredPrompt: null,

  async init() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        this._watchForUpdates(reg);
      } catch (e) { console.warn('[BIYE PWA] SW registration failed:', e.message); }
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this._deferredPrompt = e;
      document.dispatchEvent(new CustomEvent('biye:installAvailable'));
    });
    window.addEventListener('appinstalled', () => {
      this._deferredPrompt = null;
      document.dispatchEvent(new CustomEvent('biye:installed'));
    });
  },

  get canInstall() { return !!this._deferredPrompt; },

  async promptInstall() {
    if (!this._deferredPrompt) return false;
    this._deferredPrompt.prompt();
    const { outcome } = await this._deferredPrompt.userChoice;
    this._deferredPrompt = null;
    return outcome === 'accepted';
  },

  _watchForUpdates(reg) {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          document.dispatchEvent(new CustomEvent('biye:updateAvailable', { detail: { reg } }));
        }
      });
    });
  },

  skipWaiting(reg) {
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  },
};
