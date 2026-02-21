import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Users, Hash, Key, Clock,
  CreditCard, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useBookingDetail, useCancelBooking } from '../hooks/useBookings';
import './MyBookingDetailPage.css';

const STATUS_CONFIG = {
  awaiting_payment: { label: 'Awaiting Payment', className: 'status-awaiting' },
  confirmed:        { label: 'Confirmed',         className: 'status-confirmed' },
  checked_in:       { label: 'Checked In',        className: 'status-checkedin' },
  checked_out:      { label: 'Checked Out',       className: 'status-checkedout' },
  cancelled:        { label: 'Cancelled',         className: 'status-cancelled' },
  no_show:          { label: 'No Show',           className: 'status-noshow' },
};

const CANCELLABLE_STATUSES = ['awaiting_payment', 'confirmed'];

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MyBookingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { booking, loading, error, setBooking } = useBookingDetail(id);
  const { cancelBooking, loading: cancelling, error: cancelError } = useCancelBooking();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason]           = useState('');
  const [showHistory, setShowHistory]             = useState(false);

  if (loading) return <LoadingSkeleton />;

  if (error || !booking) {
    return (
      <div className="booking-detail-error-container">
        <div className="error-content">
          <h2 className="error-heading">Booking Not Found</h2>
          <p className="error-message">{error || 'This booking does not exist.'}</p>
          <Link to="/bookings/my" className="btn btn-primary">
            <ArrowLeft size={18} />
            My Bookings
          </Link>
        </div>
      </div>
    );
  }

  const statusCfg  = STATUS_CONFIG[booking.status] || STATUS_CONFIG.awaiting_payment;
  const canCancel  = CANCELLABLE_STATUSES.includes(booking.status);
  const refundPct  = parseFloat(booking.refund_percentage || 0);

  const handleCancel = async () => {
    const updated = await cancelBooking(id, cancelReason);
    if (updated) {
      setBooking(updated);
      setShowCancelConfirm(false);
    }
  };

  return (
    <div className="booking-detail-page">
      {/* Nav — identical to room-detail-nav */}
      <div className="booking-detail-nav">
        <div className="nav-container">
          <Link to="/bookings/my" className="back-link">
            <ArrowLeft size={18} />
            My Bookings
          </Link>
        </div>
      </div>

      <div className="booking-detail-container">
        <div className="booking-detail-layout">
          {/* ── Left column ─────────────────────────────────────────────── */}
          <div className="booking-detail-main">

            {/* Reference & status */}
            <div className="detail-card reference-card">
              <div className="reference-header">
                <div>
                  <p className="reference-eyebrow">
                    <Hash size={12} />
                    Booking Reference
                  </p>
                  <h1 className="reference-number">{booking.reference_number}</h1>
                </div>
                <div className={`booking-status-badge ${statusCfg.className}`}>
                  {statusCfg.label}
                </div>
              </div>

              {booking.status === 'awaiting_payment' && !booking.is_expired && (
                <div className="payment-notice">
                  <Clock size={15} />
                  <span>Complete payment within <strong>30 minutes</strong> to confirm your reservation.</span>
                </div>
              )}

              {booking.is_expired && (
                <div className="expired-notice">
                  <AlertCircle size={15} />
                  <span>This booking has expired due to non-payment.</span>
                </div>
              )}
            </div>

            {/* Check-in PIN */}
            {booking.checkin_pin && booking.status !== 'cancelled' && (
              <div className="detail-card pin-card">
                <h3 className="card-title">
                  <Key size={16} />
                  Check-in PIN
                </h3>
                <div className="pin-display">
                  {booking.checkin_pin.split('').map((d, i) => (
                    <span key={i} className="pin-digit">{d}</span>
                  ))}
                </div>
                <p className="pin-note">
                  Show this PIN at reception along with a valid ID. Required on your check-in date ({booking.check_in}).
                </p>
              </div>
            )}

            {/* Stay details */}
            <div className="detail-card">
              <h3 className="card-title">
                <Calendar size={16} />
                Stay Details
              </h3>
              <div className="info-rows">
                <InfoRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                <InfoRow label="Bed Type"  value={booking.room_bed_type} />
                <InfoRow label="Floor"     value={booking.room_floor} />
                <InfoRow label="Check-in"  value={booking.check_in} />
                <InfoRow label="Check-out" value={booking.check_out} />
                <InfoRow label="Duration"  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <InfoRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
              </div>
            </div>

            {/* Guest info */}
            <div className="detail-card">
              <h3 className="card-title">
                <Users size={16} />
                Guest Information
              </h3>
              <div className="info-rows">
                <InfoRow label="Name"  value={booking.full_name} />
                <InfoRow label="Email" value={booking.email} />
                <InfoRow label="Phone" value={booking.phone} />
              </div>
            </div>

            {/* Cancellation info */}
            {booking.status === 'cancelled' && (
              <div className="detail-card cancelled-card">
                <h3 className="card-title">
                  <XCircle size={16} />
                  Cancellation Details
                </h3>
                <div className="info-rows">
                  {booking.cancelled_at && (
                    <InfoRow label="Cancelled at" value={new Date(booking.cancelled_at).toLocaleString()} />
                  )}
                  {booking.cancellation_reason && (
                    <InfoRow label="Reason" value={booking.cancellation_reason} />
                  )}
                  <InfoRow label="Refund" value={`${booking.refund_percentage}% — ₱${formatPrice(booking.refund_amount)}`} />
                  <InfoRow label="Refund status" value={booking.refund_status_display} />
                </div>
              </div>
            )}

            {/* Status history */}
            {booking.status_history?.length > 0 && (
              <div className="detail-card">
                <button
                  className="history-toggle"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <span className="card-title" style={{ margin: 0 }}>
                    <Clock size={16} />
                    Status History
                  </span>
                  {showHistory ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {showHistory && (
                  <div className="history-list">
                    {booking.status_history.map((h) => (
                      <div key={h.id} className="history-item">
                        <div className="history-dot" />
                        <div className="history-content">
                          <span className="history-transition">
                            {h.old_status || 'Created'} → {h.new_status}
                          </span>
                          {h.note && <span className="history-note">{h.note}</span>}
                          <span className="history-time">
                            {new Date(h.changed_at).toLocaleString()} · {h.changed_by_name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right sidebar — matches room-detail-sidebar ──────────────── */}
          <div className="booking-detail-sidebar">
            {/* Price summary */}
            <div className="sidebar-card">
              <h3 className="sidebar-title">Price Summary</h3>
              <div className="price-rows">
                <PriceRow
                  label={`₱${formatPrice(booking.room_price_snapshot)} × ${booking.nights} night${booking.nights !== 1 ? 's' : ''}`}
                  value={`₱${formatPrice(booking.subtotal)}`}
                />
                <PriceRow label="Tax (12%)"        value={`₱${formatPrice(booking.tax)}`} />
                <PriceRow label="Service fee (5%)" value={`₱${formatPrice(booking.service_fee)}`} />
                <div className="price-total-row">
                  <span>Total</span>
                  <span className="price-total-amount">₱{formatPrice(booking.total_price)}</span>
                </div>
              </div>
              <div className="payment-status-row">
                <span>Payment</span>
                <span className={`payment-badge payment-${booking.payment_status}`}>
                  {booking.payment_status_display}
                </span>
              </div>
            </div>

            {/* Actions */}
            {canCancel && !showCancelConfirm && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="btn btn-danger btn-full"
              >
                <XCircle size={16} />
                Cancel Booking
              </button>
            )}

            {/* Cancel confirmation */}
            {showCancelConfirm && (
              <div className="cancel-confirm-card">
                <h4 className="cancel-confirm-title">
                  <AlertCircle size={16} />
                  Confirm Cancellation
                </h4>
                {refundPct > 0 && (
                  <p className="cancel-refund-info">
                    You are eligible for a <strong>{refundPct}% refund</strong> (₱{formatPrice(booking.refund_amount)}).
                  </p>
                )}
                {refundPct === 0 && (
                  <p className="cancel-refund-info cancel-no-refund">
                    This cancellation is not eligible for a refund based on current policy.
                  </p>
                )}
                <textarea
                  placeholder="Reason for cancellation (optional)"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="cancel-reason-input"
                  rows={3}
                />
                {cancelError && (
                  <div className="booking-api-error">
                    <AlertCircle size={14} />
                    {cancelError}
                  </div>
                )}
                <div className="cancel-confirm-actions">
                  <button
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="btn btn-danger"
                  >
                    {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    className="btn btn-outline"
                  >
                    Keep Booking
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function PriceRow({ label, value }) {
  return (
    <div className="price-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="booking-detail-page">
      <div className="booking-detail-nav">
        <div className="nav-container">
          <div className="skeleton skeleton-back" />
        </div>
      </div>
      <div className="booking-detail-container">
        <div className="booking-detail-layout">
          <div className="booking-detail-main">
            <div className="skeleton skeleton-card-lg" />
            <div className="skeleton skeleton-card-md" />
            <div className="skeleton skeleton-card-md" />
          </div>
          <div className="skeleton skeleton-sidebar-card" />
        </div>
      </div>
    </div>
  );
}