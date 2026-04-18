/**
 * src/features/staff/frontdesk/BookingExtensionPage.jsx
 *
 * Revised — matches FrontDeskDashboard light theme.
 * - DM Sans / DM Serif Display, fd- CSS tokens
 * - Lucide icons only — no emoji
 * - No top strip lines
 * - Payment method selection + confirmation in a modal
 * - Search results open in a modal
 * - Real-time: search fires on Enter or button click, state kept live
 *
 * Flow:
 *   Step 1 — SEARCH:  Finds checked-in bookings via modal result list
 *   Step 2 — EXTEND:  Selects new check-out, previews charges
 *   Step 3 — PAYMENT: Modal collects payment method + confirms
 *   Step 4 — SUCCESS: Confirmation card with receipt details
 *
 * Route: /staff/front-desk/extend
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search, X, CalendarRange, CreditCard, Banknote,
  CheckCircle2, AlertCircle, Info, Printer, Plus,
  CalendarDays, BedDouble, User, Clock,
} from 'lucide-react';
import api from '../../../services/api';
import { formatPHP, todayISO } from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STEP = { SEARCH: 'search', EXTEND: 'extend', SUCCESS: 'success' };

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash',       Icon: Banknote,    desc: 'Collect at desk'  },
  { value: 'card', label: 'Card (POS)', Icon: CreditCard,  desc: 'POS terminal'     },
];

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

function fmtDate(iso, opts = { month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', opts);
}

// ── Search Results Modal ──────────────────────────────────────────────────────
function SearchModal({ results, onSelect, onClose }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 560,
        maxHeight: '80vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(1,0,13,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid #F2F3F7', background: '#F2F3F7',
        }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 400, color: '#01000D' }}>
            Active Bookings Found
          </span>
          <button
            onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 7, background: '#E4E6ED', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#01000D' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Result list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 22px',
                borderBottom: '1px solid #F2F3F7',
                transition: 'background 0.15s',
                cursor: 'default',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#F2F3F7'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(1,0,13,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#01000D', flexShrink: 0 }}>
                  <User size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#01000D', marginBottom: 2 }}>{b.full_name}</div>
                  <div style={{ fontSize: 11, color: '#7A7987' }}>{b.reference_number}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#01000D' }}>Room {b.room_number}</div>
                  <div style={{ fontSize: 11, color: '#7A7987' }}>{b.room_type}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#7A7987', marginBottom: 1 }}>Check-out</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#B45309' }}>
                    {fmtDate(b.check_out, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <button
                  className="fd-btn fd-btn-primary"
                  style={{ padding: '7px 16px', fontSize: 11 }}
                  onClick={() => onSelect(b)}
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #F2F3F7', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="fd-btn" onClick={onClose} style={{ padding: '9px 16px', fontSize: 12 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ booking, previewData, newCheckOut, onConfirm, onClose, busy, error }) {
  const [selected, setSelected] = useState(null);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 480,
        overflow: 'hidden',
        boxShadow: '0 8px 40px rgba(1,0,13,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px 16px',
          borderBottom: '1px solid #F2F3F7', background: '#F2F3F7',
        }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, fontWeight: 400, color: '#01000D' }}>
            Collect Payment
          </span>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ width: 28, height: 28, borderRadius: 7, background: '#E4E6ED', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#01000D', opacity: busy ? 0.4 : 1 }}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          {/* Summary strip */}
          <div className="fd-notice fd-notice-blue" style={{ marginBottom: 20 }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12 }}>
              <strong>{booking.full_name}</strong> · Room {booking.room_number} &middot; {previewData.addedNights} night{previewData.addedNights !== 1 ? 's' : ''} &middot; New check-out: <strong>{fmtDate(newCheckOut, { month: 'short', day: 'numeric', year: 'numeric' })}</strong>
            </div>
          </div>

          {/* Amount */}
          <div className="fd-price-box" style={{ marginBottom: 20 }}>
            <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
              <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--fd-text)' }}>Amount to Collect</span>
              <span className="fd-price-value gold" style={{ fontSize: 24 }}>{formatPHP(previewData.addedTotal)}</span>
            </div>
            <div className="fd-price-row">
              <span className="fd-price-label" style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>Final amount confirmed by server</span>
            </div>
          </div>

          {error && (
            <div className="fd-notice fd-notice-error" style={{ marginBottom: 16 }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Payment method */}
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--fd-text-muted)', marginBottom: 12 }}>
            Payment Method
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {PAYMENT_METHODS.map((pm) => {
              const isSelected = selected?.value === pm.value;
              return (
                <button
                  key={pm.value}
                  onClick={() => setSelected(pm)}
                  style={{
                    background:    isSelected ? 'var(--fd-accent-lt)' : 'var(--fd-surface-2)',
                    border:        `2px solid ${isSelected ? 'var(--fd-accent)' : 'transparent'}`,
                    borderRadius:  'var(--fd-radius-md)',
                    padding:       '18px 14px',
                    cursor:        'pointer',
                    display:       'flex',
                    flexDirection: 'column',
                    alignItems:    'center',
                    gap:           8,
                    fontFamily:    "'DM Sans', sans-serif",
                    transition:    'all 0.15s',
                  }}
                >
                  <pm.Icon size={26} style={{ color: isSelected ? 'var(--fd-text)' : 'var(--fd-text-muted)' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--fd-text)' : 'var(--fd-text-muted)' }}>{pm.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>{pm.desc}</span>
                </button>
              );
            })}
          </div>

          {selected?.value === 'cash' && (
            <div className="fd-notice fd-notice-amber" style={{ marginBottom: 0 }}>
              <Banknote size={14} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>Collect <strong>{formatPHP(previewData.addedTotal)}</strong> in cash, then click Confirm.</span>
            </div>
          )}
          {selected?.value === 'card' && (
            <div className="fd-notice fd-notice-blue" style={{ marginBottom: 0 }}>
              <CreditCard size={14} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12 }}>Process <strong>{formatPHP(previewData.addedTotal)}</strong> on the POS terminal, then click Confirm.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0 22px 20px', display: 'flex', gap: 10 }}>
          <button className="fd-btn" onClick={onClose} disabled={busy} style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            className="fd-btn fd-btn-primary"
            style={{ flex: 2 }}
            onClick={() => onConfirm(selected)}
            disabled={busy || !selected}
          >
            {busy
              ? <><span className="fd-spinner-sm" /> Processing…</>
              : `Confirm${selected ? ` ${selected.label}` : ''} Payment`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookingExtensionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const today    = todayISO();

  const [step, setStep] = useState(STEP.SEARCH);

  // Search
  const [query,           setQuery]           = useState('');
  const [searchResults,   setSearchResults]   = useState([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [searchError,     setSearchError]     = useState(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // Extend
  const [newCheckOut, setNewCheckOut] = useState('');
  const [extendError, setExtendError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payBusy,      setPayBusy]      = useState(false);
  const [payError,     setPayError]     = useState(null);

  // Success
  const [confirmed,       setConfirmed]       = useState(null);
  const [confirmedMethod, setConfirmedMethod] = useState(null);

  // Auto-load booking from state if navigated from CurrentCheckInsPage
  useEffect(() => {
    if (location.state?.bookingId) {
      const loadBooking = async () => {
        try {
          const res = await api.get(`/bookings/admin/${location.state.bookingId}/`);
          if (res.data) {
            setSelectedBooking(res.data);
            setStep(STEP.EXTEND);
          }
        } catch (err) {
          setSearchError('Failed to load booking details.');
        }
      };
      loadBooking();
    }
  }, [location.state?.bookingId]);

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) { setSearchError('Enter a booking ID, room number, or guest name.'); return; }

    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const res = await api.get('/bookings/admin/', {
        params: { search: q, status: 'checked_in' },
      });
      const results = Array.isArray(res.data) ? res.data : (res.data.results ?? []);
      if (results.length === 0) {
        setSearchError('No checked-in bookings found matching that search.');
      } else {
        setSearchResults(results);
        setShowSearchModal(true);
      }
    } catch (err) {
      setSearchError(err.response?.data?.detail || err.message || 'Search failed.');
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  function selectBooking(b) {
    setSelectedBooking(b);
    setShowSearchModal(false);
    const next = new Date(b.check_out + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    setNewCheckOut(next.toISOString().split('T')[0]);
    setStep(STEP.EXTEND);
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  function computePreview() {
    if (!selectedBooking || !newCheckOut) return null;
    const addedNights = nightsBetween(selectedBooking.check_out, newCheckOut);
    if (addedNights <= 0) return null;

    const ratePerNight  = parseFloat(selectedBooking.room_price_snapshot || 0);
    const addedSubtotal = ratePerNight * addedNights;
    const addedTax      = addedSubtotal * 0.12;
    const addedFee      = addedSubtotal * 0.05;
    const addedTotal    = addedSubtotal + addedTax + addedFee;
    const totalNights   = nightsBetween(selectedBooking.check_in, newCheckOut);

    return { totalNights, addedNights, addedSubtotal, addedTax, addedFee, addedTotal, newCheckOut };
  }

  function handleProceedToPayment() {
    setExtendError(null);
    if (!newCheckOut) { setExtendError('Select a new check-out date.'); return; }
    if (newCheckOut <= selectedBooking.check_out) {
      setExtendError('New check-out must be after the current check-out date.');
      return;
    }
    const preview = computePreview();
    if (!preview) { setExtendError('Invalid extension dates.'); return; }
    setPreviewData(preview);
    setPayError(null);
    setShowPayModal(true);
  }

  // ── Confirm extension ──────────────────────────────────────────────────────
  async function handleConfirmExtension(method) {
    if (!method) { setPayError('Select a payment method.'); return; }
    setPayBusy(true);
    setPayError(null);

    try {
      const res = await api.post(`/bookings/admin/${selectedBooking.id}/extend/`, {
        new_check_out:  newCheckOut,
        payment_method: method.value,
        note:           `Extension collected at front desk via ${method.label}.`,
      });
      setConfirmed(res.data);
      setConfirmedMethod(method);
      setShowPayModal(false);
      setStep(STEP.SUCCESS);
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' · ');
        setPayError(msgs);
      } else {
        setPayError(d?.error || d?.detail || err.message || 'Extension failed. Please try again.');
      }
    } finally {
      setPayBusy(false);
    }
  }

  function reset() {
    setStep(STEP.SEARCH);
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setSelectedBooking(null);
    setNewCheckOut('');
    setExtendError(null);
    setPreviewData(null);
    setShowPayModal(false);
    setPayBusy(false);
    setPayError(null);
    setConfirmed(null);
    setConfirmedMethod(null);
  }

  const preview = step === STEP.EXTEND ? computePreview() : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 720 }}>

        {/* Page header */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Extend Stay</h1>
            <p>Extend an active booking &middot; Cash &amp; card only</p>
          </div>
        </div>

        {/* ════ STEP 1: SEARCH ════ */}
        {step === STEP.SEARCH && (
          <div className="fd-card">
            <div className="fd-card-label">Find Active Booking</div>
            <p style={{ fontSize: 12, color: 'var(--fd-text-muted)', marginBottom: 18, marginTop: -8 }}>
              Search by booking ID, room number, or guest name.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: searchError ? 14 : 0 }}>
              <input
                className="fd-input-lg"
                style={{ flex: 1 }}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                placeholder="CMH-2026-000124 &nbsp;·&nbsp; Room 101 &nbsp;·&nbsp; Juan dela Cruz"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
              <button
                className="fd-btn fd-btn-primary"
                onClick={handleSearch}
                disabled={searchLoading}
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 7 }}
              >
                {searchLoading
                  ? <><span className="fd-spinner-sm" /> Searching…</>
                  : <><Search size={14} /> Search</>
                }
              </button>
            </div>

            {searchError && (
              <div className="fd-notice fd-notice-amber" style={{ marginTop: 0 }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{searchError}</span>
              </div>
            )}
          </div>
        )}

        {/* ════ STEP 2: EXTEND ════ */}
        {step === STEP.EXTEND && selectedBooking && (
          <div>
            {/* Booking summary card */}
            <div className="fd-card">
              <div className="fd-card-label">Active Booking</div>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', margin: 0 }}>
                {[
                  [<User size={12} />,        'Guest',            selectedBooking.full_name],
                  [<CalendarRange size={12} />,'Reference',        selectedBooking.reference_number],
                  [<BedDouble size={12} />,    'Room',             `Room ${selectedBooking.room_number}`],
                  [<Clock size={12} />,        'Current Check-Out', fmtDate(selectedBooking.check_out)],
                ].map(([icon, label, value]) => (
                  <div key={label}>
                    <dt style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                      {icon}{label}
                    </dt>
                    <dd style={{ fontSize: 14, fontWeight: 600, color: 'var(--fd-text)', margin: 0 }}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Date selector card */}
            <div className="fd-card">
              <div className="fd-card-label">New Check-Out Date</div>

              {extendError && (
                <div className="fd-notice fd-notice-error" style={{ marginBottom: 16 }}>
                  <AlertCircle size={14} style={{ flexShrink: 0 }} />
                  <span>{extendError}</span>
                </div>
              )}

              <div className="fd-form-group">
                <label className="fd-label fd-label-req">Extend To</label>
                <input
                  type="date"
                  className="fd-input-lg"
                  value={newCheckOut}
                  min={(() => {
                    const d = new Date(selectedBooking.check_out + 'T00:00:00');
                    d.setDate(d.getDate() + 1);
                    return d.toISOString().split('T')[0];
                  })()}
                  onChange={(e) => { setNewCheckOut(e.target.value); setExtendError(null); }}
                />
              </div>

              {/* Quick select */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 8 }}>
                  Quick Select
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    { label: '+1 Night', days: 1 },
                    { label: '+2 Nights', days: 2 },
                    { label: '+3 Nights', days: 3 },
                    { label: '+1 Week',   days: 7 },
                  ].map(({ label, days }) => {
                    const d = new Date(selectedBooking.check_out + 'T00:00:00');
                    d.setDate(d.getDate() + days);
                    const val = d.toISOString().split('T')[0];
                    const isActive = newCheckOut === val;
                    return (
                      <button
                        key={label}
                        className={`fd-btn${isActive ? ' fd-btn-primary' : ''}`}
                        style={{ padding: '7px 14px', fontSize: 11 }}
                        onClick={() => { setNewCheckOut(val); setExtendError(null); }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Charge preview */}
              {preview && (
                <div className="fd-price-box" style={{ marginBottom: 20 }}>
                  <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <span className="fd-price-label">Extension nights</span>
                    <span className="fd-price-value">{preview.addedNights} night{preview.addedNights !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="fd-price-row">
                    <span className="fd-price-label">Rate &times; nights</span>
                    <span className="fd-price-value">{formatPHP(preview.addedSubtotal)}</span>
                  </div>
                  <div className="fd-price-row">
                    <span className="fd-price-label">Tax (12%)</span>
                    <span className="fd-price-value">{formatPHP(preview.addedTax)}</span>
                  </div>
                  <div className="fd-price-row">
                    <span className="fd-price-label">Service Fee (5%)</span>
                    <span className="fd-price-value">{formatPHP(preview.addedFee)}</span>
                  </div>
                  <div className="fd-price-row" style={{ borderTop: '1px solid var(--fd-surface-3)', paddingTop: 10, marginTop: 4 }}>
                    <span className="fd-price-label" style={{ fontWeight: 700, color: 'var(--fd-text)' }}>Additional Charge</span>
                    <span className="fd-price-value gold" style={{ fontSize: 22 }}>{formatPHP(preview.addedTotal)}</span>
                  </div>
                  <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 4 }}>
                    <span className="fd-price-label" style={{ fontSize: 11, color: 'var(--fd-text-faint)' }}>New check-out</span>
                    <span className="fd-price-value" style={{ fontSize: 12, color: 'var(--fd-amber)' }}>
                      {fmtDate(newCheckOut)}
                    </span>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="fd-btn"
                  style={{ flex: 1 }}
                  onClick={() => { setStep(STEP.SEARCH); setExtendError(null); }}
                >
                  Change Booking
                </button>
                <button
                  className="fd-btn fd-btn-primary"
                  style={{ flex: 2 }}
                  onClick={handleProceedToPayment}
                  disabled={!newCheckOut || newCheckOut <= selectedBooking.check_out}
                >
                  Proceed to Payment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 4: SUCCESS ════ */}
        {step === STEP.SUCCESS && confirmed && (
          <div className="fd-card">
            <div className="fd-success">
              <div className="fd-success-icon" style={{ background: 'var(--fd-green-bg)', color: '#0D9488' }}>
                <CheckCircle2 size={28} />
              </div>
              <h2 className="fd-success-title">Stay Extended</h2>
              <p className="fd-success-sub">
                <strong>{confirmed.full_name}</strong>'s stay in Room <strong>{confirmed.room_number}</strong> has been extended.
              </p>

              <dl className="fd-success-creds">
                {[
                  ['Guest',           confirmed.full_name],
                  ['Room',            `Room ${confirmed.room_number}`],
                  ['Reference',       confirmed.reference_number],
                  ['New Check-Out',   fmtDate(confirmed.check_out)],
                  ['Total Nights',    `${confirmed.nights} night${confirmed.nights !== 1 ? 's' : ''}`],
                  ['Additional Paid', confirmed.extension_summary?.additional_charge
                    ? formatPHP(confirmed.extension_summary.additional_charge)
                    : '—'],
                  ['Receipt',         confirmed.extension_summary?.receipt_number || '—'],
                  ['Method',          confirmedMethod?.label || '—'],
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={label === 'Reference' || label === 'Receipt' ? 'highlight' : ''}>{value || '—'}</dd>
                  </div>
                ))}
              </dl>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="fd-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => window.print()}
                >
                  <Printer size={14} /> Print Receipt
                </button>
                <button
                  className="fd-btn fd-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={reset}
                >
                  <Plus size={14} /> New Extension
                </button>
                <button
                  className="fd-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => navigate('/staff/front-desk')}
                >
                  <CalendarDays size={14} /> Front Desk
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── Search Results Modal ─────────────────────────────────────────────── */}
      {showSearchModal && (
        <SearchModal
          results={searchResults}
          onSelect={selectBooking}
          onClose={() => setShowSearchModal(false)}
        />
      )}

      {/* ── Payment Modal ────────────────────────────────────────────────────── */}
      {showPayModal && previewData && selectedBooking && (
        <PaymentModal
          booking={selectedBooking}
          previewData={previewData}
          newCheckOut={newCheckOut}
          onConfirm={handleConfirmExtension}
          onClose={() => { if (!payBusy) setShowPayModal(false); }}
          busy={payBusy}
          error={payError}
        />
      )}
    </div>
  );
}