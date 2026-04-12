/**
 * GuestCheckoutPage.jsx
 * src/features/staff/frontdesk/GuestCheckoutPage.jsx
 *
 * Front Desk — Guest Checkout flow.
 *
 * ══════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE DOES
 * ══════════════════════════════════════════════════════════════════
 *
 * Step 1 — BILL REVIEW
 *   Shows the final bill broken into two sections:
 *     a) Accommodation — total_price, amount already paid, balance due
 *     b) Food & Drinks — all unpaid pay_checkout orders for this booking
 *   Grand Total = accommodation balance + food total.
 *
 * Step 2 — PAYMENT & CHECKOUT
 *   If grandTotal > 0 the staff selects Cash or Card.
 *   On confirm:
 *     a) Each food order is marked paid via PATCH /food/orders/<pk>/mark-paid/
 *        (sequentially — if any fails the checkout is aborted with a clear error)
 *     b) POST /bookings/admin/<pk>/checkout/ is called with { payment_method, note }
 *        The backend (StaffCheckoutAndCollectView) atomically:
 *          i.  Creates a BALANCE_PAYMENT Payment record for any accommodation balance
 *          ii. Calls payment.mark_paid() → generates a receipt
 *          iii.Transitions CHECKED_IN → CHECKED_OUT
 *          iv. Creates ReviewToken + sends review email
 *
 * Step 3 — SUCCESS
 *   Shows checkout confirmation, receipt number, and action buttons.
 *
 * ══════════════════════════════════════════════════════════════════
 * KEY DESIGN DECISIONS
 * ══════════════════════════════════════════════════════════════════
 *
 * • Food orders are settled BEFORE the checkout call. If food mark-paid
 *   fails we abort early — the booking stays CHECKED_IN, nothing is
 *   half-committed.
 *
 * • The accommodation balance is handled INSIDE the checkout endpoint
 *   (StaffCheckoutAndCollectView) atomically. If the Payment creation
 *   fails the booking does not transition — no lost money, no lost state.
 *
 * • payment_method is sent to the checkout endpoint even when the
 *   accommodation balance is 0. The backend ignores it when not needed,
 *   which keeps the frontend logic simple.
 *
 * • awaiting_payment food orders are excluded from the bill. These are
 *   pay_now orders whose PayMongo payment never completed — they should
 *   not appear at checkout.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import api from '../../../services/api';
import { frontDeskBookingsApi, formatPHP } from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STEP = { BILL: 'bill', PAYMENT: 'payment', SUCCESS: 'success' };

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash',       icon: '💵', desc: 'Collect at desk' },
  { value: 'card', label: 'Card (POS)', icon: '💳', desc: 'POS terminal'    },
];

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Safe money parse — never returns NaN or negative */
function safeMoney(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function GuestCheckoutPage() {
  const navigate      = useNavigate();
  const { bookingId } = useParams();
  const location      = useLocation();

  const [booking,        setBooking]        = useState(location.state?.booking || null);
  const [foodOrders,     setFoodOrders]     = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState(null);

  const [step,           setStep]           = useState(STEP.BILL);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [note,           setNote]           = useState('');
  const [busy,           setBusy]           = useState(false);
  const [payError,       setPayError]       = useState(null);

  // Snapshot totals at the moment checkout succeeds — immune to re-renders
  const [successSnapshot, setSuccessSnapshot] = useState(null);

  // ── Load booking + food orders ────────────────────────────────────────────
  const load = useCallback(async () => {
    const pk = bookingId || location.state?.booking?.id;
    if (!pk) {
      setLoadError('No booking ID provided.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      // A: fetch booking — need room_number + id for food query
      const bookingData = await frontDeskBookingsApi.detail(pk);
      setBooking(bookingData);

      // B: fetch food orders scoped to this booking
      //    Exclude awaiting_payment — those are pay_now orders whose
      //    PayMongo payment never completed; they should not appear at checkout.
      let relevantOrders = [];
      try {
        const foodRes = await api.get('/food/orders/admin/', {
          params: {
            booking:        bookingData.id,
            payment_type:   'pay_checkout',
            payment_status: 'unpaid',
          },
        });
        const allFromBooking = Array.isArray(foodRes.data)
          ? foodRes.data
          : (foodRes.data.results ?? []);

        relevantOrders = allFromBooking.filter(
          (o) => o.payment_type   === 'pay_checkout'
              && o.payment_status === 'unpaid'
              && o.order_status   !== 'cancelled'
              && o.order_status   !== 'awaiting_payment',   // ← exclude ghost orders
        );
      } catch {
        // Fallback: room-scoped query for older backends without booking param
        try {
          const fallbackRes = await api.get('/food/orders/admin/', {
            params: { room: bookingData.room_number },
          });
          const allOrders = Array.isArray(fallbackRes.data)
            ? fallbackRes.data
            : (fallbackRes.data.results ?? []);

          const hasBookingIdField = allOrders.some((o) => o.booking_id !== undefined);

          relevantOrders = allOrders.filter((o) => {
            if (o.payment_type   !== 'pay_checkout')      return false;
            if (o.payment_status !== 'unpaid')            return false;
            if (o.order_status   === 'cancelled')         return false;
            if (o.order_status   === 'awaiting_payment')  return false; // ← ghost orders
            if (hasBookingIdField) {
              return String(o.booking_id) === String(bookingData.id);
            }
            return true;
          });
        } catch {
          relevantOrders = [];
        }
      }

      setFoodOrders(relevantOrders);
    } catch (err) {
      setLoadError(
        err.response?.data?.detail || err.message || 'Failed to load checkout data.',
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Bill calculations ─────────────────────────────────────────────────────
  const bookingBalance = safeMoney(booking?.amount_due);
  const foodTotal      = foodOrders.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const grandTotal     = bookingBalance + foodTotal;

  // ── Confirm checkout ──────────────────────────────────────────────────────
  async function handleConfirmCheckout() {
    if (grandTotal > 0 && !selectedMethod) {
      setPayError('Select a payment method to collect the outstanding balance.');
      return;
    }
    setBusy(true);
    setPayError(null);

    try {
      // ── Step 1: Settle food orders FIRST ────────────────────────────────
      // We mark food orders paid before calling checkout so that if a food
      // mark-paid fails we can abort without having touched the booking status.
      const failedFoodIds = [];
      for (const order of foodOrders) {
        try {
          await api.patch(`/food/orders/${order.id}/mark-paid/`);
        } catch (err) {
          const statusCode = err.response?.status;
          if (statusCode === 404) {
            // Order no longer belongs to this booking context — log and skip.
            // This can happen if the order was already settled in another session.
            console.warn(
              `[Checkout] Food order #${order.id} returned 404 — skipping.`,
            );
          } else {
            failedFoodIds.push(order.id);
          }
        }
      }

      if (failedFoodIds.length > 0) {
        setPayError(
          `Could not settle food order${failedFoodIds.length > 1 ? 's' : ''} ` +
          `#${failedFoodIds.join(', #')}. Please retry or contact support.`,
        );
        setBusy(false);
        return;
      }

      // ── Step 2: Checkout + collect accommodation balance ─────────────────
      // StaffCheckoutAndCollectView (Option A) handles this atomically:
      //   • Creates BALANCE_PAYMENT Payment record if bookingBalance > 0
      //   • Calls payment.mark_paid() to generate receipt
      //   • Transitions CHECKED_IN → CHECKED_OUT
      //   • Creates ReviewToken + sends review email
      //
      // We always send payment_method — the backend ignores it when balance = 0.
      const checkoutNote = [
        note.trim(),
        foodTotal > 0 ? `Food & Drinks ${formatPHP(foodTotal)} settled at checkout.` : '',
      ].filter(Boolean).join(' ');

      const checkoutRes = await frontDeskBookingsApi.checkout(
        bookingId || booking?.id,
        checkoutNote,
        selectedMethod?.value || null,  // ← NEW: pass payment_method to backend
      );

      // Snapshot totals + receipt before any state can change
      setSuccessSnapshot({
        grandTotal,
        bookingBalance,
        foodTotal,
        foodOrderCount:  foodOrders.length,
        methodLabel:     selectedMethod?.label || null,
        receiptNumber:   checkoutRes?.checkout_summary?.receipt_number || null,
      });

      setStep(STEP.SUCCESS);
    } catch (err) {
      setPayError(
        err.response?.data?.detail ||
        err.response?.data?.error  ||
        err.message                ||
        'Checkout failed. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Loading / error guards ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fd-page">
        <div className="fd-inner" style={{ maxWidth: 760 }}>
          <div className="fd-loading">
            <div className="fd-spinner" />
            <p>Loading checkout…</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="fd-page">
        <div className="fd-inner" style={{ maxWidth: 760 }}>
          <div className="fd-notice fd-notice-error">
            <span className="fd-notice-icon">✕</span>
            <span>{loadError}</span>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk/today')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 760 }}>

        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Guest Checkout</h1>
            <p>Settle all charges and check out the guest</p>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk/today')}>
            ← Back
          </button>
        </div>

        {/* ════ STEP 1: BILL REVIEW ════ */}
        {step === STEP.BILL && booking && (
          <div>

            {/* Guest summary */}
            <div className="fd-card">
              <div className="fd-card-label">Guest &amp; Room</div>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', margin: 0 }}>
                {[
                  ['Guest',     booking.full_name],
                  ['Reference', booking.reference_number],
                  ['Room',      `Room ${booking.room_number}`],
                  ['Check-In',  formatDate(booking.check_in)],
                  ['Check-Out', formatDate(booking.check_out)],
                  ['Nights',    String(booking.nights ?? '—')],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{
                      fontSize: 10, letterSpacing: 1.5,
                      textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2,
                    }}>
                      {label}
                    </dt>
                    <dd style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', margin: 0 }}>
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Bill breakdown */}
            <div className="fd-card">
              <div className="fd-card-label">Final Bill</div>

              {/* Accommodation */}
              <p style={{
                fontSize: 10, letterSpacing: 1.5,
                textTransform: 'uppercase', color: 'var(--white-dim)', marginBottom: 8,
              }}>
                Accommodation
              </p>
              <div className="fd-price-box" style={{ marginBottom: 16 }}>
                <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="fd-price-label">Total booking amount</span>
                  <span className="fd-price-value">{formatPHP(booking.total_price)}</span>
                </div>
                <div className="fd-price-row">
                  <span className="fd-price-label">Already paid</span>
                  <span className="fd-price-value" style={{ color: 'var(--green)' }}>
                    −{formatPHP(booking.amount_paid)}
                  </span>
                </div>
                <div className="fd-price-row" style={{
                  borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4,
                }}>
                  <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                    Accommodation balance
                  </span>
                  <span className="fd-price-value" style={{
                    color: bookingBalance > 0 ? 'var(--amber)' : 'var(--green)',
                  }}>
                    {bookingBalance > 0 ? formatPHP(bookingBalance) : '✓ Settled'}
                  </span>
                </div>
              </div>

              {/* Food & Drinks */}
              <p style={{
                fontSize: 10, letterSpacing: 1.5,
                textTransform: 'uppercase', color: 'var(--white-dim)', marginBottom: 8,
              }}>
                Food &amp; Drinks (Pay at Checkout)
              </p>
              {foodOrders.length === 0 ? (
                <div className="fd-price-box" style={{ marginBottom: 16 }}>
                  <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <span className="fd-price-label" style={{ color: 'rgba(248,246,240,0.3)' }}>
                      No outstanding food charges
                    </span>
                    <span className="fd-price-value" style={{ color: 'var(--green)' }}>✓ None</span>
                  </div>
                </div>
              ) : (
                <div className="fd-price-box" style={{ marginBottom: 16 }}>
                  {foodOrders.map((o) => (
                    <div
                      key={o.id}
                      className="fd-price-row"
                      style={{ borderTop: 'none', paddingTop: 4 }}
                    >
                      <span className="fd-price-label">
                        {o.food_item_name} × {o.quantity}
                        <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.5 }}>#{o.id}</span>
                      </span>
                      <span className="fd-price-value">{formatPHP(o.total_price)}</span>
                    </div>
                  ))}
                  <div className="fd-price-row" style={{
                    borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4,
                  }}>
                    <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                      Food &amp; Drinks subtotal
                    </span>
                    <span className="fd-price-value" style={{ color: 'var(--amber)' }}>
                      {formatPHP(foodTotal)}
                    </span>
                  </div>
                </div>
              )}

              {/* Grand total */}
              <div className="fd-price-box" style={{
                background: 'var(--navy)', border: '1px solid var(--gold)',
              }}>
                <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="fd-price-label" style={{
                    fontWeight: 700, color: 'var(--white)', fontSize: 15,
                  }}>
                    Grand Total Due
                  </span>
                  <span className="fd-price-value gold" style={{ fontSize: 26 }}>
                    {grandTotal > 0 ? formatPHP(grandTotal) : '✓ Fully Settled'}
                  </span>
                </div>
              </div>

              {grandTotal === 0 && (
                <div className="fd-notice fd-notice-success" style={{ marginTop: 14 }}>
                  <span className="fd-notice-icon">✓</span>
                  <span>All charges are settled. You can proceed directly to checkout.</span>
                </div>
              )}
            </div>

            <button
              className="fd-btn fd-btn-primary fd-btn-full"
              style={{ padding: 14, fontSize: 12 }}
              onClick={() => setStep(STEP.PAYMENT)}
              disabled={!booking}
            >
              {grandTotal > 0 ? 'Proceed to Payment & Checkout →' : 'Confirm Checkout →'}
            </button>
          </div>
        )}

        {/* ════ STEP 2: PAYMENT & CHECKOUT ════ */}
        {step === STEP.PAYMENT && (
          <div>

            {/* Summary banner */}
            <div className="fd-card">
              <div className="fd-card-label">Checkout Summary</div>
              <div className="fd-notice fd-notice-blue" style={{ marginBottom: 0 }}>
                <span className="fd-notice-icon">ℹ</span>
                <div>
                  Checking out{' '}
                  <strong>{booking?.full_name}</strong> · Room{' '}
                  <strong>{booking?.room_number}</strong>
                  {grandTotal > 0
                    ? <> · Collect <strong>{formatPHP(grandTotal)}</strong> before confirming.</>
                    : <> · All charges settled — no payment needed.</>
                  }
                </div>
              </div>
            </div>

            <div className="fd-card">

              {/* ── Balance > 0 path ── */}
              {grandTotal > 0 && (
                <>
                  <div className="fd-card-label">Collect Outstanding Balance</div>

                  {payError && (
                    <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                      <span className="fd-notice-icon">✕</span>
                      <span>{payError}</span>
                    </div>
                  )}

                  {/* Breakdown */}
                  <div className="fd-price-box" style={{ marginBottom: 20 }}>
                    {bookingBalance > 0 && (
                      <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                        <span className="fd-price-label">Accommodation balance</span>
                        <span className="fd-price-value">{formatPHP(bookingBalance)}</span>
                      </div>
                    )}
                    {foodTotal > 0 && (
                      <div className="fd-price-row">
                        <span className="fd-price-label">
                          Food &amp; Drinks
                          <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.5 }}>
                            ({foodOrders.length} order{foodOrders.length !== 1 ? 's' : ''})
                          </span>
                        </span>
                        <span className="fd-price-value">{formatPHP(foodTotal)}</span>
                      </div>
                    )}
                    <div className="fd-price-row" style={{
                      borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4,
                    }}>
                      <span className="fd-price-label" style={{ fontWeight: 700, color: 'var(--white)' }}>
                        Total to Collect
                      </span>
                      <span className="fd-price-value gold" style={{ fontSize: 22 }}>
                        {formatPHP(grandTotal)}
                      </span>
                    </div>
                  </div>

                  {/* Payment method */}
                  <label className="fd-label" style={{ marginBottom: 12, display: 'block' }}>
                    Payment Method
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    {PAYMENT_METHODS.map((pm) => (
                      <button
                        key={pm.value}
                        type="button"
                        onClick={() => { setSelectedMethod(pm); setPayError(null); }}
                        style={{
                          background:    selectedMethod?.value === pm.value ? 'var(--gold-dim)' : 'var(--navy-mid)',
                          border:        `2px solid ${selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--gold-border)'}`,
                          color:         selectedMethod?.value === pm.value ? 'var(--gold)' : 'var(--white-dim)',
                          padding:       '20px 16px',
                          cursor:        'pointer',
                          display:       'flex',
                          flexDirection: 'column',
                          alignItems:    'center',
                          gap:           8,
                          fontFamily:    "'Raleway', sans-serif",
                          transition:    'all 0.18s',
                        }}
                      >
                        <span style={{ fontSize: 32 }}>{pm.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{pm.label}</span>
                        <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 400 }}>{pm.desc}</span>
                      </button>
                    ))}
                  </div>

                  {selectedMethod?.value === 'cash' && (
                    <div className="fd-notice fd-notice-amber" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon">💵</span>
                      <span style={{ fontSize: 12 }}>
                        Collect <strong>{formatPHP(grandTotal)}</strong> in cash, then click Confirm Checkout.
                      </span>
                    </div>
                  )}
                  {selectedMethod?.value === 'card' && (
                    <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon">💳</span>
                      <span style={{ fontSize: 12 }}>
                        Process <strong>{formatPHP(grandTotal)}</strong> on the POS terminal,
                        then click Confirm Checkout once approved.
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* ── Zero-balance path ── */}
              {grandTotal === 0 && (
                <>
                  <div className="fd-card-label">No Outstanding Balance</div>

                  {payError && (
                    <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                      <span className="fd-notice-icon">✕</span>
                      <span>{payError}</span>
                    </div>
                  )}

                  <div className="fd-notice fd-notice-success" style={{ marginBottom: 16 }}>
                    <span className="fd-notice-icon">✓</span>
                    <span>All charges have been settled. Confirm checkout to free the room.</span>
                  </div>

                  {foodOrders.length > 0 && (
                    <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                      <span className="fd-notice-icon">🍽</span>
                      <span style={{ fontSize: 12 }}>
                        {foodOrders.length} food order{foodOrders.length !== 1 ? 's' : ''} totalling{' '}
                        <strong>{formatPHP(foodTotal)}</strong> will be marked as paid on confirmation.
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Optional checkout note */}
              <div className="fd-form-group" style={{ marginBottom: 20, marginTop: grandTotal === 0 ? 4 : 0 }}>
                <label className="fd-label">
                  Checkout Note{' '}
                  <span style={{
                    color: 'var(--white-dim)', fontWeight: 400,
                    textTransform: 'none', letterSpacing: 0,
                  }}>
                    (optional)
                  </span>
                </label>
                <textarea
                  className="fd-textarea-lg"
                  rows={2}
                  placeholder="e.g. guest requested late checkout, room condition notes…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="fd-btn"
                  onClick={() => {
                    setPayError(null);        // clear error on back
                    setStep(STEP.BILL);
                  }}
                  disabled={busy}
                  style={{ flex: 1 }}
                >
                  ← Back to Bill
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px', fontSize: 11 }}
                  onClick={handleConfirmCheckout}
                  disabled={busy || (grandTotal > 0 && !selectedMethod)}
                >
                  {busy
                    ? <><span className="fd-spinner-sm" /> Processing Checkout…</>
                    : '✓ Confirm Guest Checkout'
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: SUCCESS ════ */}
        {step === STEP.SUCCESS && (
          <div className="fd-card">
            <div className="fd-success">
              <div
                className="fd-success-icon"
                style={{ background: 'var(--green-bg)', borderColor: 'var(--green-border)' }}
              >
                ✓
              </div>
              <h2 className="fd-success-title">Guest Checked Out</h2>
              <p className="fd-success-sub">
                <strong>{booking?.full_name}</strong> has been checked out from Room{' '}
                <strong>{booking?.room_number}</strong>. Room is now queued for cleaning.
              </p>

              <dl className="fd-success-creds">
                {[
                  ['Guest',     booking?.full_name],
                  ['Room',      `Room ${booking?.room_number}`],
                  ['Reference', booking?.reference_number],
                  ['Check-Out', new Date().toLocaleTimeString('en-PH', {
                    hour: '2-digit', minute: '2-digit',
                  })],
                  // Accommodation balance collected
                  ...(successSnapshot?.bookingBalance > 0
                    ? [[
                        'Accommodation',
                        `${formatPHP(successSnapshot.bookingBalance)} via ${successSnapshot.methodLabel}`,
                      ]]
                    : [['Accommodation', 'Fully Settled ✓']]
                  ),
                  // Food charges settled
                  ...(successSnapshot?.foodOrderCount > 0
                    ? [[
                        'Food Charges',
                        `${successSnapshot.foodOrderCount} order${
                          successSnapshot.foodOrderCount !== 1 ? 's' : ''
                        } · ${formatPHP(successSnapshot.foodTotal)}`,
                      ]]
                    : []
                  ),
                  // Grand total collected
                  ...(successSnapshot?.grandTotal > 0
                    ? [['Total Collected', formatPHP(successSnapshot.grandTotal)]]
                    : []
                  ),
                  // Receipt number (from backend checkout_summary)
                  ...(successSnapshot?.receiptNumber
                    ? [['Receipt', successSnapshot.receiptNumber]]
                    : []
                  ),
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={label === 'Reference' || label === 'Receipt' ? 'highlight' : ''}>
                      {value || '—'}
                    </dd>
                  </div>
                ))}
              </dl>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="fd-btn" onClick={() => window.print()}>
                  🖨 Print Receipt
                </button>
                <button
                  className="fd-btn fd-btn-primary"
                  onClick={() => navigate('/staff/front-desk/today')}
                >
                  Today's Schedule
                </button>
                <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>
                  Front Desk
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}