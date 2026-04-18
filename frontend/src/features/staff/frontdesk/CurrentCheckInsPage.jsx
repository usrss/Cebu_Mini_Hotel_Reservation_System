/**
 * CurrentCheckInsPage.jsx — Currently Checked-In Guests
 * Light theme, matching FrontDesk design
 * Click to open modal with details: check-in/out dates, payment status, food bill, extend stay button
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

function paymentBadge(status) {
  if (status === 'paid')               return { cls: 'fd-badge-green', label: 'Fully Paid' };
  if (status === 'partially_refunded') return { cls: 'fd-badge-amber', label: 'Partial'    };
  if (status === 'unpaid')             return { cls: 'fd-badge-red',   label: 'Unpaid'     };
  return { cls: 'fd-badge-muted', label: status };
}

function CheckInRow({ booking, onRowClick }) {
  const payBadge    = paymentBadge(booking.payment_status);
  const amountDue   = parseFloat(booking.amount_due || '0');
  const hasBalance  = amountDue > 0;

  return (
    <tr onClick={() => onRowClick(booking)} style={{ cursor: 'pointer' }}>
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
            Owes {formatPHP(amountDue)}
          </div>
        )}
      </td>
      <td><span className={`fd-badge ${payBadge.cls}`}>{payBadge.label}</span></td>
      <td style={{ fontSize: 12, color: 'var(--fd-green)', fontWeight: 600 }}>In Hotel</td>
    </tr>
  );
}

function CurrentCheckInsModal({ booking, foodOrders, onClose, onExtend }) {
  const payBadge    = paymentBadge(booking.payment_status);
  const amountDue   = parseFloat(booking.amount_due || '0');
  const hasBalance  = amountDue > 0;

  const foodTotal = foodOrders?.reduce((sum, order) => {
    return sum + parseFloat(order.total_price || 0);
  }, 0) || 0;

  const groupedOrders = {};
  foodOrders?.forEach(order => {
    const category = order.category || 'other';
    if (!groupedOrders[category]) groupedOrders[category] = [];
    groupedOrders[category].push(order);
  });

  return (
    <div className="ccp-modal-overlay" onClick={onClose}>
      <div className="ccp-modal" onClick={e => e.stopPropagation()}>
        <div className="ccp-modal-header">
          <h2 className="ccp-modal-title">{booking.full_name}</h2>
          <button className="ccp-modal-close" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="ccp-modal-body">
          {/* Reference & Payment Status */}
          <div className="ccp-section">
            <h3 className="ccp-section-title">Booking Information</h3>
            <div className="ccp-info-grid">
              <div className="ccp-info-item">
                <span className="ccp-info-label">Reference Number</span>
                <span className="ccp-info-value" style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 500 }}>
                  {booking.reference_number}
                </span>
              </div>
              <div className="ccp-info-item">
                <span className="ccp-info-label">Payment Status</span>
                <span className={`fd-badge ${payBadge.cls}`} style={{ marginTop: 4 }}>
                  {payBadge.label}
                </span>
              </div>
            </div>
          </div>

          {/* Check-in & Check-out Dates */}
          <div className="ccp-section">
            <h3 className="ccp-section-title">Stay Dates</h3>
            <div className="ccp-info-grid">
              <div className="ccp-info-item">
                <span className="ccp-info-label">Check-in</span>
                <span className="ccp-info-value">{formatDate(booking.check_in)}</span>
              </div>
              <div className="ccp-info-item">
                <span className="ccp-info-label">Check-out</span>
                <span className="ccp-info-value">{formatDate(booking.check_out)}</span>
              </div>
            </div>
          </div>

          {/* Room & Guest Info */}
          <div className="ccp-section">
            <h3 className="ccp-section-title">Room & Guest Details</h3>
            <div className="ccp-info-grid">
              <div className="ccp-info-item">
                <span className="ccp-info-label">Room</span>
                <span className="ccp-info-value">
                  Room {booking.room_number} — {booking.room_type}
                </span>
              </div>
              <div className="ccp-info-item">
                <span className="ccp-info-label">Guests</span>
                <span className="ccp-info-value">
                  {booking.guests_count} guest{booking.guests_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="ccp-section">
            <h3 className="ccp-section-title">Financial Summary</h3>
            <div className="ccp-financial-summary">
              <div className="ccp-financial-row">
                <span>Room Rate</span>
                <span>{formatPHP(booking.total_price)}</span>
              </div>
              {foodTotal > 0 && (
                <div className="ccp-financial-row">
                  <span>Food & Drinks</span>
                  <span>{formatPHP(foodTotal)}</span>
                </div>
              )}
              {hasBalance && (
                <div className="ccp-financial-row ccp-financial-row--highlight">
                  <span>Balance Due</span>
                  <span style={{ color: 'var(--fd-amber)', fontWeight: 600 }}>
                    {formatPHP(amountDue)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Food & Drinks Orders */}
          {foodOrders && foodOrders.length > 0 && (
            <div className="ccp-section">
              <h3 className="ccp-section-title">Food & Drinks Orders</h3>
              <div className="ccp-orders-container">
                {Object.entries(groupedOrders).map(([category, orders]) => (
                  <div key={category} className="ccp-order-category">
                    <h4 className="ccp-category-title">
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </h4>
                    <div className="ccp-orders-list">
                      {orders.map(order => (
                        <div key={order.id} className="ccp-order-item">
                          <div className="ccp-order-details">
                            <div className="ccp-order-name">{order.food_item_name}</div>
                            <div className="ccp-order-breakdown">
                              <span className="ccp-order-unit-price">{formatPHP(order.unit_price)}</span>
                              <span className="ccp-order-separator">×</span>
                              <span className="ccp-order-qty">{order.quantity}</span>
                              <span className="ccp-order-separator">=</span>
                              <span className="ccp-order-total">{formatPHP(order.total_price)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!foodOrders || foodOrders.length === 0 && (
            <div className="ccp-section">
              <p style={{ fontSize: 12, color: 'var(--fd-text-muted)', textAlign: 'center', margin: 0 }}>
                No food or drink orders yet.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer with Extend Stay Button */}
        <div className="ccp-modal-footer">
          <button className="ccp-btn ccp-btn-extend" onClick={onExtend}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M2 12h20" />
            </svg>
            Extend Check-in
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CurrentCheckInsPage() {
  const navigate = useNavigate();
  const today    = todayISO();
  const todayFmt = new Date().toLocaleDateString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const [checkedInGuests, setCheckedInGuests] = useState([]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [foodOrders, setFoodOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadingModal, setLoadingModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/bookings/admin/', {
        params: { status: 'checked_in' },
      });

      const data = Array.isArray(response.data)
        ? response.data
        : (response.data?.results ?? []);

      setCheckedInGuests(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to load check-ins.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Real-time auto-refresh every 60s
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const handleRowClick = async (booking) => {
    setSelectedBooking(booking);
    setLoadingModal(true);
    try {
      const response = await api.get('/food/orders/admin/', {
        params: { booking: booking.id },
      });
      const orders = Array.isArray(response.data)
        ? response.data
        : (response.data?.results ?? []);
      setFoodOrders(orders);
    } catch (err) {
      setFoodOrders([]);
    } finally {
      setLoadingModal(false);
    }
  };

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <h1>Current Check-Ins</h1>
            <p>{todayFmt}</p>
          </div>
        </div>

        {/* Summary Card */}
        {!loading && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <div className="fd-card" style={{ flex: 1, padding: '18px 20px', marginBottom: 0 }}>
              <div className="fd-stat-value" style={{ color: 'var(--fd-green)', fontSize: 34 }}>
                {checkedInGuests.length}
              </div>
              <div className="fd-stat-label">Currently In Hotel</div>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading</p></div>
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
                  <th>Payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {checkedInGuests.length === 0 ? (
                  <tr><td colSpan={7} className="fd-table-empty">No guests currently checked in.</td></tr>
                ) : (
                  checkedInGuests.map(booking => (
                    <CheckInRow
                      key={booking.id}
                      booking={booking}
                      onRowClick={handleRowClick}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Modal */}
      {selectedBooking && (
        <CurrentCheckInsModal
          booking={selectedBooking}
          foodOrders={loadingModal ? [] : foodOrders}
          onClose={() => setSelectedBooking(null)}
          onExtend={() => {
            const bookingId = selectedBooking.id;
            setSelectedBooking(null);
            navigate('/staff/front-desk/extend', { state: { bookingId } });
          }}
        />
      )}
    </div>
  );
}
