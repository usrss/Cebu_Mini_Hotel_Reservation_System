/**
 * GuestBookingHistory.jsx
 * Paginated full booking history for a specific guest.
 * Accessible by: admin, manager, receptionist, front_desk
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { guestApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './GuestBookingHistory.module.css';

const STATUS_STYLES = {
  confirmed:       { bg: '#dcfce7', color: '#16a34a' },
  pending_payment: { bg: '#fef9c3', color: '#ca8a04' },
  cancelled:       { bg: '#fee2e2', color: '#dc2626' },
  checked_in:      { bg: '#e0e7ff', color: '#6366f1' },
  checked_out:     { bg: '#f1f5f9', color: '#475569' },
  no_show:         { bg: '#ffe4e6', color: '#9f1239' },
};

function StatusBadge({ value }) {
  const s = STATUS_STYLES[value] ?? { bg: '#f1f5f9', color: '#64748b' };
  return (
    <span style={{ background: s.bg, color: s.color, padding: '0.25rem 0.625rem',
      borderRadius: 9999, fontSize: '0.75rem', fontWeight: 600 }}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export default function GuestBookingHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canViewGuests } = useAdminRole();

  const [bookings, setBookings]     = useState([]);
  const [guestEmail, setGuestEmail] = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [count, setCount]           = useState(0);
  const [ordering, setOrdering]     = useState('-created_at');

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const data    = await guestApi.bookings(id, { ordering, page });
      const results = data.results ?? data;
      setBookings(results);
      setCount(data.count ?? results.length);
      setTotalPages(data.count ? Math.ceil(data.count / 20) : 1);
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [id, ordering, page]);

  useEffect(() => {
    guestApi.detail(id)
      .then((g) => setGuestEmail(g.email))
      .catch((err) => {
        console.error('Failed to fetch guest detail:', err);
        setGuestEmail('Guest');
      });
    fetchBookings();
  }, [id, fetchBookings]);

  if (!canViewGuests) return <div className={styles.stateError}>Access denied.</div>;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(`/admin/guests/${id}`)}>
        ← Back
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>Booking History</h1>
        <p className={styles.subtitle}>{count} bookings total</p>
      </div>

      <div className={styles.toolbar}>
        <select className={styles.select} value={ordering}
          onChange={(e) => { setOrdering(e.target.value); setPage(1); }}>
          <option value="-created_at">Newest first</option>
          <option value="created_at">Oldest first</option>
          <option value="-check_in">Check-in ↓</option>
          <option value="check_in">Check-in ↑</option>
          <option value="status">Status</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.state}>Loading…</div>
      ) : error ? (
        <div className={styles.stateError}>{error}</div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Reference</th><th>Room</th><th>Check-in</th>
                  <th>Check-out</th><th>Status</th><th>Amount</th><th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className={styles.row}>
                    <td className={styles.ref}>{b.reference_number}</td>
                    <td>
                      <span className={styles.roomNum}>Room {b.room_number}</span>
                      <span className={styles.roomType}>{b.room_type}</span>
                    </td>
                    <td>{new Date(b.check_in).toLocaleDateString()}</td>
                    <td>{new Date(b.check_out).toLocaleDateString()}</td>
                    <td><StatusBadge value={b.status} /></td>
                    <td className={styles.amount}>₱{Number(b.total_price).toLocaleString()}</td>
                    <td className={styles.date}>{new Date(b.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr><td colSpan={7} className={styles.empty}>No bookings found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>←</button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}