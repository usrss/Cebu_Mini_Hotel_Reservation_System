/**
 * PaymentRefundModal.jsx
 * Initiate a partial or full refund for a PAID payment.
 * Only admin / manager can reach this (enforced by PaymentListPage / PaymentDetailPage).
 */

import { useState } from 'react';
import { paymentApi } from '../../services/adminApi';
import styles from './PaymentModal.module.css';

export default function PaymentRefundModal({ payment, onClose, onSuccess }) {
  const remaining = Number(payment.amount) - Number(payment.total_refunded ?? 0);
  const [amount, setAmount]   = useState(remaining.toFixed(2));
  const [reason, setReason]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const handleRefund = async () => {
    setLoading(true);
    setError(null);
    try {
      const body = { reason };
      // Only send refund_amount if it's a partial refund
      if (parseFloat(amount) < remaining) body.refund_amount = amount;
      const res = await paymentApi.refund(payment.id, body);
      onSuccess(res.payment);
    } catch (err) {
      const data = err.response?.data;
      setError(
        data?.non_field_errors?.[0] ??
        data?.refund_amount?.[0] ??
        data?.detail ??
        'Refund failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Initiate Refund</h2>
        <p className={styles.modalSub}>
          Refundable: <strong>₱{remaining.toLocaleString()}</strong>
        </p>

        <div className={styles.paymentSummary}>
          <div className={styles.summaryRow}>
            <span>Booking</span><strong>{payment.booking_reference}</strong>
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
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label className={styles.label}>
          Reason (optional)
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="e.g. Guest requested cancellation"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className={styles.refundBtn} onClick={handleRefund} disabled={loading}>
            {loading ? 'Processing…' : 'Issue Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}