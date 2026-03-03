import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, SearchX, Calendar, Hash, ChevronRight } from 'lucide-react';
import { useMyBookings } from '../hooks/useBookings';
import './MyBookingsPage.css';

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
  { value: 'pending_payment', label: 'Pending Payment' },
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
  const { bookings, loading, error } = useMyBookings();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]             = useState('');

  const filtered = bookings.filter((b) => {
    const matchStatus = !statusFilter || b.status === statusFilter;
    const matchSearch = !search ||
      b.reference_number.toLowerCase().includes(search.toLowerCase()) ||
      b.room_number?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="my-bookings-page">
      {/* Hero — mirrors room-list-hero */}
      <div className="my-bookings-hero">
        <div className="hero-background" />
        <div className="hero-content">
          <div className="hero-icon">
            <BookOpen size={32} />
          </div>
          <h1 className="hero-title">My Bookings</h1>
          <p className="hero-subtitle">
            View and manage all your reservations
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="my-bookings-container">
        {/* Toolbar */}
        <div className="bookings-toolbar">
          {/* Status filter pills */}
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

          {/* Search */}
          <div className="bookings-search-wrapper">
            <Hash size={15} className="search-icon" />
            <input
              type="text"
              placeholder="Search by reference or room…"
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
          <EmptyState hasFilters={!!statusFilter || !!search} onClear={() => { setStatusFilter(''); setSearch(''); }} />
        ) : (
          <div className="bookings-list">
            <p className="bookings-count">
              <span className="count-number">{filtered.length}</span> booking{filtered.length !== 1 ? 's' : ''}
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
          <span className="ref-label">Reference</span>
          <span className="ref-value">{booking.reference_number}</span>
        </div>
        <div className="booking-card-room">
          Room #{booking.room_number} — {booking.room_type}
        </div>
        <div className="booking-card-dates">
          <Calendar size={13} />
          {booking.check_in} → {booking.check_out}
          <span className="nights-badge">{booking.nights} night{booking.nights !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="booking-card-right">
        <div className="booking-card-price">₱{formatPrice(booking.total_price)}</div>
        <div className={`booking-status-pill ${statusCfg.className}`}>
          {statusCfg.label}
        </div>
        <ChevronRight size={18} className="booking-card-chevron" />
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
      <div className="empty-icon"><SearchX size={40} /></div>
      <h3 className="empty-title">{hasFilters ? 'No bookings match your filters' : 'No bookings yet'}</h3>
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
      <div className="error-icon"><SearchX size={40} /></div>
      <h3 className="error-title">Something went wrong</h3>
      <p className="error-text">{message || 'Failed to load bookings. Please try again.'}</p>
    </div>
  );
}