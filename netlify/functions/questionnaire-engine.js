/**
 * BIYE.LTD — questionnaire-engine.js
 * Adaptive questionnaire: lazy loads questions, branching, auto-save.
 * Supports 600+ questions without loading all at once.
 */

import { DB } from './supabase.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';
import { CONFIG } from './config.js';

const BATCH_SIZE = CONFIG.QUESTIONNAIRE.batchSize;
const AUTO_SAVE_DELAY = CONFIG.QUESTIONNAIRE.autoSaveDebounceMs;

export class QuestionnaireEngine {
  constructor(profileId) {
    this.profileId = profileId;
    this.session = null;
    this.currentQuestion = null;
    this.answeredIds = new Set();
    this.skippedIds = new Set();
    this.questionCache = new Map();
    this.logicCache = [];
    this._saveTimer = null;
    this._listeners = {};
  }

  // ── Session management ────────────────────────────────
  async init() {
    PrivacySecurity.assertValidUUID(this.profileId);
    // Find or create session
    try {
      const sessions = await DB.select('questionnaire_sessions', {
        filters: { profile_id: this.profileId, status: 'in_progress' },
        order: { column: 'last_activity_at', asc: false },
        limit: 1,
      });
      if (sessions?.length) {
        this.session = sessions[0];
        await this._loadAnsweredIds();
      } else {
        await this._createSession();
      }
      return this.session;
    } catch (e) {
      ErrorMonitor.capture(e, 'questionnaire.init');
      throw e;
    }
  }

  async _createSession() {
    const rows = await DB.insert('questionnaire_sessions', {
      profile_id: this.profileId,
      questionnaire_version: '1.0',
      status: 'started',
      questions_presented: 0,
      questions_answered: 0,
      progress_percent: 0,
    });
    this.session = rows?.[0];
  }

  async _loadAnsweredIds() {
    const answers = await DB.select('questionnaire_answers', {
      columns: 'question_id,answer_status',
      filters: { profile_id: this.profileId },
    });
    answers?.forEach(a => {
      this.answeredIds.add(a.question_id);
      if (a.answer_status === 'skipped') this.skippedIds.add(a.question_id);
    });
  }

  // ── Question loading ──────────────────────────────────
  /** Load next batch of questions from DB */
  async loadNextBatch(domain = null, offset = 0) {
    try {
      let q = DB.client.from('question_definitions')
        .select('id,question_code,question_key,question_type,domain,subdomain,sensitivity,required,consent_required,parent_question_id,priority_relevance,matching_relevance,sort_order')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);
      if (domain) q = q.eq('domain', domain);
      const { data, error } = await q;
      if (error) throw error;
      data?.forEach(q => this.questionCache.set(q.id, q));
      return data || [];
    } catch (e) {
      ErrorMonitor.capture(e, 'questionnaire.loadBatch');
      return [];
    }
  }

  /** Load options for a question */
  async loadOptions(questionId) {
    if (this.questionCache.get(questionId + '_opts')) {
      return this.questionCache.get(questionId + '_opts');
    }
    const opts = await DB.select('question_options', {
      filters: { question_id: questionId, active: true },
      order: { column: 'sort_order', asc: true },
    });
    this.questionCache.set(questionId + '_opts', opts || []);
    return opts || [];
  }

  /** Load branching logic for a question */
  async loadLogic(questionId) {
    const logic = await DB.select('question_logic', {
      filters: { source_question_id: questionId, active: true },
      order: { column: 'priority', asc: true },
    });
    return logic || [];
  }

  // ── Adaptive engine ───────────────────────────────────
  /** Determine next question based on last answer and logic */
  async getNextQuestion(lastAnswerId = null, lastAnswerValue = null) {
    // Apply branching logic if we have a last answer
    if (lastAnswerId) {
      const logic = await this.loadLogic(lastAnswerId);
      for (const rule of logic) {
        if (this._evaluateCondition(rule, lastAnswerValue)) {
          if (rule.action === 'show' || rule.action === 'require') {
            const q = await this._fetchQuestion(rule.target_question_id);
            if (q && !this.answeredIds.has(q.id)) return q;
          }
          if (rule.action === 'skip') {
            this.skippedIds.add(rule.target_question_id);
          }
        }
      }
    }

    // Load next unanswered question in default order
    let offset = this.answeredIds.size;
    while (true) {
      const batch = await this.loadNextBatch(null, offset);
      if (!batch.length) return null; // No more questions

      const next = batch.find(q =>
        !this.answeredIds.has(q.id) && !this.skippedIds.has(q.id)
      );
      if (next) {
        this.currentQuestion = next;
        await this._updateSession({ current_question_id: next.id });
        return next;
      }
      offset += BATCH_SIZE;
      if (offset > 700) return null; // Safety ceiling
    }
  }

  async _fetchQuestion(id) {
    if (this.questionCache.has(id)) return this.questionCache.get(id);
    const data = await DB.select('question_definitions', {
      filters: { id, active: true }, single: true,
    });
    if (data) this.questionCache.set(id, data);
    return data;
  }

  _evaluateCondition(rule, answerValue) {
    if (!answerValue) return false;
    const v = String(answerValue).toLowerCase();
    const cv = String(rule.condition_value || '').toLowerCase();
    switch (rule.condition_operator) {
      case 'equals': return v === cv;
      case 'not_equals': return v !== cv;
      case 'contains': return v.includes(cv);
      case 'greater_than': return parseFloat(v) > parseFloat(cv);
      case 'less_than': return parseFloat(v) < parseFloat(cv);
      default: return false;
    }
  }

  // ── Answer saving ─────────────────────────────────────
  /** Save an answer with debounce */
  async saveAnswer({ questionId, selectedOptionId = null, answerText = null, answerNumber = null,
    answerBoolean = null, answerJson = null, answerStatus = 'answered',
    skipped = false, preferNotToAnswer = false, notSure = false,
    sensitivity = 'standard', consentStatus = 'not_required' }) {

    const row = {
      session_id: this.session.id,
      profile_id: this.profileId,
      question_id: questionId,
      selected_option_id: selectedOptionId,
      answer_text: answerText,
      answer_number: answerNumber,
      answer_boolean: answerBoolean,
      answer_json: answerJson ? JSON.stringify(answerJson) : null,
      answer_status: answerStatus,
      skipped,
      prefer_not_to_answer: preferNotToAnswer,
      not_sure: notSure,
      sensitivity,
      consent_status: consentStatus,
      updated_at: new Date().toISOString(),
    };

    try {
      await DB.upsert('questionnaire_answers', row, { onConflict: 'session_id,question_id' });
      this.answeredIds.add(questionId);
      if (skipped) this.skippedIds.add(questionId);
      await this._updateProgress();
      this._emit('answerSaved', { questionId });
    } catch (e) {
      ErrorMonitor.capture(e, 'questionnaire.saveAnswer');
      throw e;
    }
  }

  // ── Progress ──────────────────────────────────────────
  async _updateProgress() {
    const answered = this.answeredIds.size;
    const progress = Math.min(100, Math.round((answered / 137) * 100)); // 137 base metrics
    await this._updateSession({
      questions_answered: answered,
      progress_percent: progress,
      last_activity_at: new Date().toISOString(),
      status: progress >= 100 ? 'completed' : 'in_progress',
      completed_at: progress >= 100 ? new Date().toISOString() : null,
    });
    this._emit('progressUpdate', { answered, progress, readyForMatching: answered >= CONFIG.QUESTIONNAIRE.minAnswersForMatching });
  }

  async _updateSession(updates) {
    if (!this.session?.id) return;
    await DB.update('questionnaire_sessions', updates, { id: this.session.id });
    Object.assign(this.session, updates);
  }

  get progress() {
    return {
      answered: this.answeredIds.size,
      percent: Math.min(100, Math.round((this.answeredIds.size / 137) * 100)),
      readyForMatching: this.answeredIds.size >= CONFIG.QUESTIONNAIRE.minAnswersForMatching,
    };
  }

  // ── Pause / Resume ────────────────────────────────────
  async pause() { await this._updateSession({ status: 'paused' }); }
  async resume() { await this._updateSession({ status: 'in_progress' }); }
  async complete() {
    await this._updateSession({ status: 'completed', completed_at: new Date().toISOString(), progress_percent: 100 });
    this._emit('completed', this.progress);
  }

  // ── Events ────────────────────────────────────────────
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
  }
}
