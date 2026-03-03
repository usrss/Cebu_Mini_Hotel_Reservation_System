import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Smartphone, Building2, Wallet,
  AlertCircle, CheckCircle2, Clock, Hash,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import { useInitiatePayment } from '../hooks/usePayments';
import './PaymentPage.css';

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Credit / Debit Card', icon: <CreditCard size={22} />, badge: 'Visa · Mastercard · JCB' },
  { id: 'gcash',         label: 'GCash',               icon: <Smartphone size={22} />, badge: 'Scan QR or app redirect' },
  { id: 'bank_transfer', label: 'Bank Transfer',        icon: <Building2 size={22} />,  badge: 'InstaPay · PESONet' },
  { id: 'paypal',        label: 'PayPal',               icon: <Wallet size={22} />,     badge: 'Pay with PayPal account' },
];

const NEW_PAYMENT_TYPES = [
  { id: 'full_payment', label: 'Full Payment',  description: 'Pay the total amount now.',              pct: 1    },
  { id: 'deposit',      label: 'Deposit (30%)', description: 'Reserve now, pay the rest on check-in.', pct: 0.30 },
];

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentPage() {
  const { bookingId } = useParams();
  const { state }     = useLocation();
  const navigate      = useNavigate();

  const { booking, loading, error }            = useBookingDetail(bookingId);
  const { initiate, loading: paying, error: payError } = useInitiatePayment();

  const [selectedMethod, setSelectedMethod] = useState('card');
  const [selectedType,   setSelectedType]   = useState('full_payment');

  const forcedType    = state?.payment_type || null;
  const isBalanceMode = forcedType === 'balance_payment';

  useEffect(() => {
    if (forcedType) setSelectedType(forcedType);
  }, [forcedType]);

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

  const total      = Number(booking.total_price);
  const amountPaid = Number(booking.amount_paid || 0);
  const amountDue  = Number(booking.amount_due  || total);

  const paymentTypeUsed = booking.payment_type_used || 'full_payment';
  const isFullySettled  = paymentTypeUsed === 'settled';
  const isCancelled     = ['cancelled', 'expired', 'no_show'].includes(booking.status);

  const previewAmount = (() => {
    if (isBalanceMode)              return amountDue;
    if (selectedType === 'deposit') return total * 0.30;
    return total;
  })();

  const handlePay = async () => {
    const result = await initiate({
      booking_id:     Number(bookingId),
      payment_method: selectedMethod,
      payment_type:   isBalanceMode ? 'balance_payment' : selectedType,
    });
    if (!result) return;
    if (result.checkout_url) {
      window.location.href = result.checkout_url;
    } else {
      navigate(`/payments/verify?payment_id=${result.payment_id}`);
    }
  };

  return (
    <div className="payment-page">

      <div className="payment-nav">
        <div className="nav-container">
          <Link to={`/bookings/my/${bookingId}`} className="back-link">
            <ArrowLeft size={18} /> Back to Booking
          </Link>
        </div>
      </div>

      <div className="payment-hero">
        <div className="payment-hero-icon"><CreditCard size={36} /></div>
        <h1 className="payment-hero-title">
          {isBalanceMode ? 'Pay Remaining Balance' : 'Complete Payment'}
        </h1>
        <p className="payment-hero-subtitle">
          Booking{' '}
          {booking.reference_number
            ? <span className="ref-highlight">{booking.reference_number}</span>
            : <span className="ref-highlight">#{booking.id}</span>
          }
        </p>
      </div>

      <div className="payment-container">
        <div className="payment-layout">

          <div className="payment-main">

            {isFullySettled && (
              <div className="payment-notice payment-notice--success">
                <CheckCircle2 size={16} />
                This booking has been fully paid. No further payment is needed.
              </div>
            )}

            {isCancelled && (
              <div className="payment-notice payment-notice--error">
                <AlertCircle size={16} />
                This booking has been {booking.status} and cannot be paid.
              </div>
            )}

            {!isFullySettled && !isCancelled && (
              <>
                {isBalanceMode && (
                  <div className="balance-mode-banner">
                    <div className="balance-mode-row">
                      <span>Total booking</span>
                      <span>₱{formatPrice(total)}</span>
                    </div>
                    <div className="balance-mode-row">
                      <span>Deposit paid</span>
                      <span className="balance-paid">− ₱{formatPrice(amountPaid)}</span>
                    </div>
                    <div className="balance-mode-row balance-mode-row--total">
                      <span>Remaining balance</span>
                      <span className="balance-owed">₱{formatPrice(amountDue)}</span>
                    </div>
                    <p className="balance-mode-note">
                      <Clock size={13} />
                      You are paying the remaining 70% balance for this booking.
                    </p>
                  </div>
                )}

                {!isBalanceMode && (
                  <div className="payment-card">
                    <h3 className="payment-card-title">
                      <Wallet size={16} /> Payment Plan
                    </h3>
                    <div className="payment-type-grid">
                      {NEW_PAYMENT_TYPES.map((pt) => (
                        <button
                          key={pt.id}
                          onClick={() => setSelectedType(pt.id)}
                          className={`payment-type-btn ${selectedType === pt.id ? 'active' : ''}`}
                        >
                          <span className="type-label">{pt.label}</span>
                          <span className="type-amount">₱{formatPrice(total * pt.pct)}</span>
                          <span className="type-desc">{pt.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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

                {payError && (
                  <div className="payment-api-error">
                    <AlertCircle size={15} /> {payError}
                  </div>
                )}

                <button onClick={handlePay} disabled={paying} className="payment-submit-btn">
                  {paying ? (
                    <><span className="spinner" /> Connecting to payment gateway…</>
                  ) : (
                    <><CheckCircle2 size={18} /> Pay ₱{formatPrice(previewAmount)} now</>
                  )}
                </button>

                <p className="payment-security-note">
                  🔒 Your payment is secured via {selectedMethod === 'paypal' ? 'PayPal' : 'PayMongo'}.
                  You will be redirected to complete checkout.
                </p>
              </>
            )}
          </div>

          <div className="payment-sidebar">
            <div className="payment-card summary-card">
              <h3 className="payment-card-title"><Hash size={16} /> Booking Summary</h3>
              <div className="summary-rows">
                <SummaryRow label="Room"     value={`#${booking.room_number} — ${booking.room_type}`} />
                <SummaryRow label="Check-in"  value={booking.check_in} />
                <SummaryRow label="Check-out" value={booking.check_out} />
                <SummaryRow label="Duration"  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <SummaryRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
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
                {!isBalanceMode && selectedType === 'deposit' && (
                  <div className="deposit-note">
                    <Clock size={13} />
                    Paying 30% deposit (₱{formatPrice(total * 0.30)}).
                    Balance of ₱{formatPrice(total * 0.70)} due on check-in.
                  </div>
                )}
                {isBalanceMode && (
                  <div className="deposit-note deposit-note--balance">
                    <CheckCircle2 size={13} style={{ color: '#059669' }} />
                    Deposit of ₱{formatPrice(amountPaid)} already paid.
                    Paying remaining ₱{formatPrice(amountDue)}.
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
    <div className="price-row"><span>{label}</span><span>{value}</span></div>
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