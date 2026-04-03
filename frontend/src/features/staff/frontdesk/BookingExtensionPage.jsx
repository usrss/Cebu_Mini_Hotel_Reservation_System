/**
 * src/features/staff/frontdesk/BookingExtensionPage.jsx
 *
 * Staff extends an active (CHECKED_IN) booking.
 * No guest account required.
 *
 * Flow:
 *   Step 1 — SEARCH:   Staff locates booking by booking ID, room number, or guest name
 *   Step 2 — EXTEND:   Staff selects new check-out date, sees additional charge
 *   Step 3 — PAYMENT:  Cash or card collected at desk
 *   Step 4 — SUCCESS:  Extension confirmed, booking dates updated
 *
 * Backend calls:
 *   GET  /bookings/admin/?search=<query>&status=checked_in  → search active bookings
 *   POST /bookings/admin/<pk>/extend/                       → StaffExtendBookingView
 *
 * Route: /staff/front-desk/extend
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { formatPHP, todayISO } from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

const STEP = { SEARCH: 'search', EXTEND: 'extend', PAYMENT: 'payment', SUCCESS: 'success' };

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash',      icon: '💵', desc: 'Collect at desk' },
  { value: 'card', label: 'Card (POS)', icon: '💳', desc: 'POS terminal'  },
];

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

export default function BookingExtensionPage() {
  const navigate = useNavigate();
  const today    = todayISO();

  const [step, setStep] = useState(STEP.SEARCH);

  // ── Step 1: Search ─────────────────────────────────────────────────────────
  const [query,         setQuery]         = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // ── Step 2: Extension form ─────────────────────────────────────────────────
  const [newCheckOut,   setNewCheckOut]   = useState('');
  const [extendError,   setExtendError]   = useState(null);
  const [previewData,   setPreviewData]   = useState(null); // computed before payment

  // ── Step 3: Payment ────────────────────────────────────────────────────────
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payBusy,        setPayBusy]        = useState(false);
  const [payError,       setPayError]       = useState(null);

  // ── Step 4: Success ────────────────────────────────────────────────────────
  const [confirmed, setConfirmed] = useState(null);

  // ── Search active bookings ─────────────────────────────────────────────────
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
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No checked-in bookings found matching that search.');
      }
    } catch (err) {
      setSearchError(err.response?.data?.detail || err.message || 'Search failed.');
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  function selectBooking(b) {
    setSelectedBooking(b);
    // Default new check-out to +1 day from current check-out
    const next = new Date(b.check_out + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    setNewCheckOut(next.toISOString().split('T')[0]);
    setStep(STEP.EXTEND);
  }

  // ── Preview extension charge ───────────────────────────────────────────────
  function computePreview() {
    if (!selectedBooking || !newCheckOut) return null;
    const totalNights   = nightsBetween(selectedBooking.check_in, newCheckOut);
    const addedNights   = nightsBetween(selectedBooking.check_out, newCheckOut);
    if (addedNights <= 0) return null;

    // Use same pricing logic as backend — approximate on frontend for preview only
    // The backend always computes the authoritative amount
    const ratePerNight  = parseFloat(selectedBooking.room_price_snapshot || 0);
    const addedSubtotal = ratePerNight * addedNights;
    const addedTax      = addedSubtotal * 0.12;
    const addedFee      = addedSubtotal * 0.05;
    const addedTotal    = addedSubtotal + addedTax + addedFee;

    return {
      totalNights,
      addedNights,
      addedSubtotal,
      addedTax,
      addedFee,
      addedTotal,
      newCheckOut,
    };
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
    setStep(STEP.PAYMENT);
  }

  // ── Confirm extension + payment ────────────────────────────────────────────
  async function handleConfirmExtension() {
    if (!selectedMethod) { setPayError('Select a payment method.'); return; }
    setPayBusy(true);
    setPayError(null);

    try {
      const res = await api.post(`/bookings/admin/${selectedBooking.id}/extend/`, {
        new_check_out:  newCheckOut,
        payment_method: selectedMethod.value,
        note:           `Extension collected at front desk via ${selectedMethod.label}.`,
      });

      setConfirmed(res.data);
      setStep(STEP.SUCCESS);
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join(' · ');
        setPayError(msgs);
      } else {
        setPayError(
          d?.error || d?.detail || err.message || 'Extension failed. Please try again.',
        );
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
    setSelectedMethod(null);
    setPayError(null);
    setConfirmed(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fd-page">
      <div className="fd-inner" style={{ maxWidth: 760 }}>

        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Extend Stay</h1>
            <p>Extend an active booking · Cash & card only</p>
          </div>
          <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>← Back</button>
        </div>

        {/* ════ STEP 1: SEARCH ════ */}
        {step === STEP.SEARCH && (
          <div className="fd-card">
            <div className="fd-card-label">Find Active Booking</div>
            <p style={{ fontSize: 12, color: 'var(--white-dim)', marginBottom: 16, marginTop: -8 }}>
              Search by booking ID, room number, or guest name.
            </p>

            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <input
                className="fd-input-lg"
                style={{ flex: 1 }}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchError(null); }}
                placeholder="e.g. CMH-2026-000124 · Room 101 · Juan dela Cruz"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
              <button
                className="fd-btn fd-btn-primary"
                onClick={handleSearch}
                disabled={searchLoading}
                style={{ whiteSpace: 'nowrap' }}
              >
                {searchLoading ? <><span className="fd-spinner-sm" /> Searching…</> : '🔍 Search'}
              </button>
            </div>

            {searchError && (
              <div className="fd-notice fd-notice-amber">
                <span className="fd-notice-icon">⚠</span>
                <span>{searchError}</span>
              </div>
            )}

            {searchResults.length > 0 && (
              <div className="fd-table-wrap" style={{ marginTop: 12 }}>
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th>Guest</th>
                      <th>Room</th>
                      <th>Check-In</th>
                      <th>Check-Out</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((b) => (
                      <tr key={b.id}>
                        <td>
                          <div className="fd-table-name">{b.full_name}</div>
                          <div className="fd-table-sub">{b.reference_number}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--white)' }}>Room {b.room_number}</div>
                          <div className="fd-table-sub">{b.room_type}</div>
                        </td>
                        <td>{new Date(b.check_in + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                        <td style={{ color: 'var(--amber)', fontWeight: 600 }}>
                          {new Date(b.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td>
                          <button
                            className="fd-btn fd-btn-primary"
                            style={{ padding: '6px 14px', fontSize: 10 }}
                            onClick={() => selectBooking(b)}
                          >
                            Extend →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════ STEP 2: EXTENSION FORM ════ */}
        {step === STEP.EXTEND && selectedBooking && (
          <div>
            <div className="fd-card">
              <div className="fd-card-label">Active Booking</div>
              <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', margin: 0 }}>
                {[
                  ['Guest',         selectedBooking.full_name],
                  ['Reference',     selectedBooking.reference_number],
                  ['Room',          `Room ${selectedBooking.room_number}`],
                  ['Current Check-Out', new Date(selectedBooking.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--gold)', marginBottom: 2 }}>{label}</dt>
                    <dd style={{ fontSize: 14, fontWeight: 600, color: 'var(--white)', margin: 0 }}>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="fd-card">
              <div className="fd-card-label">New Check-Out Date</div>

              {extendError && (
                <div className="fd-notice fd-notice-error" style={{ marginBottom: 14 }}>
                  <span className="fd-notice-icon">✕</span>
                  <span>{extendError}</span>
                </div>
              )}

              <div className="fd-form-group">
                <label className="fd-label fd-label-req">Extend To</label>
                <input
                  type="date"
                  className="fd-input-lg"
                  value={newCheckOut}
                  min={
                    // One day after current check-out
                    (() => {
                      const d = new Date(selectedBooking.check_out + 'T00:00:00');
                      d.setDate(d.getDate() + 1);
                      return d.toISOString().split('T')[0];
                    })()
                  }
                  onChange={(e) => { setNewCheckOut(e.target.value); setExtendError(null); }}
                />
              </div>

              {/* Quick duration buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--white-dim)', width: '100%', margin: '0 0 6px' }}>
                  Quick Select
                </p>
                {[
                  { label: '+1 Night', days: 1 },
                  { label: '+2 Nights', days: 2 },
                  { label: '+3 Nights', days: 3 },
                  { label: '+1 Week', days: 7 },
                ].map(({ label, days }) => {
                  const d = new Date(selectedBooking.check_out + 'T00:00:00');
                  d.setDate(d.getDate() + days);
                  const val = d.toISOString().split('T')[0];
                  return (
                    <button
                      key={label}
                      className={`fd-btn${newCheckOut === val ? ' fd-btn-primary' : ''}`}
                      style={{ padding: '7px 14px', fontSize: 10 }}
                      onClick={() => { setNewCheckOut(val); setExtendError(null); }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Charge preview */}
              {(() => {
                const preview = computePreview();
                if (!preview) return null;
                return (
                  <div className="fd-price-box" style={{ marginBottom: 16 }}>
                    <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                      <span className="fd-price-label">Extension nights</span>
                      <span className="fd-price-value">{preview.addedNights} night{preview.addedNights !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="fd-price-row">
                      <span className="fd-price-label">Rate × nights</span>
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
                    <div className="fd-price-row" style={{ borderTop: '1px solid var(--gold-border)', paddingTop: 8, marginTop: 4 }}>
                      <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                        Additional Charge
                      </span>
                      <span className="fd-price-value gold" style={{ fontSize: 20 }}>
                        {formatPHP(preview.addedTotal)}
                      </span>
                    </div>
                    <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 4 }}>
                      <span className="fd-price-label" style={{ color: 'var(--white-dim)', fontSize: 11 }}>
                        New check-out
                      </span>
                      <span className="fd-price-value" style={{ fontSize: 12, color: 'var(--amber)' }}>
                        {new Date(newCheckOut + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fd-btn" onClick={() => setStep(STEP.SEARCH)} style={{ flex: 1 }}>
                  ← Back
                </button>
                <button
                  className="fd-btn fd-btn-primary"
                  style={{ flex: 2 }}
                  onClick={handleProceedToPayment}
                  disabled={!newCheckOut || newCheckOut <= selectedBooking.check_out}
                >
                  Proceed to Payment →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 3: PAYMENT ════ */}
        {step === STEP.PAYMENT && previewData && (
          <div>
            <div className="fd-card">
              <div className="fd-card-label">Extension Summary</div>
              <div className="fd-notice fd-notice-blue" style={{ marginBottom: 0 }}>
                <span className="fd-notice-icon">ℹ</span>
                <div>
                  <strong>{selectedBooking.full_name}</strong> · Room {selectedBooking.room_number} ·
                  Extending {previewData.addedNights} night{previewData.addedNights !== 1 ? 's' : ''} →
                  New check-out:{' '}
                  <strong>
                    {new Date(newCheckOut + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </strong>
                </div>
              </div>
            </div>

            <div className="fd-card">
              <div className="fd-card-label">Collect Additional Payment</div>

              {payError && (
                <div className="fd-notice fd-notice-error" style={{ marginBottom: 18 }}>
                  <span className="fd-notice-icon">✕</span>
                  <span>{payError}</span>
                </div>
              )}

              <div className="fd-price-box" style={{ marginBottom: 20 }}>
                <div className="fd-price-row" style={{ borderTop: 'none', paddingTop: 0 }}>
                  <span className="fd-price-label" style={{ fontWeight: 600, color: 'var(--white)' }}>
                    Amount to Collect
                  </span>
                  <span className="fd-price-value gold" style={{ fontSize: 24 }}>
                    {formatPHP(previewData.addedTotal)}
                  </span>
                </div>
                <div className="fd-price-row">
                  <span className="fd-price-label" style={{ fontSize: 11, color: 'rgba(248,246,240,0.35)' }}>
                    Final amount confirmed by server
                  </span>
                </div>
              </div>

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
                    Collect <strong>~{formatPHP(previewData.addedTotal)}</strong> in cash, then click Confirm.
                  </span>
                </div>
              )}
              {selectedMethod?.value === 'card' && (
                <div className="fd-notice fd-notice-blue" style={{ marginBottom: 16 }}>
                  <span className="fd-notice-icon">💳</span>
                  <span style={{ fontSize: 12 }}>
                    Process <strong>~{formatPHP(previewData.addedTotal)}</strong> on the POS terminal, then click Confirm once approved.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="fd-btn" onClick={() => setStep(STEP.EXTEND)} disabled={payBusy} style={{ flex: 1 }}>
                  ← Back
                </button>
                <button
                  className="fd-btn fd-btn-success"
                  style={{ flex: 2, padding: '13px' }}
                  onClick={handleConfirmExtension}
                  disabled={payBusy || !selectedMethod}
                >
                  {payBusy
                    ? <><span className="fd-spinner-sm" /> Processing…</>
                    : `✓ Confirm Extension & ${selectedMethod?.label || ''} Payment`
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════ STEP 4: SUCCESS ════ */}
        {step === STEP.SUCCESS && confirmed && (
          <div className="fd-card">
            <div className="fd-success">
              <div className="fd-success-icon">✓</div>
              <h2 className="fd-success-title">Stay Extended</h2>
              <p className="fd-success-sub">
                <strong>{confirmed.full_name}</strong>'s stay in Room{' '}
                <strong>{confirmed.room_number}</strong> has been extended.
              </p>

              <dl className="fd-success-creds">
                {[
                  ['Guest',            confirmed.full_name],
                  ['Room',             `Room ${confirmed.room_number}`],
                  ['Reference',        confirmed.reference_number],
                  ['New Check-Out',    new Date(confirmed.check_out + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })],
                  ['Total Nights',     `${confirmed.nights} night${confirmed.nights !== 1 ? 's' : ''}`],
                  ['Additional Paid',  confirmed.extension_summary?.additional_charge
                    ? formatPHP(confirmed.extension_summary.additional_charge)
                    : '—'],
                  ['Receipt',          confirmed.extension_summary?.receipt_number || '—'],
                  ['Method',           selectedMethod?.label || '—'],
                ].map(([label, value]) => (
                  <div className="fd-cred-item" key={label}>
                    <dt>{label}</dt>
                    <dd className={label === 'Reference' ? 'highlight' : ''}>{value || '—'}</dd>
                  </div>
                ))}
              </dl>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="fd-btn" onClick={() => window.print()}>🖨 Print Receipt</button>
                <button className="fd-btn fd-btn-primary" onClick={reset}>+ New Extension</button>
                <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>Front Desk →</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}