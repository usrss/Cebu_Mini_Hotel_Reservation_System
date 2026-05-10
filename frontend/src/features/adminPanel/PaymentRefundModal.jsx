/**
 * PaymentRefundModal.jsx
 * Initiate a partial or full refund for a PAID payment.
 * Only admin / manager can reach this (enforced by PaymentListPage / PaymentDetailPage).
 */

import { useEffect, useRef, useState } from 'react';
import { paymentApi } from '../../services/adminApi';
import styles from './PaymentModal.module.css';

const refundInFlight = new Set();

const REFUND_REASONS = [
  { value: 'requested_by_guest', label: 'Requested by guest' },
  { value: 'duplicate',          label: 'Duplicate transaction' },
  { value: 'fraudulent',         label: 'Fraudulent' },
  { value: 'other',              label: 'Other' },
];

// ─── Friendly error messages ──────────────────────────────────────────────────
// Maps backend error keywords to plain-language explanations staff will understand.
function getFriendlyError(raw) {
  if (!raw) return 'Something went wrong. Please try again.';
  const msg = typeof raw === 'string' ? raw.toLowerCase() : String(raw).toLowerCase();

  if (msg.includes('exceeds remaining') || msg.includes('remaining refundable'))
    return "The refund amount is more than what's left to refund. The maximum amount has been updated below — please review and try again.";
  if (msg.includes('already refunded') || msg.includes('fully refunded'))
    return "This payment has already been fully refunded.";
  if (msg.includes('not paid') || msg.includes('invalid status'))
    return "This payment cannot be refunded because it hasn't been marked as paid yet.";
  if (msg.includes('paymongo') || msg.includes('payment gateway') || msg.includes('provider'))
    return "The payment provider was unable to process this refund. Please try again in a few minutes or contact support.";
  if (msg.includes('network') || msg.includes('timeout') || msg.includes('connection'))
    return "A connection error occurred. Please check your internet connection and try again.";
  if (msg.includes('permission') || msg.includes('not allowed') || msg.includes('forbidden'))
    return "You don't have permission to issue this refund. Please contact an admin.";
  if (msg.includes('not found'))
    return "This payment record could not be found. It may have been deleted.";
  if (msg.includes('invalid') && msg.includes('amount'))
    return "The refund amount entered is not valid. Please enter a positive number.";

  // Fallback — don't expose raw backend text to staff
  return "The refund could not be processed. Please try again or contact support if the problem continues.";
}

export default function PaymentRefundModal({ payment, onClose, onSuccess }) {
  const initialRemaining = Number(payment.amount) - Number(payment.total_refunded ?? 0);
  const [paymentLive, setPaymentLive] = useState(payment);
  const remaining = paymentLive
    ? Number(paymentLive.amount) - Number(paymentLive.total_refunded ?? 0)
    : 0;

  const [amount, setAmount]       = useState(initialRemaining.toFixed(2));
  const [reason, setReason]       = useState('requested_by_guest');
  const [notes, setNotes]         = useState('');
  const [cashRefund, setCashRefund] = useState(
    payment?.provider === 'manual' || payment?.payment_method === 'cash'
  );
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const amountTouchedRef          = useRef(false);

  const isManualPayment = payment?.provider === 'manual' || payment?.payment_method === 'cash';

  const refetchPayment = async () => {
    const fresh = await paymentApi.detail(payment?.id);
    setPaymentLive(fresh);
    return fresh;
  };

  useEffect(() => {
    if (!payment?.id) return;
    amountTouchedRef.current = false;
    setError(null);

    (async () => {
      try {
        const fresh = await refetchPayment();
        const latestRemaining = Number(fresh.amount) - Number(fresh.total_refunded ?? 0);
        if (!amountTouchedRef.current) setAmount(latestRemaining.toFixed(2));
      } catch {
        // Keep existing modal data if refresh fails
      }
    })();
  }, [payment?.id]);

  const handleRefund = async () => {
    if (!payment?.id) return;
    if (refundInFlight.has(payment.id)) return;

    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      setError('Please enter a valid refund amount greater than ₱0.');
      return;
    }
    if (refundAmount > remaining) {
      setError(`The amount entered (₱${refundAmount.toLocaleString()}) is more than the refundable balance of ₱${remaining.toLocaleString()}.`);
      return;
    }

    if (isManualPayment && cashRefund) {
      const confirmed = window.confirm(
        `You are about to issue a cash refund of ₱${refundAmount.toFixed(2)} to ${payment.guest_name}.\n\n` +
        `Please ensure you have the cash ready at the front desk.\n\nDo you want to proceed?`
      );
      if (!confirmed) return;
    }

    refundInFlight.add(payment.id);
    setLoading(true);
    setError(null);

    try {
      await refetchPayment();

      const finalAmount = Math.min(refundAmount, remaining);

      const res = await paymentApi.refund(payment.id, {
        reason,
        notes:         notes || undefined,
        refund_amount: finalAmount.toFixed(2),
        cash_refund:   cashRefund,
      });

      if (isManualPayment && cashRefund) {
        alert(
          `✅ Cash refund of ₱${finalAmount.toFixed(2)} recorded.\n\n` +
          `Please give the cash to ${payment.guest_name} at the front desk.`
        );
      }

      window.dispatchEvent(new Event('revenue-updated'));
      onSuccess(res.payment);
    } catch (err) {
      const data = err.response?.data;

      const rawError =
        data?.non_field_errors?.[0] ??
        data?.refund_amount?.[0] ??
        data?.detail ??
        '';

      // If the amount exceeded the remaining balance, refresh so staff sees the correct max
      const rawStr = typeof rawError === 'string' ? rawError : String(rawError);
      if (
        rawStr.toLowerCase().includes('exceeds remaining') ||
        rawStr.toLowerCase().includes('remaining refundable')
      ) {
        try {
          const fresh = await refetchPayment();
          const latestRemaining = Number(fresh.amount) - Number(fresh.total_refunded ?? 0);
          setAmount(latestRemaining.toFixed(2));
        } catch {
          // Ignore — friendly message will still show
        }
      }

      setError(getFriendlyError(rawError));
    } finally {
      if (payment?.id) refundInFlight.delete(payment.id);
      setLoading(false);
    }
  };

  const handleSetFullAmount = () => {
    setAmount(remaining.toFixed(2));
    amountTouchedRef.current = true;
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>
          {isManualPayment ? 'Issue Cash Refund' : 'Initiate Refund'}
        </h2>
        <p className={styles.modalSub}>
          Refundable: <strong>₱{remaining.toLocaleString()}</strong>
          {remaining > 0 && (
            <button
              type="button"
              onClick={handleSetFullAmount}
              style={{
                marginLeft: 12, padding: '2px 8px', fontSize: 11,
                background: 'none', border: '1px solid var(--gold-border, #d4af37)',
                borderRadius: 4, color: 'var(--gold, #d4af37)', cursor: 'pointer',
              }}
            >
              Set Full Amount
            </button>
          )}
        </p>

        <div className={styles.paymentSummary}>
          <div className={styles.summaryRow}>
            <span>Booking</span><strong>{payment.booking_reference || 'Walk-in'}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Guest</span><strong>{payment.guest_name}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Total Paid</span><strong>₱{Number(payment.amount).toLocaleString()}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Already Refunded</span>
            <strong>₱{Number(payment.total_refunded ?? 0).toLocaleString()}</strong>
          </div>
          {isManualPayment && (
            <div className={styles.summaryRow}>
              <span>Payment Method</span>
              <strong style={{ color: 'var(--amber, #f59e0b)' }}>Cash / Manual</strong>
            </div>
          )}
        </div>

        <label className={styles.label}>
          Refund Amount (₱)
          <input
            type="number"
            className={styles.input}
            value={amount}
            min="0.01"
            max={remaining}
            step="0.01"
            onChange={(e) => {
              setAmount(e.target.value);
              amountTouchedRef.current = true;
            }}
          />
        </label>

        <label className={styles.label}>
          Reason
          <select
            className={styles.select}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            {REFUND_REASONS.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.label}>
          Additional Notes (optional)
          <textarea
            className={styles.textarea}
            rows={2}
            placeholder={isManualPayment
              ? 'e.g. Cash given to guest at front desk'
              : 'Internal notes about this refund…'}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {isManualPayment && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={cashRefund}
              onChange={(e) => setCashRefund(e.target.checked)}
            />
            <span>
              <strong>Cash refund</strong> — I confirm that cash will be given to the guest at the front desk
            </span>
          </label>
        )}

        {!isManualPayment && (
          <div className={styles.infoNote}>
            <span>ℹ️</span>
            <span>
              This refund will be processed through{' '}
              {payment.provider === 'paymongo' ? 'PayMongo' : 'PayPal'}.
              The guest will receive the refund within 5–10 business days.
            </span>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className={isManualPayment ? styles.cashRefundBtn : styles.refundBtn}
            onClick={handleRefund}
            disabled={loading || refundInFlight.has(payment?.id) || (isManualPayment && !cashRefund)}
          >
            {loading ? 'Processing…' : isManualPayment ? 'Issue Cash Refund' : 'Issue Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}