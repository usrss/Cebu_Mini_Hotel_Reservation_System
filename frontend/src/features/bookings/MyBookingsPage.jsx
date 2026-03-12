import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SearchX, Calendar, Hash, ChevronRight, ArrowLeft } from 'lucide-react';
import { useMyBookings } from '../hooks/useBookings';
import ReviewForm from '../rooms/ReviewForm';
import api from '../../services/api';
import './MyBookingsPage.css';

async function fetchPendingReviews() {
  try {
    const res = await api.get('/rooms/reviews/pending/');
    return res.data;
  } catch {
    return [];
  }
}

const STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', className: 'status-awaiting' },
  confirmed:       { label: 'Confirmed',        className: 'status-confirmed' },
  checked_in:      { label: 'Checked In',       className: 'status-checkedin' },
  checked_out:     { label: 'Checked Out',      className: 'status-checkedout' },
  cancelled:       { label: 'Cancelled',        className: 'status-cancelled' },
  expired:         { label: 'Expired',          className: 'status-cancelled' },
  no_show:         { label: 'No Show',          className: 'status-noshow' },
};

const STATUS_FILTERS = [
  { value: '',                label: 'All' },
  { value: 'pending_payment', label: 'Pending' },
  { value: 'confirmed',       label: 'Confirmed' },
  { value: 'checked_in',      label: 'Checked In' },
  { value: 'checked_out',     label: 'Checked Out' },
  { value: 'cancelled',       label: 'Cancelled' },
  { value: 'expired',         label: 'Expired' },
];

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyBookingsPage() {
  const navigate = useNavigate();
  const { bookings, loading, error } = useMyBookings();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [pendingReview, setPendingReview] = useState(null);

  // Only check for pending reviews once bookings have loaded (confirms auth is working)
  useEffect(() => {
    if (loading) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    fetchPendingReviews().then((data) => {
      if (data.length > 0) setPendingReview(data[0]);
    });
  }, [loading]);

  const filtered = bookings.filter((b) => {
    const matchStatus = !statusFilter || b.status === statusFilter;
    const matchSearch = !search ||
      b.reference_number.toLowerCase().includes(search.toLowerCase()) ||
      b.room_number?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="my-bookings-page">

      {/* ── Review modal for checked-out bookings ── */}
      {pendingReview && (
        <ReviewForm
          booking={{
            id: pendingReview.booking_id,
            room_number: pendingReview.room_number,
            room_type: pendingReview.room_type,
            check_out: pendingReview.check_out,
          }}
          onClose={() => setPendingReview(null)}
          onSubmit={async (payload) => {
            await api.post('/rooms/reviews/', payload);
            setPendingReview(null);
          }}
        />
      )}

      {/* ── Single compact header bar ── */}
      <div className="mbp-header">
        <div className="mbp-header-inner">
          <button onClick={() => navigate(-1)} className="mbp-back">
            <ArrowLeft size={15} />
            Back
          </button>
          <div className="mbp-header-center">
            <h1 className="mbp-title">My Bookings</h1>
            <span className="mbp-subtitle">Reservations &amp; history</span>
          </div>
          <div className="mbp-header-right" />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="my-bookings-container">

        {/* Toolbar */}
        <div className="bookings-toolbar">
          <div className="status-filter-pills">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`status-pill ${statusFilter === value ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="bookings-search-wrapper">
            <Hash size={13} className="search-icon" />
            <input
              type="text"
              placeholder="Search reference or room…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bookings-search"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingList />
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState
            hasFilters={!!statusFilter || !!search}
            onClear={() => { setStatusFilter(''); setSearch(''); }}
          />
        ) : (
          <div className="bookings-list">
            <p className="bookings-count">
              <span className="count-number">{filtered.length}</span>
              {' '}booking{filtered.length !== 1 ? 's' : ''}
            </p>
            {filtered.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingCard({ booking }) {
  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending_payment;

  return (
    <Link to={`/bookings/my/${booking.id}`} className="booking-card">
      <div className="booking-card-left">
        <div className="booking-card-ref">
          <span className="ref-label">Ref</span>
          <span className="ref-value">{booking.reference_number}</span>
        </div>
        <div className="booking-card-room">
          Room #{booking.room_number} — {booking.room_type}
        </div>
        <div className="booking-card-dates">
          <Calendar size={12} />
          {booking.check_in} → {booking.check_out}
          <span className="nights-badge">
            {booking.nights}N
          </span>
        </div>
      </div>
      <div className="booking-card-right">
        <div className="booking-card-price">₱{formatPrice(booking.total_price)}</div>
        <div className={`booking-status-pill ${statusCfg.className}`}>
          {statusCfg.label}
        </div>
        <ChevronRight size={15} className="booking-card-chevron" />
      </div>
    </Link>
  );
}

function LoadingList() {
  return (
    <div className="bookings-list">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="booking-card-skeleton">
          <div className="skeleton skeleton-ref" />
          <div className="skeleton skeleton-text" />
          <div className="skeleton skeleton-dates" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><SearchX size={32} /></div>
      <h3 className="empty-title">
        {hasFilters ? 'No bookings match your filters' : 'No bookings yet'}
      </h3>
      <p className="empty-text">
        {hasFilters
          ? 'Try clearing your filters to see all bookings.'
          : 'Browse our rooms and make your first reservation.'}
      </p>
      {hasFilters ? (
        <button onClick={onClear} className="btn btn-primary">Clear Filters</button>
      ) : (
        <Link to="/rooms" className="btn btn-primary">Browse Rooms</Link>
      )}
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="error-state">
      <div className="empty-icon"><SearchX size={32} /></div>
      <h3 className="empty-title">Something went wrong</h3>
      <p className="empty-text">{message || 'Failed to load bookings. Please try again.'}</p>
    </div>
  );
}