/**
 * PaymentDetailPage.jsx
 * Full payment record + nested refund history.
 * Accessible by: admin, manager, front_desk
 * Refund action: admin, manager only
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { paymentApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import PaymentConfirmModal from './PaymentConfirmModal';
import PaymentRefundModal from './PaymentRefundModal';
import styles from './PaymentDetailPage.module.css';

const STATUS_COLORS = {
  paid: '#16a34a', pending: '#ca8a04', refunded: '#6366f1',
  cancelled: '#dc2626', failed: '#dc2626', expired: '#64748b',
  completed: '#16a34a',
};

function Field({ label, value }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{value ?? '—'}</span>
    </div>
  );
}

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canManagePayments, canRefund } = useAdminRole();

  const [payment, setPayment]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showRefund, setShowRefund]   = useState(false);

  useEffect(() => {
    paymentApi.detail(id)
      .then(setPayment)
      .catch((err) => setError(err.response?.data?.detail ?? 'Payment not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleActionSuccess = (updated) => {
    setPayment(updated);
    setShowConfirm(false);
    setShowRefund(false);
  };

  if (!canManagePayments) return <div className={styles.stateError}>Access denied.</div>;
  if (loading)             return <div className={styles.state}>Loading…</div>;
  if (error)               return <div className={styles.stateError}>{error}</div>;
  if (!payment)            return null;

  const statusColor = STATUS_COLORS[payment.status] ?? '#64748b';

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/admin/payments')}>← Payments</button>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>{payment.receipt_number || `Payment #${payment.id}`}</h1>
          <span style={{ color: statusColor, fontWeight: 700, fontSize: '0.875rem' }}>
            ● {payment.status_display}
          </span>
        </div>
        <div className={styles.actions}>
          {payment.status === 'pending' && (
            <button className={styles.confirmBtn} onClick={() => setShowConfirm(true)}>
              Confirm Payment
            </button>
          )}
          {payment.status === 'paid' && canRefund && (
            <button className={styles.refundBtn} onClick={() => setShowRefund(true)}>
              Issue Refund
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className={styles.cards}>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Amount</span>
          <span className={styles.cardValue}>₱{Number(payment.amount).toLocaleString()}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Total Refunded</span>
          <span className={styles.cardValue}>₱{Number(payment.total_refunded ?? 0).toLocaleString()}</span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Net</span>
          <span className={styles.cardValue}>
            ₱{(Number(payment.amount) - Number(payment.total_refunded ?? 0)).toLocaleString()}
          </span>
        </div>
        <div className={styles.card}>
          <span className={styles.cardLabel}>Refund Count</span>
          <span className={styles.cardValue}>{payment.refund_count}</span>
        </div>
      </div>

      {/* Details */}
      <div className={styles.sections}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Booking & Guest</h2>
          <div className={styles.grid}>
            <Field label="Booking Ref"  value={payment.booking_reference} />
            <Field label="Room"         value={payment.room_number} />
            <Field label="Guest Name"   value={payment.guest_name} />
            <Field label="Guest Email"  value={payment.guest_email} />
          </div>
        </div>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Payment Info</h2>
          <div className={styles.grid}>
            <Field label="Method"         value={payment.payment_method_display} />
            <Field label="Type"           value={payment.payment_type_display} />
            <Field label="Provider"       value={payment.provider_display} />
            <Field label="Currency"       value={payment.currency} />
            <Field label="Transaction ID" value={payment.transaction_id} />
            <Field label="Session ID"     value={payment.checkout_session_id} />
            <Field label="Paid At"
              value={payment.paid_at ? new Date(payment.paid_at).toLocaleString() : null} />
            <Field label="Expires At"
              value={payment.expires_at ? new Date(payment.expires_at).toLocaleString() : null} />
            <Field label="Created" value={new Date(payment.created_at).toLocaleString()} />
          </div>
        </div>
      </div>

      {/* Refunds */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Refunds ({payment.refund_count})</h2>
        {payment.refunds?.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>ID</th><th>Amount</th><th>Status</th><th>Reason</th>
                  <th>Initiated By</th><th>Date</th><th>Provider Ref</th>
                </tr>
              </thead>
              <tbody>
                {payment.refunds.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.refId}>#{r.id}</td>
                    <td className={styles.bold}>₱{Number(r.amount).toLocaleString()}</td>
                    <td style={{ color: STATUS_COLORS[r.status] ?? '#64748b', fontWeight: 600 }}>
                      {r.status_display}
                    </td>
                    <td>{r.reason || '—'}</td>
                    <td>{r.initiated_by_email || '—'}</td>
                    <td className={styles.muted}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className={styles.muted}>{r.provider_refund_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>No refunds.</p>
        )}
      </div>

      {showConfirm && (
        <PaymentConfirmModal
          payment={payment}
          onClose={() => setShowConfirm(false)}
          onSuccess={handleActionSuccess}
        />
      )}
      {showRefund && (
        <PaymentRefundModal
          payment={payment}
          onClose={() => setShowRefund(false)}
          onSuccess={handleActionSuccess}
        />
      )}
    </div>
  );
}