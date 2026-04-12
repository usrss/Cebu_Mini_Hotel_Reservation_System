/**
 * TodayArrivalsPage.jsx
 *
 * ISSUES FIXED
 * ─────────────────────────────────────────────────────────────────
 * 1. Arrivals query used status=confirmed only.
 *    A booking that was confirmed yesterday but not yet checked in
 *    still appears today — the filter is correct.  But once staff
 *    manually check someone in early it shows status=checked_in and
 *    disappears from the arrivals list.  Fixed by showing both
 *    confirmed AND checked_in arrivals, with clear visual distinction.
 *
 * 2. Departures tab lived inside this page but shared the same table
 *    header and state.  Checkout is a full multi-step flow (bill →
 *    payment → success) so it correctly navigates to GuestCheckoutPage.
 *    The departure list itself is fine staying here — it's just a
 *    list of who is leaving today.  Kept but clarified.
 *
 * 3. No overdue indicator.  Confirmed bookings whose check_in is
 *    today but time is past noon with no check-in action are now
 *    highlighted amber as "overdue".
 *
 * 4. Late checkout not surfaced.  Guests with check_out = yesterday
 *    who are still checked_in are not shown here (they'd need a
 *    separate "overdue checkout" query — added as a third tab).
 *
 * 5. Summary cards showed arrivals.length which included already-
 *    checked-in guests, so "pending" count was inaccurate.
 *    Now the "pending" sub-label is confirmed count only.
 *
 * 6. Auto-refresh timer was created in a separate useEffect that
 *    depended on `load` but load itself depended on `today` which
 *    never changes — this was fine but confusing.  Merged into one
 *    effect for clarity.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  frontDeskBookingsApi,
  todayISO,
  formatPHP,
  formatDate,
} from './services/frontDeskApi';
import api from '../../../services/api';
import './FrontDesk.css';
import '../Staff.css';

// ── Badge helpers ─────────────────────────────────────────────────────────────

function bookingStatusBadge(status) {
  const map = {
    confirmed:   { cls: 'fd-badge-gold',  label: 'Confirmed'   },
    checked_in:  { cls: 'fd-badge-green', label: 'Checked In'  },
    checked_out: { cls: 'fd-badge-blue',  label: 'Checked Out' },
    cancelled:   { cls: 'fd-badge-red',   label: 'Cancelled'   },
  };
  return map[status] || { cls: 'fd-badge-muted', label: status };
}

function paymentBadge(status) {
  if (status === 'paid')               return { cls: 'fd-badge-green', label: 'Fully Paid' };
  if (status === 'partially_refunded') return { cls: 'fd-badge-amber', label: 'Partial'    };
  if (status === 'unpaid')             return { cls: 'fd-badge-red',   label: 'Unpaid'     };
  return { cls: 'fd-badge-muted', label: status };
}

// ── Arrival row ───────────────────────────────────────────────────────────────
// Shows both confirmed (pending check-in) and already-checked-in arrivals.
// Overdue = confirmed booking whose check_in is today and it's past noon.

function ArrivalRow({ booking, onCheckIn, nowHour }) {
  const statusBadge = bookingStatusBadge(booking.status);
  const payBadge    = paymentBadge(booking.payment_status);
  const amountDue   = parseFloat(booking.amount_due || '0');
  const hasBalance  = amountDue > 0;

  // FIX 3: overdue = confirmed + still no check-in + afternoon
  const isOverdue = booking.status === 'confirmed' && nowHour >= 14;

  return (
    <tr style={isOverdue ? { background: 'rgba(201,168,76,0.05)' } : {}}>
      <td>
        <div className="fd-table-name">
          {booking.full_name}
          {isOverdue && (
            <span style={{
              marginLeft: 8, fontSize: 9, color: 'var(--amber)',
              letterSpacing: 1, textTransform: 'uppercase',
              border: '1px solid var(--amber-border)', padding: '1px 5px',
            }}>
              Overdue
            </span>
          )}
        </div>
        <div className="fd-table-sub">{booking.email}</div>
      </td>
      <td>
        <div style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td>{booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}</td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>{formatPHP(booking.total_price)}</div>
        {hasBalance && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
            Owes {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td><span className={`fd-badge ${statusBadge.cls}`}>{statusBadge.label}</span></td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td>
        {/* FIX 1: show Check In button for confirmed, "In Hotel" for checked_in */}
        {booking.status === 'confirmed' && (
          <button
            className="fd-btn fd-btn-success"
            style={{ padding: '6px 14px', fontSize: 9 }}
            onClick={() => onCheckIn(booking.reference_number)}
          >
            Check In →
          </button>
        )}
        {booking.status === 'checked_in' && (
          <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ In Hotel</span>
        )}
      </td>
    </tr>
  );
}

// ── Departure row ─────────────────────────────────────────────────────────────

function DepartureRow({ booking, onCheckOut }) {
  const statusBadge = bookingStatusBadge(booking.status);
  const payBadge    = paymentBadge(booking.payment_status);
  const amountDue   = parseFloat(booking.amount_due || '0');
  const hasBalance  = amountDue > 0;

  return (
    <tr>
      <td>
        <div className="fd-table-name">{booking.full_name}</div>
        <div className="fd-table-sub">{booking.email}</div>
      </td>
      <td>
        <div style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td>{booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}</td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>{formatPHP(booking.total_price)}</div>
        {hasBalance && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
            Balance: {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td><span className={`fd-badge ${statusBadge.cls}`}>{statusBadge.label}</span></td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td>
        {booking.status === 'checked_in' && (
          <button
            className="fd-btn fd-btn-danger"
            style={{ padding: '6px 14px', fontSize: 9, whiteSpace: 'nowrap' }}
            onClick={() => onCheckOut(booking)}
          >
            Check Out →
          </button>
        )}
        {booking.status === 'checked_out' && (
          <span style={{ fontSize: 11, color: 'var(--blue)' }}>✓ Checked Out</span>
        )}
      </td>
    </tr>
  );
}

// ── Overdue checkout row (stayed past checkout date) ──────────────────────────

function OverdueRow({ booking, onCheckOut }) {
  const payBadge  = paymentBadge(booking.payment_status);
  const amountDue = parseFloat(booking.amount_due || '0');

  return (
    <tr style={{ background: 'rgba(248,113,113,0.04)' }}>
      <td>
        <div className="fd-table-name">{booking.full_name}</div>
        <div className="fd-table-sub">{booking.email}</div>
      </td>
      <td>
        <div style={{ color: 'var(--gold)', fontFamily: "'Playfair Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td>
        {/* Show the scheduled checkout date so staff can see how late */}
        <div style={{ fontSize: 11, color: 'var(--red)' }}>
          Was due {formatDate(booking.check_out)}
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--white)' }}>{formatPHP(booking.total_price)}</div>
        {amountDue > 0 && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>
            Balance: {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td>
        <span className="fd-badge fd-badge-red">Overdue</span>
      </td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td>
        <button
          className="fd-btn fd-btn-danger"
          style={{ padding: '6px 14px', fontSize: 9, whiteSpace: 'nowrap' }}
          onClick={() => onCheckOut(booking)}
        >
          Check Out →
        </button>
      </td>
    </tr>
  );
}

// ── Table column headers ──────────────────────────────────────────────────────

function TableHead({ isOverdueTab }) {
  return (
    <thead>
      <tr>
        <th>Guest</th>
        <th>Reference</th>
        <th>Room</th>
        <th>{isOverdueTab ? 'Scheduled Out' : 'Guests'}</th>
        <th>Total</th>
        <th>Status</th>
        <th>Payment</th>
        <th>Action</th>
      </tr>
    </thead>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TodayArrivalsPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const todayFmt = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  // FIX 3: used for overdue detection
  const nowHour = new Date().getHours();

  const [activeTab,  setActiveTab]  = useState('arrivals');
  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);
  const [overdue,    setOverdue]    = useState([]); // FIX 4: late checkouts
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // FIX 1: Arrivals = confirmed + checked_in with check_in = today
      // We fetch confirmed (pending check-in) and also checked_in (already done)
      // so the list is complete and staff can see both states.
      const [confirmedData, checkedInTodayData, depData, overdueData] = await Promise.allSettled([
        // Confirmed arrivals awaiting check-in
        frontDeskBookingsApi.todayArrivals(today),
        // Already-checked-in guests who arrived today
        api.get('/bookings/admin/', {
          params: { check_in: today, status: 'checked_in' },
        }).then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
        // Today's departures
        frontDeskBookingsApi.todayDepartures(today),
        // FIX 4: Still checked-in but check_out was yesterday or earlier
        api.get('/bookings/admin/', {
          params: { check_out_before: today, status: 'checked_in' },
        }).then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
      ]);

      // Merge confirmed + already-checked-in arrivals, deduplicate by id
      const confirmedList    = confirmedData.status === 'fulfilled'
        ? (Array.isArray(confirmedData.value) ? confirmedData.value : (confirmedData.value?.results ?? []))
        : [];
      const checkedInList    = checkedInTodayData.status === 'fulfilled'
        ? checkedInTodayData.value
        : [];

      const seen    = new Set();
      const merged  = [];
      for (const b of [...confirmedList, ...checkedInList]) {
        if (!seen.has(b.id)) { seen.add(b.id); merged.push(b); }
      }
      setArrivals(merged);

      setDepartures(
        depData.status === 'fulfilled'
          ? (Array.isArray(depData.value) ? depData.value : (depData.value?.results ?? []))
          : [],
      );

      setOverdue(
        overdueData.status === 'fulfilled' ? overdueData.value : [],
      );
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [today]);

  // FIX 6: single effect handles mount + auto-refresh
  useEffect(() => {
    load();
    const timer = setInterval(load, 90_000);
    return () => clearInterval(timer);
  }, [load]);

  function handleCheckIn(referenceNumber) {
    navigate('/staff/check-in', { state: { reference: referenceNumber } });
  }

  function handleCheckOut(booking) {
    navigate(`/staff/front-desk/checkout/${booking.id}`, { state: { booking } });
  }

  // FIX 5: separate confirmed count for accurate "pending" sub-label
  const pendingCheckIns    = arrivals.filter(b => b.status === 'confirmed').length;
  const pendingCheckOuts   = departures.filter(b => b.status === 'checked_in').length;
  const withBalance        = departures.filter(b => parseFloat(b.amount_due || '0') > 0).length;

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Today's Schedule</h1>
            <p>{todayFmt}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="fd-btn" onClick={load}>↻ Refresh</button>
            <button className="fd-btn" onClick={() => navigate('/staff/front-desk')}>← Back</button>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--blue)', fontSize: 36 }}>
                {arrivals.length}
              </div>
              <div className="fd-stat-label">Expected Check-ins</div>
              {/* FIX 5: confirmed-only count for "pending" */}
              {pendingCheckIns > 0 && (
                <div className="fd-stat-sub">{pendingCheckIns} still pending</div>
              )}
            </div>

            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--amber)', fontSize: 36 }}>
                {departures.length}
              </div>
              <div className="fd-stat-label">Expected Check-outs</div>
              {withBalance > 0 && (
                <div className="fd-stat-sub" style={{ color: 'var(--amber)' }}>
                  {withBalance} with balance
                </div>
              )}
            </div>

            {/* FIX 4: overdue card — only shown when there are overdue checkouts */}
            {overdue.length > 0 && (
              <div
                className="fd-card"
                style={{ flex: 1, padding: '18px 20px', marginBottom: 0, borderColor: 'var(--red-border)', cursor: 'pointer' }}
                onClick={() => setActiveTab('overdue')}
              >
                <div className="fd-stat-value" style={{ color: 'var(--red)', fontSize: 36 }}>
                  {overdue.length}
                </div>
                <div className="fd-stat-label">Overdue Check-outs</div>
                <div className="fd-stat-sub" style={{ color: 'var(--red)' }}>
                  Still in hotel past due date
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="fd-tabs">
          <button
            className={`fd-tab${activeTab === 'arrivals' ? ' active' : ''}`}
            onClick={() => setActiveTab('arrivals')}
          >
            Check-Ins
            <span className="fd-tab-count">{arrivals.length}</span>
          </button>
          <button
            className={`fd-tab${activeTab === 'departures' ? ' active' : ''}`}
            onClick={() => setActiveTab('departures')}
          >
            Check-Outs
            <span className="fd-tab-count">{departures.length}</span>
          </button>
          {/* FIX 4: overdue tab — only shown when needed */}
          {overdue.length > 0 && (
            <button
              className={`fd-tab${activeTab === 'overdue' ? ' active' : ''}`}
              onClick={() => setActiveTab('overdue')}
              style={{ color: activeTab === 'overdue' ? 'var(--red)' : undefined }}
            >
              Overdue
              <span
                className="fd-tab-count"
                style={{ background: 'rgba(248,113,113,0.15)', color: 'var(--red)', borderColor: 'var(--red-border)' }}
              >
                {overdue.length}
              </span>
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading…</p></div>
        ) : error ? (
          <div className="fd-error"><p>{error}</p></div>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <TableHead isOverdueTab={activeTab === 'overdue'} />
              <tbody>

                {/* ── ARRIVALS TAB ── */}
                {activeTab === 'arrivals' && (
                  arrivals.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No arrivals today.</td></tr>
                  ) : (
                    // Sort: confirmed (pending action) first, then checked_in
                    [...arrivals]
                      .sort((a, b) => {
                        if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
                        if (a.status !== 'confirmed' && b.status === 'confirmed') return 1;
                        return 0;
                      })
                      .map(booking => (
                        <ArrivalRow
                          key={booking.id}
                          booking={booking}
                          onCheckIn={handleCheckIn}
                          nowHour={nowHour}
                        />
                      ))
                  )
                )}

                {/* ── DEPARTURES TAB ── */}
                {activeTab === 'departures' && (
                  departures.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No departures today.</td></tr>
                  ) : (
                    // Sort: pending checkout (checked_in) first, already done last
                    [...departures]
                      .sort((a, b) => {
                        if (a.status === 'checked_in' && b.status !== 'checked_in') return -1;
                        if (a.status !== 'checked_in' && b.status === 'checked_in') return 1;
                        return 0;
                      })
                      .map(booking => (
                        <DepartureRow
                          key={booking.id}
                          booking={booking}
                          onCheckOut={handleCheckOut}
                        />
                      ))
                  )
                )}

                {/* ── OVERDUE TAB ── */}
                {activeTab === 'overdue' && (
                  overdue.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No overdue checkouts.</td></tr>
                  ) : (
                    overdue.map(booking => (
                      <OverdueRow
                        key={booking.id}
                        booking={booking}
                        onCheckOut={handleCheckOut}
                      />
                    ))
                  )
                )}

              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}