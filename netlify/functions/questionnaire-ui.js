/**
 * BIYE.LTD — questionnaire-ui.js
 * Visual questionnaire: renders all question types, progress, navigation.
 * Never overwhelms user — shows one question at a time.
 */

import { I18n } from './i18n.js';
import { UI } from './ui.js';
import { A11y } from './accessibility.js';
import { Validation } from './validation.js';

export class QuestionnaireUI {
  constructor(engine, container) {
    this.engine = engine;
    this.container = container;
    this.currentAnswer = null;
    this._progressEl = null;
  }

  /** Render question and its controls */
  async renderQuestion(question) {
    if (!question || !this.container) return;
    const opts = await this.engine.loadOptions(question.id);
    this.currentAnswer = null;

    this.container.innerHTML = '';

    // Progress
    this._renderProgress();

    // Question card
    const card = document.createElement('div');
    card.className = 'biye-question-card';
    card.setAttribute('role', 'group');
    card.setAttribute('aria-labelledby', 'biye-q-title');

    // Category badge
    if (question.domain) {
      const badge = document.createElement('div');
      badge.className = 'biye-q-badge';
      badge.textContent = question.domain;
      card.appendChild(badge);
    }

    // Question text
    const title = document.createElement('h2');
    title.id = 'biye-q-title';
    title.className = 'biye-q-title';
    title.textContent = I18n.t(question.question_key) || question.question_key;
    card.appendChild(title);

    // Sensitivity notice
    if (['sensitive', 'highly_sensitive', 'restricted'].includes(question.sensitivity)) {
      const notice = document.createElement('p');
      notice.className = 'biye-q-sensitive-notice';
      notice.textContent = I18n.t('questionnaire.sensitiveNotice');
      card.appendChild(notice);
    }

    // Answer area
    const answerArea = document.createElement('div');
    answerArea.className = 'biye-q-answer-area';
    this._renderAnswerInput(answerArea, question, opts);
    card.appendChild(answerArea);

    // Soft options row
    const softRow = document.createElement('div');
    softRow.className = 'biye-q-soft-row';
    softRow.appendChild(this._makeTextBtn(I18n.t('questionnaire.notSure'), () => this._submitAnswer({ notSure: true })));
    softRow.appendChild(this._makeTextBtn(I18n.t('questionnaire.preferNot'), () => this._submitAnswer({ preferNot: true })));
    if (!question.required) {
      softRow.appendChild(this._makeTextBtn(I18n.t('questionnaire.skip'), () => this._submitAnswer({ skipped: true })));
    }
    card.appendChild(softRow);

    // Nav buttons
    const navRow = document.createElement('div');
    navRow.className = 'biye-q-nav';
    const prevBtn = document.createElement('button');
    prevBtn.className = 'biye-btn-ghost';
    prevBtn.textContent = I18n.t('questionnaire.prev');
    prevBtn.addEventListener('click', () => this._emit('prev'));
    const nextBtn = document.createElement('button');
    nextBtn.className = 'biye-btn-primary';
    nextBtn.id = 'biye-q-next';
    nextBtn.textContent = I18n.t('questionnaire.next');
    nextBtn.addEventListener('click', () => this._submitAnswer({}));
    navRow.appendChild(prevBtn);
    navRow.appendChild(nextBtn);
    card.appendChild(navRow);

    this.container.appendChild(card);
    A11y.focusFirst(card);
    A11y.initQuestionnaireControls(card);
  }

  _renderAnswerInput(container, question, opts) {
    switch (question.question_type) {
      case 'single_choice': return this._renderSingleChoice(container, opts, question);
      case 'multiple_choice': return this._renderMultiChoice(container, opts, question);
      case 'ranking': return this._renderRanking(container, opts);
      case 'slider': return this._renderSlider(container, question);
      case 'numeric': return this._renderNumeric(container, question);
      case 'text': return this._renderText(container, question);
      case 'long_text': return this._renderLongText(container, question);
      case 'boolean': return this._renderBoolean(container, question);
      case 'scale': return this._renderScale(container, question);
      case 'date': return this._renderDate(container, question);
      case 'range': return this._renderRange(container, question);
      case 'scenario': return this._renderSingleChoice(container, opts, question);
      case 'voice': return this._renderVoice(container, question);
      default: return this._renderText(container, question);
    }
  }

  _renderSingleChoice(container, opts, question) {
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-labelledby', 'biye-q-title');
    opts.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'biye-choice-item';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = question.id;
      radio.value = opt.id;
      radio.className = 'biye-choice-radio';
      radio.addEventListener('change', () => {
        this.currentAnswer = { selectedOptionId: opt.id, answerText: opt.value || opt.option_code };
        document.querySelectorAll('.biye-choice-item').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
      });
      const span = document.createElement('span');
      span.textContent = I18n.t(opt.label_key) || opt.label_key;
      label.appendChild(radio);
      label.appendChild(span);
      group.appendChild(label);
    });
    container.appendChild(group);
  }

  _renderMultiChoice(container, opts, question) {
    const selected = new Set();
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    opts.forEach(opt => {
      const label = document.createElement('label');
      label.className = 'biye-choice-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = opt.id;
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(opt.id); else selected.delete(opt.id);
        this.currentAnswer = { answerJson: [...selected] };
        label.classList.toggle('selected', cb.checked);
      });
      const span = document.createElement('span');
      span.textContent = I18n.t(opt.label_key) || opt.label_key;
      label.appendChild(cb);
      label.appendChild(span);
      group.appendChild(label);
    });
    container.appendChild(group);
  }

  _renderSlider(container, question) {
    const wrap = document.createElement('div');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0'; slider.max = '100'; slider.value = '50';
    slider.setAttribute('aria-label', I18n.t(question.question_key));
    const display = document.createElement('output');
    display.textContent = '50';
    slider.addEventListener('input', () => {
      display.textContent = slider.value;
      this.currentAnswer = { answerNumber: Number(slider.value) };
    });
    this.currentAnswer = { answerNumber: 50 };
    wrap.appendChild(slider);
    wrap.appendChild(display);
    container.appendChild(wrap);
  }

  _renderNumeric(container, question) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'biye-field-input';
    input.setAttribute('aria-labelledby', 'biye-q-title');
    input.addEventListener('input', () => {
      if (Validation.number(input.value)) {
        this.currentAnswer = { answerNumber: Number(input.value) };
      }
    });
    container.appendChild(input);
  }

  _renderText(container, question) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'biye-field-input';
    input.setAttribute('aria-labelledby', 'biye-q-title');
    input.addEventListener('input', () => {
      this.currentAnswer = { answerText: Validation.sanitize(input.value) };
    });
    container.appendChild(input);
  }

  _renderLongText(container, question) {
    const ta = document.createElement('textarea');
    ta.className = 'biye-field-input';
    ta.rows = 4;
    ta.setAttribute('aria-labelledby', 'biye-q-title');
    ta.addEventListener('input', () => {
      this.currentAnswer = { answerText: Validation.sanitize(ta.value) };
    });
    container.appendChild(ta);
  }

  _renderBoolean(container, question) {
    const wrap = document.createElement('div');
    wrap.className = 'biye-bool-row';
    ['yes', 'no'].forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'biye-bool-btn';
      btn.textContent = I18n.t(`questionnaire.${val}`);
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.biye-bool-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
        btn.setAttribute('aria-pressed', 'true');
        this.currentAnswer = { answerBoolean: val === 'yes' };
      });
      wrap.appendChild(btn);
    });
    container.appendChild(wrap);
  }

  _renderScale(container, question) {
    const wrap = document.createElement('div');
    wrap.className = 'biye-scale-row';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.className = 'biye-scale-btn';
      btn.textContent = i;
      btn.setAttribute('aria-label', `${i} / 5`);
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('.biye-scale-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        this.currentAnswer = { answerNumber: i };
      });
      wrap.appendChild(btn);
    }
    container.appendChild(wrap);
  }

  _renderDate(container, question) {
    const input = document.createElement('input');
    input.type = 'date';
    input.className = 'biye-field-input';
    input.addEventListener('change', () => {
      this.currentAnswer = { answerText: input.value };
    });
    container.appendChild(input);
  }

  _renderRange(container, question) {
    const wrap = document.createElement('div');
    wrap.className = 'biye-range-row';
    const minInput = this._numberInput(I18n.t('questionnaire.min'));
    const maxInput = this._numberInput(I18n.t('questionnaire.max'));
    const update = () => {
      this.currentAnswer = { answerJson: { min: Number(minInput.value), max: Number(maxInput.value) } };
    };
    minInput.addEventListener('input', update);
    maxInput.addEventListener('input', update);
    wrap.appendChild(minInput);
    wrap.appendChild(document.createTextNode(' — '));
    wrap.appendChild(maxInput);
    container.appendChild(wrap);
  }

  _renderVoice(container, question) {
    const A11yModule = A11y;
    const wrap = document.createElement('div');
    const transcript = document.createElement('p');
    transcript.className = 'biye-voice-transcript';
    transcript.textContent = I18n.t('questionnaire.speakNow');
    const micBtn = document.createElement('button');
    micBtn.className = 'biye-mic-btn';
    micBtn.setAttribute('aria-label', I18n.t('questionnaire.startVoice'));
    micBtn.textContent = '🎙';
    micBtn.addEventListener('click', () => {
      A11yModule.startVoice({
        lang: I18n.lang === 'bn' ? 'bn-BD' : 'en-US',
        onResult: ({ raw }) => { transcript.textContent = raw; this.currentAnswer = { answerText: raw }; },
        onEnd: () => micBtn.classList.remove('listening'),
        onError: () => { transcript.textContent = I18n.t('questionnaire.voiceError'); },
      });
      micBtn.classList.add('listening');
    });
    wrap.appendChild(micBtn);
    wrap.appendChild(transcript);
    container.appendChild(wrap);
  }

  _renderRanking(container, opts) {
    const order = opts.map(o => o.id);
    const list = document.createElement('ol');
    list.className = 'biye-ranking-list';
    list.setAttribute('aria-label', I18n.t('questionnaire.dragToRank'));
    opts.forEach((opt, i) => {
      const li = document.createElement('li');
      li.className = 'biye-ranking-item';
      li.dataset.id = opt.id;
      li.draggable = true;
      li.textContent = `${i + 1}. ${I18n.t(opt.label_key) || opt.label_key}`;
      list.appendChild(li);
    });
    this.currentAnswer = { answerJson: order };
    container.appendChild(list);
  }

  _renderProgress() {
    const prog = this.engine.progress;
    const bar = document.createElement('div');
    bar.className = 'biye-q-progress';
    bar.innerHTML = `<div class="biye-progress-track"><div class="biye-progress-bar" style="width:${prog.percent}%"></div></div><span class="biye-q-count">${prog.answered} ${I18n.t('questionnaire.answered')}</span>`;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', prog.percent);
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    this.container.appendChild(bar);
  }

  async _submitAnswer({ skipped = false, preferNot = false, notSure = false } = {}) {
    const q = this.engine.currentQuestion;
    if (!q) return;
    const answer = this.currentAnswer || {};
    await this.engine.saveAnswer({
      questionId: q.id,
      ...answer,
      skipped,
      preferNotToAnswer: preferNot,
      notSure,
      answerStatus: skipped ? 'skipped' : preferNot ? 'prefer_not' : notSure ? 'not_sure' : 'answered',
      sensitivity: q.sensitivity || 'standard',
    });
    const answerValue = answer.selectedOptionId || answer.answerText || answer.answerBoolean;
    const next = await this.engine.getNextQuestion(q.id, answerValue);
    if (next) await this.renderQuestion(next);
    else this._emit('completed');
  }

  _makeTextBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'biye-soft-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  _numberInput(placeholder) {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.placeholder = placeholder;
    inp.className = 'biye-field-input biye-range-input';
    return inp;
  }

  _listeners = {};
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
  }
}
