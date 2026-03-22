// src/features/bookings/BookingExtendPage.jsx
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Calendar, AlertCircle, CheckCircle2,
  Clock, CreditCard, ArrowRight, Info,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import {
  useExtendStay,
  useModificationPayment,
  useCancelModification,
} from '../hooks/useBookingModification';
import './BookingExtendPage.css';

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (n) =>
  Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Credit / Debit Card', sub: 'Visa · Mastercard · JCB' },
  { id: 'gcash',         label: 'GCash',               sub: 'Scan QR or app redirect' },
  { id: 'bank_transfer', label: 'Bank Transfer',        sub: 'InstaPay · PESONet' },
  { id: 'paypal',        label: 'PayPal',               sub: 'Pay with PayPal account' },
];

function addedNights(currentOut, newOut) {
  if (!currentOut || !newOut) return 0;
  return Math.max(0, Math.ceil(
    (new Date(newOut) - new Date(currentOut)) / 86400000
  ));
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════════════ */

export default function BookingExtendPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const { booking, loading: bLoading, error: bError } = useBookingDetail(id);
  const { requestExtend,  loading: extLoading,  error: extError  } = useExtendStay();
  const { initiatePayment, loading: payLoading, error: payError  } = useModificationPayment();
  const { cancel } = useCancelModification();

  const [newCheckOut,  setNewCheckOut]  = useState('');
  const [mod,          setMod]          = useState(null);
  const [payMethod,    setPayMethod]    = useState('card');
  const [step,         setStep]         = useState('dates'); // dates | confirm | done

  /* ── step 1: request extend ─────────────────────────────────────────────── */
  const handlePreview = async () => {
    if (!newCheckOut) return;
    const result = await requestExtend(id, { new_check_out: newCheckOut });
    if (result) {
      setMod(result);
      setStep('confirm');
    }
  };

  /* ── step 2: pay ────────────────────────────────────────────────────────── */
  const handlePay = async () => {
    const result = await initiatePayment(mod.id, { payment_method: payMethod });
    if (result?.checkout_url) {
      window.location.href = result.checkout_url;
    } else if (result?.payment_id) {
      navigate(`/payments/success?payment_id=${result.payment_id}&mod_id=${mod.id}`);
    }
  };

  const handleCancel = async () => {
    if (mod) await cancel(mod.id);
    navigate(`/bookings/my/${id}`);
  };

  /* ── guard states ────────────────────────────────────────────────────────── */
  if (bLoading) return <PageShell><LoadingCard /></PageShell>;
  if (bError || !booking) return (
    <PageShell>
      <div className="ext-notice ext-notice--error">
        <AlertCircle size={20} />
        <div>
          <strong>Error</strong>
          <p>{bError || 'Booking not found.'}</p>
        </div>
      </div>
    </PageShell>
  );

  const today = new Date().toISOString().split('T')[0];

  if (!['confirmed', 'checked_in'].includes(booking.status)) return (
    <PageShell>
      <div className="ext-notice ext-notice--warn">
        <AlertCircle size={20} />
        <div>
          <strong>Cannot Extend Stay</strong>
          <p>
            Extend Stay is available for <em>Confirmed</em> or <em>Checked-In</em> bookings only.
          </p>
        </div>
      </div>
      <Link to={`/bookings/my/${id}`} className="ext-back-link">
        <ArrowLeft size={14} /> Back to Booking
      </Link>
    </PageShell>
  );

  if (booking.check_out <= today) return (
    <PageShell>
      <div className="ext-notice ext-notice--warn">
        <AlertCircle size={20} />
        <div>
          <strong>Stay Has Ended</strong>
          <p>You cannot extend a booking that has already checked out.</p>
        </div>
      </div>
      <Link to={`/bookings/my/${id}`} className="ext-back-link">
        <ArrowLeft size={14} /> Back to Booking
      </Link>
    </PageShell>
  );

  const extraNights = newCheckOut ? addedNights(booking.check_out, newCheckOut) : 0;
  const previewCost = mod ? Number(mod.price_difference) : 0;

  /* ─────────────────────────────────────────────────────────────────────────
     DONE (webhook fires → redirect here after payment success)
     We show this only when navigated with state.extended=true.
  ───────────────────────────────────────────────────────────────────────── */
  if (step === 'done' && mod) return (
    <PageShell>
      <div className="ext-done-card">
        <div className="ext-done-icon"><CheckCircle2 size={44} /></div>
        <h2 className="ext-done-title">Stay Extended!</h2>
        <p className="ext-done-sub">
          Your new check-out is <strong>{mod.new_check_out}</strong>.
          {' '}Enjoy your extended stay!
        </p>
        <Link to={`/bookings/my/${id}`} className="ext-btn ext-btn--primary">
          View Updated Booking
        </Link>
      </div>
    </PageShell>
  );

  /* ─────────────────────────────────────────────────────────────────────────
     MAIN LAYOUT
  ───────────────────────────────────────────────────────────────────────── */
  return (
    <div className="ext-page">

      {/* Nav */}
      <div className="ext-nav">
        <div className="ext-nav-inner">
          <Link to={`/bookings/my/${id}`} className="ext-back">
            <ArrowLeft size={17} /> Back to Booking
          </Link>
          <h1 className="ext-nav-title">Extend Your Stay</h1>
          <div />
        </div>
      </div>

      {/* Hero strip */}
      <div className="ext-hero">
        <div className="ext-hero-row">
          <div className="ext-hero-block">
            <span className="ext-hero-eyebrow">Room</span>
            <span className="ext-hero-value">#{booking.room_number}</span>
          </div>
          <ArrowRight size={20} className="ext-hero-arrow" />
          <div className="ext-hero-block">
            <span className="ext-hero-eyebrow">Current Check-out</span>
            <span className="ext-hero-value">{booking.check_out}</span>
          </div>
          <ArrowRight size={20} className="ext-hero-arrow" />
          <div className="ext-hero-block ext-hero-block--accent">
            <span className="ext-hero-eyebrow">New Check-out</span>
            <span className="ext-hero-value">{newCheckOut || '—'}</span>
          </div>
        </div>
      </div>

      <div className="ext-container">
        <div className="ext-layout">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div className="ext-main">

            {/* STEP 1 — Pick new checkout */}
            <div className={`ext-card ${step !== 'dates' ? 'ext-card--muted' : ''}`}>
              <div className="ext-step-header">
                <span className="ext-step-num">1</span>
                <span className="ext-step-label">Select New Check-out Date</span>
              </div>

              {step === 'dates' ? (
                <>
                  <div className="ext-field">
                    <label className="ext-label">New Check-out</label>
                    <input
                      type="date"
                      min={booking.check_out}
                      value={newCheckOut}
                      onChange={(e) => setNewCheckOut(e.target.value)}
                      className="ext-date-input"
                    />
                    <p className="ext-field-hint">
                      Must be after your current check-out ({booking.check_out}).
                      Only available dates will be accepted.
                    </p>
                  </div>

                  {extraNights > 0 && (
                    <div className="ext-nights-preview">
                      <Clock size={14} />
                      Adding <strong>{extraNights}</strong> extra night{extraNights !== 1 ? 's' : ''}
                    </div>
                  )}

                  {extError && (
                    <div className="ext-error">
                      <AlertCircle size={14} /> {extError}
                    </div>
                  )}

                  <button
                    className="ext-btn ext-btn--primary"
                    onClick={handlePreview}
                    disabled={!newCheckOut || extLoading}
                  >
                    {extLoading
                      ? <><span className="ext-spinner" /> Checking availability…</>
                      : 'Preview Extension →'}
                  </button>
                </>
              ) : (
                <div className="ext-dates-locked">
                  <Calendar size={13} />
                  New check-out: <strong>{newCheckOut}</strong>
                  &nbsp;(+{mod?.new_nights - booking.nights} nights)
                  <button
                    className="ext-change-btn"
                    onClick={() => { setMod(null); setStep('dates'); }}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* STEP 2 — Cost summary + payment method */}
            {mod && step === 'confirm' && (
              <div className="ext-card">
                <div className="ext-step-header">
                  <span className="ext-step-num active">2</span>
                  <span className="ext-step-label active">Review & Pay</span>
                </div>

                {/* Cost card */}
                <div className="ext-cost-card">
                  <div className="ext-cost-row">
                    <span>Additional nights</span>
                    <strong>{mod.new_nights - mod.original_nights} night{(mod.new_nights - mod.original_nights) !== 1 ? 's' : ''}</strong>
                  </div>
                  <div className="ext-cost-row">
                    <span>New check-out</span>
                    <strong>{mod.new_check_out}</strong>
                  </div>
                  <div className="ext-cost-divider" />
                  <div className="ext-cost-row">
                    <span>Original total</span>
                    <span>₱{fmt(mod.original_total)}</span>
                  </div>
                  <div className="ext-cost-row">
                    <span>New total</span>
                    <span>₱{fmt(mod.new_total)}</span>
                  </div>
                  <div className="ext-cost-row ext-cost-row--total">
                    <span>Additional payment</span>
                    <strong className="ext-cost-amount">₱{fmt(mod.price_difference)}</strong>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="ext-breakdown">
                  <div className="ext-breakdown-row">
                    <span>Additional subtotal</span>
                    <span>₱{fmt(Number(mod.new_subtotal) - Number(mod.original_total) / (1 + 0.12 + 0.05))}</span>
                  </div>
                  <div className="ext-breakdown-row">
                    <span>Tax (12%)</span>
                    <span>₱{fmt(Number(mod.new_tax))}</span>
                  </div>
                  <div className="ext-breakdown-row">
                    <span>Service fee (5%)</span>
                    <span>₱{fmt(Number(mod.new_service_fee))}</span>
                  </div>
                </div>

                <div className="ext-info-note">
                  <Info size={13} />
                  Your booking will only be updated <em>after</em> successful payment.
                </div>

                {/* Payment methods */}
                <h4 className="ext-section-label">Select Payment Method</h4>
                <div className="ext-methods">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className={`ext-method-btn ${payMethod === m.id ? 'active' : ''}`}
                    >
                      <span className="ext-method-label">{m.label}</span>
                      <span className="ext-method-sub">{m.sub}</span>
                      <span className={`ext-radio ${payMethod === m.id ? 'checked' : ''}`} />
                    </button>
                  ))}
                </div>

                {payError && (
                  <div className="ext-error">
                    <AlertCircle size={14} /> {payError}
                  </div>
                )}

                <div className="ext-cta-group">
                  <button
                    className="ext-btn ext-btn--primary"
                    onClick={handlePay}
                    disabled={payLoading}
                  >
                    {payLoading
                      ? <><span className="ext-spinner" /> Redirecting to payment…</>
                      : <><CreditCard size={16} /> Pay ₱{fmt(mod.price_difference)} & Extend Stay</>}
                  </button>
                  <button className="ext-btn ext-btn--ghost" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>

                <p className="ext-security-note">
                  🔒 Secured via {payMethod === 'paypal' ? 'PayPal' : 'PayMongo'}.
                  Your booking is updated only after payment is confirmed.
                </p>
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <aside className="ext-sidebar">
            <div className="ext-sidebar-card">
              <h3 className="ext-sidebar-title">Current Booking</h3>
              <div className="ext-sidebar-rows">
                <SideRow label="Room"      value={`#${booking.room_number}`} />
                <SideRow label="Check-in"  value={booking.check_in} />
                <SideRow label="Check-out" value={booking.check_out} />
                <SideRow label="Nights"    value={`${booking.nights}`} />
                <SideRow label="Total"     value={`₱${fmt(booking.total_price)}`} bold />
              </div>
            </div>

            {mod && (
              <div className="ext-sidebar-card ext-sidebar-card--new">
                <h3 className="ext-sidebar-title">After Extension</h3>
                <div className="ext-sidebar-rows">
                  <SideRow label="Check-out"    value={mod.new_check_out} highlight />
                  <SideRow label="Total Nights" value={`${mod.new_nights}`} highlight />
                  <SideRow label="New Total"    value={`₱${fmt(mod.new_total)}`} bold highlight />
                </div>
              </div>
            )}

            <div className="ext-sidebar-card ext-policy-card">
              <h3 className="ext-sidebar-title">Extend Stay Policy</h3>
              <ul className="ext-policy-list">
                <li>Extension is subject to room availability.</li>
                <li>Only dates after current check-out can be selected.</li>
                <li>Full additional cost must be paid upfront.</li>
                <li>Booking is updated only after payment is confirmed.</li>
                <li>Extended stays follow the same cancellation policy.</li>
              </ul>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function SideRow({ label, value, bold, highlight }) {
  return (
    <div className="ext-side-row">
      <span className="ext-side-label">{label}</span>
      <span className={`ext-side-value ${bold ? 'bold' : ''} ${highlight ? 'highlight' : ''}`}>
        {value}
      </span>
    </div>
  );
}
function PageShell({ children }) {
  return (
    <div className="ext-page">
      <div className="ext-container" style={{ paddingTop: '2rem' }}>{children}</div>
    </div>
  );
}
function LoadingCard() {
  return (
    <div className="ext-loading">
      <span className="ext-spinner ext-spinner--lg" />
      <p>Loading booking…</p>
    </div>
  );
}