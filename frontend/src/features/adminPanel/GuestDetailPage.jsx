/**
 * GuestDetailPage.jsx
 * Full guest profile. Accessible by: admin, manager, receptionist, front_desk
 * Block action restricted to: admin, manager
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { guestApi } from '../../services/adminApi';
import { useAdminRole } from '../hooks/useAdminRole';
import styles from './GuestDetailPage.module.css';

const STATUS_COLORS = {
  confirmed:       '#16a34a',
  pending_payment: '#d97706',
  cancelled:       '#dc2626',
  checked_in:      '#6366f1',
  checked_out:     '#64748b',
  no_show:         '#9f1239',
};

export default function GuestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canViewGuests, canModifyGuests } = useAdminRole();

  const [guest, setGuest]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    guestApi.detail(id)
      .then(setGuest)
      .catch((err) => setError(err.response?.data?.detail ?? 'Guest not found.'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleBlock = async () => {
    const newState = !guest.is_active;
    const reason   = newState ? '' : (prompt('Reason for blocking (optional):') ?? '');
    setBlocking(true);
    try {
      const res = await guestApi.block(id, { is_active: newState, reason });
      setGuest((g) => ({ ...g, is_active: res.guest?.is_active ?? newState }));
    } catch {
      alert('Failed to update status.');
    } finally {
      setBlocking(false);
    }
  };

  if (!canViewGuests) return <div className={styles.stateError}>Access denied.</div>;
  if (loading)        return <div className={styles.state}>Loading…</div>;
  if (error)          return <div className={styles.stateError}>{error}</div>;
  if (!guest)         return null;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/admin/guests')}>← Back</button>

      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroAvatar}>
          {(guest.full_name?.[0] || guest.email[0]).toUpperCase()}
        </div>
        <div className={styles.heroInfo}>
          <h1 className={styles.heroName}>{guest.full_name || guest.email}</h1>
          <p className={styles.heroEmail}>{guest.email}</p>
          {guest.phone && <p className={styles.heroPhone}>{guest.phone}</p>}
        </div>
        <div className={styles.heroMeta}>
          <span className={guest.is_active ? styles.badgeActive : styles.badgeInactive}>
            {guest.is_active ? 'Active' : 'Blocked'}
          </span>
          {canModifyGuests && (
            <button
              className={guest.is_active ? styles.blockBtn : styles.activateBtn}
              onClick={handleBlock}
              disabled={blocking}
            >
              {guest.is_active ? 'Block Account' : 'Reactivate'}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Bookings</span>
          <span className={styles.statValue}>{guest.booking_count}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Spent</span>
          <span className={styles.statValue}>₱{Number(guest.total_spent).toLocaleString()}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Member Since</span>
          <span className={styles.statValue}>
            {new Date(guest.date_joined).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Last Login</span>
          <span className={styles.statValue}>
            {guest.last_login ? new Date(guest.last_login).toLocaleDateString() : 'Never'}
          </span>
        </div>
      </div>

      {/* Recent Bookings */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent Bookings</h2>
          <button className={styles.viewAll}
            onClick={() => navigate(`/admin/guests/${id}/bookings`)}>
            View all →
          </button>
        </div>
        {guest.recent_bookings?.length ? (
          <div className={styles.bookingList}>
            {guest.recent_bookings.map((b) => (
              <div key={b.id} className={styles.bookingCard}>
                <div className={styles.bookingRef}>{b.reference_number}</div>
                <div className={styles.bookingRoom}>Room {b.room_number} · {b.room_type}</div>
                <div className={styles.bookingDates}>
                  {new Date(b.check_in).toLocaleDateString()} – {new Date(b.check_out).toLocaleDateString()}
                </div>
                <div className={styles.bookingStatus}
                  style={{ color: STATUS_COLORS[b.status] ?? '#475569' }}>
                  {b.status.replace(/_/g, ' ')}
                </div>
                <div className={styles.bookingPrice}>₱{Number(b.total_price).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No bookings yet.</p>
        )}
      </div>
    </div>
  );
}