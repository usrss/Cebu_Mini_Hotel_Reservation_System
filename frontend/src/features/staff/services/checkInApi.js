/**
 * src/features/staff/checkin/services/checkInApi.js
 *
 * All API calls for the Front Desk Check-In system.
 *
 * CHANGES vs previous version:
 *  - canCheckIn() now validates check_in date:
 *      • Blocks check-in if check_in > today (future booking)
 *      • Returns a warning (not a block) if check_in < today (late check-in)
 *    This fixes the bug where staff could check in guests regardless of date.
 */

import api from '../../../services/api';

export const checkInApi = {

  /**
   * Look up a booking by reference number.
   * Uses the existing public endpoint — works for CONFIRMED+ bookings only.
   * Returns BookingDetailSerializer which includes amount_paid and amount_due.
   */
  lookupByReference: (reference) =>
    api.get('/bookings/lookup/', { params: { reference } }).then((r) => r.data),

  /**
   * Verify guest PIN. Does NOT change booking status.
   * checkin_pin is exactly 4 digits on the backend.
   * Returns { valid: true } on success, throws on failure.
   */
  verifyPin: (bookingId, pin) =>
    api.post(`/bookings/admin/${bookingId}/verify-pin/`, { pin }).then((r) => r.data),

  /**
   * Confirm check-in for a FULLY PAID booking.
   * Transitions CONFIRMED → CHECKED_IN.
   * Room status → OCCUPIED via existing signal.
   */
  confirmCheckIn: (bookingId, method = 'manual_entry') =>
    api.post(`/bookings/admin/${bookingId}/check-in/`, { method }).then((r) => r.data),

  /**
   * Collect remaining balance at the desk then check-in.
   * Creates a balance_payment Payment record (manual/cash provider).
   * Transitions CONFIRMED → CHECKED_IN, sets payment_status = PAID.
   */
  collectPayment: (bookingId, paymentMethod) =>
    api
      .post(`/bookings/admin/${bookingId}/collect-payment/`, {
        payment_method: paymentMethod,
      })
      .then((r) => r.data),

  /**
   * Check-in guest despite unpaid balance (hotel policy).
   * Does NOT collect payment. Booking transitions CONFIRMED → CHECKED_IN.
   * Response includes remaining_balance field for the warning UI.
   */
  checkInWithBalance: (bookingId, method = 'manual_entry') =>
    api
      .post(`/bookings/admin/${bookingId}/check-in-with-balance/`, { method })
      .then((r) => r.data),
};

// ─── Payment method options ────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Cash',                icon: '💵' },
  { value: 'gcash', label: 'GCash',               icon: '📱' },
  { value: 'card',  label: 'Credit / Debit Card', icon: '💳' },
  { value: 'other', label: 'Other',               icon: '•••' },
];

// ─── Booking status values ────────────────────────────────────────────────────

export const BOOKING_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  CONFIRMED:       'confirmed',
  CHECKED_IN:      'checked_in',
  CHECKED_OUT:     'checked_out',
  EXPIRED:         'expired',
  CANCELLED:       'cancelled',
  NO_SHOW:         'no_show',
};

export const BOOKING_STATUS_LABELS = {
  pending_payment: 'Pending Payment',
  confirmed:       'Confirmed',
  checked_in:      'Checked In',
  checked_out:     'Checked Out',
  expired:         'Expired',
  cancelled:       'Cancelled',
  no_show:         'No Show',
};

// ─── Payment status values ────────────────────────────────────────────────────

export const BOOKING_PAYMENT_STATUS = {
  UNPAID:             'unpaid',
  PAID:               'paid',
  REFUNDED:           'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  FAILED:             'failed',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getRemainingBalance(booking) {
  if (!booking) return 0;
  const due = parseFloat(booking.amount_due || '0');
  return Math.max(0, due);
}

export function getAmountPaid(booking) {
  if (!booking) return 0;
  return parseFloat(booking.amount_paid || '0');
}

/**
 * Validate that a booking can be checked in.
 *
 * Returns:
 *   { ok: false, reason: string }         — hard block, show error
 *   { ok: true,  reason: null }            — all clear
 *   { ok: true,  reason: null,
 *     warning: string }                    — allowed but show amber notice
 *                                            (late check-in)
 */
export function canCheckIn(booking) {
  if (!booking) return { ok: false, reason: 'No booking found.' };

  const s = booking.status;

  if (s === BOOKING_STATUS.CANCELLED)
    return { ok: false, reason: 'This booking has been cancelled.' };

  if (s === BOOKING_STATUS.CHECKED_IN)
    return { ok: false, reason: 'Guest is already checked in.' };

  if (s === BOOKING_STATUS.CHECKED_OUT)
    return { ok: false, reason: 'This booking has already been checked out.' };

  if (s === BOOKING_STATUS.EXPIRED)
    return { ok: false, reason: 'This booking has expired.' };

  if (s === BOOKING_STATUS.PENDING_PAYMENT)
    return { ok: false, reason: 'Payment has not been completed for this booking.' };

  if (s === BOOKING_STATUS.NO_SHOW)
    return { ok: false, reason: 'This booking was marked as no-show.' };

  if (s !== BOOKING_STATUS.CONFIRMED)
    return {
      ok: false,
      reason: `Unexpected booking status: ${booking.status_display || s}`,
    };

  if (!booking.has_credentials)
    return { ok: false, reason: 'This booking has no check-in credentials.' };

  // ── Date validation ────────────────────────────────────────────────────────
  const today      = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const checkInDate = booking.check_in;                      // 'YYYY-MM-DD'

  if (!checkInDate)
    return { ok: false, reason: 'This booking has no check-in date.' };

  // HARD BLOCK: check-in date is in the future
  if (checkInDate > today) {
    const formatted = new Date(checkInDate + 'T00:00:00').toLocaleDateString('en-PH', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    return {
      ok: false,
      reason: `Check-in date is ${formatted}. This booking cannot be checked in yet.`,
    };
  }

  // SOFT WARNING: check-in date was in the past (late arrival)
  const daysDiff = Math.round(
    (new Date(today + 'T00:00:00') - new Date(checkInDate + 'T00:00:00')) / 86400000,
  );

  if (daysDiff > 0) {
    const formatted = new Date(checkInDate + 'T00:00:00').toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
    return {
      ok: true,
      reason: null,
      warning: `Scheduled check-in was ${daysDiff} day${daysDiff !== 1 ? 's' : ''} ago (${formatted}). Proceeding as a late arrival.`,
    };
  }

  return { ok: true, reason: null };
}

export function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}