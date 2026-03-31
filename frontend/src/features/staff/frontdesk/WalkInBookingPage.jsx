/**
 * src/features/staff/frontdesk/WalkInBookingPage.jsx
 *
 * Walk-In Booking — Front Desk creates a booking and collects payment.
 *
 * Payment flow:
 *   Manual (Cash / GCash / Card / Bank Transfer)
 *     → POST /payments/initiate/ → status=PROCESSING
 *     → POST /payments/admin/<pk>/confirm/ → CONFIRMED immediately
 *     → Shows success screen with reference number + PIN
 *
 *   PayMongo / PayPal
 *     → POST /payments/initiate/ → returns checkout_url + payment_id
 *     → payment_id + booking_id saved to sessionStorage (survives redirect)
 *     → window.location.href = checkout_url  (same as guest booking flow)
 *     → PayMongo webhook marks payment PAID and confirms booking server-side
 *     → Browser redirects back to /payments/success?payment_id=<id>
 *     → WalkInPaymentReturnPage reads payment_id from sessionStorage and polls
 *       GET /payments/my/<paymentId>/verify/ — same endpoint as PaymentSuccessPage
 *
 * Availability flow:
 *   1. Staff selects check-in + check-out dates
 *   2. POST /rooms/availability/ returns only available rooms for that range
 *   3. Changing dates clears the selected room and re-fetches
 *   4. Availability is re-validated on the backend before booking is created
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  frontDeskRoomsApi,
  frontDeskBookingsApi,
  frontDeskPaymentsApi,
  ROOM_TYPE_LABELS,
  formatPHP,
  todayISO,
} from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const STEP = { FORM: 'form', PAYMENT: 'payment', REDIRECTING: 'redirecting', SUCCESS: 'success' };

const PAYMENT_TYPES = [
  { value: 'full_payment', label: 'Full Payment',  desc: '100% of total' },
  { value: 'deposit',      label: 'Deposit (30%)', desc: '30% now, rest at check-in' },
];

const PAYMENT_METHODS = [
  // Manual — confirmed immediately at the desk
  { value: 'cash',          label: 'Cash',          icon: '💵', group: 'immediate' },
  { value: 'gcash',         label: 'GCash',         icon: '📱', group: 'immediate' },
  { value: 'card',          label: 'Card',          icon: '💳', group: 'immediate' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: '🏦', group: 'immediate' },
  // Online — browser redirects to provider checkout
  { value: 'paymongo',      label: 'PayMongo',      icon: '🔗', group: 'online'    },
  { value: 'paypal',        label: 'PayPal',        icon: '🅿',  group: 'online'    },
];

/**
 * Maps UI method values to the payment_method field the backend expects.
 * InitiatePaymentSerializer derives provider automatically from payment_method:
 *   cash           → provider=manual
 *   gcash/card/
 *   bank_transfer  → provider=paymongo
 *   paypal         → provider=paypal
 *
 * For the online UI options (paymongo/paypal), we map to their respective
 * backend payment_method values so the serializer picks the right provider.
 */
const BACKEND_METHOD_MAP = {
  cash:          'cash',
  gcash:         'gcash',
  card:          'card',
  bank_transfer: 'bank_transfer',
  paymongo:      'card',    // serializer sees 'card' → sets provider=paymongo
  paypal:        'paypal',  // serializer sees 'paypal' → sets provider=paypal
};

// sessionStorage keys used to pass payment context across the provider redirect
const SS_PAYMENT_ID = 'walkin_payment_id';
const SS_BOOKING_ID = 'walkin_booking_id';

// ── Price calculator ───────────────────────────────────────────────────────────

function calcPrices(pricePerNight, nights) {
  if (!pricePerNight || !nights || nights <= 0) return null;
  const subtotal   = parseFloat(pricePerNight) * nights;
  const tax        = subtotal * 0.12;
  const serviceFee = subtotal * 0.05;
  const total      = subtotal + tax + serviceFee;
  const deposit    = parseFloat((total * 0.30).toFixed(2));
  return { subtotal, tax, serviceFee, total, deposit };
}

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.max(0, Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000));
}

function datesAreValid(checkIn, checkOut, today) {
  if (!checkIn || !checkOut) return false;
  if (checkIn < today) return false;
  if (checkOut <= checkIn) return false;
  return true;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function WalkInBookingPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [step, setStep] = useState(STEP.FORM);

  // ── Availability ───────────────────────────────────────────────────────────
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availLoading,   setAvailLoading]   = useState(false);
  const [availError,     setAvailError]     = useState(null);
  const [availFetched,   setAvailFetched]   = useState(false);

  // ── Step 1: Booking form ───────────────────────────────────────────────────
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
  });
  const [formErrors, setFormErrors] = useState({});
  const [formBusy,   setFormBusy]   = useState(false);
  const [booking,    setBooking]    = useState(null);

  // ── Step 2: Payment ────────────────────────────────────────────────────────
  const [paymentType,    setPaymentType]    = useState('full_payment');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payBusy,        setPayBusy]        = useState(false);
  const [payError,       setPayError]       = useState(null);

  // ── Step 3: Success (manual only — online redirects away) ─────────────────
  const [confirmed,   setConfirmed]   = useState(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkedIn,   setCheckedIn]   = useState(false);

  // ── Fetch available rooms ──────────────────────────────────────────────────
  const fetchAvailability = useCallback(async (checkIn, checkOut) => {
    if (!datesAreValid(checkIn, checkOut, today)) {
      setAvailableRooms([]);
      setAvailFetched(false);
      setAvailError(null);
      return;
    }
    setAvailLoading(true);
    setAvailError(null);
    setAvailFetched(false);
    try {
      const rooms = await frontDeskRoomsApi.available(checkIn, checkOut);
      setAvailableRooms(rooms);
      setAvailFetched(true);
    } catch (err) {
      setAvailError(
        err.response?.data?.detail ||
        err.response?.data?.error  ||
        'Failed to check availability. Please try again.',
      );
      setAvailableRooms([]);
    } finally {
      setAvailLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchAvailability(form.check_in, form.check_out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Field change handler ───────────────────────────────────────────────────
  const setField = (field) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === 'check_in' || field === 'check_out') {
        next.room_id = '';
        const newCheckIn  = field === 'check_in'  ? value : f.check_in;
        const newCheckOut = field === 'check_out' ? value : f.check_out;
        setTimeout(() => fetchAvailability(newCheckIn, newCheckOut), 0);
      }
      return next;
    });
    setFormErrors((fe) => ({ ...fe, [field]: null }));
  };

  const selectedRoom = availableRooms.find((r) => String(r.id) === String(form.room_id));
  const nights       = nightsBetween(form.check_in, form.check_out);
  const prices       = selectedRoom
    ? calcPrices(selectedRoom.discounted_price || selectedRoom.price_per_night, nights)
    : null;
  const amountToPay  = prices
    ? parseFloat((paymentType === 'deposit' ? prices.deposit : prices.total).toFixed(2))
    : 0;

  // ── Step 1: Create booking ─────────────────────────────────────────────────
  async function handleCreateBooking(e) {
    e.preventDefault();

    const errors = {};
    if (!form.full_name.trim()) errors.full_name = 'Required';
    if (!form.email.trim())     errors.email     = 'Required';
    if (!form.phone.trim())     errors.phone     = 'Required';
    if (!form.room_id)          errors.room_id   = 'Select a room';
    if (!form.check_in)         errors.check_in  = 'Required';
    if (!form.check_out)        errors.check_out = 'Required';
    if (nights <= 0)            errors.check_out = 'Check-out must be after check-in';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setFormBusy(true);

    // Re-validate availability before submitting
    try {
      const freshRooms     = await frontDeskRoomsApi.available(form.check_in, form.check_out);
      const stillAvailable = freshRooms.some((r) => String(r.id) === String(form.room_id));
      if (!stillAvailable) {
        setAvailableRooms(freshRooms);
        setForm((f) => ({ ...f, room_id: '' }));
        setFormErrors({ room_id: 'This room was just booked. Please select another.' });
        setFormBusy(false);
        return;
      }
    } catch {
      // Network hiccup — let the backend booking call handle it
    }

    try {
      const created = await frontDeskBookingsApi.createWalkIn({
        room_id:      parseInt(form.room_id),
        check_in:     form.check_in,
        check_out:    form.check_out,
        guests_count: parseInt(form.guests_count),
        full_name:    form.full_name.trim(),
        email:        form.email.trim().toLowerCase(),
        phone:        form.phone.trim(),
      });
      setBooking(created);
      setStep(STEP.PAYMENT);
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const mapped = {};
        Object.entries(d).forEach(([k, v]) => {
          mapped[k] = Array.isArray(v) ? v.join(' ') : String(v);
        });
        setFormErrors(mapped);
      } else {
        setFormErrors({ _general: err.message || 'Failed to create booking.' });
      }
    } finally {
      setFormBusy(false);
    }
  }

  // ── Step 2: Process payment ────────────────────────────────────────────────
  async function handlePayment() {
    if (!selectedMethod) { setPayError('Please select a payment method.'); return; }
    setPayBusy(true);
    setPayError(null);

    const isManual      = selectedMethod.group === 'immediate';
    const paymentMethod = BACKEND_METHOD_MAP[selectedMethod.value];

    try {
      // Only send what InitiatePaymentSerializer accepts.
      // Do NOT send provider, success_url, or cancel_url — the serializer
      // ignores unknown fields and derives provider from payment_method itself.
      // Amount is always computed server-side.
      const payment = await frontDeskPaymentsApi.initiate({
        booking_id:     booking.id,
        payment_type:   paymentType,
        payment_method: paymentMethod,
      });

      if (isManual) {
        // ── Manual: confirm immediately at desk ────────────────────────────
        const paymentId = payment.payment_id ?? payment.id;
        await frontDeskPaymentsApi.confirmManual(
          paymentId,
          `Walk-in payment at front desk via ${selectedMethod.label}.`,
        );
        // Fetch confirmed booking — now has reference_number + checkin_pin
        const updated = await frontDeskBookingsApi.detail(booking.id);
        setConfirmed(updated);
        setStep(STEP.SUCCESS);

      } else {
        // ── Online: sessionStorage → redirect ──────────────────────────────
        //
        // The backend always redirects PayMongo back to:
        //   /payments/success?payment_id=<id>
        // We cannot change this without a backend change (Option A).
        //
        // Instead we store the IDs in sessionStorage before navigating away.
        // sessionStorage is per-tab and survives the redirect within the same tab.
        //
        // WalkInPaymentReturnPage reads these keys and polls
        // GET /payments/my/<paymentId>/verify/ — the exact same endpoint and
        // polling pattern used by the guest-facing PaymentSuccessPage.
        // No new backend endpoints needed.

        const checkoutUrl = payment.checkout_url;

        if (!checkoutUrl) {
          setPayError('No checkout URL returned by the payment gateway. Please try again.');
          setPayBusy(false);
          return;
        }

        // Persist across the redirect
        sessionStorage.setItem(SS_PAYMENT_ID, String(payment.payment_id ?? payment.id));
        sessionStorage.setItem(SS_BOOKING_ID, String(booking.id));

        // Show a brief redirecting screen so staff knows what's happening
        setStep(STEP.REDIRECTING);

        // Small delay so the screen renders before navigation
        setTimeout(() => {
          window.location.href = checkoutUrl;
        }, 800);

        // Intentionally do NOT call setPayBusy(false) here.
        // Keep the button locked until the page navigates away
        // to prevent double-submits during the 800ms delay.
      }

    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' · ');
        setPayError(msgs);
      } else {
        setPayError(
          err.response?.data?.error  ||
          err.response?.data?.detail ||
          err.message                ||
          'Payment failed. Please try again.',
        );
      }
      setPayBusy(false);
    }
  }

  // ── Check in immediately after manual confirm ──────────────────────────────
  async function handleCheckInNow() {
    if (!confirmed) return;
    setCheckInBusy(true);
    try {
      await frontDeskBookingsApi.checkIn(confirmed.id, 'manual_entry');
      setCheckedIn(true);
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Check-in failed.');
    } finally {
      setCheckInBusy(false);
    }
  }

  // ── Reset to clean form ────────────────────────────────────────────────────
  function reset() {
    setStep(STEP.FORM);
    setBooking(null);
    setConfirmed(null);
    setCheckedIn(false);
    setPayError(null);
    setFormErrors({});
    setSelectedMethod(null);
    setPaymentType('full_payment');
    setAvailableRooms([]);
    setAvailFetched(false);
    setAvailError(null);
    const newForm = {
      full_name: '', email: '', phone: '',
      room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
    };
    setForm(newForm);
    fetchAvailability(today, tomorrow);
  }

  // ── Room selector helper ───────────────────────────────────────────────────
  function renderRoomSelector() {
    if (!datesAreValid(form.check_in, form.check_out, today)) {
      return (
        <div className="fd-notice fd-notice-amber">
          <span className="fd-notice-icon">📅</span>
          <span>Select valid check-in and check-out dates to see available rooms.</span>
        </div>
      );
    }
    if (availLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--white-dim)', fontSize: 13 }}>
          <span className="fd-spinner-sm" />
          Checking availability…
        </div>
      );
    }
    if (availError) {
      return (
        <div className="fd-notice fd-notice-error">
          <span className="fd-notice-icon">✕</span>
          <span>{availError}</span>
        </div>
      );
    }
    if (availFetched && availableRooms.length === 0) {
      return (
        <div className="fd-notice fd-notice-amber">
          <span className="fd-notice-icon">⚠</span>
          <span>No rooms available for the selected dates. Try a different date range.</span>
        </div>
      );
    }
    if (availFetched && availableRooms.length > 0) {
      return (
        <select
          className={`fd-select-lg${formErrors.room_id ? ' error' : ''}`}
          value={form.room_id}
          onChange={setField('room_id')}
        >
          <option value="">Select available room…</option>
          {availableRooms.map((r) => (
            <option key={r.id} value={r.id}>
              Room {r.room_number} — {ROOM_TYPE_LABELS[r.room_type] || r.room_type} · {r.bed_type} bed · {r.capacity} guest{r.capacity !== 1 ? 's' : ''} · {formatPHP(r.discounted_price || r.price_per_night)}/night
            </option>
          ))}
        </select>
      );
    }
    return (
      <div style={{ color: 'var(--white-dim)', fontSize: 13 }}>
        Select dates above to see available rooms.
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 860 }}>

        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Walk-In Booking</h1>
            <p>Create a booking for a guest arriving without a reservation</p>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>← Back</button>
        </div>

        {/* ════ REDIRECTING ════ */}
        {step === STEP.REDIRECTING && (
          <div className="fd-card">
            <div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <div className="fd-spinner" style={{ margin: '0 auto 24px' }} />
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 22, color: 'var(--white)', marginBottom: 8,
              }}>
                Redirecting to {selectedMethod?.label}
              </p>
              <p style={{ fontSize: 13, color: 'var(--white-dim)' }}>
                Please wait — you're being sent to the payment gateway.
              </p>
            </div>
          </div>
        )}

        {/* ════ STEP 1: BOOKING FORM ════ */}
        {step === STEP.FORM && (
          <form onSubmit={handleCreateBooking}>

            {formErrors._general && (
              <div className="fd-notice fd-notice-error">
                <span className="fd-notice-icon">✕</span>
                <span>{formErrors._general}</span>
              </div>
            )}

            {/* Guest info */}
            <div className="fd-card">
              <div className="fd-card-label">Guest Information</div>
              <p style={{ fontSize: 12, color: 'var(--white-dim)', marginBottom: 16, marginTop: -8 }}>
                Any email address is accepted — guests do not need an existing account.
              </p>
              <div className="fd-form-grid">
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Full Name</label>
                  <input
                    className={`fd-input-lg${formErrors.full_name ? ' error' : ''}`}
                    value={form.full_name}
                    onChange={setField('full_name')}
                    placeholder="Juan dela Cruz"
                    autoFocus
                  />
                  {formErrors.full_name && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.full_name}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Email Address</label>
                  <input
                    type="email"
                    className={`fd-input-lg${formErrors.email ? ' error' : ''}`}
                    value={form.email}
                    onChange={setField('email')}
                    placeholder="juan@example.com"
                  />
                  {formErrors.email && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.email}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Phone Number</label>
                  <input
                    className={`fd-input-lg${formErrors.phone ? ' error' : ''}`}
                    value={form.phone}
                    onChange={setField('phone')}
                    placeholder="09XX-XXX-XXXX"
                  />
                  {formErrors.phone && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.phone}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label">Number of Guests</label>
                  <input
                    type="number"
                    min={1}
                    max={selectedRoom?.capacity || 10}
                    className="fd-input-lg"
                    value={form.guests_count}
                    onChange={setField('guests_count')}
                  />
                </div>
              </div>
            </div>

            {/* Stay Dates */}
            <div className="fd-card">
              <div className="fd-card-label">Stay Dates</div>
              <div className="fd-form-grid">
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-In Date</label>
                  <input
                    type="date"
                    className={`fd-input-lg${formErrors.check_in ? ' error' : ''}`}
                    value={form.check_in}
                    min={today}
                    onChange={setField('check_in')}
                  />
                  {formErrors.check_in && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_in}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-Out Date</label>
                  <input
                    type="date"
                    className={`fd-input-lg${formErrors.check_out ? ' error' : ''}`}
                    value={form.check_out}
                    min={form.check_in || today}
                    onChange={setField('check_out')}
                  />
                  {formErrors.check_out && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_out}</p>}
                </div>
              </div>
            </div>

            {/* Available Room */}
            <div className="fd-card">
              <div className="fd-card-label">Available Room</div>
              {availFetched && !availLoading && (
                <p style={{ fontSize: 12, color: 'var(--white-dim)', marginBottom: 12, marginTop: -6 }}>
                  {availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} available
                  {' '}for {form.check_in} → {form.check_out}
                </p>
              )}
              <div className="fd-form-group" style={{ marginBottom: 0 }}>
                {renderRoomSelector()}
                {formErrors.room_id && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.room_id}</p>}
              </div>

              {prices && (
                <div className="fd-price-box" style={{ marginTop: 16 }}>
                  {[
                    ['Room rate / night', formatPHP(selectedRoom?.discounted_price || selectedRoom?.price_per_night)],
                    [`Subtotal (${nights} night${nights !== 1 ? 's' : ''})`, formatPHP(prices.subtotal)],
                    ['Tax (12%)',         formatPHP(prices.tax)],
                    ['Service Fee (5%)',  formatPHP(prices.serviceFee)],
                  ].map(([label, val]) => (
                    <div className="fd-price-row" key={label}>
                      <span className="fd-price-label">{label}</span>
                      <span className="fd-price-value">{val}</span>
                    </div>
                  ))}
                  <div className="fd-price-row" style={{ borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4 }}>
                    <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>Total</span>
                    <span className="fd-price-value gold">{formatPHP(prices.total)}</span>
                  </div>
                  <div className="fd-price-row">
                    <span className="fd-price-label">Deposit option (30%)</span>
                    <span className="fd-price-value" style={{ color: 'var(--amber)' }}>{formatPHP(prices.deposit)}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              className="fd-btn fd-btn-primary fd-btn-full"
              disabled={formBusy || availLoading || !form.room_id}
            >
              {formBusy
                ? <><span className="fd-spinner-sm" /> Creating Booking…</>
                : 'Continue to Payment →'
              }
            </button>
          </form>
        )}

        {/* ════ STEP 2: PAYMENT ════ */}
        {step === STEP.PAYMENT && booking && prices && (
          <div>

            {/* Booking summary */}
            <div className="fd-card">
              <div className="fd-card-label">Booking Created</div>
              <div className="fd-notice fd-notice-blue" style={{ marginBottom: 0 }}>
                <span className="fd-notice-icon">ℹ</span>
                <div>
                  <strong>Booking #{booking.id}</strong> for {booking.full_name} ·
                  Room {booking.room_number} · {booking.nights} night{booking.nights !== 1 ? 's' : ''} ·{' '}
                  {new Date(booking.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  {' → '}
                  {new Date(booking.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </div>

            <div className="fd-card">
              <div className="fd-card-label">Collect Payment</div>

              {payError && (
                <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                  <span className="fd-notice-icon">✕</span>
                  <span>{payError}</span>
                </div>
              )}

              {/* Payment type */}
              <div className="fd-form-group">
                <label className="fd-label">Payment Type</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  {PAYMENT_TYPES.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      className={`fd-btn${paymentType === pt.value ? ' fd-btn-primary' : ''}`}
                      style={{ flex: 1, padding: '11px', flexDirection: 'column', gap: 2 }}
                      onClick={() => setPaymentType(pt.value)}
                    >
                      <span>{pt.label}</span>
                      <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 0.5, textTransform: 'none', fontWeight: 400 }}>
                        {pt.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div className="fd-form-group">
                <label className="fd-label">Payment Method</label>

                {/* Manual */}
                <p style={{
                  fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--white-dim)', margin: '0 0 8px',
                }}>
                  Collect at Desk — Confirmed Immediately
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                  {PAYMENT_METHODS.filter((m) => m.group === 'immediate').map((pm) => (
                    <button
                      key={pm.value}
                      type="button"
                      onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                      style={{
                        background:    selectedMethod?.value === pm.value ? 'var(--gold-dim)' : 'var(--navy-mid)',
                        border:        `1px solid ${selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--gold-border)'}`,
                        color:         selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--white-dim)',
                        padding:       '12px 8px',
                        cursor:        'pointer',
                        display:       'flex',
                        flexDirection: 'column',
                        alignItems:    'center',
                        gap:           6,
                        fontFamily:    "'Raleway', sans-serif",
                        fontSize:      11,
                        fontWeight:    600,
                        letterSpacing: 1,
                        transition:    'all 0.18s',
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{pm.icon}</span>
                      {pm.label}
                    </button>
                  ))}
                </div>

                {/* Online */}
                <p style={{
                  fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase',
                  color: 'var(--white-dim)', margin: '0 0 8px',
                }}>
                  Online — Redirect to Payment Gateway
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {PAYMENT_METHODS.filter((m) => m.group === 'online').map((pm) => (
                    <button
                      key={pm.value}
                      type="button"
                      onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                      style={{
                        background: selectedMethod?.value === pm.value ? 'var(--blue-bg)' : 'var(--navy-mid)',
                        border:     `1px solid ${selectedMethod?.value === pm.value ? 'var(--blue-border)' : 'var(--gold-border)'}`,
                        color:      selectedMethod?.value === pm.value ? 'var(--blue)' : 'var(--white-dim)',
                        padding:    '12px 14px',
                        cursor:     'pointer',
                        display:    'flex',
                        alignItems: 'center',
                        gap:        12,
                        fontFamily: "'Raleway', sans-serif",
                        fontSize:   12,
                        fontWeight: 600,
                        transition: 'all 0.18s',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{pm.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div>{pm.label}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginTop: 2 }}>
                          Browser redirects to checkout page
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Online notice */}
              {selectedMethod?.group === 'online' && (
                <div className="fd-notice fd-notice-blue" style={{ marginBottom: 14 }}>
                  <span className="fd-notice-icon">ℹ</span>
                  <span style={{ fontSize: 12 }}>
                    Clicking <strong>Proceed to {selectedMethod.label}</strong> will open the{' '}
                    {selectedMethod.label} hosted checkout page. The booking is confirmed
                    automatically once payment is completed. You will be redirected back after payment.
                  </span>
                </div>
              )}

              {/* Amount summary */}
              <div className="fd-price-box" style={{ marginBottom: 18 }}>
                <div className="fd-price-row">
                  <span className="fd-price-label">Total Booking Price</span>
                  <span className="fd-price-value">{formatPHP(prices.total)}</span>
                </div>
                <div className="fd-price-row" style={{ borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4 }}>
                  <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                    Amount to Collect ({paymentType === 'deposit' ? 'Deposit 30%' : 'Full Payment'})
                  </span>
                  <span className="fd-price-value gold" style={{ fontSize: 20 }}>{formatPHP(amountToPay)}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="fd-btn"
                  onClick={() => setStep(STEP.FORM)}
                  style={{ flex: 1 }}
                  disabled={payBusy}
                >
                  ← Back
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px' }}
                  onClick={handlePayment}
                  disabled={payBusy || !selectedMethod}
                >
                  {payBusy ? (
                    <><span className="fd-spinner-sm" /> Processing…</>
                  ) : selectedMethod?.group === 'online' ? (
                    `Proceed to ${selectedMethod.label} →`
                  ) : (
                    `✓ Confirm ${formatPHP(amountToPay)} Payment`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: SUCCESS (manual payments only) ════ */}
        {step === STEP.SUCCESS && confirmed && (
          <div className="fd-card">
            <div className="fd-success">
              <div className="fd-success-icon">✓</div>
              <h2 className="fd-success-title">Booking Confirmed</h2>
              <p className="fd-success-sub">
                Walk-in booking for <strong>{confirmed.full_name}</strong> is confirmed and paid.
                Share the credentials below with the guest.
              </p>

              <dl className="fd-success-creds">
                {[
                  ['Reference Number', confirmed.reference_number],
                  ['Check-In PIN',     confirmed.checkin_pin],
                  ['Room',             `${confirmed.room_number} — ${confirmed.room_type}`],
                  ['Stay', `${confirmed.check_in
                    ? new Date(confirmed.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                    : '—'} → ${confirmed.check_out
                    ? new Date(confirmed.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}`],
                  ['Amount Paid', formatPHP(confirmed.amount_paid)],
                  ...(parseFloat(confirmed.amount_due || '0') > 0
                    ? [['Balance Due', formatPHP(confirmed.amount_due)]]
                    : []),
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={['Reference Number', 'Check-In PIN'].includes(label) ? 'highlight' : ''}>
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              {!checkedIn && confirmed.status === 'confirmed' && (
                <div className="fd-notice fd-notice-blue" style={{ maxWidth: 420, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">ℹ</span>
                  <div>
                    <strong>Guest is here now?</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                      Check them in immediately — no PIN flow needed.
                    </p>
                  </div>
                </div>
              )}
              {checkedIn && (
                <div className="fd-notice fd-notice-success" style={{ maxWidth: 420, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">✓</span>
                  <strong>Guest checked in. Room {confirmed.room_number} is now Occupied.</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="fd-btn" onClick={() => window.print()}>🖨 Print Receipt</button>
                {!checkedIn && confirmed.status === 'confirmed' && (
                  <button
                    className="fd-btn fd-btn-success"
                    onClick={handleCheckInNow}
                    disabled={checkInBusy}
                  >
                    {checkInBusy
                      ? <><span className="fd-spinner-sm" /> Checking In…</>
                      : '✓ Check In Guest Now'}
                  </button>
                )}
                <button className="fd-btn fd-btn-primary" onClick={reset}>
                  + New Walk-In
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}