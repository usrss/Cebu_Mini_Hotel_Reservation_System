import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, ArrowLeft, Receipt, Hash } from 'lucide-react';
import { useVerifyPayment } from '../hooks/usePayments';
import './PaymentSuccessPage.css';

const POLL_INTERVAL_MS = 3000;  // poll every 3s
const MAX_POLLS        = 10;    // give up after ~30s

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentSuccessPage() {
  const [searchParams]            = useSearchParams();
  const paymentId                 = searchParams.get('payment_id');
  const { payment, loading, error, verify } = useVerifyPayment(paymentId);

  const [polls,     setPolls]     = useState(0);
  const [timedOut,  setTimedOut]  = useState(false);
  const intervalRef               = useRef(null);

  // Poll until paid or max retries reached
  useEffect(() => {
    if (!paymentId) return;

    const poll = () => {
      setPolls((prev) => {
        if (prev >= MAX_POLLS) {
          clearInterval(intervalRef.current);
          setTimedOut(true);
          return prev;
        }
        verify(paymentId);
        return prev + 1;
      });
    };

    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [paymentId]);

  // Stop polling when paid or failed
  useEffect(() => {
    if (payment?.status === 'paid' || payment?.status === 'failed') {
      clearInterval(intervalRef.current);
    }
  }, [payment?.status]);

  const isPaid   = payment?.status === 'paid';
  const isFailed = payment?.status === 'failed' || payment?.status === 'expired';
  const isPending = !isPaid && !isFailed && !timedOut;

  return (
    <div className="success-page">

      {/* Nav */}
      <div className="success-nav">
        <div className="nav-container">
          <Link to="/bookings/my" className="back-link">
            <ArrowLeft size={18} /> My Bookings
          </Link>
        </div>
      </div>

      <div className="success-container">

        {/* ── PENDING / POLLING ─────────────────────────────────────────── */}
        {(loading || isPending) && (
          <div className="success-card pending-card">
            <div className="success-spinner-wrap">
              <span className="spinner spinner-lg" />
            </div>
            <h2 className="success-title">Verifying your payment…</h2>
            <p className="success-subtitle">
              Please wait while we confirm your payment with the provider.
              This usually takes a few seconds.
            </p>
            {timedOut && (
              <p className="success-timeout-note">
                <Clock size={14} />
                Taking longer than expected. Your payment may still be processing.
                Check your <Link to="/bookings/my">My Bookings</Link> shortly.
              </p>
            )}
          </div>
        )}

        {/* ── SUCCESS ────────────────────────────────────────────────────── */}
        {isPaid && (
          <div className="success-card paid-card">
            <div className="success-icon success-icon--paid">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="success-title">Payment Successful!</h2>
            <p className="success-subtitle">
              Your booking is now confirmed. Check your email for details.
            </p>

            <div className="success-details">
              <DetailRow
                icon={<Receipt size={14} />}
                label="Receipt No."
                value={payment.receipt_number}
              />
              <DetailRow
                icon={<Hash size={14} />}
                label="Booking Ref."
                value={payment.booking_reference}
              />
              <DetailRow
                label="Amount Paid"
                value={`₱${formatPrice(payment.amount)}`}
              />
              <DetailRow
                label="Payment Type"
                value={payment.payment_type_display}
              />
              <DetailRow
                label="Method"
                value={payment.payment_method_display}
              />
              <DetailRow
                label="Paid At"
                value={payment.paid_at ? new Date(payment.paid_at).toLocaleString() : '—'}
              />
            </div>

            {payment.payment_type === 'deposit' && (
              <div className="deposit-balance-notice">
                <Clock size={14} />
                You paid a 30% deposit. The remaining balance is due on check-in.
              </div>
            )}

            <div className="success-actions">
              <Link
                to={`/bookings/confirmation/${payment.booking}`}
                className="btn btn-primary"
              >
                <CheckCircle2 size={16} /> View Booking Confirmation
              </Link>
              <Link to="/bookings/my" className="btn btn-outline">
                My Bookings
              </Link>
            </div>
          </div>
        )}

        {/* ── FAILED ─────────────────────────────────────────────────────── */}
        {isFailed && (
          <div className="success-card failed-card">
            <div className="success-icon success-icon--failed">
              <AlertCircle size={48} />
            </div>
            <h2 className="success-title">Payment Failed</h2>
            <p className="success-subtitle">
              Your payment could not be completed. Your booking remains pending.
              You can try again or choose a different payment method.
            </p>

            <div className="success-actions">
              {payment?.booking && (
                <Link
                  to={`/payments/${payment.booking}`}
                  className="btn btn-primary"
                >
                  Try Again
                </Link>
              )}
              <Link to="/bookings/my" className="btn btn-outline">
                My Bookings
              </Link>
            </div>
          </div>
        )}

        {/* ── NOT FOUND ──────────────────────────────────────────────────── */}
        {error && !loading && (
          <div className="success-card failed-card">
            <div className="success-icon success-icon--failed">
              <AlertCircle size={48} />
            </div>
            <h2 className="success-title">Something went wrong</h2>
            <p className="success-subtitle">{error}</p>
            <Link to="/bookings/my" className="btn btn-primary">
              <ArrowLeft size={16} /> My Bookings
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">
        {icon && <span className="detail-icon">{icon}</span>}
        {label}
      </span>
      <span className="detail-value">{value ?? '—'}</span>
    </div>
  );
}