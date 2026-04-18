/**
 * PaymentConfirmModal.jsx
 * Manually confirm a PENDING cash payment.
 */

import { useEffect, useState } from 'react';
import { paymentApi } from '../../services/adminApi';
import styles from './PaymentModal.module.css';

const confirmInFlight = new Set();

export default function PaymentConfirmModal({ payment, onClose, onSuccess }) {
  const [notes, setNotes]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    // Log current payment status when the modal is opened.
    if (!payment?.id) return;
    // #region agent log
    fetch('http://127.0.0.1:7856/ingest/4e163005-d170-46ab-9664-3f995293df86', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'a06f0f',
      },
      body: JSON.stringify({
        sessionId: 'a06f0f',
        runId: 'pre-fix',
        hypothesisId: 'H3',
        location: 'PaymentConfirmModal.jsx:open',
        message: 'Confirm modal opened; logging payment status',
        data: {
          paymentId: payment.id,
          clientPaymentStatus: payment.status,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [payment?.id, payment?.status]);

  const handleConfirm = async () => {
    if (!payment?.id) return;
    if (confirmInFlight.has(payment.id)) return;
    const idempotencyKey = `${payment.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    confirmInFlight.add(payment.id);
    setLoading(true);
    setError(null);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7856/ingest/4e163005-d170-46ab-9664-3f995293df86', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a06f0f',
        },
        body: JSON.stringify({
          sessionId: 'a06f0f',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'PaymentConfirmModal.jsx:confirmClick',
          message: 'Confirm clicked',
          data: {
            paymentId: payment.id,
            clientPaymentStatus: payment.status,
            notesLength: notes?.length ?? 0,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const res = await paymentApi.confirm(payment.id, { notes, idempotency_key: idempotencyKey });

      // #region agent log
      fetch('http://127.0.0.1:7856/ingest/4e163005-d170-46ab-9664-3f995293df86', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a06f0f',
        },
        body: JSON.stringify({
          sessionId: 'a06f0f',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'PaymentConfirmModal.jsx:confirmSuccess',
          message: 'Confirm API succeeded',
          data: {
            paymentId: res?.payment?.id ?? payment.id,
            paymentStatus: res?.payment?.status,
            receiptNumber: res?.payment?.receipt_number ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      onSuccess(res.payment);
    } catch (err) {
      const data = err.response?.data;
      if (err.response?.status === 409) {
        setError('This payment was already confirmed.');
        try {
          const latest = await paymentApi.detail(payment.id);
          onSuccess(latest);
        } catch {
          // ignore refresh failure; user can retry with updated status.
        }
        return;
      }
      // #region agent log
      fetch('http://127.0.0.1:7856/ingest/4e163005-d170-46ab-9664-3f995293df86', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Debug-Session-Id': 'a06f0f',
        },
        body: JSON.stringify({
          sessionId: 'a06f0f',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'PaymentConfirmModal.jsx:confirmError',
          message: 'Confirm API failed',
          data: {
            paymentId: payment.id,
            httpStatus: err.response?.status ?? null,
            backendErrorDetail: data?.detail ?? null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      setError(data?.detail ?? data?.non_field_errors?.[0] ?? 'Failed to confirm payment.');
    } finally {
      if (payment?.id) confirmInFlight.delete(payment.id);
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
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={loading || confirmInFlight.has(payment?.id)}
          >
            {loading ? 'Confirming…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}