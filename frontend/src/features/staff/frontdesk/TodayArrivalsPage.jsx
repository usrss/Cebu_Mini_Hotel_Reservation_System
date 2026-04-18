/**
 * TodayArrivalsPage.jsx — Redesigned light theme
 * Removed: fd-eyebrow header block, refresh button, gold/navy color refs
 * Added: real-time auto-refresh every 90s (no manual button)
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

function bookingStatusBadge(status) {
  const map = {
    confirmed:   { cls: 'fd-badge-amber', label: 'Confirmed'   },
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

function ArrivalRow({ booking, onCheckIn, nowHour }) {
  const statusBadge = bookingStatusBadge(booking.status);
  const payBadge    = paymentBadge(booking.payment_status);
  const amountDue   = parseFloat(booking.amount_due || '0');
  const hasBalance  = amountDue > 0;
  const isOverdue   = booking.status === 'confirmed' && nowHour >= 14;

  return (
    <tr style={isOverdue ? { background: 'rgba(180,83,9,0.04)' } : {}}>
      <td>
        <div className="fd-table-name">
          {booking.full_name}
          {isOverdue && (
            <span className="fd-badge fd-badge-amber" style={{ marginLeft: 8, fontSize: 9 }}>
              Overdue
            </span>
          )}
        </div>
        <div className="fd-table-sub">{booking.email}</div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--fd-accent)', fontFamily: "'DM Serif Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div className="fd-table-name">Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td style={{ color: 'var(--fd-text-sec)' }}>{booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}</td>
      <td>
        <div className="fd-table-name">{formatPHP(booking.total_price)}</div>
        {hasBalance && (
          <div style={{ fontSize: 11, color: 'var(--fd-amber)', marginTop: 2 }}>
            Owes {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td><span className={`fd-badge ${statusBadge.cls}`}>{statusBadge.label}</span></td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td>
        {booking.status === 'confirmed' && (
          <button
            className="fd-btn fd-btn-primary"
            style={{ padding: '6px 14px', fontSize: 11 }}
            onClick={() => onCheckIn(booking.reference_number)}
          >
            Check In
          </button>
        )}
        {booking.status === 'checked_in' && (
          <span style={{ fontSize: 12, color: 'var(--fd-green)', fontWeight: 600 }}>In Hotel</span>
        )}
      </td>
    </tr>
  );
}

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
        <div style={{ fontWeight: 600, color: 'var(--fd-accent)', fontFamily: "'DM Serif Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div className="fd-table-name">Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td style={{ color: 'var(--fd-text-sec)' }}>{booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}</td>
      <td>
        <div className="fd-table-name">{formatPHP(booking.total_price)}</div>
        {hasBalance && (
          <div style={{ fontSize: 11, color: 'var(--fd-amber)', marginTop: 2 }}>
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
            style={{ padding: '6px 14px', fontSize: 11, whiteSpace: 'nowrap' }}
            onClick={() => onCheckOut(booking)}
          >
            Check Out
          </button>
        )}
        {booking.status === 'checked_out' && (
          <span style={{ fontSize: 12, color: 'var(--fd-blue)', fontWeight: 600 }}>Checked Out</span>
        )}
      </td>
    </tr>
  );
}

function OverdueRow({ booking, onCheckOut }) {
  const payBadge  = paymentBadge(booking.payment_status);
  const amountDue = parseFloat(booking.amount_due || '0');

  return (
    <tr style={{ background: 'rgba(220,38,38,0.03)' }}>
      <td>
        <div className="fd-table-name">{booking.full_name}</div>
        <div className="fd-table-sub">{booking.email}</div>
      </td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--fd-accent)', fontFamily: "'DM Serif Display', serif", fontSize: 14 }}>
          {booking.reference_number}
        </div>
      </td>
      <td>
        <div className="fd-table-name">Room {booking.room_number}</div>
        <div className="fd-table-sub">{booking.room_type}</div>
      </td>
      <td>
        <div style={{ fontSize: 12, color: 'var(--fd-red)', fontWeight: 500 }}>
          Due {formatDate(booking.check_out)}
        </div>
      </td>
      <td>
        <div className="fd-table-name">{formatPHP(booking.total_price)}</div>
        {amountDue > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fd-amber)', marginTop: 2 }}>
            Balance: {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td><span className="fd-badge fd-badge-red">Overdue</span></td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td>
        <button
          className="fd-btn fd-btn-danger"
          style={{ padding: '6px 14px', fontSize: 11, whiteSpace: 'nowrap' }}
          onClick={() => onCheckOut(booking)}
        >
          Check Out
        </button>
      </td>
    </tr>
  );
}

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

export default function TodayArrivalsPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const todayFmt = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const nowHour = new Date().getHours();

  const [activeTab,  setActiveTab]  = useState('arrivals');
  const [arrivals,   setArrivals]   = useState([]);
  const [departures, setDepartures] = useState([]);
  const [overdue,    setOverdue]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Calculate yesterday for overdue filter
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayISO = yesterday.toISOString().split('T')[0];

      const [confirmedData, checkedInTodayData, depData, overdueData] = await Promise.allSettled([
        frontDeskBookingsApi.todayArrivals(today),
        api.get('/bookings/admin/', {
          params: { check_in: today, status: 'checked_in' },
        }).then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
        frontDeskBookingsApi.todayDepartures(today),
        api.get('/bookings/admin/', {
          params: { check_out_to: yesterdayISO, status: 'checked_in' },
        }).then(r => Array.isArray(r.data) ? r.data : (r.data.results ?? [])),
      ]);

      const confirmedList = confirmedData.status === 'fulfilled'
        ? (Array.isArray(confirmedData.value) ? confirmedData.value : (confirmedData.value?.results ?? []))
        : [];
      const checkedInList = checkedInTodayData.status === 'fulfilled'
        ? checkedInTodayData.value : [];

      const seen = new Set();
      const merged = [];
      for (const b of [...confirmedList, ...checkedInList]) {
        if (!seen.has(b.id)) { seen.add(b.id); merged.push(b); }
      }
      setArrivals(merged);

      setDepartures(
        depData.status === 'fulfilled'
          ? (Array.isArray(depData.value) ? depData.value : (depData.value?.results ?? []))
          : [],
      );

      setOverdue(overdueData.status === 'fulfilled' ? overdueData.value : []);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [today]);

  // Filter function based on search query
  const filterBookings = (bookings) => {
    if (!searchQuery.trim()) return bookings;
    
    const query = searchQuery.toLowerCase().trim();
    return bookings.filter(booking => 
      booking.full_name.toLowerCase().includes(query) ||
      (booking.reference_number && booking.reference_number.toLowerCase().includes(query))
    );
  };

  // Filter arrivals and departures
  const filteredArrivals = filterBookings(arrivals);
  const filteredDepartures = filterBookings(departures);
  const filteredOverdue = filterBookings(overdue);

  // Real-time auto-refresh every 90s — no manual button needed
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

  const pendingCheckIns  = arrivals.filter(b => b.status === 'confirmed').length;
  const withBalance      = departures.filter(b => parseFloat(b.amount_due || '0') > 0).length;

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header — no eyebrow, no refresh button */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <h1>Today's Schedule</h1>
            <p>{todayFmt}</p>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--fd-blue)', fontSize: 34 }}>
                {arrivals.length}
              </div>
              <div className="fd-stat-label">Expected Check-ins</div>
              {pendingCheckIns > 0 && (
                <div className="fd-stat-sub">{pendingCheckIns} still pending</div>
              )}
            </div>

            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--fd-amber)', fontSize: 34 }}>
                {departures.length}
              </div>
              <div className="fd-stat-label">Expected Check-outs</div>
              {withBalance > 0 && (
                <div className="fd-stat-sub" style={{ color: 'var(--fd-amber)' }}>
                  {withBalance} with balance due
                </div>
              )}
            </div>

            {overdue.length > 0 && (
              <div
                className="fd-card"
                style={{ flex: 1, padding: '18px 20px', marginBottom: 0, cursor: 'pointer' }}
                onClick={() => setActiveTab('overdue')}
              >
                <div className="fd-stat-value" style={{ color: 'var(--fd-red)', fontSize: 34 }}>
                  {overdue.length}
                </div>
                <div className="fd-stat-label">Overdue Check-outs</div>
                <div className="fd-stat-sub" style={{ color: 'var(--fd-red)' }}>
                  Still in hotel past due
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Bar */}
        {!loading && (
          <div className="fd-filter-bar">
            <input
              type="text"
              className="fd-input"
              placeholder="Search by guest name or reference number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: 300 }}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="fd-tabs">
          <button
            className={`fd-tab${activeTab === 'arrivals' ? ' active' : ''}`}
            onClick={() => setActiveTab('arrivals')}
          >
            Expected Check-Ins
            <span className="fd-tab-count">{filteredArrivals.length}</span>
          </button>
          <button
            className={`fd-tab${activeTab === 'departures' ? ' active' : ''}`}
            onClick={() => setActiveTab('departures')}
          >
            Expected Check-Outs
            <span className="fd-tab-count">{filteredDepartures.length}</span>
          </button>
          {overdue.length > 0 && (
            <button
              className={`fd-tab${activeTab === 'overdue' ? ' active' : ''}`}
              onClick={() => setActiveTab('overdue')}
              style={activeTab === 'overdue' ? { color: 'var(--fd-red)', background: 'var(--fd-red-bg)' } : {}}
            >
              Overdue
              <span className="fd-tab-count">{filteredOverdue.length}</span>
            </button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading</p></div>
        ) : error ? (
          <div className="fd-error"><p>{error}</p></div>
        ) : (
          <div className="fd-table-wrap">
            <table className="fd-table">
              <TableHead isOverdueTab={activeTab === 'overdue'} />
              <tbody>

                {activeTab === 'arrivals' && (
                  arrivals.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No arrivals today.</td></tr>
                  ) : filteredArrivals.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No results matching your search.</td></tr>
                  ) : (
                    [...filteredArrivals]
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

                {activeTab === 'departures' && (
                  departures.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No departures today.</td></tr>
                  ) : filteredDepartures.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No results matching your search.</td></tr>
                  ) : (
                    [...filteredDepartures]
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

                {activeTab === 'overdue' && (
                  overdue.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No overdue checkouts.</td></tr>
                  ) : filteredOverdue.length === 0 ? (
                    <tr><td colSpan={8} className="fd-table-empty">No results matching your search.</td></tr>
                  ) : (
                    filteredOverdue.map(booking => (
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