/**
 * src/features/staff/frontdesk/WalkInBookingPage.jsx
 *
 * Walk-In Booking — Cash & Card (POS terminal) only.
 * No PayMongo/PayPal. No guest account required.
 *
 * Flow:
 *   Step 1 — FORM:     Guest info (name, optional contact) + dates + room selection
 *   Step 2 — PAYMENT:  Staff collects cash or card, confirms payment at desk
 *   Step 3 — SUCCESS:  Booking confirmed + guest automatically checked in
 *
 * Backend calls:
 *   POST /bookings/              → create PENDING_PAYMENT booking
 *   POST /payments/initiate/     → create manual Payment (PROCESSING)
 *   POST /payments/admin/<pk>/confirm/ → mark PAID → booking becomes CONFIRMED
 *   POST /bookings/admin/<pk>/check-in/ → CONFIRMED → CHECKED_IN
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

const PAYMENT_METHODS = [
  {
    value:   'cash',
    label:   'Cash',
    icon:    '💵',
    desc:    'Collect banknotes at the desk',
    method:  'cash',   // backend PaymentMethod value
  },
  {
    value:   'card',
    label:   'Card (POS)',
    icon:    '💳',
    desc:    'Swipe or tap via POS terminal',
    method:  'card',   // backend PaymentMethod value
  },
];

// ── Price calculator ───────────────────────────────────────────────────────────

function calcPrices(pricePerNight, nights) {
  if (!pricePerNight || !nights || nights <= 0) return null;
  const subtotal   = parseFloat(pricePerNight) * nights;
  const tax        = subtotal * 0.12;
  const serviceFee = subtotal * 0.05;
  const total      = subtotal + tax + serviceFee;
  return { subtotal, tax, serviceFee, total };
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

  // ── Step 1: Form ───────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    full_name:    '',
    phone:        '',   // optional
    email:        '',   // optional — needed for review link after checkout
    room_id:      '',
    check_in:     today,
    check_out:    tomorrow,
    guests_count: 1,
  });
  const [formErrors, setFormErrors] = useState({});
  const [formBusy,   setFormBusy]   = useState(false);
  const [booking,    setBooking]    = useState(null);

  // ── Step 2: Payment ────────────────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payBusy,        setPayBusy]        = useState(false);
  const [payError,       setPayError]       = useState(null);

  // ── Step 3: Success ────────────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState(null);  // booking after check-in

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

  // ── Step 1: Create booking ─────────────────────────────────────────────────
  async function handleCreateBooking(e) {
    e.preventDefault();

    const errors = {};
    if (!form.full_name.trim()) errors.full_name = 'Required';
    if (!form.room_id)          errors.room_id   = 'Select a room';
    if (!form.check_in)         errors.check_in  = 'Required';
    if (!form.check_out)        errors.check_out = 'Required';
    if (nights <= 0)            errors.check_out = 'Check-out must be after check-in';

    // email is optional but must be valid if provided
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address or leave blank';
    }

    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setFormBusy(true);

    // Re-validate availability
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
      // Network hiccup — let backend handle it
    }

    try {
      const created = await frontDeskBookingsApi.createWalkIn({
        room_id:      parseInt(form.room_id),
        check_in:     form.check_in,
        check_out:    form.check_out,
        guests_count: parseInt(form.guests_count),
        full_name:    form.full_name.trim(),
        // Backend requires email — use placeholder if not provided
        email:        form.email.trim().toLowerCase() || `walkin-${Date.now()}@desk.local`,
        phone:        form.phone.trim() || '',
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

  // ── Step 2: Confirm payment + auto check-in ────────────────────────────────
  async function handleConfirmPayment() {
    if (!selectedMethod) { setPayError('Select a payment method.'); return; }
    setPayBusy(true);
    setPayError(null);

    try {
      // 1. Initiate manual payment (status → PROCESSING)
      const payment = await frontDeskPaymentsApi.initiate({
        booking_id:     booking.id,
        payment_type:   'full_payment',
        payment_method: selectedMethod.method,
      });

      const paymentId = payment.payment_id ?? payment.id;

      // 2. Confirm payment at desk (PROCESSING → PAID → booking CONFIRMED)
      await frontDeskPaymentsApi.confirmManual(
        paymentId,
        `Walk-in payment collected at front desk via ${selectedMethod.label}.`,
      );

      // 3. Auto check-in immediately — guest is already at the desk
      await frontDeskBookingsApi.checkIn(booking.id, 'manual_entry');

      // 4. Fetch final booking state (CHECKED_IN + reference_number + checkin_pin)
      const updated = await frontDeskBookingsApi.detail(booking.id);
      setConfirmed(updated);
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
          'Payment confirmation failed. Please try again.',
        );
      }
    } finally {
      setPayBusy(false);
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function reset() {
    setStep(STEP.FORM);
    setBooking(null);
    setConfirmed(null);
    setPayError(null);
    setFormErrors({});
    setSelectedMethod(null);
    setAvailableRooms([]);
    setAvailFetched(false);
    setAvailError(null);
    setForm({
      full_name: '', phone: '', email: '',
      room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
    });
    fetchAvailability(today, tomorrow);
  }

  // ── Room selector ──────────────────────────────────────────────────────────
  function renderRoomSelector() {
    if (!datesAreValid(form.check_in, form.check_out, today)) {
      return (
        <div className="fd-notice fd-notice-amber">
          <span className="fd-notice-icon">📅</span>
          <span>Select valid check-in and check-out dates first.</span>
        </div>
      );
    }
    if (availLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--white-dim)', fontSize: 13 }}>
          <span className="fd-spinner-sm" /> Checking availability…
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
          <span>No rooms available for the selected dates.</span>
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
            <p>Cash & card payments · No guest account required</p>
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
                Only name is required. Contact details are optional but enable review invitation after checkout.
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
                  {formErrors.full_name && (
                    <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.full_name}</p>
                  )}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label">Phone Number <span style={{ color: 'var(--white-dim)', fontWeight: 400 }}>(optional)</span></label>
                  <input
                    className="fd-input-lg"
                    value={form.phone}
                    onChange={setField('phone')}
                    placeholder="09XX-XXX-XXXX"
                  />
                </div>
                <div className="fd-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="fd-label">
                    Email Address <span style={{ color: 'var(--white-dim)', fontWeight: 400 }}>(optional — for review invitation)</span>
                  </label>
                  <input
                    type="email"
                    className={`fd-input-lg${formErrors.email ? ' error' : ''}`}
                    value={form.email}
                    onChange={setField('email')}
                    placeholder="juan@example.com"
                  />
                  {formErrors.email && (
                    <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.email}</p>
                  )}
                  {!form.email && (
                    <p style={{ color: 'rgba(248,246,240,0.3)', fontSize: 11, marginTop: 4 }}>
                      If provided, a review link will be sent to this address after checkout.
                    </p>
                  )}
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
                  {formErrors.check_in && (
                    <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_in}</p>
                  )}
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
                  {formErrors.check_out && (
                    <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_out}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Room Selection */}
            <div className="fd-card">
              <div className="fd-card-label">Available Room</div>
              {availFetched && !availLoading && (
                <p style={{ fontSize: 12, color: 'var(--white-dim)', marginBottom: 12, marginTop: -6 }}>
                  {availableRooms.length} room{availableRooms.length !== 1 ? 's' : ''} available
                  {' for '}{form.check_in} → {form.check_out}
                </p>
              )}
              <div className="fd-form-group" style={{ marginBottom: 0 }}>
                {renderRoomSelector()}
                {formErrors.room_id && (
                  <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.room_id}</p>
                )}
              </div>

              {/* Price preview */}
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
                    <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                      Total (Full Payment)
                    </span>
                    <span className="fd-price-value gold">{formatPHP(prices.total)}</span>
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
                  <strong>{booking.full_name}</strong> · Room {booking.room_number} ·{' '}
                  {booking.nights} night{booking.nights !== 1 ? 's' : ''} ·{' '}
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

              {/* Amount */}
              <div className="fd-price-box" style={{ marginBottom: 20 }}>
                <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                    Amount to Collect
                  </span>
                  <span className="fd-price-value gold" style={{ fontSize: 24 }}>
                    {formatPHP(prices.total)}
                  </span>
                </div>
              </div>

              {/* Payment method selection */}
              <label className="fd-label" style={{ marginBottom: 12, display: 'block' }}>
                Payment Method
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {PAYMENT_METHODS.map((pm) => (
                  <button
                    key={pm.value}
                    type="button"
                    onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                    style={{
                      background:    selectedMethod?.value === pm.value ? 'var(--gold-dim)' : 'var(--navy-mid)',
                      border:        `2px solid ${selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--gold-border)'}`,
                      color:         selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--white-dim)',
                      padding:       '20px 16px',
                      cursor:        'pointer',
                      display:       'flex',
                      flexDirection: 'column',
                      alignItems:    'center',
                      gap:           8,
                      fontFamily:    "'Raleway', sans-serif",
                      transition:    'all 0.18s',
                    }}
                  >
                    <span style={{ fontSize: 32 }}>{pm.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 0.5 }}>{pm.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{pm.desc}</span>
                  </button>
                ))}
              </div>

              {/* Instruction based on method */}
              {selectedMethod?.value === 'cash' && (
                <div className="fd-notice fd-notice-amber" style={{ marginBottom: 16 }}>
                  <span className="fd-notice-icon">💵</span>
                  <span style={{ fontSize: 12 }}>
                    Collect <strong>{formatPHP(prices.total)}</strong> in cash from the guest, then click Confirm.
                  </span>
                </div>
              )}
              {selectedMethod?.value === 'card' && (
                <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                  <span className="fd-notice-icon">💳</span>
                  <span style={{ fontSize: 12 }}>
                    Process <strong>{formatPHP(prices.total)}</strong> on the POS terminal, then click Confirm once approved.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="fd-btn"
                  onClick={() => setStep(STEP.FORM)}
                  disabled={payBusy}
                  style={{ flex: 1 }}
                >
                  ← Back
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px', fontSize: 12 }}
                  onClick={handleConfirmPayment}
                  disabled={payBusy || !selectedMethod}
                >
                  {payBusy
                    ? <><span className="fd-spinner-sm" /> Processing…</>
                    : `✓ Confirm ${selectedMethod ? formatPHP(prices.total) : ''} ${selectedMethod?.label || ''} Payment`
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: SUCCESS — AUTO CHECKED IN ════ */}
        {step === STEP.SUCCESS && confirmed && (
          <div className="fd-card">
            <div className="fd-success">

              {/* Checked-in icon */}
              <div className="fd-success-icon" style={{ background: 'var(--green-bg)', borderColor: 'var(--green-border)' }}>
                ✓
              </div>
              <h2 className="fd-success-title">Guest Checked In</h2>
              <p className="fd-success-sub">
                <strong>{confirmed.full_name}</strong> is now checked into Room{' '}
                <strong>{confirmed.room_number}</strong>. Room status is <strong>Occupied</strong>.
              </p>

              {/* Credentials grid */}
              <dl className="fd-success-creds">
                {[
                  ['Reference Number', confirmed.reference_number],
                  ['Check-In PIN',     confirmed.checkin_pin],
                  ['Room',             `${confirmed.room_number}${confirmed.room_type ? ` — ${confirmed.room_type}` : ''}`],
                  ['Stay', `${confirmed.check_in
                    ? new Date(confirmed.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                    : '—'} → ${confirmed.check_out
                    ? new Date(confirmed.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}`],
                  ['Payment', `${selectedMethod?.label} — ${formatPHP(prices?.total)}`],
                  ['Status',  'Checked In ✓'],
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={['Reference Number', 'Check-In PIN'].includes(label) ? 'highlight' : ''}>
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Email confirmation */}
              {confirmed.email && !confirmed.email.includes('@desk.local') && (
                <div className="fd-notice fd-notice-blue" style={{ maxWidth: 460, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">📧</span>
                  <span style={{ fontSize: 12 }}>
                    A review invitation will be emailed to <strong>{confirmed.email}</strong> after checkout.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="fd-btn" onClick={() => window.print()}>🖨 Print Receipt</button>
                <button className="fd-btn fd-btn-primary" onClick={reset}>+ New Walk-In</button>
                <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>
                  Front Desk →
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}