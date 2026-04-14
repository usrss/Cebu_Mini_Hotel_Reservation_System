/**
 * src/features/staff/checkin/CheckInPage.jsx
 *
 * Front Desk Check-In Verification Panel.
 * UI redesigned to match the Dashboard editorial light theme
 * (Montserrat + Playfair Display, FAF9F6 background, dark text accents).
 *
 * CHANGES:
 *  - Stores and displays `warning` returned by canCheckIn() (late arrival banner)
 *  - Clears warning on reset
 *  - Full visual refresh — light palette, no dark navy/gold
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import QRScannerModal    from './QRScannerModal';
import BookingPreviewCard from './BookingPreviewCard';
import {
  checkInApi,
  PAYMENT_METHODS,
  BOOKING_STATUS,
  getRemainingBalance,
  formatPHP,
  canCheckIn,
} from '../services/checkInApi';
import './CheckIn.css';

const STEP = {
  LOOKUP:  'lookup',
  PIN:     'pin',
  PAYMENT: 'payment',
  CONFIRM: 'confirm',
  SUCCESS: 'success',
};

// ── 4-digit PIN input ──────────────────────────────────────────────────────────
function PinInput({ value, onChange, error }) {
  const inputs    = useRef([]);
  const PIN_LENGTH = 4;

  function handleKey(e, i) {
    const char = e.key;
    if (char === 'Backspace') {
      if (value[i]) {
        const next = value.split('');
        next[i] = '';
        onChange(next.join(''));
      } else if (i > 0) {
        inputs.current[i - 1]?.focus();
      }
      return;
    }
    if (!/^\d$/.test(char)) return;
    const next = (value + '    ').split('').slice(0, PIN_LENGTH);
    next[i] = char;
    onChange(next.join('').trimEnd());
    if (i < PIN_LENGTH - 1) inputs.current[i + 1]?.focus();
  }

  return (
    <div className="ci-pin-wrap">
      {Array.from({ length: PIN_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={() => {}}
          onKeyDown={(e) => handleKey(e, i)}
          onFocus={(e) => e.target.select()}
          className={`ci-pin-digit${value[i] ? ' filled' : ''}${error ? ' error' : ''}`}
          placeholder="·"
          autoComplete="off"
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepBar({ currentStep, hasBalance }) {
  const steps = [
    { key: STEP.LOOKUP,  label: 'Verify' },
    { key: STEP.PIN,     label: 'PIN' },
    ...(hasBalance
      ? [{ key: STEP.PAYMENT, label: 'Payment' }]
      : [{ key: STEP.CONFIRM, label: 'Confirm' }]
    ),
    { key: STEP.SUCCESS, label: 'Done' },
  ];
  const ORDER = [STEP.LOOKUP, STEP.PIN, STEP.PAYMENT, STEP.CONFIRM, STEP.SUCCESS];
  const idx   = (s) => ORDER.indexOf(s);

  return (
    <div className="ci-steps ci-no-print">
      {steps.map((s, i) => {
        const done   = idx(currentStep) > idx(s.key);
        const active = currentStep === s.key;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div className={`ci-step${active ? ' active' : done ? ' done' : ''}`}>
              <div className="ci-step-dot">{done ? '✓' : i + 1}</div>
              <span className="ci-step-label">{s.label}</span>
            </div>
            {i < steps.length - 1 && <div className="ci-step-line" />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CheckInPage() {
  const location = useLocation();

  const [method,       setMethod]       = useState('qr');
  const [showScanner,  setShowScanner]  = useState(false);
  const [step,         setStep]         = useState(STEP.LOOKUP);
  const [reference,    setReference]    = useState('');
  const [booking,      setBooking]      = useState(null);
  const [pin,          setPin]          = useState('');
  const [payMethod,    setPayMethod]    = useState('');
  const [result,       setResult]       = useState(null);
  const [checkInWarning, setCheckInWarning] = useState(null); // ← new

  const [lookupBusy,  setLookupBusy]   = useState(false);
  const [pinBusy,     setPinBusy]      = useState(false);
  const [payBusy,     setPayBusy]      = useState(false);
  const [confirmBusy, setConfirmBusy]  = useState(false);

  const [lookupErr,   setLookupErr]    = useState(null);
  const [pinErr,      setPinErr]       = useState(null);
  const [payErr,      setPayErr]       = useState(null);
  const [confirmErr,  setConfirmErr]   = useState(null);


  const remaining  = getRemainingBalance(booking);
  const hasBalance = remaining > 0;

  // Auto-lookup when navigated here from TodayArrivalsPage
  useEffect(() => {
    const incoming = location?.state?.reference;
    if (incoming && step === STEP.LOOKUP) {
      setReference(incoming.toUpperCase());
      handleLookup(incoming.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setStep(STEP.LOOKUP);
    setReference(''); setBooking(null); setPin('');
    setPayMethod(''); setResult(null);
    setLookupErr(null); setPinErr(null);
    setPayErr(null); setConfirmErr(null);
    setCheckInWarning(null); // ← clear warning on reset
  }

  // ── Step 1: Lookup ─────────────────────────────────────────────────────────
  const handleLookup = useCallback(async (refOverride) => {
    const ref = (refOverride || reference).trim().toUpperCase();
    if (!ref) { setLookupErr('Please enter a reference number.'); return; }

    setLookupBusy(true); setLookupErr(null);
    try {
      const data  = await checkInApi.lookupByReference(ref);
      const check = canCheckIn(data);

      if (!check.ok) {
        setLookupErr(check.reason);
        return;
      }

      setBooking(data);
      setReference(data.reference_number);
      setCheckInWarning(check.warning || null); // ← store warning
      setStep(STEP.PIN);
    } catch (err) {
      if (err.response?.status === 404) {
        setLookupErr('Reference number not found. Please check and try again.');
      } else {
        setLookupErr(
          err.response?.data?.error ||
          err.response?.data?.detail ||
          err.message ||
          'Failed to retrieve booking.',
        );
      }
    } finally {
      setLookupBusy(false);
    }
  }, [reference]);

  function handleQRScan(ref) {
    setShowScanner(false);
    setReference(ref);
    handleLookup(ref);
  }

  // ── Step 2: Verify PIN ─────────────────────────────────────────────────────
  async function handleVerifyPin() {
    if (pin.length < 4) { setPinErr('Please enter all 4 digits of the PIN.'); return; }
    setPinBusy(true); setPinErr(null);
    try {
      const res = await checkInApi.verifyPin(booking.id, pin);
      if (!res.valid) {
        setPinErr(res.error || 'Incorrect PIN. Please try again.');
        setPin('');
        return;
      }
      setStep(hasBalance ? STEP.PAYMENT : STEP.CONFIRM);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'PIN verification failed. Please try again.';
      setPinErr(msg);
      setPin('');
    } finally {
      setPinBusy(false);
    }
  }

  // ── Step 3: Collect payment ────────────────────────────────────────────────
  async function handleCollectPayment() {
    if (!payMethod) { setPayErr('Please select a payment method.'); return; }
    setPayBusy(true); setPayErr(null);
    try {
      const updated = await checkInApi.collectPayment(booking.id, payMethod);
      setResult(updated);
      setStep(STEP.SUCCESS);
    } catch (err) {
      setPayErr(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Payment collection failed. Please try again.',
      );
    } finally {
      setPayBusy(false);
    }
  }

  // ── Step 3b: Check-in with balance ─────────────────────────────────────────
  async function handleCheckInWithBalance() {
    setConfirmBusy(true); setConfirmErr(null);
    try {
      const updated = await checkInApi.checkInWithBalance(
        booking.id,
        method === 'qr' ? 'qr_scan' : 'manual_entry',
      );
      setResult(updated);
      setStep(STEP.SUCCESS);
    } catch (err) {
      setConfirmErr(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Check-in failed. Please try again.',
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  // ── Step 4: Confirm (fully paid) ───────────────────────────────────────────
  async function handleConfirmCheckIn() {
    setConfirmBusy(true); setConfirmErr(null);
    try {
      const updated = await checkInApi.confirmCheckIn(
        booking.id,
        method === 'qr' ? 'qr_scan' : 'manual_entry',
      );
      setResult(updated);
      setStep(STEP.SUCCESS);
    } catch (err) {
      setConfirmErr(
        err.response?.data?.error ||
        err.response?.data?.detail ||
        'Check-in confirmation failed. Please try again.',
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ci-page">
      <div className="ci-inner">

        {/* Header */}
        <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid rgba(1,0,13,0.08)' }}>
          <span style={{
            fontSize: 9, fontWeight: 900, letterSpacing: '0.32em',
            textTransform: 'uppercase', color: '#909090', display: 'block', marginBottom: 8,
          }}>
            Front Desk
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(24px, 3vw, 34px)',
            fontWeight: 700, color: '#01000D', margin: '0 0 6px', lineHeight: 1.1,
          }}>
            Guest Check-In
          </h1>
          <p style={{ fontSize: 13, color: '#909090', margin: 0, fontWeight: 500 }}>
            Verify booking and process guest arrival
          </p>
        </div>

        {/* Step bar */}
        {step !== STEP.SUCCESS && (
          <StepBar currentStep={step} hasBalance={hasBalance && step !== STEP.LOOKUP} />
        )}

        {/* ════ STEP 1: LOOKUP ════ */}
        {step === STEP.LOOKUP && (
          <>

            <div className="ci-card">
              <div className="ci-card-label">
                {method === 'qr' ? 'QR Code Verification' : 'Reference Number Lookup'}
              </div>

              {lookupErr && (
                <div className="ci-notice ci-notice-error">
                  <span className="ci-notice-icon">✕</span>
                  <span>{lookupErr}</span>
                </div>
              )}

              {method === 'qr' && (
                <div style={{ textAlign: 'center', paddingBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#535252', marginBottom: 20, fontWeight: 500 }}>
                    Click the button below to open the camera and scan the guest's QR code.
                  </p>
                  <button
                    className="ci-btn ci-btn-primary"
                    style={{ padding: '14px 32px', fontSize: 10 }}
                    onClick={() => setShowScanner(true)}
                  >
                     Open QR Scanner
                  </button>
                  <p style={{ fontSize: 11, color: '#909090', marginTop: 16, fontWeight: 500 }}>
                    Or enter the reference number below
                  </p>
                </div>
              )}

              <div className="ci-ref-input-wrap">
                <div className="ci-ref-input-group">
                  <label className="ci-label">
                    {method === 'qr' ? 'Or type reference number' : 'Reference Number'}
                  </label>
                  <input
                    className={`ci-input${lookupErr ? ' error' : ''}`}
                    value={reference}
                    onChange={(e) => { setReference(e.target.value.toUpperCase()); setLookupErr(null); }}
                    placeholder="CMH-2026-000001"
                    autoFocus={method === 'manual'}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                  />
                </div>
                <button
                  className="ci-btn ci-btn-primary"
                  style={{ padding: '13px 22px', alignSelf: 'flex-end' }}
                  onClick={() => handleLookup()}
                  disabled={lookupBusy}
                >
                  {lookupBusy ? <span className="ci-spinner" /> : 'Look Up'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ STEP 2: PIN ════ */}
        {step === STEP.PIN && booking && (
          <>
            {/* Late arrival warning — shown when canCheckIn returned a warning */}
            {checkInWarning && (
              <div className="ci-notice ci-notice-amber" style={{ marginBottom: 16 }}>
                <span className="ci-notice-icon">⚠</span>
                <div>
                  <strong style={{ display: 'block', marginBottom: 3 }}>Late Arrival</strong>
                  <span style={{ fontSize: 12 }}>{checkInWarning}</span>
                </div>
              </div>
            )}

            <BookingPreviewCard booking={booking} method={method === 'qr' ? 'qr_scan' : 'manual_entry'} />

            <div className="ci-card">
              <div className="ci-card-label">PIN Verification</div>
              <p style={{ fontSize: 13, color: '#535252', marginBottom: 24, textAlign: 'center', fontWeight: 500 }}>
                Ask the guest to provide their 4-digit booking PIN.
              </p>

              {pinErr && (
                <div className="ci-notice ci-notice-error">
                  <span className="ci-notice-icon">✕</span>
                  <span>{pinErr}</span>
                </div>
              )}

              <PinInput value={pin} onChange={(v) => { setPin(v); setPinErr(null); }} error={!!pinErr} />

              <div className="ci-actions" style={{ marginTop: 24, justifyContent: 'space-between' }}>
                <button className="ci-btn" onClick={reset}>← Back</button>
                <button
                  className="ci-btn ci-btn-primary"
                  style={{ padding: '12px 28px' }}
                  onClick={handleVerifyPin}
                  disabled={pinBusy || pin.length < 4}
                >
                  {pinBusy ? <><span className="ci-spinner" /> Verifying…</> : 'Verify PIN'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ STEP 3: PAYMENT ════ */}
        {step === STEP.PAYMENT && booking && (
          <>
            <BookingPreviewCard booking={booking} method={method === 'qr' ? 'qr_scan' : 'manual_entry'} />

            <div className="ci-card">
              <div className="ci-card-label">Outstanding Balance</div>

              <div className="ci-notice ci-notice-amber" style={{ marginBottom: 22 }}>
                <span className="ci-notice-icon">
                    ⚠</span>
                <div>
                  <strong>Remaining Balance: {formatPHP(remaining)}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                    Total: {formatPHP(booking.total_price)}
                    &nbsp;·&nbsp;
                    Paid: {formatPHP(booking.amount_paid)}
                    &nbsp;·&nbsp;
                    Outstanding: {formatPHP(remaining)}
                  </p>
                </div>
              </div>

              {payErr && (
                <div className="ci-notice ci-notice-error">
                  <span className="ci-notice-icon">✕</span>
                  <span>{payErr}</span>
                </div>
              )}

              {/* Option 1 — Collect now */}
              <div style={{ marginBottom: 24 }}>
                <p style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#01000D', marginBottom: 12,
                }}>
                  Option 1 — Collect Remaining Payment
                </p>
                <p style={{ fontSize: 13, color: '#535252', marginBottom: 14, fontWeight: 500 }}>
                  Select payment method to collect{' '}
                  <strong style={{ color: '#01000D' }}>{formatPHP(remaining)}</strong>:
                </p>
                <div className="ci-payment-methods">
                  {PAYMENT_METHODS.map((pm) => (
                    <button
                      key={pm.value}
                      className={`ci-pay-method-btn${payMethod === pm.value ? ' selected' : ''}`}
                      onClick={() => { setPayMethod(pm.value); setPayErr(null); }}
                    >
                      <span className="ci-pay-method-icon">{pm.icon}</span>
                      {pm.label}
                    </button>
                  ))}
                </div>
                <button
                  className="ci-btn ci-btn-success ci-btn-full"
                  style={{ marginTop: 14 }}
                  onClick={handleCollectPayment}
                  disabled={payBusy || !payMethod}
                >
                  {payBusy
                    ? <><span className="ci-spinner" /> Processing…</>
                    : `Collect ${formatPHP(remaining)} & Confirm Check-In`}
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 20px' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(1,0,13,0.10)' }} />
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#909090' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(1,0,13,0.10)' }} />
              </div>

              {/* Option 2 — Check-in with balance */}
              <div>
                <p style={{
                  fontSize: 9, fontWeight: 900, letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#909090', marginBottom: 10,
                }}>
                  Option 2 — Check-In With Remaining Balance
                </p>
                <div className="ci-notice ci-notice-amber" style={{ marginBottom: 12 }}>
                  <span className="ci-notice-icon">⚠</span>
                  <span style={{ fontSize: 12 }}>
                    Guest will be checked in with <strong>{formatPHP(remaining)}</strong> outstanding.
                    To be settled during stay or at checkout.
                  </span>
                </div>
                {confirmErr && (
                  <div className="ci-notice ci-notice-error">
                    <span className="ci-notice-icon">✕</span>
                    <span>{confirmErr}</span>
                  </div>
                )}
                <button
                  className="ci-btn ci-btn-amber ci-btn-full"
                  onClick={handleCheckInWithBalance}
                  disabled={confirmBusy}
                >
                  {confirmBusy
                    ? <><span className="ci-spinner" /> Processing…</>
                    : `Check-In With Remaining Balance (${formatPHP(remaining)})`}
                </button>
              </div>

              <button className="ci-btn" style={{ marginTop: 16 }} onClick={() => setStep(STEP.PIN)}>
                ← Back
              </button>
            </div>
          </>
        )}

        {/* ════ STEP 4: CONFIRM ════ */}
        {step === STEP.CONFIRM && booking && (
          <>
            <BookingPreviewCard booking={booking} method={method === 'qr' ? 'qr_scan' : 'manual_entry'} />

            <div className="ci-card">
              <div className="ci-card-label">Confirm Check-In</div>

              <div className="ci-notice ci-notice-success" style={{ marginBottom: 20 }}>
                <span className="ci-notice-icon">✓</span>
                <span>
                  PIN verified. Booking is fully paid. Ready to confirm check-in for{' '}
                  <strong>{booking.full_name}</strong> — Room {booking.room_number}.
                </span>
              </div>

              {confirmErr && (
                <div className="ci-notice ci-notice-error">
                  <span className="ci-notice-icon">✕</span>
                  <span>{confirmErr}</span>
                </div>
              )}

              <div className="ci-actions" style={{ justifyContent: 'space-between' }}>
                <button className="ci-btn" onClick={() => setStep(STEP.PIN)}>← Back</button>
                <button
                  className="ci-btn ci-btn-success"
                  style={{ padding: '14px 36px', fontSize: 11 }}
                  onClick={handleConfirmCheckIn}
                  disabled={confirmBusy}
                >
                  {confirmBusy
                    ? <><span className="ci-spinner" /> Processing…</>
                    : '✓ Confirm Check-In'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ════ STEP 5: SUCCESS ════ */}
        {step === STEP.SUCCESS && result && (
          <div className="ci-card">
            <div className="ci-success-screen">
              <div className="ci-success-icon">✓</div>
              <h2 className="ci-success-title">Check-In Successful</h2>
              <p className="ci-success-sub">
                {result.full_name} has been checked in to Room {result.room_number}.
              </p>

              <dl className="ci-success-details">
                {[
                  ['Guest',     result.full_name],
                  ['Reference', result.reference_number],
                  ['Room',      result.room_number],
                  ['Room Type', result.room_type],
                  ['Check-In',  result.check_in
                    ? new Date(result.check_in + 'T00:00:00').toLocaleDateString('en-PH')
                    : '—'],
                  ['Check-Out', result.check_out
                    ? new Date(result.check_out + 'T00:00:00').toLocaleDateString('en-PH')
                    : '—'],
                  ['Payment',   result.payment_status_display || result.payment_status],
                  ['Method',    method === 'qr' ? 'QR Scan' : 'Manual Entry'],
                ].map(([label, value]) => (
                  <div className="ci-success-detail-item" key={label}>
                    <dt>{label}</dt>
                    <dd>{value || '—'}</dd>
                  </div>
                ))}
              </dl>

              {result.remaining_balance && parseFloat(result.remaining_balance) > 0 && (
                <div className="ci-notice ci-notice-amber" style={{
                  textAlign: 'left', maxWidth: 420, margin: '0 auto 20px',
                }}>
                  <span className="ci-notice-icon">⚠</span>
                  <span style={{ fontSize: 12 }}>
                    Guest still has a remaining balance of{' '}
                    <strong>{formatPHP(result.remaining_balance)}</strong>.
                    Please remind guest at checkout.
                  </span>
                </div>
              )}

              <div className="ci-actions" style={{ justifyContent: 'center' }}>
                <button className="ci-btn" onClick={() => window.print()}>
                  🖨 Print Receipt
                </button>
                <button className="ci-btn ci-btn-primary" onClick={reset}>
                  + New Check-In
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {showScanner && (
        <QRScannerModal onScan={handleQRScan} onClose={() => setShowScanner(false)} />
      )}
    </div>
  );
}