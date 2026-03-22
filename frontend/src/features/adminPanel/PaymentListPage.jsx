/**
 * PaymentListPage.jsx
 * Accessible by: admin, manager, front_desk
 * Refund action: admin, manager only
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { paymentApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import { getStoredUser } from '../../services/api';
import PaymentConfirmModal from './PaymentConfirmModal';
import PaymentRefundModal from './PaymentRefundModal';
import styles from './PaymentListPage.module.css';

const STATUS_COLORS = {
  paid:      { bg: '#dcfce7', color: '#16a34a' },
  pending:   { bg: '#fef9c3', color: '#ca8a04' },
  refunded:  { bg: '#e0e7ff', color: '#6366f1' },
  cancelled: { bg: '#fee2e2', color: '#dc2626' },
  failed:    { bg: '#fee2e2', color: '#dc2626' },
  expired:   { bg: '#f1f5f9', color: '#64748b' },
};

function StatusBadge({ status, label }) {
  const s = STATUS_COLORS[status] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{
      background: s.bg, color: s.color, padding: '0.2rem 0.6rem',
      borderRadius: 9999, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label || status}
    </span>
  );
}

// Returns the correct payment detail route based on the current user's role.
// front_desk has no separate detail page — detail is shown inline via selectedPayment state.
// admin/manager navigate to the full admin payment detail page.
function getPaymentDetailRoute(paymentId) {
  const user = getStoredUser();
  const role = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  if (role === 'front_desk') return null; // handled by inline detail panel
  return `/admin/payments/${paymentId}`;
}

function isFrontDesk() {
  const user = getStoredUser();
  const role = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  return role === 'front_desk';
}

// Returns the correct revenue route based on role.
function getRevenueRoute() {
  const user = getStoredUser();
  const role = user?.staff_profile?.effective_role ?? (user?.is_staff ? 'admin' : null);
  if (role === 'front_desk') {
    return '/staff/front-desk/payments';  // front desk has no separate revenue page
  }
  return '/admin/payments/revenue';
}

export default function PaymentListPage() {
  const navigate = useNavigate();
  const { canManagePayments, canRefund, role } = useAdminRole();

  const [payments, setPayments]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [count, setCount]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ordering, setOrdering]         = useState('-created_at');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [confirmPayment, setConfirmPayment] = useState(null);
  const [refundPayment, setRefundPayment]   = useState(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { ordering, page };
      if (search)       params.search = search;
      if (statusFilter) params.status = statusFilter;
      const data    = await paymentApi.list(params);
      const results = data.results ?? data;
      setPayments(results);
      setCount(data.count ?? results.length);
      setTotalPages(data.count ? Math.ceil(data.count / 20) : 1);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load payments.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, ordering, page]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleConfirmSuccess = (updated) => {
    setConfirmPayment(null);
    setPayments((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleRefundSuccess = (updated) => {
    setRefundPayment(null);
    setPayments((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  };

  if (!canManagePayments) return <div className={styles.forbidden}>Access denied.</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Payments</h1>
          <p className={styles.subtitle}>{count} transactions</p>
        </div>
        {['admin', 'manager'].includes(role) && (
          <button
            className={styles.revenueBtn}
            onClick={() => navigate(getRevenueRoute())}
          >
            Revenue Summary →
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Search reference, email, transaction ID…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className={styles.select}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
          <option value="cancelled">Cancelled</option>
          <option value="failed">Failed</option>
          <option value="expired">Expired</option>
        </select>
        <select
          className={styles.select}
          value={ordering}
          onChange={(e) => { setOrdering(e.target.value); setPage(1); }}
        >
          <option value="-created_at">Newest first</option>
          <option value="created_at">Oldest first</option>
          <option value="-amount">Highest amount</option>
          <option value="amount">Lowest amount</option>
          <option value="-paid_at">Paid at ↓</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.state}>Loading…</div>
      ) : error ? (
        <div className={styles.stateError}>{error}</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Receipt / Ref</th>
                <th>Guest</th>
                <th>Room</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr
                  key={p.id}
                  className={styles.row}
                  onClick={() => {
                    const dest = getPaymentDetailRoute(p.id);
                    if (dest) navigate(dest);
                    else setSelectedPayment(p);
                  }}
                >
                  <td>
                    <div className={styles.ref}>{p.receipt_number || '—'}</div>
                    <div className={styles.bookingRef}>{p.booking_reference}</div>
                  </td>
                  <td>
                    <div className={styles.guestName}>{p.guest_name}</div>
                    <div className={styles.guestEmail}>{p.guest_email}</div>
                  </td>
                  <td>{p.room_number || '—'}</td>
                  <td className={styles.amount}>
                    ₱{Number(p.amount).toLocaleString()}
                  </td>
                  <td>{p.payment_method_display}</td>
                  <td>
                    <StatusBadge status={p.status} label={p.status_display} />
                  </td>
                  <td className={styles.date}>
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className={styles.btnGroup}>
                      {p.status === 'pending' && (
                        <button
                          className={styles.confirmBtn}
                          onClick={() => setConfirmPayment(p)}
                        >
                          Confirm
                        </button>
                      )}
                      {p.status === 'paid' && canRefund && (
                        <button
                          className={styles.refundBtn}
                          onClick={() => setRefundPayment(p)}
                        >
                          Refund
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.empty}>No payments found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
        </div>
      )}

      {/* Inline payment detail panel for front_desk role */}
      {selectedPayment && isFrontDesk() && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}
          onClick={() => setSelectedPayment(null)}
        >
          <div style={{
            background: '#fff', borderRadius: 12, padding: 32,
            maxWidth: 480, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Payment Detail</h2>
              <button onClick={() => setSelectedPayment(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' }}>
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                ['Receipt No.',    selectedPayment.receipt_number || '—'],
                ['Booking Ref.',   selectedPayment.booking_reference || '—'],
                ['Room',           selectedPayment.room_number || '—'],
                ['Amount',         `₱${Number(selectedPayment.amount).toLocaleString()}`],
                ['Payment Type',   selectedPayment.payment_type_display],
                ['Method',         selectedPayment.payment_method_display],
                ['Status',         selectedPayment.status_display],
                ['Date',           new Date(selectedPayment.created_at).toLocaleString()],
                ['Paid At',        selectedPayment.paid_at ? new Date(selectedPayment.paid_at).toLocaleString() : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                  <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
            {selectedPayment.status === 'pending' && (
              <button
                style={{ marginTop: 20, width: '100%', padding: '10px 0', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 14 }}
                onClick={() => { setConfirmPayment(selectedPayment); setSelectedPayment(null); }}
              >
                Confirm Payment
              </button>
            )}
          </div>
        </div>
      )}

      {confirmPayment && (
        <PaymentConfirmModal
          payment={confirmPayment}
          onClose={() => setConfirmPayment(null)}
          onSuccess={handleConfirmSuccess}
        />
      )}
      {refundPayment && (
        <PaymentRefundModal
          payment={refundPayment}
          onClose={() => setRefundPayment(null)}
          onSuccess={handleRefundSuccess}
        />
      )}
    </div>
  );
}