/**
 * src/features/staff/frontdesk/services/frontDeskApi.js
 *
 * All API calls for the Front Desk module.
 * Uses the shared axios instance — Bearer token auto-attached.
 */

import api from '../../../../services/api';

// ─── Rooms ─────────────────────────────────────────────────────────────────────

export const frontDeskRoomsApi = {
  /**
   * GET /admin/rooms/
   * All rooms with their current status.
   * Uses the admin endpoint which accepts Bearer token (staff are always authenticated).
   * Falls back to public /rooms/ endpoint if needed.
   * Used for the Room Status Board and Walk-In Booking room selector.
   */
  list: (params = {}) =>
    api.get('/rooms/', { params: { ...params } }).then((r) => r.data),
};

// ─── Bookings ──────────────────────────────────────────────────────────────────

export const frontDeskBookingsApi = {
  /**
   * GET /bookings/admin/?check_in=YYYY-MM-DD&status=confirmed
   * Today's expected arrivals.
   */
  todayArrivals: (date) =>
    api.get('/bookings/admin/', {
      params: { check_in: date, status: 'confirmed' },
    }).then((r) => r.data),

  /**
   * GET /bookings/admin/?check_out=YYYY-MM-DD&status=checked_in
   * Today's expected departures.
   */
  todayDepartures: (date) =>
    api.get('/bookings/admin/', {
      params: { check_out: date, status: 'checked_in' },
    }).then((r) => r.data),

  /**
   * GET /bookings/admin/<pk>/
   * Single booking detail.
   */
  detail: (pk) =>
    api.get(`/bookings/admin/${pk}/`).then((r) => r.data),

  /**
   * POST /bookings/
   * Create a walk-in booking (Phase 1 — PENDING_PAYMENT).
   */
// ✅ Use the admin walk-in endpoint that accepts guest details from the body
  createWalkIn: (body) =>
  api.post('/bookings/', body).then((r) => r.data),

  /**
   * POST /bookings/admin/<pk>/confirm/
   * Confirm booking after payment (Phase 2 — CONFIRMED).
   * Generates reference_number and checkin_pin.
   */
  confirm: (pk) =>
    api.post(`/bookings/admin/${pk}/confirm/`).then((r) => r.data),

  /**
   * POST /bookings/admin/<pk>/check-in/
   * Front Desk check-in (from check-in panel).
   */
  checkIn: (pk, method = 'manual_entry') =>
    api.post(`/bookings/admin/${pk}/check-in/`, { method }).then((r) => r.data),
};

// ─── Payments ──────────────────────────────────────────────────────────────────

export const frontDeskPaymentsApi = {
  /**
   * POST /payments/admin/<pk>/confirm/
   * Manually confirm a cash / walk-in payment.
   * Used after creating a walk-in booking with manual payment.
   */
  confirmManual: (pk, note = '') =>
    api.post(`/payments/admin/${pk}/confirm/`, { note }).then((r) => r.data),

  /**
   * POST /payments/initiate/
   * Create a payment record for a walk-in booking.
   * For cash payments use provider=manual, payment_method=cash.
   */
  initiate: (body) =>
    api.post('/payments/initiate/', body).then((r) => r.data),
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function formatPHP(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function formatTime(dtStr) {
  if (!dtStr) return '—';
  return new Date(dtStr).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit',
  });
}

// Room status config
export const ROOM_STATUS_CONFIG = {
  available:   { label: 'Available',        color: 'var(--green)',  bg: 'var(--green-bg)',  border: 'var(--green-border)'  },
  occupied:    { label: 'Occupied',          color: 'var(--gold)',   bg: 'var(--gold-dim)',  border: 'var(--gold-border)'   },
  cleaning:    { label: 'Cleaning',          color: 'var(--amber)',  bg: 'var(--amber-bg)',  border: 'var(--amber-border)'  },
  maintenance: { label: 'Maintenance',       color: 'var(--red)',    bg: 'var(--red-bg)',    border: 'var(--red-border)'    },
  reserved:    { label: 'Reserved',          color: 'var(--blue)',   bg: 'var(--blue-bg)',   border: 'var(--blue-border)'   },
};

export const ROOM_TYPE_LABELS = {
  standard:  'Standard',
  deluxe:    'Deluxe',
  suite:     'Suite',
  family:    'Family',
  penthouse: 'Penthouse',
};