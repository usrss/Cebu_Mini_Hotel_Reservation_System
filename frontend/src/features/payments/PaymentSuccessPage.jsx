/**
 * PaymentSuccessPage.jsx — Cebu Mini Hotel · Editorial Light Theme
 * =================================================================
 * Redesigned to match Dashboard.css palette and design language.
 * No emoji. Lucide icons throughout.
 */

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  CheckCircle2, Clock, AlertCircle, ArrowLeft,
  Receipt, Hash, CreditCard, ArrowRight,
} from 'lucide-react';
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

function DetailRow({ icon, label, value }) {
  return (
    <div className="psp-detail-row">
      <span className="psp-detail-label">
        {icon && <span className="psp-detail-icon">{icon}</span>}
        {label}
      </span>
      <span className="psp-detail-value">{value ?? '—'}</span>
    </div>
  );
}

function PageShell({ children }) {
  return (
    <div className="psp-page">
      <div className="psp-nav">
        <div className="psp-nav-inner">
          <Link to="/bookings/my" className="psp-back-link">
            <ArrowLeft size={16} />
            My Bookings
          </Link>
        </div>
      </div>
      <div className="psp-container">{children}</div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const paymentId      = searchParams.get('payment_id');
  const modId          = searchParams.get('mod_id');

  const [payment,   setPayment]   = useState(null);
  const [status,    setStatus]    = useState('loading');
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    if (!paymentId) { setStatus('error'); return; }

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

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => stopPolling();
  }, [paymentId]);

  /* ── Loading / Pending ── */
  if (status === 'loading' || status === 'pending') {
    return (
      <PageShell>
        <div className="psp-card">
          <div className="psp-status-icon psp-status-icon--pending">
            <div className="psp-spinner" />
          </div>
          <span className="psp-eyebrow">Processing</span>
          <h2 className="psp-heading">Verifying your payment</h2>
          <p className="psp-desc">
            Please wait while we confirm with the payment provider.
            This usually takes a few seconds.
          </p>
          {pollCount >= MAX_POLLS && (
            <div className="psp-notice psp-notice--warn">
              <Clock size={14} />
              <span>
                Taking longer than expected.{' '}
                <Link to="/bookings/my">Check My Bookings</Link> in a moment.
              </span>
            </div>
          )}
        </div>
      </PageShell>
    );
  }

  /* ── Timeout ── */
  if (status === 'timeout') {
    return (
      <PageShell>
        <div className="psp-card">
          <div className="psp-status-icon psp-status-icon--warn">
            <Clock size={32} />
          </div>
          <span className="psp-eyebrow">Still Processing</span>
          <h2 className="psp-heading">Payment is taking longer than usual</h2>
          <p className="psp-desc">
            Your payment may still be processing. Check your bookings in a few minutes.
          </p>
          <div className="psp-actions">
            <Link to="/bookings/my" className="psp-btn psp-btn-primary">
              <ArrowRight size={15} />
              Check My Bookings
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ── Success ── */
  if (status === 'paid' && payment) {
    return (
      <PageShell>
        <div className="psp-card psp-card--success">

          {/* Success header */}
          <div className="psp-success-header">
            <div className="psp-status-icon psp-status-icon--success">
              <CheckCircle2 size={32} />
            </div>
            <div className="psp-success-header-text">
              <span className="psp-eyebrow">Payment Confirmed</span>
              <h2 className="psp-heading">
                {modId ? 'Booking Updated' : 'Booking Confirmed'}
              </h2>
              <p className="psp-desc">
                {modId
                  ? 'Your booking has been updated successfully. A confirmation has been sent to your email.'
                  : 'Your reservation is confirmed. Check your email for full details and your check-in PIN.'}
              </p>
            </div>
          </div>

          {/* Receipt details */}
          <div className="psp-receipt">
            <div className="psp-receipt-header">
              <Receipt size={13} />
              <span>Payment Receipt</span>
            </div>
            <div className="psp-receipt-rows">
              {payment.receipt_number && (
                <DetailRow icon={<Receipt size={13} />} label="Receipt No." value={payment.receipt_number} />
              )}
              {payment.booking_reference && (
                <DetailRow icon={<Hash size={13} />} label="Booking Ref." value={payment.booking_reference} />
              )}
              <DetailRow
                icon={<CreditCard size={13} />}
                label="Amount Paid"
                value={`₱${formatPrice(payment.amount)}`}
              />
              <DetailRow label="Payment Type" value={payment.payment_type_display} />
              <DetailRow label="Method"       value={payment.payment_method_display} />
              <DetailRow
                label="Paid At"
                value={payment.paid_at
                  ? new Date(payment.paid_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                  : '—'}
              />
            </div>
          </div>

          {/* Deposit notice */}
          {payment.payment_type === 'deposit' && (
            <div className="psp-notice psp-notice--info">
              <Clock size={14} />
              <span>
                <strong>30% deposit paid.</strong> The remaining balance is due at check-in.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="psp-actions">
            {modId ? (
              <Link to={`/bookings/my/${payment.booking}`} className="psp-btn psp-btn-primary">
                <CheckCircle2 size={15} /> View Updated Booking
              </Link>
            ) : (
              <Link to={`/bookings/confirmation/${payment.booking}`} className="psp-btn psp-btn-primary">
                <CheckCircle2 size={15} /> View Booking Confirmation
              </Link>
            )}
            <Link to="/bookings/my" className="psp-btn psp-btn-outline">
              My Bookings
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ── Failed ── */
  if (status === 'failed') {
    return (
      <PageShell>
        <div className="psp-card">
          <div className="psp-status-icon psp-status-icon--error">
            <AlertCircle size={32} />
          </div>
          <span className="psp-eyebrow">Payment Failed</span>
          <h2 className="psp-heading">We could not complete your payment</h2>
          <p className="psp-desc">
            Your booking remains in a pending state. No charge was made.
            You can retry from My Bookings.
          </p>
          <div className="psp-actions">
            <Link to="/bookings/my" className="psp-btn psp-btn-primary">
              <CreditCard size={15} /> Try Again from My Bookings
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  /* ── Error / no payment ID ── */
  return (
    <PageShell>
      <div className="psp-card">
        <div className="psp-status-icon psp-status-icon--error">
          <AlertCircle size={32} />
        </div>
        <span className="psp-eyebrow">Error</span>
        <h2 className="psp-heading">Something went wrong</h2>
        <p className="psp-desc">
          We could not find this payment. Please check My Bookings for your reservation status.
        </p>
        <div className="psp-actions">
          <Link to="/bookings/my" className="psp-btn psp-btn-primary">
            <ArrowLeft size={15} /> My Bookings
          </Link>
        </div>
      </div>
    </PageShell>
  );
}