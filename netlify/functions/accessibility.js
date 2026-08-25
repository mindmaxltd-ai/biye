/**
 * BIYE.LTD — accessibility.js
 * Keyboard navigation, focus management, screen reader support, voice hooks.
 */

let _voiceRecognition = null;
let _voiceSupported = false;
let _synth = window.speechSynthesis || null;
let _reducedMotion = false;

export const A11y = {
  /** Initialize accessibility features */
  init() {
    _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    _voiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    this._initKeyboardNav();
    this._initAriaLive();
    this._applyReducedMotion();
    return this;
  },

  get voiceSupported() { return _voiceSupported; },
  get reducedMotion() { return _reducedMotion; },

  // ── Screen reader announcements ───────────────────────
  _liveRegion: null,
  announce(message, priority = 'polite') {
    if (!this._liveRegion) {
      this._liveRegion = document.createElement('div');
      this._liveRegion.setAttribute('aria-live', priority);
      this._liveRegion.setAttribute('aria-atomic', 'true');
      this._liveRegion.className = 'sr-only';
      this._liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
      document.body.appendChild(this._liveRegion);
    }
    this._liveRegion.setAttribute('aria-live', priority);
    this._liveRegion.textContent = '';
    requestAnimationFrame(() => { this._liveRegion.textContent = message; });
  },

  // ── Focus management ──────────────────────────────────
  focusFirst(container) {
    const focusable = container?.querySelector(
      'button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"]),input:not([disabled]),select,textarea'
    );
    focusable?.focus();
  },

  /** Trap focus inside a container (modal) */
  trapFocus(container) {
    const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    const handler = (e) => {
      if (e.key !== 'Tab') return;
      const els = [...container.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
  },

  // ── Keyboard navigation ───────────────────────────────
  _initKeyboardNav() {
    document.addEventListener('keydown', (e) => {
      // Escape closes modals/panels
      if (e.key === 'Escape') {
        document.dispatchEvent(new CustomEvent('biye:escapeKey'));
      }
    });
  },

  // ── ARIA live region ──────────────────────────────────
  _initAriaLive() {
    // Ensure page has at least one polite live region
    if (!document.querySelector('[aria-live]')) this.announce('');
  },

  // ── Reduced motion ────────────────────────────────────
  _applyReducedMotion() {
    if (_reducedMotion) {
      document.documentElement.style.setProperty('--tx', '0s');
    }
  },

  // ── OTP input accessibility ───────────────────────────
  initOtpBoxes(boxes) {
    boxes.forEach((box, i) => {
      box.setAttribute('autocomplete', 'one-time-code');
      box.addEventListener('input', () => {
        const v = box.value.replace(/\D/g, '');
        box.value = v;
        if (v && i < boxes.length - 1) boxes[i + 1].focus();
        if (v) box.classList.add('filled');
        else box.classList.remove('filled');
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          boxes[i - 1].value = '';
          boxes[i - 1].classList.remove('filled');
          boxes[i - 1].focus();
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        boxes.forEach((b, j) => {
          if (text[j]) { b.value = text[j]; b.classList.add('filled'); }
        });
        const last = Math.min(text.length - 1, boxes.length - 1);
        if (last >= 0) boxes[last].focus();
      });
    });
  },

  // ── Voice input (Web Speech API) ──────────────────────
  startVoice({ targetField, lang = 'bn-BD', onResult, onEnd, onError } = {}) {
    if (!_voiceSupported) { onError?.('not_supported'); return null; }
    try {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 3;

      rec.onresult = (e) => {
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) final += e.results[i][0].transcript;
          else interim += e.results[i][0].transcript;
        }
        onResult?.({ interim, final, raw: final || interim });
        if (final && targetField) {
          // Map Bengali digit words
          const mapped = _mapBengaliDigits(final);
          const digits = mapped.replace(/\D/g, '');
          if (digits.length >= 10) targetField.value = digits.slice(0, 11);
          else if (final.length > 2) targetField.value = final.trim();
        }
      };
      rec.onerror = (e) => onError?.(e.error);
      rec.onend = () => { _voiceRecognition = null; onEnd?.(); };
      rec.start();
      _voiceRecognition = rec;
      return rec;
    } catch (e) { onError?.(e.message); return null; }
  },

  stopVoice() { try { _voiceRecognition?.stop(); } catch {} },

  // ── Text to speech ────────────────────────────────────
  speak(text, lang = 'bn-BD') {
    if (!_synth) return;
    _synth.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    _synth.speak(utt);
  },

  stopSpeaking() { _synth?.cancel(); },

  // ── Questionnaire accessibility ───────────────────────
  initQuestionnaireControls(container) {
    // Make slider announce value changes
    container.querySelectorAll('input[type="range"]').forEach(slider => {
      slider.addEventListener('input', () => {
        this.announce(`${slider.getAttribute('aria-label') || 'Value'}: ${slider.value}`);
      });
    });
    // Ensure radio groups have proper roles
    container.querySelectorAll('[data-answer-type="single_choice"]').forEach(group => {
      if (!group.getAttribute('role')) group.setAttribute('role', 'radiogroup');
    });
  },
};

function _mapBengaliDigits(text) {
  return text
    .replace(/শূন্য|zero/gi, '0').replace(/এক|one/gi, '1')
    .replace(/দুই|two/gi, '2').replace(/তিন|three/gi, '3')
    .replace(/চার|four/gi, '4').replace(/পাঁচ|five/gi, '5')
    .replace(/ছয়|six/gi, '6').replace(/সাত|seven/gi, '7')
    .replace(/আট|eight/gi, '8').replace(/নয়|nine/gi, '9');
}
