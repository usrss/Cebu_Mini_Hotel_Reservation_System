import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SearchX, Calendar, Users, Hash, Key, Clock,
  ChevronRight, X, CreditCard, AlertCircle, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, RefreshCw, PlusCircle,
  Copy, Check, CalendarPlus, Info, ArrowUpDown, Search, ShieldAlert,
} from 'lucide-react';
import { useMyBookings, useBookingDetail, useCancelBooking } from '../hooks/useBookings';
import ReviewForm from '../rooms/ReviewForm';
import api from '../../services/api';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import { useHotelSettings } from '../hooks/useHotelSettings';
import { getCancellationSummary } from '../utils/cancellationUtils';
import './MyBookingsPage.css';

/* ─── helpers ──────────────────────────────────────────────────────── */
async function fetchPendingReviews() {
  try { const res = await api.get('/rooms/reviews/pending/'); return res.data; }
  catch { return []; }
}

function fmt(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useCopyText(text) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return { copied, copy };
}

/* ── FIX: countdown uses booking.payment_deadline (from BookingDetailSerializer)
   Falls back to created_at + 30 min if payment_deadline is absent ── */
function useCountdown(paymentDeadline) {
  const [remaining, setRemaining] = useState(null);
  useEffect(() => {
    if (!paymentDeadline) return;
    const tick = () => {
      const diff = Math.max(0, new Date(paymentDeadline) - new Date());
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(diff > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [paymentDeadline]);
  return remaining;
}

function buildCalendarUrl(booking) {
  const f = d => d.replace(/-/g, '');
  const title   = encodeURIComponent(`Hotel Stay — ${booking.room_type} Room #${booking.room_number}`);
  const details = encodeURIComponent(`Reference: ${booking.reference_number}\nPIN: ${booking.checkin_pin || 'N/A'}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${f(booking.check_in)}/${f(booking.check_out)}&details=${details}`;
}

const STATUS_CONFIG = {
  pending_payment: { label: 'Pending Payment', pill: 'sp-awaiting',   icon: <Clock size={16} />,        iconBg: 'rgba(217,119,6,0.1)',  iconColor: '#d97706' },
  confirmed:       { label: 'Confirmed',        pill: 'sp-confirmed',  icon: <CheckCircle2 size={16} />, iconBg: 'rgba(5,150,105,0.1)',  iconColor: '#059669' },
  checked_in:      { label: 'Checked In',       pill: 'sp-checkedin',  icon: <CheckCircle2 size={16} />, iconBg: 'rgba(1,0,13,0.06)',   iconColor: '#535252' },
  checked_out:     { label: 'Checked Out',      pill: 'sp-checkedout', icon: <CheckCircle2 size={16} />, iconBg: 'rgba(1,0,13,0.06)',   iconColor: '#909090' },
  cancelled:       { label: 'Cancelled',        pill: 'sp-cancelled',  icon: <XCircle size={16} />,      iconBg: 'rgba(1,0,13,0.06)',   iconColor: '#909090' },
  expired:         { label: 'Expired',          pill: 'sp-cancelled',  icon: <AlertCircle size={16} />,  iconBg: 'rgba(1,0,13,0.06)',   iconColor: '#909090' },
  no_show:         { label: 'No Show',          pill: 'sp-noshow',     icon: <AlertCircle size={16} />,  iconBg: 'rgba(1,0,13,0.06)',   iconColor: '#909090' },
};

const CANCELLABLE_STATUSES = ['pending_payment', 'confirmed'];
const TERMINAL_STATUSES    = ['cancelled', 'expired', 'no_show'];

const STATUS_FILTERS = [
  { value: '',                label: 'All' },
  { value: 'pending_payment', label: 'Pending' },
  { value: 'confirmed',       label: 'Confirmed' },
  { value: 'checked_in',      label: 'Checked In' },
  { value: 'checked_out',     label: 'Checked Out' },
  { value: 'cancelled',       label: 'Cancelled' },
  { value: 'expired',         label: 'Expired' },
];

/* ═══════════════════════════════════════════════════════════════════
   FULL DETAILS MODAL
   (unchanged from original — keeps countdown, policy, history, all actions)
   ═══════════════════════════════════════════════════════════════════ */
function BookingDetailModal({ bookingId, onClose }) {
  const { booking, loading, error, setBooking } = useBookingDetail(bookingId);
  const { cancelBooking, loading: cancelling, error: cancelError } = useCancelBooking();
  const { settings } = useHotelSettings();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason,      setCancelReason]       = useState('');
  const [showHistory,       setShowHistory]         = useState(false);

  const refCopy = useCopyText(booking?.reference_number);
  const pinCopy = useCopyText(booking?.checkin_pin);

  // ── FIX: use payment_deadline (returned by BookingDetailSerializer)
  // payment_deadline is a computed property: created_at + 30 min
  const countdown = useCountdown(booking?.payment_deadline);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose]);

  useEffect(() => {
    if (booking && TERMINAL_STATUSES.includes(booking.status)) setShowHistory(true);
  }, [booking?.status]);

  const handleCancel = async () => {
    const updated = await cancelBooking(bookingId, cancelReason);
    if (updated) { setBooking(updated); setShowCancelConfirm(false); }
  };

  const renderBody = () => {
    if (loading) return (
      <div className="mbp-modal-loading">
        <span className="mbp-spinner" />
        Loading booking details…
      </div>
    );
    if (error || !booking) return (
      <div className="mbp-modal-loading">
        <AlertCircle size={28} />
        {error || 'Booking not found.'}
      </div>
    );

    const statusCfg        = STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed;
    const isPendingPayment = booking.status === 'pending_payment';
    const isConfirmed      = booking.status === 'confirmed';
    const isCheckedIn      = booking.status === 'checked_in';
    const hasCredentials   = booking.has_credentials;
    const canCancel        = CANCELLABLE_STATUSES.includes(booking.status);
    const refundPct        = parseFloat(booking.refund_percentage || 0);

    const total          = Number(booking.total_price  || 0);
    const amountPaid     = Number(booking.amount_paid  || 0);
    const amountDue      = Number(booking.amount_due   || 0);
    const depositPaid    = booking.payment_type_used === 'deposit' && amountPaid > 0;
    const balancePending = isConfirmed && depositPaid && amountDue > 0;

    const today             = new Date().toISOString().split('T')[0];
    const canReschedule     = isConfirmed && !booking.is_expired && today < booking.check_in;
    const rescheduleBlocked = isCheckedIn
      ? "Rescheduling isn't available once checked in — use Extend Stay instead"
      : null;
    const canExtend = (isConfirmed || isCheckedIn) && today < booking.check_out;

    return (
      <>
        {/* Status banner */}
        <div className="mbp-modal-status-banner">
          <div className="mbp-modal-status-icon" style={{ background: statusCfg.iconBg, color: statusCfg.iconColor }}>
            {statusCfg.icon}
          </div>
          <div className="mbp-modal-status-info">
            <span className="mbp-modal-status-label">Booking Status</span>
            <span className="mbp-modal-status-val">{statusCfg.label}</span>
          </div>
        </div>

        <div className="mbp-modal-layout">
          {/* ── Left / Main ── */}
          <div className="mbp-modal-main">

            {/* Reference */}
            <div className="mbp-modal-section">
              <p className="mbp-modal-ref-eyebrow">
                <Hash size={11} />
                {hasCredentials ? 'Booking Reference' : 'Reservation (pending payment)'}
              </p>
              {hasCredentials ? (
                <div className="mbp-modal-ref-row">
                  <h2 className="mbp-modal-ref-number">{booking.reference_number}</h2>
                  <button className={`mbp-copy-btn ${refCopy.copied ? 'mbp-copy-btn--ok' : ''}`} onClick={refCopy.copy}>
                    {refCopy.copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
              ) : (
                <p className="mbp-modal-ref-pending">Complete payment to receive your reference</p>
              )}

              {/* ── FIX: countdown now uses payment_deadline ── */}
              {isPendingPayment && !booking.is_expired && (
                <div className="mbp-modal-notice mbp-modal-notice--warn">
                  <Clock size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Complete payment to receive your reference number and check-in PIN.
                    {countdown
                      ? <> Room held for <strong className="countdown-val">{countdown}</strong>.</>
                      : <> Your room hold is being processed.</>}
                  </span>
                </div>
              )}

              {(booking.is_expired || booking.status === 'expired') && (
                <div className="mbp-modal-notice mbp-modal-notice--muted">
                  <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  This booking expired without payment. No credentials were issued.
                </div>
              )}

              {depositPaid && (
                <div className="mbp-modal-notice mbp-modal-notice--info">
                  <CheckCircle2 size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    <strong>30% deposit paid</strong> — ₱{fmt(amountPaid)} received.
                    Balance of ₱{fmt(amountDue)} due at check-in.
                  </span>
                </div>
              )}
            </div>

            {/* PIN */}
            {hasCredentials && booking.checkin_pin && booking.status !== 'cancelled' && (
              <div className="mbp-modal-section">
                <h4 className="mbp-modal-section-title"><Key size={11} /> Check-in PIN</h4>
                <div className="mbp-pin-display">
                  {booking.checkin_pin.split('').map((d, i) => (
                    <span key={i} className="mbp-pin-digit">{d}</span>
                  ))}
                  <button
                    className={`mbp-copy-btn ${pinCopy.copied ? 'mbp-copy-btn--ok' : ''}`}
                    onClick={pinCopy.copy}
                    style={{ alignSelf: 'center' }}
                  >
                    {pinCopy.copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>
                <p className="mbp-pin-note">
                  Show this PIN at reception with a valid ID on check-in day ({booking.check_in}).
                </p>
              </div>
            )}

            {/* Add to calendar */}
            {hasCredentials && isConfirmed && booking.check_in > today && (
              <div className="mbp-modal-section">
                <h4 className="mbp-modal-section-title"><CalendarPlus size={11} /> Add to Calendar</h4>
                <a href={buildCalendarUrl(booking)} target="_blank" rel="noopener noreferrer" className="mbp-calendar-link">
                  Google Calendar
                </a>
              </div>
            )}

            {/* Stay details */}
            <div className="mbp-modal-section">
              <h4 className="mbp-modal-section-title"><Calendar size={11} /> Stay Details</h4>
              <div className="mbp-info-rows">
                <InfoRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                {booking.room_bed_type && <InfoRow label="Bed Type"  value={booking.room_bed_type} />}
                {booking.room_floor    && <InfoRow label="Floor"     value={booking.room_floor} />}
                <InfoRow label="Check-in"  value={booking.check_in} />
                <InfoRow label="Check-out" value={booking.check_out} />
                <InfoRow label="Duration"  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <InfoRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
                {booking.special_requests && <InfoRow label="Requests" value={booking.special_requests} />}
              </div>
            </div>

            {/* Guest info */}
            <div className="mbp-modal-section">
              <h4 className="mbp-modal-section-title"><Users size={11} /> Guest Information</h4>
              <div className="mbp-info-rows">
                <InfoRow label="Name"  value={booking.full_name} />
                <InfoRow label="Email" value={booking.email} />
                <InfoRow label="Phone" value={booking.phone} />
              </div>
            </div>

            {/* Cancellation / expiry info */}
            {(booking.status === 'cancelled' || booking.status === 'expired') && (
              <div className="mbp-modal-section">
                <h4 className="mbp-modal-section-title">
                  <XCircle size={11} />
                  {booking.status === 'expired' ? 'Expiration Details' : 'Cancellation Details'}
                </h4>
                <div className="mbp-info-rows">
                  {booking.cancelled_at && (
                    <InfoRow
                      label={booking.status === 'expired' ? 'Expired at' : 'Cancelled at'}
                      value={new Date(booking.cancelled_at).toLocaleString()}
                    />
                  )}
                  {booking.cancellation_reason && (
                    <InfoRow label="Reason" value={booking.cancellation_reason} />
                  )}
                  <InfoRow label="Refund" value={
                    booking.refund_amount > 0
                      ? `${booking.refund_percentage}% — ₱${fmt(booking.refund_amount)}`
                      : 'No refund (payment was not completed)'
                  } />
                  {booking.refund_amount > 0 && (
                    <>
                      <InfoRow label="Refund status"   value={booking.refund_status_display} />
                      <InfoRow label="Refund timeline" value="3–7 business days depending on your bank" />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Status history */}
            {booking.status_history?.length > 0 && (
              <div className="mbp-modal-section">
                <button className="mbp-history-toggle" onClick={() => setShowHistory(s => !s)}>
                  <span className="mbp-modal-section-title" style={{ margin: 0 }}>
                    <Clock size={11} /> Status History
                  </span>
                  {showHistory ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {showHistory && (
                  <div className="mbp-history-list">
                    {booking.status_history.map(h => (
                      <div key={h.id} className="mbp-history-item">
                        <div className="mbp-history-dot" />
                        <div className="mbp-history-content">
                          <span className="mbp-history-transition">
                            {h.old_status || 'Created'} → {h.new_status}
                          </span>
                          {h.note && <span className="mbp-history-note">{h.note}</span>}
                          <span className="mbp-history-time">
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

          {/* ── Right / Sidebar ── */}
          <div className="mbp-modal-sidebar">
            {/* Price summary */}
            <h3 className="mbp-sidebar-title">Price Summary</h3>
            <div className="mbp-price-rows">
              <div className="mbp-price-row">
                <span>₱{fmt(booking.room_price_snapshot)} × {booking.nights}N (at booking)</span>
                <span>₱{fmt(booking.subtotal)}</span>
              </div>
              {Number(booking.discount_amount) > 0 && (
                <div className="mbp-price-row mbp-price-row-discount">
                  <span>Discount ({booking.discount_percentage}% off)</span>
                  <span>−₱{fmt(booking.discount_amount)}</span>
                </div>
              )}
              <div className="mbp-price-row"><span>Tax (12%)</span><span>₱{fmt(booking.tax)}</span></div>
              <div className="mbp-price-row"><span>Service fee (5%)</span><span>₱{fmt(booking.service_fee)}</span></div>
            </div>
            <div className="mbp-price-total-row">
              <span className="mbp-price-total-label">Total</span>
              <span className="mbp-price-total-val">₱{fmt(total)}</span>
            </div>
            {depositPaid && (
              <>
                <div className="mbp-deposit-row mbp-deposit-row--paid">
                  <span><CheckCircle2 size={11} /> Deposit paid (30%)</span>
                  <span>₱{fmt(amountPaid)}</span>
                </div>
                <div className="mbp-deposit-row mbp-deposit-row--due">
                  <span><Clock size={11} /> Balance at check-in</span>
                  <span>₱{fmt(amountDue)}</span>
                </div>
              </>
            )}
            <div className="mbp-payment-badge-row">
              <span>Payment</span>
              <span className={`mbp-pay-badge mbp-pay-${booking.payment_status}`}>
                {booking.payment_status_display}
              </span>
            </div>

            {/* ── FIX: Cancellation policy restored ── */}
            {canCancel && !showCancelConfirm && (() => {
              const hasPaid  = booking.payment_status === 'paid' || isPendingPayment === false;
              const summary  = getCancellationSummary(
                settings.cancellation_tiers,
                booking.check_in,
                booking.total_price,
                !isPendingPayment,  // hasPaid — pending_payment means no charge yet
              );

              return (
                <div className="mbp-cancel-policy">
                  <ShieldAlert size={12} />
                  <span>
                    {isPendingPayment
                      ? 'No payment made yet — cancellation is free.'
                      : summary.description}
                  </span>
                </div>
              );
            })()}

            {/* Action buttons */}
            <div className="mbp-sidebar-actions">
              {isPendingPayment && !booking.is_expired && (
                <Link to={`/payments/${booking.id}`} className="mbp-btn mbp-btn-primary">
                  <CreditCard size={14} /> Complete Payment
                </Link>
              )}
              {balancePending && (
                <Link
                  to={`/payments/${booking.id}`}
                  state={{ payment_type: 'balance_payment' }}
                  className="mbp-btn mbp-btn-secondary"
                >
                  <CreditCard size={14} /> Pay Balance (₱{fmt(amountDue)})
                </Link>
              )}
              {canReschedule && (
                <Link to={`/bookings/my/${booking.id}/reschedule`} className="mbp-btn mbp-btn-secondary">
                  <RefreshCw size={14} /> Reschedule
                </Link>
              )}
              {rescheduleBlocked && (
                <div className="mbp-blocked-note">
                  <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  {rescheduleBlocked}
                </div>
              )}
              {canExtend && (
                <Link to={`/bookings/my/${booking.id}/extend`} className="mbp-btn mbp-btn-secondary">
                  <PlusCircle size={14} /> Extend Stay
                </Link>
              )}

              {/* Cancel */}
              {canCancel && !showCancelConfirm && (
                <button onClick={() => setShowCancelConfirm(true)} className="mbp-btn mbp-btn-danger">
                  <XCircle size={14} /> Cancel Booking
                </button>
              )}
              {showCancelConfirm && (
                <div className="mbp-cancel-confirm">
                  <h4 className="mbp-cancel-confirm-title">
                    <AlertCircle size={13} /> Confirm Cancellation
                  </h4>
                   <div className="mbp-cancel-refund-info">
                          {(() => {
                            const summary = getCancellationSummary(
                              settings.cancellation_tiers,
                              booking.check_in,
                              booking.total_price,
                              !isPendingPayment,
                            );
                            if (isPendingPayment) {
                              return 'No payment was made — your booking will be cancelled at no cost.';
                            }
                            if (depositPaid && summary.pct > 0) {
                              return `Deposit paid: ₱${fmt(amountPaid)}. ${summary.description}`;
                            }
                            return summary.description;
                          })()}
                      </div>
                  <textarea
                    placeholder="Reason for cancellation (optional)"
                    value={cancelReason}
                    onChange={e => setCancelReason(e.target.value)}
                    className="mbp-cancel-reason"
                    rows={3}
                  />
                  {cancelError && (
                    <div className="mbp-modal-notice mbp-modal-notice--warn" style={{ borderRadius: 0, margin: 0 }}>
                      <AlertCircle size={13} /> {cancelError}
                    </div>
                  )}
                  <div className="mbp-cancel-actions">
                    <button onClick={handleCancel} disabled={cancelling} className="mbp-btn mbp-btn-danger">
                      {cancelling ? 'Cancelling…' : 'Yes, Cancel'}
                    </button>
                    <button onClick={() => setShowCancelConfirm(false)} className="mbp-btn mbp-btn-ghost">
                      Keep Booking
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const refNum = booking?.has_credentials
    ? booking.reference_number
    : booking ? `Booking #${booking.id}` : `Booking #${bookingId}`;
  const statusCfg = booking ? (STATUS_CONFIG[booking.status] || STATUS_CONFIG.confirmed) : null;

  return (
    <div className="mbp-modal-overlay" onClick={onClose}>
      <div className="mbp-modal" onClick={e => e.stopPropagation()}>
        <div className="mbp-modal-header">
          <div className="mbp-modal-header-left">
            <button className="mbp-modal-close" onClick={onClose}><X size={16} /></button>
            <span className="mbp-modal-header-ref">{loading ? 'Loading…' : refNum}</span>
          </div>
          {statusCfg && (
            <span className={`mbp-status-pill ${statusCfg.pill}`}>{statusCfg.label}</span>
          )}
        </div>
        <div className="mbp-modal-body">{renderBody()}</div>
      </div>
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────────── */
function InfoRow({ label, value }) {
  return (
    <div className="mbp-info-row">
      <span className="mbp-info-label">{label}</span>
      <span className="mbp-info-val">{value ?? '—'}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   BOOKING CARD
   ═══════════════════════════════════════════════════════════════════ */
function BookingCard({ booking, onClick }) {
  const statusCfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.pending_payment;
  const hasRef    = booking.has_credentials && booking.reference_number;

  return (
    <div
      className="mbp-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="mbp-card-top">
        <div className="mbp-card-ref-block">
          <span className="mbp-card-ref-label">{hasRef ? 'Reference' : 'Booking ID'}</span>
          {hasRef
            ? <span className="mbp-card-ref-val">{booking.reference_number}</span>
            : <span className="mbp-card-ref-pending">#{booking.id} — Pending Payment</span>
          }
        </div>
        <span className={`mbp-status-pill ${statusCfg.pill}`}>{statusCfg.label}</span>
      </div>

      <div className="mbp-card-body">
        <div className="mbp-card-room">
          <span className="mbp-card-room-label">Room</span>
          <span className="mbp-card-room-val">#{booking.room_number}</span>
          <span className="mbp-card-room-type">{booking.room_type}</span>
        </div>
        <div className="mbp-card-dates">
          <span className="mbp-card-date-label">Dates</span>
          <div className="mbp-card-date-val">
            <span>{booking.check_in}</span>
            <span className="mbp-card-date-arrow">→</span>
            <span>{booking.check_out}</span>
            <span className="mbp-nights-chip">{booking.nights}N</span>
          </div>
        </div>
      </div>

      <div className="mbp-card-footer">
        <span className="mbp-card-price">
          ₱{Number(booking.total_price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <div className="mbp-card-right">
          <span className="mbp-card-view-label">View Details</span>
          <ChevronRight size={15} className="mbp-card-chevron" />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function MyBookingsPage() {
  const location = useLocation();
  const { bookings, loading, error } = useMyBookings();
  const [statusFilter,  setStatusFilter]  = useState('');
  const [search,        setSearch]        = useState('');
  const [sortAsc,       setSortAsc]       = useState(false);
  const [activeId,      setActiveId]      = useState(null);
  const [pendingReview, setPendingReview] = useState(null);

  // ── FIX: auto-open modal when Dashboard passes openBookingId via router state
  useEffect(() => {
    const openId = location.state?.openBookingId;
    if (openId) {
      setActiveId(openId);
      // Clear the state so navigating back doesn't re-open
      window.history.replaceState({}, '');
    }
  }, [location.state?.openBookingId]);

  useEffect(() => {
    if (loading) return;
    const token = localStorage.getItem('accessToken');
    if (!token) return;
    fetchPendingReviews().then(data => {
      if (data.length > 0) setPendingReview(data[0]);
    });
  }, [loading]);

  const filtered = (bookings || [])
    .filter(b => {
      const matchStatus = !statusFilter || b.status === statusFilter;
      const matchSearch = !search
        || b.reference_number?.toLowerCase().includes(search.toLowerCase())
        || String(b.room_number)?.toLowerCase().includes(search.toLowerCase());
      return matchStatus && matchSearch;
    })
    .sort((a, b) => {
      const diff = new Date(a.check_in) - new Date(b.check_in);
      return sortAsc ? diff : -diff;
    });

  const handleCloseModal = useCallback(() => setActiveId(null), []);
  const clearSearch = () => setSearch('');
  const clearAll    = () => { setStatusFilter(''); setSearch(''); };

  return (
    <div className="mbp-page">
      <Navbar />

      {pendingReview && (
        <ReviewForm
          booking={{
            id:          pendingReview.booking_id,
            room_number: pendingReview.room_number,
            room_type:   pendingReview.room_type,
            check_out:   pendingReview.check_out,
          }}
          onClose={() => setPendingReview(null)}
          onSubmit={async payload => {
            await api.post('/rooms/reviews/', payload);
            setPendingReview(null);
          }}
        />
      )}

      {activeId && (
        <BookingDetailModal bookingId={activeId} onClose={handleCloseModal} />
      )}

      {/* ── Toolbar ── */}
      <div className="mbp-toolbar">
        <div className="mbp-page-heading">
          <span className="mbp-page-eyebrow">Your Reservations</span>
          <h1 className="mbp-page-title">My Bookings</h1>
        </div>

        <div className="mbp-toolbar-right">
          <div className="mbp-filter-pills">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`mbp-pill ${statusFilter === value ? 'active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            className="mbp-sort-btn"
            onClick={() => setSortAsc(v => !v)}
            title={sortAsc ? 'Oldest check-in first' : 'Newest check-in first'}
          >
            <ArrowUpDown size={14} />
            {sortAsc ? 'Oldest first' : 'Newest first'}
          </button>

          <div className="mbp-search-wrap">
            <Search size={13} className="mbp-search-icon" />
            <input
              type="text"
              placeholder="Search ref or room…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="mbp-search"
            />
            {search && (
              <button className="mbp-search-clear" onClick={clearSearch} title="Clear search">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mbp-divider"><hr /></div>

      {/* ── Content ── */}
      <div className="mbp-content">
        {loading ? (
          <LoadingGrid />
        ) : error ? (
          <div className="mbp-error">
            <div className="mbp-empty-icon"><SearchX size={26} /></div>
            <h3 className="mbp-empty-title">Something went wrong</h3>
            <p className="mbp-empty-text">{error || 'Failed to load bookings.'}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mbp-empty">
            <div className="mbp-empty-icon"><SearchX size={26} /></div>
            <h3 className="mbp-empty-title">
              {statusFilter || search ? 'No matches found' : 'No bookings yet'}
            </h3>
            <p className="mbp-empty-text">
              {statusFilter || search
                ? 'Try adjusting your filters or search term.'
                : 'Browse our rooms and make your first reservation.'}
            </p>
            {statusFilter || search ? (
              <button onClick={clearAll} className="mbp-btn mbp-btn-primary" style={{ maxWidth: 200, margin: '0 auto' }}>
                Clear Filters
              </button>
            ) : (
              <Link to="/rooms" className="mbp-btn mbp-btn-primary" style={{ maxWidth: 200, margin: '0 auto' }}>
                Browse Rooms
              </Link>
            )}
          </div>
        ) : (
          <>
            <p className="mbp-count">
              <span className="mbp-count-num">{filtered.length}</span>
              {' '}booking{filtered.length !== 1 ? 's' : ''}
            </p>
            <div className="mbp-grid">
              {filtered.map(b => (
                <BookingCard
                  key={b.id}
                  booking={b}
                  onClick={() => setActiveId(b.id)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="mbp-grid">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mbp-card-skel">
          <div className="mbp-skeleton sk-ref" />
          <div className="mbp-skeleton sk-room" />
          <div className="mbp-skeleton sk-date" />
          <div className="mbp-skeleton sk-foot" />
        </div>
      ))}
    </div>
  );
}