/**
 * src/features/staff/frontdesk/WalkInBookingPage.jsx
 *
 * Front Desk creates a walk-in booking and collects payment.
 *
 * Availability flow:
 *   1. Staff selects check-in + check-out dates
 *   2. System calls POST /rooms/availability/ with the date range
 *   3. Only available rooms are shown in the room selector
 *   4. Changing dates clears the selected room and re-fetches availability
 *   5. Before confirming the booking, availability is re-validated on the backend
 *
 * Payment flow by method:
 *   Cash / GCash / Card / Bank Transfer
 *     → provider=manual → POST /payments/admin/<pk>/confirm/ → CONFIRMED immediately
 *   PayMongo / PayPal
 *     → provider=paymongo|paypal → returns checkout_url → show link to guest
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

const STEP = { FORM: 'form', PAYMENT: 'payment', SUCCESS: 'success' };

const PAYMENT_TYPES = [
  { value: 'full_payment', label: 'Full Payment',  desc: '100% of total' },
  { value: 'deposit',      label: 'Deposit (30%)', desc: '30% now, rest at check-in' },
];

const MANUAL_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash',          icon: '💵', provider: 'manual',   group: 'immediate' },
  { value: 'gcash',         label: 'GCash',         icon: '📱', provider: 'manual',   group: 'immediate' },
  { value: 'card',          label: 'Card',          icon: '💳', provider: 'manual',   group: 'immediate' },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: '🏦', provider: 'manual',   group: 'immediate' },
  { value: 'paymongo',      label: 'PayMongo',      icon: '🔗', provider: 'paymongo', group: 'online'    },
  { value: 'paypal',        label: 'PayPal',        icon: '🅿',  provider: 'paypal',  group: 'online'    },
];

const ONLINE_METHOD_MAP = {
  paymongo: 'card',
  paypal:   'paypal',
};

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

  // ── Availability state ─────────────────────────────────────────────────────
  // availableRooms: rooms returned by the backend for the selected date range.
  // availLoading:   true while the availability request is in flight.
  // availError:     string if the request failed or dates are invalid.
  // availFetched:   true once at least one successful fetch has completed —
  //                 used to distinguish "not yet checked" from "no results".
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availLoading,   setAvailLoading]   = useState(false);
  const [availError,     setAvailError]     = useState(null);
  const [availFetched,   setAvailFetched]   = useState(false);

  // Step 1 — form fields
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
  });
  const [formErrors, setFormErrors] = useState({});
  const [formBusy,   setFormBusy]   = useState(false);

  // Step 1 result
  const [booking, setBooking] = useState(null);

  // Step 2 — payment
  const [paymentType,    setPaymentType]    = useState('full_payment');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payBusy,        setPayBusy]        = useState(false);
  const [payError,       setPayError]       = useState(null);

  // Step 3 — result
  const [confirmed,   setConfirmed]   = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkedIn,   setCheckedIn]   = useState(false);

  // ── Fetch available rooms whenever dates change ────────────────────────────
  const fetchAvailability = useCallback(async (checkIn, checkOut) => {
    // Guard: both dates must be present and logically valid
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
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.error  ||
        'Failed to check availability. Please try again.';
      setAvailError(msg);
      setAvailableRooms([]);
    } finally {
      setAvailLoading(false);
    }
  }, [today]);

  // Run on initial mount with default dates
  useEffect(() => {
    fetchAvailability(form.check_in, form.check_out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Field change handler ───────────────────────────────────────────────────
  const setField = (field) => (e) => {
    const value = e.target.value;

    setForm((f) => {
      const next = { ...f, [field]: value };

      // When either date changes:
      //  1. Clear the selected room — it may no longer be available
      //  2. Re-fetch availability for the new date range
      if (field === 'check_in' || field === 'check_out') {
        next.room_id = '';
        const newCheckIn  = field === 'check_in'  ? value : f.check_in;
        const newCheckOut = field === 'check_out' ? value : f.check_out;
        // Schedule fetch after state update
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

    // ── Backend re-validation before creating the booking ──────────────────
    // Re-check availability so we never create a booking on a room that was
    // taken between when staff loaded the form and when they hit "Continue".
    setFormBusy(true);
    try {
      const freshRooms = await frontDeskRoomsApi.available(form.check_in, form.check_out);
      const stillAvailable = freshRooms.some((r) => String(r.id) === String(form.room_id));

      if (!stillAvailable) {
        // Update the room list so the UI reflects current state
        setAvailableRooms(freshRooms);
        setForm((f) => ({ ...f, room_id: '' }));
        setFormErrors({ room_id: 'This room was just booked. Please select another.' });
        setFormBusy(false);
        return;
      }
    } catch {
      // If availability re-check fails, let the backend booking call handle it
      // — don't block the staff from proceeding on a network hiccup.
    }

    // ── Create the booking ─────────────────────────────────────────────────
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
    setPayBusy(true); setPayError(null);

    const isManual = selectedMethod.group === 'immediate';
    const provider = selectedMethod.provider;
    const paymentMethod = isManual
      ? selectedMethod.value
      : ONLINE_METHOD_MAP[provider];

    try {
      const payment = await frontDeskPaymentsApi.initiate({
        booking_id:     booking.id,
        payment_type:   paymentType,
        payment_method: paymentMethod,
        provider:       provider,
        amount:         amountToPay,
      });

      if (isManual) {
        const paymentId = payment.payment_id ?? payment.id;
        await frontDeskPaymentsApi.confirmManual(
          paymentId,
          `Walk-in payment at front desk via ${selectedMethod.label}.`,
        );
        const updated = await frontDeskBookingsApi.detail(booking.id);
        setConfirmed(updated);
        setCheckoutUrl(null);
      } else {
        setCheckoutUrl(payment.checkout_url);
        const updated = await frontDeskBookingsApi.detail(booking.id);
        setConfirmed(updated);
      }

      setStep(STEP.SUCCESS);
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
          'Payment failed. Please try again.'
        );
      }
    } finally {
      setPayBusy(false);
    }
  }

  // ── Optional: check in immediately after confirming ────────────────────────
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

  function reset() {
    setStep(STEP.FORM);
    setBooking(null); setConfirmed(null);
    setCheckoutUrl(null); setCheckedIn(false);
    setPayError(null); setFormErrors({});
    setSelectedMethod(null); setPaymentType('full_payment');
    setAvailableRooms([]); setAvailFetched(false); setAvailError(null);
    const newForm = {
      full_name: '', email: '', phone: '',
      room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
    };
    setForm(newForm);
    // Fetch availability for the reset dates
    fetchAvailability(today, tomorrow);
  }

  // ── Room selector content ──────────────────────────────────────────────────
  // Separated out to keep the JSX readable.
  function renderRoomSelector() {
    // Dates not yet valid — prompt staff to fill them in first
    if (!datesAreValid(form.check_in, form.check_out, today)) {
      return (
        <div className="fd-notice fd-notice-amber">
          <span className="fd-notice-icon">📅</span>
          <span>Select valid check-in and check-out dates to see available rooms.</span>
        </div>
      );
    }

    // Loading
    if (availLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--white-dim)', fontSize: 13 }}>
          <span className="fd-spinner-sm" />
          Checking availability…
        </div>
      );
    }

    // Availability fetch failed
    if (availError) {
      return (
        <div className="fd-notice fd-notice-error">
          <span className="fd-notice-icon">✕</span>
          <span>{availError}</span>
        </div>
      );
    }

    // Fetch completed but no rooms available
    if (availFetched && availableRooms.length === 0) {
      return (
        <div className="fd-notice fd-notice-amber">
          <span className="fd-notice-icon">⚠</span>
          <span>No rooms available for the selected dates. Try a different date range.</span>
        </div>
      );
    }

    // Rooms available — show selector
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
              Room {r.room_number} — {ROOM_TYPE_LABELS[r.room_type] || r.room_type} · {r.bed_type} bed · {r.capacity} guests · {formatPHP(r.discounted_price || r.price_per_night)}/night
            </option>
          ))}
        </select>
      );
    }

    // Default: not yet fetched (e.g. initial render before first fetch resolves)
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
                    value={form.full_name} onChange={setField('full_name')}
                    placeholder="Juan dela Cruz" autoFocus
                  />
                  {formErrors.full_name && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.full_name}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Email Address</label>
                  <input
                    type="email"
                    className={`fd-input-lg${formErrors.email ? ' error' : ''}`}
                    value={form.email} onChange={setField('email')}
                    placeholder="juan@example.com"
                  />
                  {formErrors.email && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.email}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Phone Number</label>
                  <input
                    className={`fd-input-lg${formErrors.phone ? ' error' : ''}`}
                    value={form.phone} onChange={setField('phone')}
                    placeholder="09XX-XXX-XXXX"
                  />
                  {formErrors.phone && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.phone}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label">Number of Guests</label>
                  <input
                    type="number" min={1} max={selectedRoom?.capacity || 10}
                    className="fd-input-lg" value={form.guests_count}
                    onChange={setField('guests_count')}
                  />
                </div>
              </div>
            </div>

            {/* Dates first, then room — availability depends on dates */}
            <div className="fd-card">
              <div className="fd-card-label">Stay Dates</div>
              <div className="fd-form-grid">
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-In Date</label>
                  <input
                    type="date"
                    className={`fd-input-lg${formErrors.check_in ? ' error' : ''}`}
                    value={form.check_in} min={today}
                    onChange={setField('check_in')}
                  />
                  {formErrors.check_in && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_in}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-Out Date</label>
                  <input
                    type="date"
                    className={`fd-input-lg${formErrors.check_out ? ' error' : ''}`}
                    value={form.check_out} min={form.check_in || today}
                    onChange={setField('check_out')}
                  />
                  {formErrors.check_out && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_out}</p>}
                </div>
              </div>
            </div>

            {/* Room selector — shown after dates, always reflects current availability */}
            <div className="fd-card">
              <div className="fd-card-label">Available Room</div>

              {/* Availability count badge */}
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

              {/* Price preview — only shown when a room is selected */}
              {prices && (
                <div className="fd-price-box" style={{ marginTop: 16 }}>
                  {[
                    ['Room rate / night', formatPHP(selectedRoom?.discounted_price || selectedRoom?.price_per_night)],
                    [`Subtotal (${nights} night${nights !== 1 ? 's' : ''})`, formatPHP(prices.subtotal)],
                    ['Tax (12%)',        formatPHP(prices.tax)],
                    ['Service Fee (5%)', formatPHP(prices.serviceFee)],
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
                    <button key={pt.value} type="button"
                      className={`fd-btn${paymentType === pt.value ? ' fd-btn-primary' : ''}`}
                      style={{ flex: 1, padding: '11px', flexDirection: 'column', gap: 2 }}
                      onClick={() => setPaymentType(pt.value)}>
                      <span>{pt.label}</span>
                      <span style={{ fontSize: 9, opacity: 0.7, letterSpacing: 0.5, textTransform: 'none', fontWeight: 400 }}>{pt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method */}
              <div className="fd-form-group">
                <label className="fd-label">Payment Method</label>

                <p style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--white-dim)', margin: '0 0 8px' }}>
                  Collect at Desk — Confirmed Immediately
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                  {PAYMENT_METHODS.filter((m) => m.group === 'immediate').map((pm) => (
                    <button key={pm.value} type="button"
                      onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                      style={{
                        background: selectedMethod?.value === pm.value ? 'var(--gold-dim)' : 'var(--navy-mid)',
                        border: `1px solid ${selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--gold-border)'}`,
                        color: selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--white-dim)',
                        padding: '12px 8px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        fontFamily: "'Raleway', sans-serif",
                        fontSize: 11, fontWeight: 600, letterSpacing: 1,
                        transition: 'all 0.18s',
                      }}>
                      <span style={{ fontSize: 20 }}>{pm.icon}</span>
                      {pm.label}
                    </button>
                  ))}
                </div>

                <p style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--white-dim)', margin: '0 0 8px' }}>
                  Online — Guest Pays via Checkout Link
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {PAYMENT_METHODS.filter((m) => m.group === 'online').map((pm) => (
                    <button key={pm.value} type="button"
                      onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                      style={{
                        background: selectedMethod?.value === pm.value ? 'var(--blue-bg)' : 'var(--navy-mid)',
                        border: `1px solid ${selectedMethod?.value === pm.value ? 'var(--blue-border)' : 'var(--gold-border)'}`,
                        color: selectedMethod?.value === pm.value ? 'var(--blue)' : 'var(--white-dim)',
                        padding: '12px 14px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                        fontFamily: "'Raleway', sans-serif",
                        fontSize: 12, fontWeight: 600,
                        transition: 'all 0.18s',
                      }}>
                      <span style={{ fontSize: 22 }}>{pm.icon}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div>{pm.label}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginTop: 2 }}>
                          Sends checkout link to guest
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

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

              {selectedMethod?.group === 'online' && (
                <div className="fd-notice fd-notice-blue" style={{ marginBottom: 14 }}>
                  <span className="fd-notice-icon">ℹ</span>
                  <span style={{ fontSize: 12 }}>
                    A checkout link will be generated. Share it with the guest or open it on their device.
                    The booking will be confirmed automatically once payment is completed.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fd-btn" onClick={() => setStep(STEP.FORM)} style={{ flex: 1 }}>
                  ← Back
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px' }}
                  onClick={handlePayment}
                  disabled={payBusy || !selectedMethod}>
                  {payBusy ? (
                    <><span className="fd-spinner-sm" /> Processing…</>
                  ) : selectedMethod?.group === 'online' ? (
                    `Generate ${selectedMethod.label} Checkout Link`
                  ) : (
                    `✓ Confirm ${formatPHP(amountToPay)} Payment`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: SUCCESS ════ */}
        {step === STEP.SUCCESS && confirmed && (
          <div className="fd-card">
            {checkoutUrl ? (
              <div className="fd-success">
                <div className="fd-success-icon" style={{ background: 'var(--blue-bg)', borderColor: 'var(--blue-border)', color: 'var(--blue)' }}>
                  🔗
                </div>
                <h2 className="fd-success-title" style={{ color: 'var(--blue)' }}>Checkout Link Ready</h2>
                <p className="fd-success-sub">
                  Share this link with the guest to complete their{' '}
                  {selectedMethod?.label} payment of {formatPHP(amountToPay)}.
                </p>

                <div style={{
                  background: 'var(--navy-mid)', border: '1px solid var(--blue-border)',
                  padding: '14px 16px', maxWidth: 500, margin: '0 auto 20px',
                  wordBreak: 'break-all', fontSize: 12, color: 'var(--blue)',
                  textAlign: 'left',
                }}>
                  <p style={{ fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--white-dim)', margin: '0 0 6px' }}>
                    Checkout URL
                  </p>
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--blue)', textDecoration: 'underline' }}>
                    {checkoutUrl}
                  </a>
                </div>

                <div className="fd-notice fd-notice-amber" style={{ maxWidth: 460, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">⚠</span>
                  <span style={{ fontSize: 12 }}>
                    The booking is <strong>pending payment</strong>. Reference number and PIN will be
                    generated automatically once the guest completes payment online.
                  </span>
                </div>

                <dl className="fd-success-creds">
                  {[
                    ['Guest',     confirmed.full_name],
                    ['Room',      confirmed.room_number],
                    ['Check-In',  confirmed.check_in ? new Date(confirmed.check_in + 'T00:00:00').toLocaleDateString('en-PH') : '—'],
                    ['Check-Out', confirmed.check_out ? new Date(confirmed.check_out + 'T00:00:00').toLocaleDateString('en-PH') : '—'],
                  ].map(([label, value]) => (
                    <div className="fd-cred-item" key={label}>
                      <dt>{label}</dt>
                      <dd>{value || '—'}</dd>
                    </div>
                  ))}
                </dl>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="fd-btn" onClick={() => { navigator.clipboard.writeText(checkoutUrl); }}>
                    Copy Link
                  </button>
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                    className="fd-btn fd-btn-primary" style={{ textDecoration: 'none' }}>
                    Open Link →
                  </a>
                  <button className="fd-btn fd-btn-primary" onClick={reset}>+ New Walk-In</button>
                </div>
              </div>
            ) : (
              <div className="fd-success">
                <div className="fd-success-icon">✓</div>
                <h2 className="fd-success-title">Booking Confirmed</h2>
                <p className="fd-success-sub">
                  Walk-in booking for {confirmed.full_name} is confirmed and paid.
                  Share the credentials below with the guest.
                </p>

                <dl className="fd-success-creds">
                  {[
                    ['Reference Number', confirmed.reference_number],
                    ['Check-In PIN',     confirmed.checkin_pin],
                    ['Room',             `${confirmed.room_number} — ${confirmed.room_type}`],
                    ['Stay',             `${confirmed.check_in ? new Date(confirmed.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'} → ${confirmed.check_out ? new Date(confirmed.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`],
                    ['Amount Paid',      formatPHP(confirmed.amount_paid)],
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
                        Check the guest in immediately — no need to go through the PIN flow again.
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
                    <button className="fd-btn fd-btn-success" onClick={handleCheckInNow} disabled={checkInBusy}>
                      {checkInBusy ? <><span className="fd-spinner-sm" /> Checking In…</> : '✓ Check In Guest Now'}
                    </button>
                  )}
                  <button className="fd-btn fd-btn-primary" onClick={reset}>+ New Walk-In</button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}