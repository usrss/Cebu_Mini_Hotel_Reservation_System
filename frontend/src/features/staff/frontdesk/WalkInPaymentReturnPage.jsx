/**
 * src/features/staff/frontdesk/WalkInPaymentReturnPage.jsx
 *
 * Handles the browser landing after a PayMongo / PayPal walk-in payment.
 *
 * The backend always redirects PayMongo back to:
 *   /payments/success?payment_id=<id>
 *
 * This page is reached when the staff member lands on that URL and we detect
 * the walk-in sessionStorage keys set by WalkInBookingPage before the redirect.
 *
 * Alternatively, wire this as its own route and detect the keys on mount.
 * Either way, the polling logic is identical to PaymentSuccessPage —
 * it calls GET /payments/my/<paymentId>/verify/ and waits for status=paid.
 *
 * Route (add to your router):
 *   <Route path="/staff/front-desk/payment-return" element={<WalkInPaymentReturnPage />} />
 *
 * You can also detect the walkin sessionStorage keys inside PaymentSuccessPage
 * and render this component's UI instead — both approaches work.
 *
 * sessionStorage keys (set by WalkInBookingPage):
 *   walkin_payment_id  — the payment PK returned by /payments/initiate/
 *   walkin_booking_id  — the booking PK created in Step 1
 *
 * Flow:
 *   1. Read walkin_payment_id from sessionStorage
 *   2. Poll GET /payments/my/<paymentId>/verify/ every 3s (max 20 polls)
 *      — same endpoint and pattern as PaymentSuccessPage
 *   3. On status=paid → fetch booking detail → show credentials screen
 *   4. On status=failed/cancelled → show retry screen
 *   5. On timeout → show advisory screen (webhook may still fire)
 *   6. Clean up sessionStorage keys on any terminal state
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { frontDeskBookingsApi, formatPHP } from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const API_BASE        = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS        = 20;

// sessionStorage keys — must match WalkInBookingPage
const SS_PAYMENT_ID = 'walkin_payment_id';
const SS_BOOKING_ID = 'walkin_booking_id';

async function fetchVerify(paymentId) {
  const token = localStorage.getItem('accessToken');
  const res   = await fetch(`${API_BASE}/payments/${paymentId}/verify/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to verify payment.');
  return res.json();
}

function clearSessionKeys() {
  sessionStorage.removeItem(SS_PAYMENT_ID);
  sessionStorage.removeItem(SS_BOOKING_ID);
}

export default function WalkInPaymentReturnPage() {
  const navigate     = useNavigate();
  const [params]     = useSearchParams();

  // Read IDs — prefer sessionStorage (set by WalkInBookingPage before redirect),
  // fall back to query params as a safety net.
  const paymentId = sessionStorage.getItem(SS_PAYMENT_ID) || params.get('payment_id');
  const bookingId = sessionStorage.getItem(SS_BOOKING_ID);

  const [phase,     setPhase]     = useState('verifying'); // verifying | paid | failed | cancelled | error
  const [booking,   setBooking]   = useState(null);
  const [pollCount, setPollCount] = useState(0);

  // Check-in-now helpers
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkedIn,   setCheckedIn]   = useState(false);

  const intervalRef = useRef(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // ── No payment ID — nothing to verify ─────────────────────────────────────
  useEffect(() => {
    if (!paymentId) {
      setPhase('error');
    }
  }, [paymentId]);

  // ── Poll /payments/my/<paymentId>/verify/ ──────────────────────────────────
  // Identical pattern to PaymentSuccessPage — no new endpoints needed.
  useEffect(() => {
    if (!paymentId) return;

    const poll = async () => {
      try {
        const data = await fetchVerify(paymentId);

        if (data.status === 'paid') {
          stopPolling();
          clearSessionKeys();

          // Fetch the confirmed booking to get reference_number + checkin_pin
          if (bookingId) {
            try {
              const b = await frontDeskBookingsApi.detail(bookingId);
              setBooking(b);
            } catch {
              // Non-fatal — still show paid state even without booking detail
            }
          }
          setPhase('paid');

        } else if (['failed', 'expired', 'cancelled'].includes(data.status)) {
          stopPolling();
          clearSessionKeys();
          setPhase('failed');

        } else {
          // Still pending
          setPollCount((prev) => {
            const next = prev + 1;
            if (next >= MAX_POLLS) {
              stopPolling();
              clearSessionKeys();
              setPhase('timeout');
            }
            return next;
          });
        }
      } catch {
        // Transient error — keep polling
      }
    };

    poll(); // immediate first check
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => stopPolling();
  }, [paymentId, bookingId]);

  // ── Check in immediately ───────────────────────────────────────────────────
  async function handleCheckInNow() {
    if (!booking) return;
    setCheckInBusy(true);
    try {
      await frontDeskBookingsApi.checkIn(booking.id, 'manual_entry');
      setCheckedIn(true);
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Check-in failed.');
    } finally {
      setCheckInBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 640 }}>

        <div className="fd-toprow" style={{ marginBottom: 24 }}>
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Walk-In Payment</h1>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>
            ← Front Desk
          </button>
        </div>

        {/* ── Verifying ── */}
        {phase === 'verifying' && (
          <div className="fd-card">
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="fd-spinner" style={{ margin: '0 auto 24px' }} />
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 20, color: 'var(--white)', marginBottom: 8,
              }}>
                Verifying Payment
              </p>
              <p style={{ fontSize: 13, color: 'var(--white-dim)', marginBottom: 20 }}>
                Waiting for confirmation from the payment gateway…
              </p>

              {/* Progress dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      width: 6, height: 6,
                      borderRadius: '50%',
                      background: i < Math.ceil((pollCount / MAX_POLLS) * 5)
                        ? 'var(--gold)'
                        : 'var(--gold-border)',
                      transition: 'background 0.3s',
                    }}
                  />
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'rgba(248,246,240,0.25)', marginTop: 10, letterSpacing: 1 }}>
                Check {pollCount} of {MAX_POLLS}
              </p>
            </div>
          </div>
        )}

        {/* ── Paid / Confirmed ── */}
        {phase === 'paid' && (
          <div className="fd-card">
            <div className="fd-success">
              <div className="fd-success-icon">✓</div>
              <h2 className="fd-success-title">Payment Confirmed</h2>
              <p className="fd-success-sub">
                {booking
                  ? <>Walk-in booking for <strong>{booking.full_name}</strong> is confirmed and paid.</>
                  : 'The payment was successful and the booking is confirmed.'}
                {' '}Share the credentials below with the guest.
              </p>

              {booking && (
                <dl className="fd-success-creds">
                  {[
                    ['Reference Number', booking.reference_number],
                    ['Check-In PIN',     booking.checkin_pin],
                    ['Room',             `${booking.room_number}${booking.room_type ? ` — ${booking.room_type}` : ''}`],
                    ['Stay', `${booking.check_in
                      ? new Date(booking.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
                      : '—'} → ${booking.check_out
                      ? new Date(booking.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}`],
                    ...(booking.amount_paid ? [['Amount Paid', formatPHP(booking.amount_paid)]] : []),
                    ...(parseFloat(booking.amount_due || '0') > 0
                      ? [['Balance Due', formatPHP(booking.amount_due)]]
                      : []),
                  ].map(([label, value]) => (
                    <div className="fd-cred-item" key={label}>
                      <dt>{label}</dt>
                      <dd className={['Reference Number', 'Check-In PIN'].includes(label) ? 'highlight' : ''}>
                        {value || '—'}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Offer immediate check-in */}
              {booking && !checkedIn && booking.status === 'confirmed' && (
                <div className="fd-notice fd-notice-blue" style={{ maxWidth: 420, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">ℹ</span>
                  <div>
                    <strong>Guest is here now?</strong>
                    <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                      Check them in immediately — no PIN flow needed.
                    </p>
                  </div>
                </div>
              )}
              {checkedIn && booking && (
                <div className="fd-notice fd-notice-success" style={{ maxWidth: 420, margin: '0 auto 20px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">✓</span>
                  <strong>Guest checked in. Room {booking.room_number} is now Occupied.</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="fd-btn" onClick={() => window.print()}>
                  🖨 Print Receipt
                </button>
                {booking && !checkedIn && booking.status === 'confirmed' && (
                  <button
                    className="fd-btn fd-btn-success"
                    onClick={handleCheckInNow}
                    disabled={checkInBusy}
                  >
                    {checkInBusy
                      ? <><span className="fd-spinner-sm" /> Checking In…</>
                      : '✓ Check In Guest Now'}
                  </button>
                )}
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => navigate('/staff/front-desk/walk-in')}
                >
                  + New Walk-In
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Failed ── */}
        {phase === 'failed' && (
          <div className="fd-card">
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--red-bg)', border: '2px solid var(--red-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, margin: '0 auto 18px',
              }}>
                ✕
              </div>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 24, color: 'var(--red)', margin: '0 0 8px',
              }}>
                Payment Failed
              </h2>
              <p style={{ fontSize: 13, color: 'var(--white-dim)', marginBottom: 24 }}>
                The payment could not be completed or was cancelled.
                The booking remains in pending status — you can retry with a different method.
              </p>
              {bookingId && (
                <div className="fd-notice fd-notice-amber" style={{ maxWidth: 420, margin: '0 auto 24px', textAlign: 'left' }}>
                  <span className="fd-notice-icon">⚠</span>
                  <span style={{ fontSize: 12 }}>
                    Booking #{bookingId} is still in <strong>Pending Payment</strong> status.
                    The room is not yet reserved. Retry payment or start a new walk-in.
                  </span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => navigate('/staff/front-desk/walk-in')}
                >
                  ↩ New Walk-In Booking
                </button>
                <button
                  className="fd-btn"
                  onClick={() => navigate('/staff/front-desk')}
                >
                  Front Desk Dashboard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Timeout ── */}
        {phase === 'timeout' && (
          <div className="fd-card">
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--amber-bg)', border: '2px solid var(--amber-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, margin: '0 auto 18px',
              }}>
                ⏱
              </div>
              <h2 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 24, color: 'var(--amber)', margin: '0 0 8px',
              }}>
                Still Processing
              </h2>
              <p style={{ fontSize: 13, color: 'var(--white-dim)', maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.6 }}>
                The payment provider hasn't confirmed yet. If the payment was
                completed on the checkout page, the booking will be confirmed
                automatically within a few minutes via webhook.
              </p>
              <div className="fd-notice fd-notice-blue" style={{ maxWidth: 420, margin: '0 auto 24px', textAlign: 'left' }}>
                <span className="fd-notice-icon">ℹ</span>
                <span style={{ fontSize: 12 }}>
                  Check <strong>Today's Arrivals</strong> in a moment to confirm the booking
                  appeared. If it's missing after 5 minutes, contact your payment provider.
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="fd-btn"
                  onClick={() => navigate('/staff/front-desk/today')}
                >
                  Today's Arrivals
                </button>
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => navigate('/staff/front-desk/walk-in')}
                >
                  New Walk-In
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Error (no payment ID) ── */}
        {phase === 'error' && (
          <div className="fd-card">
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ fontSize: 13, color: 'var(--white-dim)', marginBottom: 20 }}>
                No payment information found. Please return to the Front Desk.
              </p>
              <button
                className="fd-btn fd-btn-primary"
                onClick={() => navigate('/staff/front-desk')}
              >
                ← Front Desk Dashboard
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}