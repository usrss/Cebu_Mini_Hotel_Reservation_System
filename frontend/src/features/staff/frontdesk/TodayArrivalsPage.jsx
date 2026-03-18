/**
 * src/features/staff/frontdesk/TodayArrivalsPage.jsx
 *
 * Shows today's expected check-ins (CONFIRMED bookings with check_in=today)
 * and expected check-outs (CHECKED_IN bookings with check_out=today).
 *
 * Front Desk can navigate to Check-In panel for arrivals.
 *
 * RBAC: front_desk, admin, manager
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  frontDeskBookingsApi,
  todayISO,
  formatPHP,
  formatDate,
} from './services/frontDeskApi';
import './FrontDesk.css';
import '../Staff.css';

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
  if (status === 'paid')               return { cls: 'fd-badge-green',  label: 'Fully Paid'  };
  if (status === 'partially_refunded') return { cls: 'fd-badge-amber',  label: 'Partial'     };
  if (status === 'unpaid')             return { cls: 'fd-badge-red',    label: 'Unpaid'      };
  return { cls: 'fd-badge-muted', label: status };
}

function BookingRow({ booking, onCheckIn }) {
  const statusBadge  = bookingStatusBadge(booking.status);
  const payBadge     = paymentBadge(booking.payment_status);
  const amountDue    = parseFloat(booking.amount_due || '0');
  const hasBalance   = amountDue > 0;

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
            Owes {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td>
        <span className={`fd-badge ${statusBadge.cls}`}>{statusBadge.label}</span>
      </td>
      <td>
        <span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span>
      </td>
      <td>
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

export default function TodayArrivalsPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const todayFmt = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const [activeTab,  setActiveTab]  = useState('arrivals');
  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [arrData, depData] = await Promise.all([
        frontDeskBookingsApi.todayArrivals(today),
        frontDeskBookingsApi.todayDepartures(today),
      ]);
      setArrivals(Array.isArray(arrData) ? arrData : (arrData.results ?? []));
      setDepartures(Array.isArray(depData) ? depData : (depData.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 90 seconds
  useEffect(() => {
    const timer = setInterval(load, 90_000);
    return () => clearInterval(timer);
  }, [load]);

  function handleCheckIn(referenceNumber) {
    // Navigate to check-in page with reference pre-filled via URL state
    navigate('/staff/check-in', { state: { reference: referenceNumber } });
  }

  const active = activeTab === 'arrivals' ? arrivals : departures;

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

        {/* Summary row */}
        {!loading && (
          <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--blue)', fontSize: 36 }}>
                {arrivals.length}
              </div>
              <div className="fd-stat-label">Expected Check-ins</div>
              {arrivals.filter((b) => b.status === 'confirmed').length > 0 && (
                <div className="fd-stat-sub">
                  {arrivals.filter((b) => b.status === 'confirmed').length} pending
                </div>
              )}
            </div>
            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--amber)', fontSize: 36 }}>
                {departures.length}
              </div>
              <div className="fd-stat-label">Expected Check-outs</div>
              {departures.filter((b) => parseFloat(b.amount_due || '0') > 0).length > 0 && (
                <div className="fd-stat-sub" style={{ color: 'var(--amber)' }}>
                  {departures.filter((b) => parseFloat(b.amount_due || '0') > 0).length} with balance
                </div>
              )}
            </div>
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
        </div>

        {/* Table */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading…</p></div>
        ) : error ? (
          <div className="fd-error"><p>{error}</p></div>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <thead>
                <tr>
                  <th>Guest</th>
                  <th>Reference</th>
                  <th>Room</th>
                  <th>Guests</th>
                  <th>Total</th>
                  <th>Booking Status</th>
                  <th>Payment</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {active.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="fd-table-empty">
                      No {activeTab === 'arrivals' ? 'arrivals' : 'departures'} today.
                    </td>
                  </tr>
                ) : (
                  active.map((booking) => (
                    <BookingRow
                      key={booking.id}
                      booking={booking}
                      onCheckIn={handleCheckIn}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}