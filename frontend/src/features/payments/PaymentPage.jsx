import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, Smartphone, Building2, Wallet,
  AlertCircle, CheckCircle2, Clock, Hash, Tag,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import { useInitiatePayment } from '../hooks/usePayments';
import './PaymentPage.css';

const PAYMENT_METHODS = [
  { id: 'card',          label: 'Credit / Debit Card', icon: <CreditCard size={22} />, badge: 'Visa · Mastercard · JCB' },
  { id: 'gcash',         label: 'GCash',               icon: <Smartphone size={22} />, badge: 'Scan QR or app redirect' },
  { id: 'bank_transfer', label: 'Bank Transfer',        icon: <Building2  size={22} />, badge: 'InstaPay · PESONet' },
  { id: 'paypal',        label: 'PayPal',               icon: <Wallet     size={22} />, badge: 'Pay with PayPal account' },
];

const DEPOSIT_PCT = 0.30;

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentPage() {
  const { bookingId } = useParams();
  const { state }     = useLocation();
  const navigate      = useNavigate();

  const { booking, loading, error }                     = useBookingDetail(bookingId);
  const { initiate, loading: paying, error: payError }  = useInitiatePayment();

  const [selectedMethod, setSelectedMethod] = useState('card');
  const [selectedType,   setSelectedType]   = useState('deposit'); // Default: deposit

  // If navigated with a forced type (e.g. balance_payment from MyBookings)
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

  const depositAmount  = total * DEPOSIT_PCT;
  const balanceAmount  = total - depositAmount;

  const paymentTypeUsed = booking.payment_type_used || 'full_payment';
  const isFullySettled  = paymentTypeUsed === 'settled';
  const isCancelled     = ['cancelled', 'expired', 'no_show'].includes(booking.status);
  const isConfirmed     = booking.status === 'confirmed';

  // Determine payment types to show
  // If booking is already CONFIRMED with a deposit paid → only balance mode applies
  const PAYMENT_TYPES = [
    {
      id:          'deposit',
      label:       'Deposit — 30%',
      description: 'Reserve now and pay the remaining 70% on check-in.',
      amount:      depositAmount,
      highlight:   true,
      badge:       'Recommended',
    },
    {
      id:          'full_payment',
      label:       'Full Payment — 100%',
      description: 'Pay the entire amount now. No balance due at check-in.',
      amount:      total,
      highlight:   false,
    },
  ];

  // Preview amount for the pay button
  const previewAmount = (() => {
    if (isBalanceMode)              return amountDue;
    if (selectedType === 'deposit') return depositAmount;
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

          {/* ── Main column ─────────────────────────────────────────── */}
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
                {/* ── Balance mode banner (navigated from MyBookings) ── */}
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

                {/* ── Payment Plan selector (only for initial payment) ── */}
                {!isBalanceMode && (
                  <div className="payment-card">
                    <h3 className="payment-card-title">
                      <Wallet size={16} /> Payment Plan
                    </h3>

                    <div className="payment-type-grid">
                      {PAYMENT_TYPES.map((pt) => (
                        <button
                          key={pt.id}
                          onClick={() => setSelectedType(pt.id)}
                          className={`payment-type-btn ${selectedType === pt.id ? 'active' : ''} ${pt.highlight ? 'payment-type-btn--recommended' : ''}`}
                        >
                          <div className="type-header">
                            <span className="type-label">{pt.label}</span>
                            {pt.badge && (
                              <span className="type-badge">
                                <Tag size={10} /> {pt.badge}
                              </span>
                            )}
                          </div>
                          <span className="type-amount">₱{formatPrice(pt.amount)}</span>
                          <span className="type-desc">{pt.description}</span>

                          {/* Deposit split preview */}
                          {pt.id === 'deposit' && selectedType === 'deposit' && (
                            <div className="deposit-split-preview">
                              <div className="split-row">
                                <span>Pay today</span>
                                <strong>₱{formatPrice(depositAmount)}</strong>
                              </div>
                              <div className="split-divider" />
                              <div className="split-row">
                                <span>Due on check-in</span>
                                <strong>₱{formatPrice(balanceAmount)}</strong>
                              </div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>

                    <p className="payment-plan-note">
                      <AlertCircle size={13} />
                      Deposit reserves your room. The 70% balance is collected at check-in by staff.
                      Failure to pay the balance at check-in may result in a partial refund of your deposit.
                    </p>
                  </div>
                )}

                {/* ── Payment Method ── */}
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

          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <div className="payment-sidebar">
            <div className="payment-card summary-card">
              <h3 className="payment-card-title"><Hash size={16} /> Booking Summary</h3>
              <div className="summary-rows">
                <SummaryRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                <SummaryRow label="Check-in"  value={booking.check_in} />
                <SummaryRow label="Check-out" value={booking.check_out} />
                <SummaryRow label="Duration"  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <SummaryRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
              </div>
              <div className="summary-divider" />
              <div className="summary-price-rows">
                <PriceRow
                  label={`₱${formatPrice(booking.room_price_snapshot)} × ${booking.nights} night${booking.nights !== 1 ? 's' : ''}`}
                  value={`₱${formatPrice(booking.subtotal)}`}
                />
                {/* Discount row */}
                {Number(booking.discount_amount || 0) > 0 && (
                  <PriceRow
                    label={`Discount (${booking.discount_percentage}% off)`}
                    value={`−₱${formatPrice(booking.discount_amount)}`}
                    isDiscount
                  />
                )}
                <PriceRow label="Tax (12%)"        value={`₱${formatPrice(booking.tax)}`} />
                <PriceRow label="Service fee (5%)" value={`₱${formatPrice(booking.service_fee)}`} />
                <div className="summary-total-row">
                  <span>Total</span>
                  <span className="summary-total-amount">₱{formatPrice(total)}</span>
                </div>

                {/* Deposit breakdown in sidebar */}
                {!isBalanceMode && !isFullySettled && !isCancelled && (
                  <div className="sidebar-deposit-box">
                    <div className={`sidebar-deposit-row ${selectedType === 'deposit' ? 'highlighted' : ''}`}>
                      <span>
                        {selectedType === 'deposit' ? '✓ ' : ''}
                        Pay now ({selectedType === 'deposit' ? '30%' : '100%'})
                      </span>
                      <strong>₱{formatPrice(previewAmount)}</strong>
                    </div>
                    {selectedType === 'deposit' && (
                      <div className="sidebar-deposit-row sidebar-balance-row">
                        <span>Due at check-in (70%)</span>
                        <span>₱{formatPrice(balanceAmount)}</span>
                      </div>
                    )}
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

function PriceRow({ label, value, isDiscount = false }) {
  return (
    <div className={`price-row${isDiscount ? ' price-row--discount' : ''}`}>
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