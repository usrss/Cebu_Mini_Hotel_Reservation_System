import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, AlertCircle, CheckCircle2, Clock, Hash, Tag,
} from 'lucide-react';
import { useBookingDetail } from '../hooks/useBookings';
import { useInitiatePayment } from '../hooks/usePayments';
import Navbar from '../../components/UIComponents/Navbar';
import Footer from '../../components/UIComponents/Footer';
import './PaymentPage.css';

// ─── Real SVG payment method logos ──────────────────────────
function VisaLogo() {
  return (
    <svg viewBox="0 0 50 32" fill="none" style={{ width: 48, height: 30 }}>
      <rect width="50" height="32" rx="3" fill="#1A1F71"/>
      <path d="M20 22L22.5 10H26L23.5 22H20Z" fill="white"/>
      <path d="M33 10.3C32.2 10 31 9.7 29.6 9.7C26.5 9.7 24.3 11.3 24.3 13.6C24.3 15.3 25.8 16.2 27 16.8C28.2 17.4 28.6 17.8 28.6 18.4C28.6 19.2 27.6 19.6 26.7 19.6C25.5 19.6 24.8 19.4 23.8 19L23.4 18.8L23 21.4C23.9 21.8 25.5 22.1 27.1 22.1C30.4 22.1 32.5 20.5 32.5 18.1C32.5 16.7 31.6 15.7 29.8 14.9C28.7 14.3 28 13.9 28 13.3C28 12.7 28.6 12.1 29.9 12.1C30.9 12.1 31.7 12.3 32.3 12.6L32.6 12.7L33 10.3Z" fill="white"/>
      <path d="M37.5 10H35.2C34.5 10 34 10.2 33.7 10.9L29.2 22H32.5L33.2 20H37.2L37.6 22H40.6L37.5 10ZM34.1 17.6C34.3 17 35.3 14.4 35.3 14.4C35.3 14.4 35.6 13.6 35.8 13.1L36 14.3C36 14.3 36.7 17.1 36.8 17.6H34.1Z" fill="white"/>
      <path d="M17.5 10L14.4 18.2L14.1 16.7C13.5 14.8 11.8 12.7 9.8 11.6L12.7 22H16L21.5 10H17.5Z" fill="white"/>
      <path d="M11.5 10H6.5L6.4 10.3C10.3 11.3 12.9 13.7 14 16.7L12.9 11C12.7 10.3 12.2 10 11.5 10Z" fill="#F9A51A"/>
    </svg>
  );
}

function MastercardLogo() {
  return (
    <svg viewBox="0 0 50 32" fill="none" style={{ width: 48, height: 30 }}>
      <rect width="50" height="32" rx="3" fill="#252525"/>
      <circle cx="19" cy="16" r="8" fill="#EB001B"/>
      <circle cx="31" cy="16" r="8" fill="#F79E1B"/>
      <path d="M25 10.3A8 8 0 0 1 28 16a8 8 0 0 1-3 5.7A8 8 0 0 1 22 16a8 8 0 0 1 3-5.7Z" fill="#FF5F00"/>
    </svg>
  );
}

function GCashLogo() {
  return (
    <svg viewBox="0 0 50 32" fill="none" style={{ width: 48, height: 30 }}>
      <rect width="50" height="32" rx="3" fill="#007DFF"/>
      <text x="25" y="20" textAnchor="middle" fill="white" fontSize="9" fontWeight="900" fontFamily="Arial">GCash</text>
    </svg>
  );
}

function BankTransferLogo() {
  return (
    <svg viewBox="0 0 50 32" fill="none" style={{ width: 48, height: 30 }}>
      <rect width="50" height="32" rx="3" fill="#F0EDE6"/>
      <path d="M10 22V15M18 22V15M26 22V15M34 22V15M42 22V15" stroke="#01000D" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 15L25 8L42 15H8Z" fill="#01000D"/>
      <path d="M8 22H42" stroke="#01000D" strokeWidth="2" strokeLinecap="round"/>
      <path d="M6 24H44" stroke="#01000D" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function PayPalLogo() {
  return (
    <svg viewBox="0 0 50 32" fill="none" style={{ width: 48, height: 30 }}>
      <rect width="50" height="32" rx="3" fill="#003087"/>
      <path d="M20 12C20 12 21.5 10 24 10H29C31.5 10 32 12 31.5 14C31 16 29 17 27 17H25L24 22H21L23 12H20Z" fill="white"/>
      <path d="M22 15C22 15 23.5 13 26 13H31C33.5 13 34 15 33.5 17C33 19 31 20 29 20H27L26 25H23L25 15H22Z" fill="#009CDE"/>
    </svg>
  );
}

// ─── Payment methods with logo components ────────────────────
const PAYMENT_METHODS = [
  {
    id:     'card',
    label:  'Credit / Debit Card',
    badge:  'Visa · Mastercard · JCB',
    LogoComponent: () => (
      <div style={{ display: 'flex', gap: 3 }}>
        <VisaLogo />
        <MastercardLogo />
      </div>
    ),
  },
  {
    id:     'gcash',
    label:  'GCash',
    badge:  'Scan QR or app redirect',
    LogoComponent: GCashLogo,
  },
  {
    id:     'bank_transfer',
    label:  'Bank Transfer',
    badge:  'InstaPay · PESONet',
    LogoComponent: BankTransferLogo,
  },
  {
    id:     'paypal',
    label:  'PayPal',
    badge:  'Pay with PayPal account',
    LogoComponent: PayPalLogo,
  },
];

const DEPOSIT_PCT = 0.30;

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentPage() {
  const { bookingId } = useParams();
  const { state }     = useLocation();
  const navigate      = useNavigate();

  const { booking, loading, error }                    = useBookingDetail(bookingId);
  const { initiate, loading: paying, error: payError } = useInitiatePayment();

  const [selectedMethod, setSelectedMethod] = useState('card');
  const [selectedType,   setSelectedType]   = useState('deposit');

  const forcedType    = state?.payment_type || null;
  const isBalanceMode = forcedType === 'balance_payment';

  useEffect(() => {
    if (forcedType) setSelectedType(forcedType);
  }, [forcedType]);

  if (loading) return <LoadingSkeleton />;

  if (error || !booking) {
    return (
      <div className="payment-page">
        <Navbar />
        <div className="payment-error-container">
          <div className="error-content">
            <h2 style={{ fontFamily: 'Playfair Display, serif', marginBottom: 8 }}>Booking Not Found</h2>
            <p style={{ color: '#909090', marginBottom: 24 }}>{error || 'We could not find this booking.'}</p>
            <Link to="/bookings/my" className="back-link">
              <ArrowLeft size={16} /> My Bookings
            </Link>
          </div>
        </div>
        <Footer />
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

  const PAYMENT_TYPES = [
    {
      id:          'deposit',
      label:       'Deposit — 30%',
      description: 'Reserve now and pay the remaining 70% on check-in.',
      amount:      depositAmount,
      badge:       'Recommended',
    },
    {
      id:          'full_payment',
      label:       'Full Payment — 100%',
      description: 'Pay the entire amount now. No balance due at check-in.',
      amount:      total,
    },
  ];

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
      <Navbar />

      {/* Hero */}
      <div className="payment-hero">
        <div className="payment-hero-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2"/>
            <line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
        </div>
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

          {/* ── Main ──────────────────────────────────────── */}
          <div className="payment-main">
            {/* Back link */}
            <div style={{ marginBottom: 20 }}>
              <Link to={`/bookings/my/${bookingId}`} className="back-link">
                <ArrowLeft size={15} /> Back to Booking
              </Link>
            </div>

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
                {/* Balance mode banner */}
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

                {/* Payment plan */}
                {!isBalanceMode && (
                  <div className="payment-card">
                    <h3 className="payment-card-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                      Payment Plan
                    </h3>
                    <div className="payment-type-grid">
                      {PAYMENT_TYPES.map((pt) => (
                        <button
                          key={pt.id}
                          onClick={() => setSelectedType(pt.id)}
                          className={`payment-type-btn ${selectedType === pt.id ? 'active' : ''}`}
                        >
                          <div className="type-header">
                            <span className="type-label">{pt.label}</span>
                            {pt.badge && (
                              <span className="type-badge">
                                <Tag size={9} /> {pt.badge}
                              </span>
                            )}
                          </div>
                          <span className="type-amount">₱{formatPrice(pt.amount)}</span>
                          <span className="type-desc">{pt.description}</span>

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
                    </p>
                  </div>
                )}

                {/* Payment method */}
                <div className="payment-card">
                  <h3 className="payment-card-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                    Payment Method
                  </h3>
                  <div className="payment-methods">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMethod(m.id)}
                        className={`payment-method-btn ${selectedMethod === m.id ? 'active' : ''}`}
                      >
                        <div className="method-icon">
                          <m.LogoComponent />
                        </div>
                        <div className="method-info">
                          <span className="method-label">{m.label}</span>
                          <span className="method-badge">{m.badge}</span>
                        </div>
                        <div className={`method-radio ${selectedMethod === m.id ? 'checked' : ''}`} />
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
                   Secured via {selectedMethod === 'paypal' ? 'PayPal' : 'PayMongo'}.
                  You will be redirected to complete checkout.
                </p>
              </>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────── */}
          <div className="payment-sidebar">
            <div className="payment-card summary-card">
              <h3 className="payment-card-title">
                <Hash size={14} /> Booking Summary
              </h3>
              <div className="summary-rows">
                <SummaryRow label="Room"      value={`#${booking.room_number} — ${booking.room_type}`} />
                <SummaryRow label="Check-in"  value={booking.check_in} />
                <SummaryRow label="Check-out" value={booking.check_out} />
                <SummaryRow label="Duration"  value={`${booking.nights} night${booking.nights !== 1 ? 's' : ''}`} />
                <SummaryRow label="Guests"    value={`${booking.guests_count} guest${booking.guests_count !== 1 ? 's' : ''}`} />
              </div>
              <div className="summary-divider" />
              <div className="price-row">
                <span>₱{formatPrice(booking.room_price_snapshot)} × {booking.nights} night{booking.nights !== 1 ? 's' : ''}</span>
                <span>₱{formatPrice(booking.subtotal)}</span>
              </div>
              {Number(booking.discount_amount || 0) > 0 && (
                <div className="price-row price-row--discount">
                  <span>Discount ({booking.discount_percentage}% off)</span>
                  <span>−₱{formatPrice(booking.discount_amount)}</span>
                </div>
              )}
              <div className="price-row"><span>Tax (12%)</span><span>₱{formatPrice(booking.tax)}</span></div>
              <div className="price-row"><span>Service fee (5%)</span><span>₱{formatPrice(booking.service_fee)}</span></div>
              <div className="summary-total-row">
                <span>Total</span>
                <span className="summary-total-amount">₱{formatPrice(total)}</span>
              </div>

              {!isBalanceMode && !isFullySettled && !isCancelled && (
                <div className="sidebar-deposit-box">
                  <div className={`sidebar-deposit-row ${selectedType === 'deposit' ? 'highlighted' : ''}`}>
                    <span>Pay now ({selectedType === 'deposit' ? '30%' : '100%'})</span>
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
                  <CheckCircle2 size={13} />
                  Deposit of ₱{formatPrice(amountPaid)} already paid.
                  Paying remaining ₱{formatPrice(amountDue)}.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      <Footer />
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

function LoadingSkeleton() {
  return (
    <div className="payment-page">
      <Navbar />
      <div style={{ maxWidth: 1020, margin: '0 auto', padding: '44px 5%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="skeleton skeleton-card-lg" />
            <div className="skeleton skeleton-card-md" />
          </div>
          <div className="skeleton skeleton-sidebar" />
        </div>
      </div>
    </div>
  );
}