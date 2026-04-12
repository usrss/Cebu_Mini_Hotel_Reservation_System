// src/features/bookings/BookingReschedulePage.jsx
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Calendar, AlertCircle, CheckCircle2,
  Clock, CreditCard, RefreshCw, Info,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import {
  useRescheduleBooking,
  useConfirmModification,
  useConfirmRefund,
  useModificationPayment,
  useCancelModification,
} from '../hooks/useBookingModification';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import './BookingReschedulePage.css';

/* ─── helpers ──────────────────────────────────────────────────────────────── */
const fmt = (n) =>
  Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const getTodayStr = () => new Date().toISOString().split('T')[0];

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Credit / Debit Card', sub: 'Visa · Mastercard · JCB' },
  { id: 'gcash',         label: 'GCash',               sub: 'Scan QR or app redirect' },
  { id: 'bank_transfer', label: 'Bank Transfer',        sub: 'InstaPay · PESONet' },
  { id: 'paypal',        label: 'PayPal',               sub: 'Pay with PayPal account' },
];

/* ─── sub-components ───────────────────────────────────────────────────────── */
function SectionHeader({ step, label, active }) {
  return (
    <div className={`rsc-step-header ${active ? 'active' : ''}`}>
      <span className="rsc-step-num">{step}</span>
      <span className="rsc-step-label">{label}</span>
    </div>
  );
}

function BookingSnapshot({ booking, label, isNew }) {
  return (
    <div className={`rsc-snapshot ${isNew ? 'rsc-snapshot--new' : ''}`}>
      <p className="rsc-snapshot-label">{label}</p>
      <div className="rsc-snapshot-row">
        <Calendar size={13} />
        <span>{booking.check_in} → {booking.check_out}</span>
      </div>
      <div className="rsc-snapshot-row">
        <Clock size={13} />
        <span>{booking.nights} night{booking.nights !== 1 ? 's' : ''}</span>
      </div>
      <div className="rsc-snapshot-price">₱{fmt(booking.total_price)}</div>
    </div>
  );
}

function PriceDiffBadge({ mod }) {
  const diff = Number(mod.price_difference);
  if (diff > 0) return (
    <div className="rsc-diff-badge rsc-diff-extra">
      <CreditCard size={14} />
      Additional payment required: ₱{fmt(diff)}
    </div>
  );
  if (diff < 0) return (
    <div className="rsc-diff-badge rsc-diff-refund">
      <RefreshCw size={14} />
      Refund eligible: ₱{fmt(mod.net_refund_amount)}
    </div>
  );
  return (
    <div className="rsc-diff-badge rsc-diff-none">
      <CheckCircle2 size={14} />
      No price change — confirm for free
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main page
═══════════════════════════════════════════════════════════════════════════ */

export default function BookingReschedulePage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  const { booking, loading: bLoading, error: bError } = useBookingDetail(id);
  const { requestReschedule, loading: reqLoading, error: reqError } = useRescheduleBooking();
  const { confirm,         loading: confirmLoading, error: confirmError } = useConfirmModification();
  const { confirmRefund,   loading: refundLoading,  error: refundError  } = useConfirmRefund();
  const { initiatePayment, loading: payLoading,     error: payError     } = useModificationPayment();
  const { cancel } = useCancelModification();

  const [checkIn,   setCheckIn]   = useState('');
  const [checkOut,  setCheckOut]  = useState('');
  const [mod,       setMod]       = useState(null);
  const [payMethod, setPayMethod] = useState('card');
  const [step,      setStep]      = useState('dates');

  /* ── step 1: request reschedule ─────────────────────────────────────────── */
  const handlePreview = async () => {
    if (!checkIn || !checkOut) return;
    const result = await requestReschedule(id, {
      new_check_in:  checkIn,
      new_check_out: checkOut,
    });
    if (result) { setMod(result); setStep('preview'); }
  };

  const handleConfirmFree = async () => {
    const result = await confirm(mod.id);
    if (result) { setMod(result); setStep('done'); }
  };

  const handleConfirmRefund = async () => {
    const result = await confirmRefund(mod.id);
    if (result) { setMod(result); setStep('done'); }
  };

  const handlePayNow = async () => {
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
      <div className="rsc-page">
        <Navbar />
        <div className="rsc-loading">
          <span className="rsc-spinner rsc-spinner--lg" />
          Loading booking…
        </div>
        <Footer />
      </div>
    );
  }

  if (bError || !booking) {
    return (
      <div className="rsc-page">
        <Navbar />
        <div className="rsc-container" style={{ paddingTop: '2rem' }}>
          <div className="rsc-notice rsc-notice--error">
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

  if (booking.status !== 'confirmed') {
    return (
      <div className="rsc-page">
        <Navbar />
        <div className="rsc-container" style={{ paddingTop: '2rem' }}>
          <div className="rsc-notice rsc-notice--warn">
            <AlertCircle size={20} />
            <div>
              <strong>Cannot Reschedule</strong>
              <p>Rescheduling is only available for <em>Confirmed</em> bookings.</p>
            </div>
          </div>
          <Link to={`/bookings/my/${id}`} className="rsc-back-link">
            <ArrowLeft size={15} /> Back to Booking
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const today = getTodayStr();
  if (booking.check_in <= today) {
    return (
      <div className="rsc-page">
        <Navbar />
        <div className="rsc-container" style={{ paddingTop: '2rem' }}>
          <div className="rsc-notice rsc-notice--warn">
            <AlertCircle size={20} />
            <div>
              <strong>Too Late to Reschedule</strong>
              <p>Rescheduling must be done before your check-in date.</p>
            </div>
          </div>
          <Link to={`/bookings/my/${id}`} className="rsc-back-link">
            <ArrowLeft size={15} /> Back to Booking
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  /* ── Done state ─────────────────────────────────────────────────────────── */
  if (step === 'done') {
    return (
      <div className="rsc-page">
        <Navbar />
        <div className="rsc-container">
          <div className="rsc-done-card">
            <div className="rsc-done-icon"><CheckCircle2 size={40} /></div>
            <h2 className="rsc-done-title">Reschedule Confirmed</h2>
            <p className="rsc-done-sub">
              Your booking has been updated to{' '}
              <strong>{mod.new_check_in}</strong> → <strong>{mod.new_check_out}</strong>.
            </p>
            {mod.net_refund_amount > 0 && (
              <div className="rsc-refund-note">
                <RefreshCw size={14} />
                A refund of <strong>₱{fmt(mod.net_refund_amount)}</strong> has been initiated
                and will appear within 3–7 business days.
              </div>
            )}
            <Link to={`/bookings/my/${id}`} className="rsc-btn rsc-btn--primary">
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
    <div className="rsc-page">
      <Navbar />

      {/* Hero */}
      <div className="rsc-hero">
        <div className="rsc-hero-inner">
          <div className="rsc-hero-left">
            <span className="rsc-hero-eyebrow">Booking Modification</span>
            <h1 className="rsc-hero-title">Reschedule Booking</h1>
            <div className="rsc-hero-meta">
              <span className="rsc-hero-chip">Room <strong>#{booking.room_number}</strong></span>
              <span className="rsc-hero-chip">{booking.room_type} Room</span>
              <span className="rsc-hero-chip">Ref <strong>{booking.reference_number}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <div className="rsc-container">
        <div className="rsc-layout">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
          <div className="rsc-main">

            {/* STEP 1 — Date Picker */}
            <div className={`rsc-card ${step !== 'dates' ? 'rsc-card--muted' : ''}`}>
              <SectionHeader step="1" label="Select New Dates" active={step === 'dates'} />

              {step === 'dates' && (
                <>
                  <div className="rsc-date-grid">
                    <div className="rsc-date-field">
                      <label>New Check-in</label>
                      <input
                        type="date"
                        min={today}
                        value={checkIn}
                        onChange={(e) => {
                          setCheckIn(e.target.value);
                          if (checkOut && checkOut <= e.target.value) setCheckOut('');
                        }}
                        className="rsc-date-input"
                      />
                    </div>
                    <div className="rsc-date-field">
                      <label>New Check-out</label>
                      <input
                        type="date"
                        min={checkIn || today}
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="rsc-date-input"
                        disabled={!checkIn}
                      />
                    </div>
                  </div>

                  {checkIn && checkOut && (
                    <p className="rsc-nights-hint">
                      <Clock size={12} />
                      {Math.max(0, Math.ceil(
                        (new Date(checkOut) - new Date(checkIn)) / 86400000
                      ))} night(s) selected
                    </p>
                  )}

                  {reqError && (
                    <div className="rsc-error">
                      <AlertCircle size={14} /> {reqError}
                    </div>
                  )}

                  <button
                    className="rsc-btn rsc-btn--primary"
                    onClick={handlePreview}
                    disabled={!checkIn || !checkOut || reqLoading}
                  >
                    {reqLoading
                      ? <><span className="rsc-spinner" /> Checking…</>
                      : 'Preview Changes →'}
                  </button>
                </>
              )}

              {step !== 'dates' && mod && (
                <div className="rsc-dates-locked">
                  <Calendar size={13} />
                  <span>{mod.new_check_in} → {mod.new_check_out} ({mod.new_nights} nights)</span>
                  <button
                    className="rsc-change-btn"
                    onClick={() => { setMod(null); setStep('dates'); }}
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* STEP 2 — Preview */}
            {mod && step === 'preview' && (
              <div className="rsc-card">
                <SectionHeader step="2" label="Review Changes" active />

                <div className="rsc-compare">
                  <BookingSnapshot booking={booking} label="Current Booking" />
                  <div className="rsc-compare-arrow">→</div>
                  <div className="rsc-snapshot rsc-snapshot--new">
                    <p className="rsc-snapshot-label">New Booking</p>
                    <div className="rsc-snapshot-row">
                      <Calendar size={13} />
                      <span>{mod.new_check_in} → {mod.new_check_out}</span>
                    </div>
                    <div className="rsc-snapshot-row">
                      <Clock size={13} />
                      <span>{mod.new_nights} night{mod.new_nights !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="rsc-snapshot-price">₱{fmt(mod.new_total)}</div>
                  </div>
                </div>

                <PriceDiffBadge mod={mod} />

                {/* Refund breakdown */}
                {mod.requires_refund && (
                  <div className="rsc-refund-breakdown">
                    <h4 className="rsc-breakdown-title">Refund Breakdown</h4>
                    <div className="rsc-breakdown-row">
                      <span>Price difference</span>
                      <span>₱{fmt(Math.abs(Number(mod.price_difference)))}</span>
                    </div>
                    {Number(mod.processing_fee_deduction) > 0 && (
                      <div className="rsc-breakdown-row rsc-breakdown-deduct">
                        <span>Processing fee (non-refundable)</span>
                        <span>− ₱{fmt(mod.processing_fee_deduction)}</span>
                      </div>
                    )}
                    {Number(mod.penalty_deduction) > 0 && (
                      <div className="rsc-breakdown-row rsc-breakdown-deduct">
                        <span>Same-day penalty (10%)</span>
                        <span>− ₱{fmt(mod.penalty_deduction)}</span>
                      </div>
                    )}
                    <div className="rsc-breakdown-row rsc-breakdown-total">
                      <span>Net refund to you</span>
                      <span>₱{fmt(mod.net_refund_amount)}</span>
                    </div>
                    <p className="rsc-breakdown-note">
                      <Info size={12} />
                      Refunds are processed within 3–7 business days depending on your payment provider.
                    </p>
                  </div>
                )}

                {/* Additional payment — show method selector */}
                {mod.requires_additional_payment && (
                  <div className="rsc-pay-methods">
                    <h4 className="rsc-breakdown-title">Payment Method</h4>
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setPayMethod(m.id)}
                        className={`rsc-method-btn ${payMethod === m.id ? 'active' : ''}`}
                      >
                        <span className="rsc-method-label">{m.label}</span>
                        <span className="rsc-method-sub">{m.sub}</span>
                        <span className={`rsc-radio ${payMethod === m.id ? 'checked' : ''}`} />
                      </button>
                    ))}
                  </div>
                )}

                {/* CTAs */}
                <div className="rsc-cta-group">
                  {mod.no_price_change && (
                    <button
                      className="rsc-btn rsc-btn--primary"
                      onClick={handleConfirmFree}
                      disabled={confirmLoading}
                    >
                      {confirmLoading
                        ? <><span className="rsc-spinner" /> Confirming…</>
                        : <><CheckCircle2 size={16} /> Confirm Reschedule</>}
                    </button>
                  )}
                  {mod.requires_refund && (
                    <button
                      className="rsc-btn rsc-btn--primary"
                      onClick={handleConfirmRefund}
                      disabled={refundLoading}
                    >
                      {refundLoading
                        ? <><span className="rsc-spinner" /> Processing…</>
                        : <><RefreshCw size={16} /> Confirm & Initiate Refund</>}
                    </button>
                  )}
                  {mod.requires_additional_payment && (
                    <button
                      className="rsc-btn rsc-btn--primary"
                      onClick={handlePayNow}
                      disabled={payLoading}
                    >
                      {payLoading
                        ? <><span className="rsc-spinner" /> Redirecting…</>
                        : <><CreditCard size={16} /> Pay ₱{fmt(mod.price_difference)} & Confirm</>}
                    </button>
                  )}
                  <button className="rsc-btn rsc-btn--ghost" onClick={handleCancel}>
                    Cancel
                  </button>
                </div>

                {(confirmError || refundError || payError) && (
                  <div className="rsc-error">
                    <AlertCircle size={14} />
                    {confirmError || refundError || payError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
          <aside className="rsc-sidebar">
            <div className="rsc-sidebar-card">
              <span className="rsc-sidebar-title">Booking Details</span>
              <div className="rsc-sidebar-rows">
                <SideRow label="Reference"  value={booking.reference_number} />
                <SideRow label="Room"       value={`#${booking.room_number} — ${booking.room_type}`} />
                <SideRow label="Check-in"   value={booking.check_in} />
                <SideRow label="Check-out"  value={booking.check_out} />
                <SideRow label="Nights"     value={`${booking.nights}`} />
                <SideRow label="Total Paid" value={`₱${fmt(booking.total_price)}`} bold />
              </div>
            </div>

            <div className="rsc-sidebar-card rsc-policy-card">
              <span className="rsc-sidebar-title">Reschedule Policy</span>
              <ul className="rsc-policy-list">
                <li>Allowed only before check-in date.</li>
                <li>Subject to room availability for new dates.</li>
                <li>If new total is higher, you pay the difference.</li>
                <li>If new total is lower, a refund is issued minus a 3.5% processing fee.</li>
                <li>Same-day reschedules incur a 10% penalty.</li>
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
function SideRow({ label, value, bold }) {
  return (
    <div className="rsc-side-row">
      <span className="rsc-side-label">{label}</span>
      <span className={`rsc-side-value ${bold ? 'bold' : ''}`}>{value}</span>
    </div>
  );
}