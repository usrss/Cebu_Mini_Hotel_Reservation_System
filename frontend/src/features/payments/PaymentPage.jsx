import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Smartphone, Building2, Wallet,
  Calendar, Users, AlertCircle, CheckCircle2, Clock, Hash,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import { useInitiatePayment } from '../hooks/usePayments';
import './PaymentPage.css';

// ─── Payment method config ────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  {
    id:       'card',
    label:    'Credit / Debit Card',
    icon:     <CreditCard size={22} />,
    provider: 'paymongo',
    badge:    'Visa · Mastercard · JCB',
  },
  {
    id:       'gcash',
    label:    'GCash',
    icon:     <Smartphone size={22} />,
    provider: 'paymongo',
    badge:    'Scan QR or app redirect',
  },
  {
    id:       'bank_transfer',
    label:    'Bank Transfer',
    icon:     <Building2 size={22} />,
    provider: 'paymongo',
    badge:    'InstaPay · PESONet',
  },
  {
    id:       'paypal',
    label:    'PayPal',
    icon:     <Wallet size={22} />,
    provider: 'paypal',
    badge:    'Pay with PayPal account',
  },
];

const PAYMENT_TYPES = [
  {
    id:          'full_payment',
    label:       'Full Payment',
    description: 'Pay the total amount now.',
    pct:         1,
  },
  {
    id:          'deposit',
    label:       'Deposit (30%)',
    description: 'Reserve now, pay the rest on check-in.',
    pct:         0.30,
  },
];

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PaymentPage() {
  const { bookingId }    = useParams();
  const navigate         = useNavigate();
  const { booking, loading, error } = useBookingDetail(bookingId);
  const { initiate, loading: paying, error: payError } = useInitiatePayment();

  const [selectedMethod, setSelectedMethod] = useState('card');
  const [selectedType,   setSelectedType]   = useState('full_payment');

  // Determine amount preview
  const total        = booking ? Number(booking.total_price) : 0;
  const previewAmount = selectedType === 'deposit' ? total * 0.30 : total;

  if (loading) return <LoadingSkeleton />;

  if (error || !booking) {
    return (
      <div className="payment-error-container">
        <div className="error-content">
          <h2>Booking Not Found</h2>
          <p>{error || 'We could not find this booking.'}</p>
          <Link to="/bookings/my" className="btn btn-primary">
            <ArrowLeft size={18} /> My Bookings
          </Link>
        </div>
      </div>
    );
  }

  // Block payment if booking is not payable
  const isPaid      = booking.payment_status === 'paid';
  const isCancelled = booking.status === 'cancelled';

  const handlePay = async () => {
    const result = await initiate({
      booking_id:     Number(bookingId),
      payment_method: selectedMethod,
      payment_type:   selectedType,
    });

    if (!result) return;

    if (result.checkout_url) {
      // Redirect to provider (PayMongo / PayPal)
      window.location.href = result.checkout_url;
    } else {
      // Manual/cash — go to verify page directly
      navigate(`/payments/verify?payment_id=${result.payment_id}`);
    }
  };

  return (
    <div className="payment-page">
      {/* Nav */}
      <div className="payment-nav">
        <div className="nav-container">
          <Link to={`/bookings/my/${bookingId}`} className="back-link">
            <ArrowLeft size={18} /> Back to Booking
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="payment-hero">
        <div className="payment-hero-icon"><CreditCard size={36} /></div>
        <h1 className="payment-hero-title">Complete Payment</h1>
        <p className="payment-hero-subtitle">
          Booking <span className="ref-highlight">{booking.reference_number}</span>
        </p>
      </div>

      <div className="payment-container">
        <div className="payment-layout">

          {/* Left — form */}
          <div className="payment-main">

            {/* Blocked states */}
            {isPaid && (
              <div className="payment-notice payment-notice--success">
                <CheckCircle2 size={16} />
                This booking has already been paid.
              </div>
            )}
            {isCancelled && (
              <div className="payment-notice payment-notice--error">
                <AlertCircle size={16} />
                This booking has been cancelled and cannot be paid.
              </div>
            )}

            {!isPaid && !isCancelled && (
              <>
                {/* Payment Type */}
                <div className="payment-card">
                  <h3 className="payment-card-title">
                    <Wallet size={16} /> Payment Plan
                  </h3>
                  <div className="payment-type-grid">
                    {PAYMENT_TYPES.map((pt) => (
                      <button
                        key={pt.id}
                        onClick={() => setSelectedType(pt.id)}
                        className={`payment-type-btn ${selectedType === pt.id ? 'active' : ''}`}
                      >
                        <span className="type-label">{pt.label}</span>
                        <span className="type-amount">
                          ₱{formatPrice(total * pt.pct)}
                        </span>
                        <span className="type-desc">{pt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payment Method */}
                <div className="payment-card">
                  <h3 className="payment-card-title">
                    <CreditCard size={16} /> Payment Method
                  </h3>
                  <div className="payment-methods">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMethod(m.id)}
                        className={`payment-method-btn ${selectedMethod === m.id ? 'active' : ''}`}
                      >
                        <span className="method-icon">{m.icon}</span>
                        <span className="method-info">
                          <span className="method-label">{m.label}</span>
                          <span className="method-badge">{m.badge}</span>
                        </span>
                        <span className={`method-radio ${selectedMethod === m.id ? 'checked' : ''}`} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* API Error */}
                {payError && (
                  <div className="payment-api-error">
                    <AlertCircle size={15} />
                    {payError}
                  </div>
                )}

                {/* Submit */}
                <button
                  onClick={handlePay}
                  disabled={paying}
                  className="payment-submit-btn"
                >
                  {paying ? (
                    <><span className="spinner" /> Connecting to payment gateway…</>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Pay ₱{formatPrice(previewAmount)} now
                    </>
                  )}
                </button>

                <p className="payment-security-note">
                  🔒 Your payment is secured via {selectedMethod === 'paypal' ? 'PayPal' : 'PayMongo'}.
                  You will be redirected to complete checkout.
                </p>
              </>
            )}
          </div>

          {/* Right — booking summary */}
          <div className="payment-sidebar">
            <div className="payment-card summary-card">
              <h3 className="payment-card-title">
                <Hash size={16} /> Booking Summary
              </h3>

              <div className="summary-rows">
                <SummaryRow label="Reference"  value={booking.reference_number} />
                <SummaryRow label="Room"       value={`#${booking.room_number} — ${booking.room_type}`} />
                <SummaryRow label="Check-in"   value={booking.check_in} />
                <SummaryRow label="Check-out"  value={booking.check_out} />
                <SummaryRow
                  label="Duration"
                  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`}
                />
                <SummaryRow
                  label="Guests"
                  value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`}
                />
              </div>

              <div className="summary-divider" />

              <div className="summary-price-rows">
                <PriceRow label={`₱${formatPrice(booking.room_price_snapshot)} × ${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} value={`₱${formatPrice(booking.subtotal)}`} />
                <PriceRow label="Tax (12%)"        value={`₱${formatPrice(booking.tax)}`} />
                <PriceRow label="Service fee (5%)" value={`₱${formatPrice(booking.service_fee)}`} />
                <div className="summary-total-row">
                  <span>Total</span>
                  <span className="summary-total-amount">₱{formatPrice(booking.total_price)}</span>
                </div>
                {selectedType === 'deposit' && (
                  <div className="deposit-note">
                    <Clock size={13} />
                    You're paying a 30% deposit (₱{formatPrice(previewAmount)}).
                    Balance of ₱{formatPrice(total - previewAmount)} due on check-in.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="summary-row">
      <span className="summary-label">{label}</span>
      <span className="summary-value">{value ?? '—'}</span>
    </div>
  );
}

function PriceRow({ label, value }) {
  return (
    <div className="price-row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="payment-page">
      <div className="payment-nav">
        <div className="nav-container"><div className="skeleton skeleton-back" /></div>
      </div>
      <div className="payment-container">
        <div className="payment-layout">
          <div className="payment-main">
            <div className="skeleton skeleton-card-lg" />
            <div className="skeleton skeleton-card-md" />
          </div>
          <div className="skeleton skeleton-sidebar" />
        </div>
      </div>
    </div>
  );
}