/**
 * src/features/staff/checkin/services/checkInApi.js
 *
 * All API calls for the Front Desk Check-In system.
 * Written against the REAL bookings backend:
 *
 *   GET  /bookings/lookup/?reference=CMH-YYYY-XXXXXX
 *        → BookingDetailSerializer (has amount_paid, amount_due fields)
 *
 *   POST /bookings/admin/<pk>/verify-pin/
 *        body: { pin: "1234" }   ← 4 digits, not 6
 *        → { valid: true } | 400 { valid: false, error: "..." }
 *
 *   POST /bookings/admin/<pk>/check-in/
 *        body: { method: "qr_scan" | "manual_entry" }
 *        → BookingDetailSerializer
 *
 *   POST /bookings/admin/<pk>/collect-payment/
 *        body: { payment_method: "cash" | "gcash" | "card" | "other" }
 *        → BookingDetailSerializer
 *
 *   POST /bookings/admin/<pk>/check-in-with-balance/
 *        body: { method: "qr_scan" | "manual_entry" }
 *        → BookingDetailSerializer + remaining_balance field
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
// Matches PaymentMethod choices in payments/models.py + 'other'

export const PAYMENT_METHODS = [
  { value: 'cash',  label: 'Cash',                icon: '💵' },
  { value: 'gcash', label: 'GCash',               icon: '📱' },
  { value: 'card',  label: 'Credit / Debit Card', icon: '💳' },
  { value: 'other', label: 'Other',               icon: '•••' },
];

// ─── Booking status values (matches BookingStatus in bookings/models.py) ──────

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

// ─── Payment status values (matches PaymentStatus in bookings/models.py) ──────

export const BOOKING_PAYMENT_STATUS = {
  UNPAID:             'unpaid',
  PAID:               'paid',
  REFUNDED:           'refunded',
  PARTIALLY_REFUNDED: 'partially_refunded',
  FAILED:             'failed',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Get remaining balance from a BookingDetailSerializer response.
 * Uses the computed `amount_due` field which the serializer calculates
 * by summing paid Payment records and subtracting from total_price.
 */
export function getRemainingBalance(booking) {
  if (!booking) return 0;
  const due = parseFloat(booking.amount_due || '0');
  return Math.max(0, due);
}

/**
 * Get the amount already paid from a BookingDetailSerializer response.
 */
export function getAmountPaid(booking) {
  if (!booking) return 0;
  return parseFloat(booking.amount_paid || '0');
}

/**
 * Validate that a booking can be checked in.
 * Runs locally before making any API calls.
 * Returns { ok: boolean, reason: string | null }
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
    return { ok: false, reason: `Unexpected booking status: ${booking.status_display || s}` };

  if (!booking.has_credentials)
    return { ok: false, reason: 'This booking has no check-in credentials.' };

  return { ok: true, reason: null };
}

/**
 * Format a number as Philippine Peso currency.
 */
export function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}