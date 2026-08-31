/**
 * BIYE.LTD — ui.js
 * Shared UI components. Never use innerHTML with untrusted content.
 */

import { I18n } from './i18n.js';

// ── Toast ─────────────────────────────────────────────────
let _toastContainer = null;
function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div');
    _toastContainer.id = 'biye-toasts';
    _toastContainer.setAttribute('aria-live', 'polite');
    _toastContainer.setAttribute('aria-atomic', 'true');
    _toastContainer.style.cssText = 'position:fixed;bottom:calc(1rem + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:.5rem;width:min(360px,92vw);pointer-events:none';
    document.body.appendChild(_toastContainer);
  }
  return _toastContainer;
}

// ── Modal ─────────────────────────────────────────────────
let _modalStack = [];

// ── Loading ───────────────────────────────────────────────
const _loadingTargets = new Map();

export const UI = {
  // ── Toast ──────────────────────────────────────────────
  toast(message, type = 'info', durationMs = 3500) {
    const colors = { info: '#1565C0', success: '#00A651', error: '#C20F5E', warn: '#D4AF37' };
    const icons = { info: 'ℹ', success: '✓', error: '✕', warn: '⚠' };
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = `background:${colors[type] || colors.info};color:#fff;padding:.75rem 1.1rem;border-radius:12px;font-size:.88rem;font-weight:600;display:flex;align-items:center;gap:.6rem;box-shadow:0 4px 20px rgba(0,0,0,.18);pointer-events:auto;animation:biye-toast-in .22s ease;font-family:inherit`;
    // Safe text — no innerHTML
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = icons[type] || icons.info;
    const text = document.createElement('span');
    text.textContent = message; // textContent — no XSS
    el.appendChild(icon);
    el.appendChild(text);
    getToastContainer().appendChild(el);
    const remove = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); };
    setTimeout(remove, durationMs);
    el.addEventListener('click', remove);
    return { remove };
  },

  // ── Loading state ─────────────────────────────────────
  setLoading(btnOrEl, loading = true, loadingText = null) {
    if (!btnOrEl) return;
    if (loading) {
      _loadingTargets.set(btnOrEl, {
        text: btnOrEl.textContent,
        disabled: btnOrEl.disabled,
      });
      btnOrEl.disabled = true;
      btnOrEl.setAttribute('aria-busy', 'true');
      if (loadingText) {
        const spinner = document.createElement('span');
        spinner.className = 'biye-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        btnOrEl.textContent = '';
        btnOrEl.appendChild(spinner);
        const t = document.createElement('span');
        t.textContent = ' ' + loadingText;
        btnOrEl.appendChild(t);
      }
    } else {
      const prev = _loadingTargets.get(btnOrEl);
      if (prev) {
        btnOrEl.disabled = prev.disabled;
        btnOrEl.textContent = prev.text;
        _loadingTargets.delete(btnOrEl);
      }
      btnOrEl.removeAttribute('aria-busy');
    }
  },

  // ── Skeleton ──────────────────────────────────────────
  skeleton(container, lines = 3) {
    container.innerHTML = '';
    for (let i = 0; i < lines; i++) {
      const sk = document.createElement('div');
      sk.className = 'biye-skeleton';
      sk.setAttribute('aria-hidden', 'true');
      sk.style.cssText = `height:${i === 0 ? '20px' : '14px'};border-radius:8px;background:linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%);background-size:200% 100%;animation:biye-skeleton-wave 1.4s infinite;margin-bottom:.6rem;width:${[100, 80, 60][i] || 90}%`;
      container.appendChild(sk);
    }
  },

  // ── Modal ─────────────────────────────────────────────
  modal({ title, content, actions = [], onClose } = {}) {
    const overlay = document.createElement('div');
    overlay.className = 'biye-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:1rem';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', title || 'Dialog');

    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:20px;padding:1.5rem;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.2);max-height:90vh;overflow-y:auto';

    if (title) {
      const h = document.createElement('h2');
      h.style.cssText = 'font-size:1.15rem;font-weight:800;margin-bottom:.75rem';
      h.textContent = title;
      box.appendChild(h);
    }

    if (typeof content === 'string') {
      const p = document.createElement('p');
      p.style.cssText = 'font-size:.9rem;color:rgba(20,20,20,.6);line-height:1.65;margin-bottom:1rem';
      p.textContent = content; // textContent — safe
      box.appendChild(p);
    } else if (content instanceof HTMLElement) {
      box.appendChild(content);
    }

    const actRow = document.createElement('div');
    actRow.style.cssText = 'display:flex;gap:.6rem;justify-content:flex-end;flex-wrap:wrap;margin-top:.5rem';
    actions.forEach(({ label, type = 'ghost', onClick }) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `padding:.6rem 1.2rem;border-radius:10px;font-weight:700;font-size:.88rem;cursor:pointer;border:none;font-family:inherit;${type === 'primary' ? 'background:linear-gradient(120deg,#E2136E,#6A2DA8,#1565C0);color:#fff' : 'background:rgba(20,20,20,.06);color:rgba(20,20,20,.7)'}`;
      btn.addEventListener('click', () => { onClick?.(); close(); });
      actRow.appendChild(btn);
    });
    box.appendChild(actRow);

    const close = () => {
      overlay.remove();
      _modalStack = _modalStack.filter(m => m !== overlay);
      onClose?.();
    };

    overlay.appendChild(box);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    document.body.appendChild(overlay);
    _modalStack.push(overlay);

    // Focus trap
    const focusable = box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable.length) focusable[0].focus();

    return { close };
  },

  // ── Confirm dialog ────────────────────────────────────
  confirm(message, { title, confirmLabel, cancelLabel } = {}) {
    return new Promise(resolve => {
      this.modal({
        title: title || I18n.t('ui.confirm'),
        content: message,
        actions: [
          { label: cancelLabel || I18n.t('ui.cancel'), onClick: () => resolve(false) },
          { label: confirmLabel || I18n.t('ui.ok'), type: 'primary', onClick: () => resolve(true) },
        ],
      });
    });
  },

  // ── Empty state ───────────────────────────────────────
  emptyState(container, { icon = '🔍', title = '', subtitle = '', action } = {}) {
    container.innerHTML = '';
    container.style.cssText = 'text-align:center;padding:3rem 1rem';
    const iconEl = document.createElement('div');
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.style.cssText = 'font-size:3rem;margin-bottom:.75rem';
    iconEl.textContent = icon;
    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'font-size:1rem;font-weight:700;margin-bottom:.35rem';
    titleEl.textContent = title;
    const subEl = document.createElement('p');
    subEl.style.cssText = 'font-size:.85rem;color:rgba(20,20,20,.55)';
    subEl.textContent = subtitle;
    container.appendChild(iconEl);
    container.appendChild(titleEl);
    container.appendChild(subEl);
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = 'margin-top:1rem;padding:.65rem 1.5rem;border-radius:12px;background:linear-gradient(120deg,#E2136E,#6A2DA8,#1565C0);color:#fff;font-weight:700;font-size:.88rem;border:none;cursor:pointer;font-family:inherit';
      btn.addEventListener('click', action.onClick);
      container.appendChild(btn);
    }
  },

  // ── Progress bar ──────────────────────────────────────
  setProgress(el, percent, label = '') {
    if (!el) return;
    el.setAttribute('role', 'progressbar');
    el.setAttribute('aria-valuenow', percent);
    el.setAttribute('aria-valuemin', 0);
    el.setAttribute('aria-valuemax', 100);
    if (label) el.setAttribute('aria-label', label);
    const bar = el.querySelector('.biye-progress-bar') || el;
    bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  },

  // ── Safe text rendering ───────────────────────────────
  safeText(el, text) {
    if (!el) return;
    el.textContent = String(text ?? ''); // Never innerHTML
  },

  // ── Accordion ─────────────────────────────────────────
  initAccordion(container) {
    container.querySelectorAll('.biye-faq-q,[data-accordion-trigger]').forEach(btn => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        const targetId = btn.getAttribute('aria-controls');
        const target = targetId ? document.getElementById(targetId) : btn.nextElementSibling;
        if (target) {
          target.hidden = expanded;
          target.setAttribute('aria-hidden', String(expanded));
        }
      });
    });
  },

  // ── Tab system ────────────────────────────────────────
  initTabs(container) {
    const tabs = container.querySelectorAll('[role="tab"]');
    const panels = container.querySelectorAll('[role="tabpanel"]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => { t.setAttribute('aria-selected', 'false'); t.tabIndex = -1; });
        panels.forEach(p => p.hidden = true);
        tab.setAttribute('aria-selected', 'true');
        tab.tabIndex = 0;
        const panelId = tab.getAttribute('aria-controls');
        const panel = document.getElementById(panelId);
        if (panel) panel.hidden = false;
      });
    });
  },
};

// Inject keyframe animations once
(function injectStyles() {
  if (document.getElementById('biye-ui-styles')) return;
  const s = document.createElement('style');
  s.id = 'biye-ui-styles';
  s.textContent = `
    @keyframes biye-toast-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
    @keyframes biye-skeleton-wave{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .biye-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:biye-spin .7s linear infinite;vertical-align:middle}
    @keyframes biye-spin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(s);
})();
