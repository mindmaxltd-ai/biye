/**
 * BIYE.LTD — validation.js
 * Central validation. Never use as authorization — backend enforces all rules.
 */

import { I18n } from './i18n.js';

export const Validation = {
  /** Bangladesh phone: +8801[3-9]XXXXXXXX */
  phone(val) {
    return /^\+8801[3-9]\d{8}$/.test(String(val).replace(/\s/g, ''));
  },

  email(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).trim());
  },

  password(val) {
    return String(val).length >= 8 && /[A-Z]/.test(val) && /[0-9]/.test(val);
  },

  passwordStrength(val) {
    let score = 0;
    if (val.length >= 8) score++;
    if (val.length >= 12) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    return { score, label: ['', 'weak', 'fair', 'good', 'strong', 'very_strong'][score] };
  },

  required(val) {
    return val !== null && val !== undefined && String(val).trim().length > 0;
  },

  dob(val) {
    const d = new Date(val);
    if (isNaN(d)) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    return age >= 18 && age <= 100;
  },

  name(val) {
    return String(val).trim().length >= 2 && String(val).trim().length <= 150;
  },

  otp(val) {
    return /^\d{6}$/.test(String(val).trim());
  },

  number(val, { min, max } = {}) {
    const n = Number(val);
    if (isNaN(n)) return false;
    if (min !== undefined && n < min) return false;
    if (max !== undefined && n > max) return false;
    return true;
  },

  photoFile(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 5 * 1024 * 1024;
    return { ok: allowed.includes(file.type) && file.size <= maxSize,
      typeOk: allowed.includes(file.type), sizeOk: file.size <= maxSize };
  },

  /** Sanitize text — prevent XSS */
  sanitize(val) {
    const el = document.createElement('div');
    el.textContent = String(val ?? '');
    return el.innerHTML; // Escaped
  },

  /** Normalize phone input to +880... */
  normalizePhone(raw) {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('880')) return '+' + digits;
    if (digits.startsWith('0')) return '+88' + digits;
    if (digits.startsWith('1')) return '+880' + digits;
    return '+' + digits;
  },

  /** Validate a whole form — returns { valid, errors } */
  form(rules) {
    const errors = {};
    let valid = true;
    for (const [field, { value, checks }] of Object.entries(rules)) {
      for (const check of checks) {
        const result = this[check.type]?.(value, check.opts);
        if (!result) {
          errors[field] = I18n.t(check.msgKey || `err.${check.type}`);
          valid = false;
          break;
        }
      }
    }
    return { valid, errors };
  },

  /** Apply error to a form field element */
  showFieldError(inputEl, message) {
    inputEl?.classList.add('err');
    inputEl?.classList.remove('ok');
    inputEl?.setAttribute('aria-invalid', 'true');
    const errId = inputEl?.getAttribute('aria-describedby');
    if (errId) {
      const errEl = document.getElementById(errId);
      if (errEl) { errEl.textContent = message; errEl.style.display = 'block'; }
    }
  },

  clearFieldError(inputEl) {
    inputEl?.classList.remove('err');
    inputEl?.classList.add('ok');
    inputEl?.setAttribute('aria-invalid', 'false');
    const errId = inputEl?.getAttribute('aria-describedby');
    if (errId) {
      const errEl = document.getElementById(errId);
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    }
  },
};
