/**
 * BIYE.LTD — payment.js
 * Payment initiation and status. Browser only initiates — server verifies.
 * NEVER trust payment_success=true from client.
 */
import { DB } from './supabase.js';
import { CONFIG } from './config.js';
import { PrivacySecurity } from './privacy-security.js';
import { ErrorMonitor } from './error-monitor.js';

export const Payment = {
  async createInvoice(profileId, type = 'registration') {
    PrivacySecurity.assertOwnProfile(profileId);
    const price = type === 'registration' ? CONFIG.PRICING.registrationFee : CONFIG.PRICING.additionalMatchViewFee;
    const vat = type === 'registration' ? Math.round(price * CONFIG.PRICING.registrationVat) : 0;
    const res = await fetch(CONFIG.PAYMENT.gatewayEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'createInvoice', customer_id: profileId, package_code: type === 'registration' ? 'REG' : 'MATCH_VIEW' }),
    });
    if (!res.ok) throw new Error('invoice_creation_failed');
    return res.json();
  },

  /** Verify payment status — always server-side */
  async verifyPayment(invoiceNumber) {
    const res = await fetch(CONFIG.PAYMENT.verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_number: invoiceNumber }),
    });
    if (!res.ok) throw new Error('verification_failed');
    const data = await res.json();
    return data;
  },

  /** Poll payment status (for gateway callbacks) */
  async pollPaymentStatus(invoiceNumber, timeoutMs = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = await this.verifyPayment(invoiceNumber);
      if (result.status === 'COMPLETED') return { ok: true, result };
      if (result.status === 'FAILED') return { ok: false, result };
      await new Promise(r => setTimeout(r, 3000));
    }
    return { ok: false, error: 'timeout' };
  },

  async loadInvoice(profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.select('invoices', {
      filters: { profile_id: profileId },
      order: { column: 'created_at', asc: false },
      limit: 10,
    });
  },

  async loadPayments(profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.select('payments', {
      filters: { profile_id: profileId },
      order: { column: 'created_at', asc: false },
    });
  },

  async loadReceipts(profileId) {
    PrivacySecurity.assertOwnProfile(profileId);
    return DB.select('receipts', {
      filters: { profile_id: profileId },
      order: { column: 'issued_at', asc: false },
    });
  },

  formatAmount(amount, currency = 'BDT') {
    return `${CONFIG.PRICING.currencySymbol}${Number(amount).toLocaleString()}`;
  },

  /** Handle payment callback URL params safely */
  handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const inv = params.get('inv');
    const status = params.get('payment');
    // Clear sensitive params from URL
    if (inv || status) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    return { inv, status };
  },
};
