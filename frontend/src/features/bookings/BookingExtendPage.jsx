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
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
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
  const [step,         setStep]         = useState('dates');

  /* ── step 1: request extend ─────────────────────────────────────────────── */
  const handlePreview = async () => {
    if (!newCheckOut) return;
    const result = await requestExtend(id, { new_check_out: newCheckOut });
    if (result) { setMod(result); setStep('confirm'); }
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
    navigate('/bookings/my');
  };

  /* ── guard states ────────────────────────────────────────────────────────── */
  if (bLoading) {
    return (
      <div className="ext-page">
        <Navbar />
        <div className="ext-loading">
          <span className="ext-spinner ext-spinner--lg" />
          Loading booking…
        </div>
        <Footer />
      </div>
    );
  }

  if (bError || !booking) {
    return (
      <div className="ext-page">
        <Navbar />
        <div className="ext-container" style={{ paddingTop: '2rem' }}>
          <div className="ext-notice ext-notice--error">
            <AlertCircle size={20} />
            <div>
              <strong>Error</strong>
              <p>{bError || 'Booking not found.'}</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  if (!['confirmed', 'checked_in'].includes(booking.status)) {
    return (
      <div className="ext-page">
        <Navbar />
        <div className="ext-container" style={{ paddingTop: '2rem' }}>
          <div className="ext-notice ext-notice--warn">
            <AlertCircle size={20} />
            <div>
              <strong>Cannot Extend Stay</strong>
              <p>Extend Stay is available for <em>Confirmed</em> or <em>Checked-In</em> bookings only.</p>
            </div>
          </div>
          <Link to={`/bookings/my/${id}`} className="ext-back-link">
            <ArrowLeft size={14} /> Back to Booking
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (booking.check_out <= today) {
    return (
      <div className="ext-page">
        <Navbar />
        <div className="ext-container" style={{ paddingTop: '2rem' }}>
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
        </div>
        <Footer />
      </div>
    );
  }

  const extraNights = newCheckOut ? addedNights(booking.check_out, newCheckOut) : 0;

  /* ── Done state ─────────────────────────────────────────────────────────── */
  if (step === 'done' && mod) {
    return (
      <div className="ext-page">
        <Navbar />
        <div className="ext-container">
          <div className="ext-done-card">
            <div className="ext-done-icon"><CheckCircle2 size={40} /></div>
            <h2 className="ext-done-title">Stay Extended!</h2>
            <p className="ext-done-sub">
              Your new check-out is <strong>{mod.new_check_out}</strong>. Enjoy your extended stay!
            </p>
            <Link to={`/bookings/my/${id}`} className="ext-btn ext-btn--primary">
              View Updated Booking
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /* ── Main layout ────────────────────────────────────────────────────────── */
  return (
    <div className="ext-page">
      <Navbar />

      {/* Hero */}
      <div className="ext-hero">
        <div className="ext-hero-inner">
          <div className="ext-hero-left">
            <span className="ext-hero-eyebrow">Booking Modification</span>
            <h1 className="ext-hero-title">Extend Your Stay</h1>
            <div className="ext-hero-meta">
              <span className="ext-hero-chip">Room <strong>#{booking.room_number}</strong></span>
              <span className="ext-hero-chip">{booking.room_type} Room</span>
              <span className="ext-hero-chip">Ref <strong>{booking.reference_number}</strong></span>
            </div>
          </div>
          <div className="ext-hero-right">
            <div className="ext-hero-dates-row">
              <div className="ext-hero-date-block">
                <span className="ext-hero-date-label">Current Check-out</span>
                <span className="ext-hero-date-val">{booking.check_out}</span>
              </div>
              <ArrowRight size={18} className="ext-hero-arrow" />
              <div className="ext-hero-date-block">
                <span className="ext-hero-date-label">New Check-out</span>
                <span className="ext-hero-date-val ext-hero-date-val--new">
                  {newCheckOut || '—'}
                </span>
              </div>
            </div>
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
                <span className={`ext-step-num ${step === 'dates' ? 'active' : ''}`}>1</span>
                <span className={`ext-step-label ${step === 'dates' ? 'active' : ''}`}>
                  Select New Check-out Date
                </span>
              </div>

              {step === 'dates' ? (
                <>
                  <div className="ext-field">
                    <label className="ext-label">New Check-out Date</label>
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
                      Adding <strong>&nbsp;{extraNights}&nbsp;</strong> extra night{extraNights !== 1 ? 's' : ''}
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
                      : <>Preview Extension <ArrowRight size={15} /></>}
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
                    <strong>
                      {mod.new_nights - mod.original_nights} night{(mod.new_nights - mod.original_nights) !== 1 ? 's' : ''}
                    </strong>
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
              <span className="ext-sidebar-title">Current Booking</span>
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
                <span className="ext-sidebar-title">After Extension</span>
                <div className="ext-sidebar-rows">
                  <SideRow label="Check-out"    value={mod.new_check_out} highlight />
                  <SideRow label="Total Nights" value={`${mod.new_nights}`} highlight />
                  <SideRow label="New Total"    value={`₱${fmt(mod.new_total)}`} bold highlight />
                </div>
              </div>
            )}

            <div className="ext-sidebar-card ext-policy-card">
              <span className="ext-sidebar-title">Extend Stay Policy</span>
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

      <Footer />
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