/**
 * src/features/staff/frontdesk/WalkInBookingPage.jsx
 *
 * Front Desk creates a walk-in booking and collects payment.
 *
 * Payment flow by method:
 *   Cash / GCash / Card / Bank Transfer
 *     → provider=manual → POST /payments/admin/<pk>/confirm/ → CONFIRMED immediately
 *
 *   PayMongo
 *     → provider=paymongo → returns checkout_url → show link to guest
 *
 *   PayPal
 *     → provider=paypal  → returns checkout_url → show link to guest
 *
 * Email validation: any email allowed — walk-ins don't need an existing account.
 *
 * Steps:
 *   1 — Guest info + room + dates (POST /bookings/)
 *   2 — Select payment type + method (POST /payments/initiate/)
 *   3 — Success: show credentials OR show checkout link
 */

import { useState, useEffect } from 'react';
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
  { value: 'full_payment', label: 'Full Payment',   desc: '100% of total' },
  { value: 'deposit',      label: 'Deposit (30%)',  desc: '30% now, rest at check-in' },
];

// Methods that are confirmed immediately at the desk (manual provider)
const MANUAL_METHODS = ['cash', 'gcash', 'card', 'bank_transfer'];

const PAYMENT_METHODS = [
  // Immediate (manual)
  { value: 'cash',           label: 'Cash',           icon: '💵', provider: 'manual',   group: 'immediate' },
  { value: 'gcash',          label: 'GCash',          icon: '📱', provider: 'manual',   group: 'immediate' },
  { value: 'card',           label: 'Card',           icon: '💳', provider: 'manual',   group: 'immediate' },
  { value: 'bank_transfer',  label: 'Bank Transfer',  icon: '🏦', provider: 'manual',   group: 'immediate' },
  // Online (returns checkout link)
  { value: 'paymongo',       label: 'PayMongo',       icon: '🔗', provider: 'paymongo', group: 'online'    },
  { value: 'paypal',         label: 'PayPal',         icon: '🅿',  provider: 'paypal',  group: 'online'    },
];

// For online methods, payment_method field the backend expects
const ONLINE_METHOD_MAP = {
  paymongo: 'card',   // PayMongo checkout supports card/gcash — use 'card' as default
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function WalkInBookingPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const [step,    setStep]    = useState(STEP.FORM);
  const [rooms,   setRooms]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Step 1 — form
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '',
    room_id: '', check_in: today, check_out: tomorrow, guests_count: 1,
  });
  const [formErrors, setFormErrors] = useState({});
  const [formBusy,   setFormBusy]   = useState(false);

  // Step 1 result
  const [booking, setBooking] = useState(null);

  // Step 2 — payment
  const [paymentType,   setPaymentType]   = useState('full_payment');
  const [selectedMethod, setSelectedMethod] = useState(null); // full PAYMENT_METHODS entry
  const [payBusy,       setPayBusy]       = useState(false);
  const [payError,      setPayError]      = useState(null);

  // Step 3 — result
  const [confirmed,       setConfirmed]       = useState(null);   // booking after confirm
  const [checkoutUrl,     setCheckoutUrl]     = useState(null);   // for online payments
  const [checkInBusy,     setCheckInBusy]     = useState(false);
  const [checkedIn,       setCheckedIn]       = useState(false);

  // Load available rooms on mount
  useEffect(() => {
    frontDeskRoomsApi.list({ status: 'available' })
      .then((d) => setRooms(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedRoom = rooms.find((r) => String(r.id) === String(form.room_id));
  const nights       = nightsBetween(form.check_in, form.check_out);
  const prices       = selectedRoom
    ? calcPrices(selectedRoom.discounted_price || selectedRoom.price_per_night, nights)
    : null;
  const amountToPay  = prices
    ? parseFloat((paymentType === 'deposit' ? prices.deposit : prices.total).toFixed(2))
    : 0;

  const setField = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setFormErrors((fe) => ({ ...fe, [field]: null }));
  };

  // ── Step 1: Create booking ─────────────────────────────────────────────────
  async function handleCreateBooking(e) {
    e.preventDefault();
    const errors = {};
    if (!form.full_name.trim()) errors.full_name    = 'Required';
    if (!form.email.trim())     errors.email        = 'Required';
    if (!form.phone.trim())     errors.phone        = 'Required';
    if (!form.room_id)          errors.room_id      = 'Select a room';
    if (!form.check_in)         errors.check_in     = 'Required';
    if (!form.check_out)        errors.check_out    = 'Required';
    if (nights <= 0)            errors.check_out    = 'Check-out must be after check-in';
    if (Object.keys(errors).length) { setFormErrors(errors); return; }

    setFormBusy(true);
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

    // payment_method field — for online providers use their mapped value
    const paymentMethod = isManual
      ? selectedMethod.value           // cash | gcash | card | bank_transfer
      : ONLINE_METHOD_MAP[provider];   // card (paymongo) | paypal

    try {
      // 1. Initiate payment
      const payment = await frontDeskPaymentsApi.initiate({
        booking_id:     booking.id,
        payment_type:   paymentType,
        payment_method: paymentMethod,
        provider:       provider,
        amount:         amountToPay,
      });

      if (isManual) {
        // 2a. Manual — confirm immediately at desk
        const paymentId = payment.payment_id ?? payment.id;
        await frontDeskPaymentsApi.confirmManual(
          paymentId,
          `Walk-in payment at front desk via ${selectedMethod.label}.`,
        );
        // 3. Fetch confirmed booking (now has reference_number + checkin_pin)
        const updated = await frontDeskBookingsApi.detail(booking.id);
        setConfirmed(updated);
        setCheckoutUrl(null);
      } else {
        // 2b. Online — return checkout URL for guest to complete payment
        setCheckoutUrl(payment.checkout_url);
        // Booking is still PENDING_PAYMENT — will be confirmed by webhook
        const updated = await frontDeskBookingsApi.detail(booking.id);
        setConfirmed(updated);
      }

      setStep(STEP.SUCCESS);
    } catch (err) {
      // Show all field errors from the backend
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' · ');
        setPayError(msgs);
      } else {
        setPayError(
          err.response?.data?.error ||
          err.response?.data?.detail ||
          err.message ||
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
    setForm({ full_name: '', email: '', phone: '', room_id: '', check_in: today, check_out: tomorrow, guests_count: 1 });
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
                  <input className={`fd-input-lg${formErrors.full_name ? ' error' : ''}`}
                    value={form.full_name} onChange={setField('full_name')}
                    placeholder="Juan dela Cruz" autoFocus />
                  {formErrors.full_name && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.full_name}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Email Address</label>
                  <input type="email" className={`fd-input-lg${formErrors.email ? ' error' : ''}`}
                    value={form.email} onChange={setField('email')}
                    placeholder="juan@example.com" />
                  {formErrors.email && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.email}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Phone Number</label>
                  <input className={`fd-input-lg${formErrors.phone ? ' error' : ''}`}
                    value={form.phone} onChange={setField('phone')}
                    placeholder="09XX-XXX-XXXX" />
                  {formErrors.phone && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.phone}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label">Number of Guests</label>
                  <input type="number" min={1} max={selectedRoom?.capacity || 10}
                    className="fd-input-lg" value={form.guests_count}
                    onChange={setField('guests_count')} />
                </div>
              </div>
            </div>

            {/* Room + dates */}
            <div className="fd-card">
              <div className="fd-card-label">Room &amp; Stay Dates</div>
              <div className="fd-form-grid">
                <div className="fd-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label className="fd-label fd-label-req">Room</label>
                  {loading ? (
                    <p style={{ color: 'var(--white-dim)', fontSize: 13 }}>Loading available rooms…</p>
                  ) : rooms.length === 0 ? (
                    <div className="fd-notice fd-notice-amber">
                      <span className="fd-notice-icon">⚠</span>
                      <span>No available rooms at the moment.</span>
                    </div>
                  ) : (
                    <select className={`fd-select-lg${formErrors.room_id ? ' error' : ''}`}
                      value={form.room_id} onChange={setField('room_id')}>
                      <option value="">Select available room…</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Room {r.room_number} — {ROOM_TYPE_LABELS[r.room_type] || r.room_type} · {r.bed_type} bed · {r.capacity} guests · {formatPHP(r.discounted_price || r.price_per_night)}/night
                        </option>
                      ))}
                    </select>
                  )}
                  {formErrors.room_id && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.room_id}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-In Date</label>
                  <input type="date" className={`fd-input-lg${formErrors.check_in ? ' error' : ''}`}
                    value={form.check_in} min={today} onChange={setField('check_in')} />
                  {formErrors.check_in && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_in}</p>}
                </div>
                <div className="fd-form-group">
                  <label className="fd-label fd-label-req">Check-Out Date</label>
                  <input type="date" className={`fd-input-lg${formErrors.check_out ? ' error' : ''}`}
                    value={form.check_out} min={form.check_in || today} onChange={setField('check_out')} />
                  {formErrors.check_out && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{formErrors.check_out}</p>}
                </div>
              </div>

              {/* Price preview */}
              {prices && (
                <div className="fd-price-box">
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

            <button type="submit" className="fd-btn fd-btn-primary fd-btn-full" disabled={formBusy || !form.room_id}>
              {formBusy ? <><span className="fd-spinner-sm" /> Creating Booking…</> : 'Continue to Payment →'}
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

              {/* Payment method — grouped */}
              <div className="fd-form-group">
                <label className="fd-label">Payment Method</label>

                {/* Immediate methods */}
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

                {/* Online methods */}
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

              {/* Online payment notice */}
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

            {/* Online payment — show checkout link */}
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

                {/* Checkout link box */}
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

                {/* Booking details */}
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
                  <button className="fd-btn"
                    onClick={() => { navigator.clipboard.writeText(checkoutUrl); }}>
                    📋 Copy Link
                  </button>
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                    className="fd-btn fd-btn-primary" style={{ textDecoration: 'none' }}>
                    Open Link →
                  </a>
                  <button className="fd-btn fd-btn-primary" onClick={reset}>
                    + New Walk-In
                  </button>
                </div>
              </div>
            ) : (
              /* Manual payment — confirmed immediately */
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

                {/* Check in now */}
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