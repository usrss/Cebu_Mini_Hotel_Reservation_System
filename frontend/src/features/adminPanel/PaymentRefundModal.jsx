/**
 * PaymentRefundModal.jsx
 * Initiate a partial or full refund for a PAID payment.
 * Only admin / manager can reach this (enforced by PaymentListPage / PaymentDetailPage).
 */

import { useEffect, useRef, useState } from 'react';
import { paymentApi } from '../../services/adminApi';
import styles from './PaymentModal.module.css';

const refundInFlight = new Set();

// PayMongo accepted reason codes
const REFUND_REASONS = [
  { value: 'requested_by_guest', label: 'Requested by guest' },
  { value: 'duplicate', label: 'Duplicate transaction' },
  { value: 'fraudulent', label: 'Fraudulent' },
  { value: 'other', label: 'Other' },
];

export default function PaymentRefundModal({ payment, onClose, onSuccess }) {
  const initialRemaining = Number(payment.amount) - Number(payment.total_refunded ?? 0);
  const [paymentLive, setPaymentLive] = useState(payment);
  const remaining = paymentLive
    ? Number(paymentLive.amount) - Number(paymentLive.total_refunded ?? 0)
    : 0;

  const [amount, setAmount] = useState(initialRemaining.toFixed(2));
  const [reason, setReason] = useState('requested_by_guest');
  const [notes, setNotes] = useState('');
  const [cashRefund, setCashRefund] = useState(
    payment?.provider === 'manual' || payment?.payment_method === 'cash'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const amountTouchedRef = useRef(false);

  // Check if this is a manual/cash payment (walk-in)
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
        const latestRemaining =
          Number(fresh.amount) - Number(fresh.total_refunded ?? 0);
        if (!amountTouchedRef.current) setAmount(latestRemaining.toFixed(2));
      } catch {
        // If refresh fails, keep displaying current modal data.
      }
    })();
  }, [payment?.id]);

  const handleRefund = async () => {
    if (!payment?.id) return;
    if (refundInFlight.has(payment.id)) return;

    // Validate amount
    const refundAmount = parseFloat(amount);
    if (isNaN(refundAmount) || refundAmount <= 0) {
      setError('Please enter a valid refund amount.');
      return;
    }

    if (refundAmount > remaining) {
      setError(`Refund amount cannot exceed ₱${remaining.toLocaleString()}.`);
      return;
    }

    // Confirm cash refund for walk-ins
    if (isManualPayment && cashRefund) {
      const confirmed = window.confirm(
        `You are about to issue a cash refund of ₱${refundAmount.toFixed(2)} to ${payment.guest_name}.\n\n` +
        `Please ensure you have the cash ready at the front desk.\n\n` +
        `Do you want to proceed?`
      );
      if (!confirmed) return;
    }

    refundInFlight.add(payment.id);
    setLoading(true);
    setError(null);

    try {
      await refetchPayment();

      const finalRefundAmount = Math.min(refundAmount, remaining);

      const body = {
        reason: reason,
        notes: notes || undefined,
        refund_amount: finalRefundAmount.toFixed(2),
        cash_refund: cashRefund,
      };

      const res = await paymentApi.refund(payment.id, body);

      // Show success message for cash refunds
      if (isManualPayment && cashRefund) {
        alert(
          `✅ Cash refund of ₱${finalRefundAmount.toFixed(2)} has been recorded.\n\n` +
          `Please give the cash to ${payment.guest_name} at the front desk.`
        );
      }

      window.dispatchEvent(new Event('revenue-updated'));
      onSuccess(res.payment);
    } catch (err) {
      const data = err.response?.data;

      const backendDetail =
        data?.non_field_errors?.[0] ??
        data?.refund_amount?.[0] ??
        data?.detail ??
        'Refund failed.';

      const backendDetailStr = typeof backendDetail === 'string' ? backendDetail : String(backendDetail);

      if (
        backendDetailStr.toLowerCase().includes('exceeds remaining') ||
        backendDetailStr.toLowerCase().includes('remaining refundable')
      ) {
        setError('Refund amount exceeds remaining refundable balance. Updating latest balance…');
        try {
          const fresh = await refetchPayment();
          const latestRemaining = Number(fresh.amount) - Number(fresh.total_refunded ?? 0);
          setAmount(latestRemaining.toFixed(2));
          setError(`Balance updated. Maximum refundable is now ₱${latestRemaining.toLocaleString()}.`);
        } catch {
          setError(backendDetailStr);
        }
      } else {
        setError(backendDetailStr);
      }
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
              className={styles.fullAmountBtn}
              onClick={handleSetFullAmount}
              style={{
                marginLeft: '12px',
                padding: '2px 8px',
                fontSize: '11px',
                background: 'none',
                border: '1px solid var(--gold-border, #d4af37)',
                borderRadius: '4px',
                color: 'var(--gold, #d4af37)',
                cursor: 'pointer',
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
            placeholder={isManualPayment ? "e.g., Cash given to guest at front desk" : "Internal notes about this refund..."}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {/* Cash refund checkbox for walk-in / manual payments */}
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

        {/* Warning for online payment refunds */}
        {!isManualPayment && (
          <div className={styles.infoNote}>
            <span>ℹ️</span>
            <span>
              This refund will be processed through {payment.provider === 'paymongo' ? 'PayMongo' : 'PayPal'}.
              The guest will receive the refund in 5-10 business days.
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