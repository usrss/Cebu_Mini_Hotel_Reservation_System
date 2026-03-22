import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, ArrowLeft, Receipt, Hash } from 'lucide-react';
import './PaymentSuccessPage.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 20;

function formatPrice(amount) {
  return Number(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function fetchVerify(paymentId) {
  const token = localStorage.getItem('accessToken');
  const res   = await fetch(`${API_BASE}/payments/${paymentId}/verify/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to verify');
  return res.json();
}

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const paymentId      = searchParams.get('payment_id');
  const modId          = searchParams.get('mod_id');   // present when payment is for a modification

  const [payment,  setPayment]  = useState(null);
  const [status,   setStatus]   = useState('loading'); // loading | pending | paid | failed | error
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!paymentId) {
      setStatus('error');
      return;
    }

    const poll = async () => {
      try {
        const data = await fetchVerify(paymentId);
        setPayment(data);

        if (data.status === 'paid') {
          setStatus('paid');
          stopPolling();
        } else if (['failed', 'expired', 'cancelled'].includes(data.status)) {
          setStatus('failed');
          stopPolling();
        } else {
          // still pending
          setPollCount((prev) => {
            if (prev >= MAX_POLLS) {
              setStatus('timeout');
              stopPolling();
              return prev;
            }
            return prev + 1;
          });
          setStatus('pending');
        }
      } catch {
        setStatus('error');
        stopPolling();
      }
    };

    // Run immediately then on interval
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [paymentId]);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (status === 'loading' || status === 'pending') {
    return (
      <PageShell>
        <div className="success-card pending-card">
          <div className="success-spinner-wrap">
            <span className="spinner spinner-lg" />
          </div>
          <h2 className="success-title">Verifying your payment…</h2>
          <p className="success-subtitle">
            Please wait while we confirm with the payment provider.
            This usually takes a few seconds.
          </p>
          {pollCount >= MAX_POLLS && (
            <p className="success-timeout-note">
              <Clock size={14} />
              Taking longer than expected. Check{' '}
              <Link to="/bookings/my">My Bookings</Link> in a moment.
            </p>
          )}
        </div>
      </PageShell>
    );
  }

  if (status === 'timeout') {
    return (
      <PageShell>
        <div className="success-card pending-card">
          <div className="success-icon" style={{ background: '#fef9c3', color: '#ca8a04' }}>
            <Clock size={48} />
          </div>
          <h2 className="success-title">Still processing…</h2>
          <p className="success-subtitle">
            Your payment may still be processing on the provider's end.
            Check your bookings in a few minutes.
          </p>
          <div className="success-actions">
            <Link to="/bookings/my" className="btn btn-primary">
              Check My Bookings
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (status === 'paid' && payment) {
    return (
      <PageShell>
        <div className="success-card paid-card">
          <div className="success-icon success-icon--paid">
            <CheckCircle2 size={48} />
          </div>
          <h2 className="success-title">Payment Successful!</h2>
          <p className="success-subtitle">
            {modId
              ? 'Your booking has been updated successfully.'
              : 'Your booking is confirmed. Check your email for details.'}
          </p>

          <div className="success-details">
            <DetailRow icon={<Receipt size={14} />} label="Receipt No."   value={payment.receipt_number} />
            <DetailRow icon={<Hash size={14} />}    label="Booking Ref."  value={payment.booking_reference} />
            <DetailRow label="Amount Paid"  value={`₱${formatPrice(payment.amount)}`} />
            <DetailRow label="Payment Type" value={payment.payment_type_display} />
            <DetailRow label="Method"       value={payment.payment_method_display} />
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
            {modId ? (
              // Modification payment → go back to booking detail
              <Link to={`/bookings/my/${payment.booking}`} className="btn btn-primary">
                <CheckCircle2 size={16} /> View Updated Booking
              </Link>
            ) : (
              // Normal booking → go to confirmation page
              <Link to={`/bookings/confirmation/${payment.booking}`} className="btn btn-primary">
                <CheckCircle2 size={16} /> View Booking Confirmation
              </Link>
            )}
            <Link to="/bookings/my" className="btn btn-outline">
              My Bookings
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  if (status === 'failed') {
    return (
      <PageShell>
        <div className="success-card failed-card">
          <div className="success-icon success-icon--failed">
            <AlertCircle size={48} />
          </div>
          <h2 className="success-title">Payment Failed</h2>
          <p className="success-subtitle">
            Your payment could not be completed. Your booking remains pending.
            You can try again from My Bookings.
          </p>
          <div className="success-actions">
            <Link to="/bookings/my" className="btn btn-primary">Try Again</Link>
          </div>
        </div>
      </PageShell>
    );
  }

  // error / no paymentId
  return (
    <PageShell>
      <div className="success-card failed-card">
        <div className="success-icon success-icon--failed">
          <AlertCircle size={48} />
        </div>
        <h2 className="success-title">Something went wrong</h2>
        <p className="success-subtitle">
          We could not find this payment. Please check My Bookings.
        </p>
        <div className="success-actions">
          <Link to="/bookings/my" className="btn btn-primary">
            <ArrowLeft size={16} /> My Bookings
          </Link>
        </div>
      </div>
    </PageShell>
  );
}

function PageShell({ children }) {
  return (
    <div className="success-page">
      <div className="success-nav">
        <div className="nav-container">
          <Link to="/bookings/my" className="back-link">
            <ArrowLeft size={18} /> My Bookings
          </Link>
        </div>
      </div>
      <div className="success-container">{children}</div>
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