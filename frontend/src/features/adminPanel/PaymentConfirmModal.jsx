/**
 * PaymentConfirmModal.jsx
 * Manually confirm a PENDING cash payment.
 */

import { useState } from 'react';
import { paymentApi } from '../../services/adminApi';
import styles from './PaymentModal.module.css';

export default function PaymentConfirmModal({ payment, onClose, onSuccess }) {
  const [notes, setNotes]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await paymentApi.confirm(payment.id, { notes });
      onSuccess(res.payment);
    } catch (err) {
      const data = err.response?.data;
      setError(data?.detail ?? data?.non_field_errors?.[0] ?? 'Failed to confirm payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Confirm Payment</h2>
        <p className={styles.modalSub}>
          Manually mark this payment as <strong>PAID</strong>.
        </p>

        <div className={styles.paymentSummary}>
          <div className={styles.summaryRow}>
            <span>Booking</span><strong>{payment.booking_reference}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Guest</span><strong>{payment.guest_name}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Amount</span><strong>₱{Number(payment.amount).toLocaleString()}</strong>
          </div>
          <div className={styles.summaryRow}>
            <span>Method</span><strong>{payment.payment_method_display}</strong>
          </div>
        </div>

        <label className={styles.label}>
          Notes (optional)
          <textarea
            className={styles.textarea}
            rows={3}
            placeholder="e.g. Cash received at front desk"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className={styles.confirmBtn} onClick={handleConfirm} disabled={loading}>
            {loading ? 'Confirming…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}