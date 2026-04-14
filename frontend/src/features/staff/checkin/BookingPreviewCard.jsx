/**
 * src/features/staff/checkin/BookingPreviewCard.jsx
 *
 * Displays booking details after reference lookup.
 * Visual refresh: editorial light theme (matches Dashboard).
 * Logic unchanged.
 */

import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS,
  getRemainingBalance,
  getAmountPaid,
  formatPHP,
} from '../services/checkInApi';
import './CheckIn.css';

function statusBadgeClass(status) {
  const map = {
    confirmed:       'ci-badge-gold',
    checked_in:      'ci-badge-green',
    checked_out:     'ci-badge-blue',
    cancelled:       'ci-badge-red',
    pending_payment: 'ci-badge-amber',
    no_show:         'ci-badge-red',
    expired:         'ci-badge-red',
  };
  return map[status] || 'ci-badge-gold';
}

function paymentBadgeClass(paymentStatus) {
  const map = {
    paid:               'ci-badge-green',
    unpaid:             'ci-badge-red',
    partially_refunded: 'ci-badge-amber',
    refunded:           'ci-badge-blue',
    failed:             'ci-badge-red',
  };
  return map[paymentStatus] || 'ci-badge-muted';
}

export default function BookingPreviewCard({ booking, method }) {
  if (!booking) return null;

  const remaining  = getRemainingBalance(booking);
  const amountPaid = getAmountPaid(booking);
  const hasBalance = remaining > 0;

  const checkInDate  = booking.check_in
    ? new Date(booking.check_in + 'T00:00:00').toLocaleDateString('en-PH', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : '—';
  const checkOutDate = booking.check_out
    ? new Date(booking.check_out + 'T00:00:00').toLocaleDateString('en-PH', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : '—';

  return (
    <div className="ci-card">
      <div className="ci-card-label">Booking Details</div>

      {/* Guest name + reference + badges */}
      <div className="ci-booking-header">
        <div>
          <h2 className="ci-guest-name">{booking.full_name || '—'}</h2>
          <p className="ci-ref-num">{booking.reference_number}</p>
          <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
            <span className={`ci-badge ${statusBadgeClass(booking.status)}`}>
              {booking.status_display || BOOKING_STATUS_LABELS[booking.status] || booking.status}
            </span>
            <span className={`ci-badge ${paymentBadgeClass(booking.payment_status)}`}>
              {booking.payment_status_display || booking.payment_status}
            </span>
            {method && (
              <span className="ci-badge ci-badge-muted">
                {method === 'qr_scan' ? '⬛ QR Scan' : '✎ Manual Entry'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Booking details grid */}
      <dl className="ci-booking-grid">
        <div className="ci-booking-field">
          <dt>Room</dt>
          <dd>{booking.room_number || '—'}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Room Type</dt>
          <dd>{booking.room_type || '—'}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Bed Type</dt>
          <dd>{booking.room_bed_type || '—'}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Guests</dt>
          <dd>
            {booking.guests_count || '—'}
            {booking.guests_count > 1 ? ' guests' : ' guest'}
          </dd>
        </div>
        <div className="ci-booking-field">
          <dt>Check-In</dt>
          <dd>{checkInDate}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Check-Out</dt>
          <dd>{checkOutDate}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Nights</dt>
          <dd>{booking.nights} night{booking.nights !== 1 ? 's' : ''}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Floor</dt>
          <dd>{booking.room_floor ? `Floor ${booking.room_floor}` : '—'}</dd>
        </div>
        <div className="ci-booking-field">
          <dt>Email</dt>
          <dd style={{ fontSize: 12 }}>{booking.email || '—'}</dd>
        </div>
      </dl>

      {/* Payment summary */}
      <div className="ci-payment-summary">
        <div className="ci-payment-row">
          <span className="ci-payment-label">Subtotal</span>
          <span className="ci-payment-value">{formatPHP(booking.subtotal)}</span>
        </div>
        {parseFloat(booking.tax || 0) > 0 && (
          <div className="ci-payment-row">
            <span className="ci-payment-label">Tax (12%)</span>
            <span className="ci-payment-value">{formatPHP(booking.tax)}</span>
          </div>
        )}
        {parseFloat(booking.service_fee || 0) > 0 && (
          <div className="ci-payment-row">
            <span className="ci-payment-label">Service Fee (5%)</span>
            <span className="ci-payment-value">{formatPHP(booking.service_fee)}</span>
          </div>
        )}
        <div className="ci-payment-row">
          <span className="ci-payment-label">Total Booking Price</span>
          <span className="ci-payment-value gold">{formatPHP(booking.total_price)}</span>
        </div>
        <div className="ci-payment-row">
          <span className="ci-payment-label">Amount Paid</span>
          <span className="ci-payment-value green">{formatPHP(amountPaid)}</span>
        </div>
        {hasBalance ? (
          <div className="ci-payment-row ci-payment-total">
            <span className="ci-payment-label" style={{ fontWeight: 700 }}>
              Remaining Balance
            </span>
            <span className="ci-payment-value amber" style={{ fontSize: 17 }}>
              {formatPHP(remaining)}
            </span>
          </div>
        ) : (
          <div className="ci-payment-row ci-payment-total">
            <span className="ci-payment-label" style={{ fontWeight: 700 }}>
              Balance Due
            </span>
            <span className="ci-payment-value green" style={{ fontSize: 17 }}>
              ₱0.00 — Fully Paid
            </span>
          </div>
        )}
      </div>

      {/* Balance warning */}
      {hasBalance && (
        <div className="ci-notice ci-notice-amber" style={{ marginTop: 14, marginBottom: 0 }}>
          <span className="ci-notice-icon">⚠</span>
          <div>
            <strong>Outstanding Balance: {formatPHP(remaining)}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12 }}>
              This guest has an unpaid balance. Collect payment before
              check-in or proceed under the hotel's partial-payment policy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}