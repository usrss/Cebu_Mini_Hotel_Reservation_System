/**
 * FoodOrdersFrontDeskPage.jsx — Enhanced
 * - Improved KPI stat cards with proper icons and layout
 * - Room groups now open in a modal instead of inline dropdown
 * - Matches FrontDeskDashboard light theme (DM Sans / DM Serif Display, fd- tokens)
 * - No emoji, Lucide icons only. Real-time auto-poll every 30s.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  UtensilsCrossed, AlertCircle, CheckCircle2, Clock,
  X, ShoppingBag, CreditCard, TrendingUp, Hash,
  Calendar, ChevronRight, Package,
} from 'lucide-react';
import api from '../../services/api';
import '../staff/frontdesk/FrontDesk.css';
import '../staff/Staff.css';

const POLL_MS = 30_000;

function safeMoney(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function formatPHP(val) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(safeMoney(val));
}

// ── Badges ────────────────────────────────────────────────────────────────────
function OrderStatusBadge({ status }) {
  const map = {
    pending:   { cls: 'fd-badge-amber', label: 'Pending'   },
    completed: { cls: 'fd-badge-green', label: 'Completed' },
    cancelled: { cls: 'fd-badge-muted', label: 'Cancelled' },
  };
  const cfg = map[status] || { cls: 'fd-badge-muted', label: status };
  return <span className={`fd-badge ${cfg.cls}`}>{cfg.label}</span>;
}

function PaymentBadge({ status, type }) {
  if (status === 'paid')   return <span className="fd-badge fd-badge-green">Paid</span>;
  if (type === 'pay_now')  return <span className="fd-badge fd-badge-blue">Pay Now</span>;
  return <span className="fd-badge fd-badge-amber">At Checkout</span>;
}

function StatCard({ icon, iconBg, iconColor, value, label, sub, subColor }) {
  return (
    <div
      className="fd-stat-card"
      style={{
        cursor: 'default',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 14,
          marginTop: 0
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: iconColor,
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>

      <div
        className="fd-stat-value"
        style={{ color: 'var(--fd-text)', marginBottom: 4 }}
      >
        {value}
      </div>

      <div
        className="fd-stat-label"
        style={{ color: 'var(--fd-text)', marginBottom: sub ? 4 : 0 }}
      >
        {label}
      </div>

      {sub && (
        <div
          className="fd-stat-sub"
          style={{ color: subColor || 'var(--fd-text-muted)' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Room Row Card (clickable, opens modal) ────────────────────────────────────
function RoomCard({ roomNumber, orders, onClick }) {
  const activeOrders   = orders.filter(o => o.order_status !== 'cancelled');
  const total          = activeOrders.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const unpaidCheckout = orders.filter(
    o => o.payment_type === 'pay_checkout' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  );
  const checkoutTotal  = unpaidCheckout.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const abandonedCount = orders.filter(
    o => o.payment_type === 'pay_now' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  ).length;

  const pendingCount   = orders.filter(o => o.order_status === 'pending').length;
  const completedCount = orders.filter(o => o.order_status === 'completed').length;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'var(--fd-surface)',
        border: 'none',
        borderRadius: 'var(--fd-radius-lg)',
        padding: '18px 22px',
        boxShadow: 'var(--fd-shadow-sm)',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        marginBottom: 10,
        transition: 'box-shadow 170ms, transform 170ms',
        fontFamily: "'DM Sans', sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--fd-shadow-md)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--fd-shadow-sm)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Left accent strip if has abandoned */}

      {/* Room number pill */}
      <div style={{
        background: 'var(--fd-accent-lt)',
        borderRadius: 'var(--fd-radius-md)',
        padding: '10px 14px',
        textAlign: 'center',
        minWidth: 58,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 2 }}>
          Room
        </div>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--fd-text)', lineHeight: 1 }}>
          {roomNumber}
        </div>
      </div>

      {/* Center info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fd-text)', marginBottom: 6 }}>
          {activeOrders.length} order{activeOrders.length !== 1 ? 's' : ''} &middot; {formatPHP(total)}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {pendingCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fd-amber)', fontWeight: 500 }}>
              <Clock size={11} />{pendingCount} pending
            </span>
          )}
          {completedCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fd-text-muted)', fontWeight: 500 }}>
              <CheckCircle2 size={11} />{completedCount} completed
            </span>
          )}
          {abandonedCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--fd-red)', fontWeight: 600 }}>
              <AlertCircle size={11} />{abandonedCount} Pay Now unpaid
            </span>
          )}
          {checkoutTotal > 0 && (
            <span style={{ fontSize: 11, color: 'var(--fd-amber)', fontWeight: 500 }}>
              {formatPHP(checkoutTotal)} due at checkout
            </span>
          )}
        </div>
      </div>

      {/* Right — order type pills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flexShrink: 0 }}>
        {checkoutTotal > 0 && (
          <span className="fd-badge fd-badge-amber" style={{ fontSize: 10 }}>
            <CreditCard size={9} />At Checkout
          </span>
        )}
        {abandonedCount > 0 && (
          <span className="fd-badge fd-badge-red" style={{ fontSize: 10 }}>
            <AlertCircle size={9} />Follow Up
          </span>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight size={16} style={{ color: 'var(--fd-text-muted)', flexShrink: 0 }} />
    </button>
  );
}

// ── Room Orders Modal ─────────────────────────────────────────────────────────
function RoomOrdersModal({ open, onClose, roomNumber, orders, statusFilter }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeOrders   = orders.filter(o => o.order_status !== 'cancelled');
  const total          = activeOrders.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const unpaidCheckout = orders.filter(
    o => o.payment_type === 'pay_checkout' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  );
  const checkoutTotal  = unpaidCheckout.reduce((s, o) => s + safeMoney(o.total_price), 0);
  const abandonedCount = orders.filter(
    o => o.payment_type === 'pay_now' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  ).length;

  const displayOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.order_status === statusFilter);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 700,
        background: 'rgba(1,0,13,0.40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
        animation: 'fd-modal-bg-in 0.18s ease',
      }}
    >
      <div
        ref={modalRef}
        style={{
          background: 'var(--fd-surface)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 720,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 48px rgba(1,0,13,0.18), 0 2px 8px rgba(1,0,13,0.08)',
          animation: 'fd-modal-in 0.22s cubic-bezier(0.16,1,0.3,1)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--fd-surface-2)',
          background: 'var(--fd-surface)',
          flexShrink: 0,
        }}>
          {/* Room pill */}
          <div style={{
            background: 'var(--fd-accent-lt)',
            borderRadius: 'var(--fd-radius-md)',
            padding: '8px 14px',
            textAlign: 'center',
            minWidth: 52,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fd-text-muted)', marginBottom: 1 }}>
              Room
            </div>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: 'var(--fd-text)', lineHeight: 1 }}>
              {roomNumber}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: 'var(--fd-text)', marginBottom: 4 }}>
              Food Orders
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--fd-text-muted)' }}>
                {activeOrders.length} active · {formatPHP(total)}
              </span>
              {checkoutTotal > 0 && (
                <span style={{ fontSize: 12, color: 'var(--fd-amber)', fontWeight: 500 }}>
                  {formatPHP(checkoutTotal)} at checkout
                </span>
              )}
              {abandonedCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--fd-red)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} />{abandonedCount} Pay Now unpaid
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--fd-surface-2)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--fd-text-muted)',
              transition: 'background 150ms',
              flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--fd-surface-3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--fd-surface-2)'}
          >
            <X size={15} />
          </button>
        </div>

        {/* Abandoned notice */}
        {abandonedCount > 0 && (
          <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
            <div className="fd-notice fd-notice-error" style={{ marginBottom: 0 }}>
              <span className="fd-notice-icon"><AlertCircle size={14} /></span>
              <span style={{ fontSize: 12 }}>
                <strong>{abandonedCount}</strong> Pay Now order{abandonedCount !== 1 ? 's' : ''} unpaid — payment likely failed or was abandoned. Contact guest to retry or cancel.
              </span>
            </div>
          </div>
        )}

        {/* Table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {displayOrders.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--fd-text-faint)' }}>
              No orders match the current filter.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--fd-surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                  {['Item', 'Qty', 'Price', 'Order Status', 'Payment', 'Type', 'Time'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '11px 18px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
                      textTransform: 'uppercase', color: 'var(--fd-text)',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayOrders.map((order, i) => (
                  <tr
                    key={order.id}
                    style={{
                      opacity: order.order_status === 'cancelled' ? 0.45 : 1,
                      borderBottom: i < displayOrders.length - 1 ? '1px solid var(--fd-surface-2)' : 'none',
                    }}
                  >
                    <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 600, color: 'var(--fd-text)', marginBottom: 2 }}>
                        {order.food_item_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--fd-text-muted)' }}>#{order.id}</div>
                    </td>
                    <td style={{ padding: '13px 18px', color: 'var(--fd-text-muted)', verticalAlign: 'middle' }}>
                      {order.quantity}
                    </td>
                    <td style={{ padding: '13px 18px', fontWeight: 600, color: 'var(--fd-text)', verticalAlign: 'middle' }}>
                      {formatPHP(order.total_price)}
                    </td>
                    <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                      <OrderStatusBadge status={order.order_status} />
                    </td>
                    <td style={{ padding: '13px 18px', verticalAlign: 'middle' }}>
                      <PaymentBadge status={order.payment_status} type={order.payment_type} />
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 11, color: 'var(--fd-text-faint)', verticalAlign: 'middle' }}>
                      {order.payment_type === 'pay_now' ? 'Pay Now' : 'At Checkout'}
                    </td>
                    <td style={{ padding: '13px 18px', fontSize: 11, color: 'var(--fd-text-faint)', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                      {order.created_at
                        ? new Date(order.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        {checkoutTotal > 0 && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--fd-surface-2)',
            background: 'var(--fd-surface-2)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fd-text-muted)' }}>
              <CheckCircle2 size={13} />
              <span>Collect at checkout:</span>
              <strong style={{ color: 'var(--fd-text)', fontSize: 14 }}>{formatPHP(checkoutTotal)}</strong>
              <span style={{ color: 'var(--fd-text-faint)' }}>— settled on guest departure</span>
            </div>
            <button
              onClick={onClose}
              className="fd-btn"
              style={{ padding: '8px 18px', fontSize: 12 }}
            >
              Close
            </button>
          </div>
        )}

        {checkoutTotal === 0 && (
          <div style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--fd-surface-2)',
            display: 'flex', justifyContent: 'flex-end',
            flexShrink: 0,
          }}>
            <button onClick={onClose} className="fd-btn" style={{ padding: '8px 18px', fontSize: 12 }}>
              Close
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fd-modal-bg-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fd-modal-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.97); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FoodOrdersFrontDeskPage() {
  const [orders,       setOrders]       = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalRoom,    setModalRoom]    = useState(null); // { roomNumber, orders }
  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/food/orders/admin/');
      setOrders(res.data.results ?? res.data);
    } catch {
      if (!silent) setOrders([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const byRoom = orders.reduce((acc, o) => {
    const room = o.room_number ?? '—';
    if (!acc[room]) acc[room] = [];
    acc[room].push(o);
    return acc;
  }, {});

  // KPI aggregates
  const pendingCount   = orders.filter(o => o.order_status === 'pending').length;
  const completedCount = orders.filter(o => o.order_status === 'completed').length;
  const totalOrders    = orders.filter(o => o.order_status !== 'cancelled').length;
  const abandonedCount = orders.filter(
    o => o.payment_type === 'pay_now' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  ).length;
  const checkoutTotal = orders
    .filter(o => o.payment_type === 'pay_checkout' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled')
    .reduce((s, o) => s + safeMoney(o.total_price), 0);
  const totalRevenue = orders
    .filter(o => o.payment_status === 'paid' && o.order_status !== 'cancelled')
    .reduce((s, o) => s + safeMoney(o.total_price), 0);

  const STATUS_FILTERS = [
    { value: 'all',       label: 'All Orders'  },
    { value: 'pending',   label: 'Pending'     },
    { value: 'completed', label: 'Completed'   },
    { value: 'cancelled', label: 'Cancelled'   },
  ];

  const roomEntries = Object.entries(byRoom).sort(([a], [b]) => String(a).localeCompare(String(b)));

  // Filter room list by status
  const filteredRoomEntries = statusFilter === 'all'
    ? roomEntries
    : roomEntries.filter(([, roomOrders]) =>
        roomOrders.some(o => o.order_status === statusFilter)
      );

  return (
    <div className="fd-page">
      <div className="fd-inner">

        {/* Header */}
        <div className="fd-toprow">
          <div className="fd-toprow-left">
            <p className="fd-eyebrow">Front Desk</p>
            <h1>Food Orders</h1>
            <p>{Object.keys(byRoom).length} room(s) with orders</p>
          </div>
        </div>

        {/* ── KPI Cards (4 columns) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>

          {/* Total Active Orders */}
          <StatCard
            icon={<ShoppingBag size={19} />}
            iconBg="var(--fd-accent-lt)"
            iconColor="var(--fd-accent)"
            value={totalOrders}
            label="Active Orders"
            sub={`${Object.keys(byRoom).length} rooms`}
            accent="var(--fd-accent)"
          />

          {/* Pending */}
          <StatCard
            icon={<Clock size={19} />}
            iconBg="var(--fd-amber-bg)"
            iconColor="var(--fd-amber)"
            value={pendingCount}
            label="Pending Orders"
            sub={pendingCount > 0 ? 'Awaiting preparation' : 'All caught up'}
            subColor={pendingCount > 0 ? 'var(--fd-amber)' : 'var(--fd-text-muted)'}
            accent="var(--fd-amber)"
          />

          {/* Pay Now Unpaid */}
          <StatCard
            icon={<AlertCircle size={19} />}
            iconBg="var(--fd-red-bg)"
            iconColor="var(--fd-red)"
            value={abandonedCount}
            label="Pay Now Unpaid"
            sub={abandonedCount > 0 ? 'Follow up with guest' : 'No issues'}
            subColor={abandonedCount > 0 ? 'var(--fd-red)' : 'var(--fd-text-muted)'}
            accent={abandonedCount > 0 ? 'var(--fd-red)' : undefined}
          />

          {/* At Checkout */}
          <StatCard
            icon={<CreditCard size={19} />}
            iconBg="rgba(29,78,216,0.09)"
            iconColor="var(--fd-blue)"
            value={
              <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: checkoutTotal > 9999 ? 22 : 28, fontWeight: 400 }}>
                {formatPHP(checkoutTotal)}
              </span>
            }
            label="At Checkout"
            sub="To collect on departure"
            accent="var(--fd-blue)"
          />
        </div>

        {/* ── Abandoned notice ── */}
        {abandonedCount > 0 && (
          <div className="fd-notice fd-notice-error" style={{ marginBottom: 20 }}>
            <span className="fd-notice-icon"><AlertCircle size={14} /></span>
            <span>
              <strong>{abandonedCount}</strong> Pay Now order{abandonedCount !== 1 ? 's' : ''} have unpaid status — the guest's online payment likely failed or was abandoned.
              These are <strong>not charged here</strong>. Contact the guest to retry, or cancel if the order won't be fulfilled.
            </span>
          </div>
        )}

        {/* ── Status filter tabs ── */}
        <div className="fd-status-tabs" style={{ marginBottom: 20 }}>
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`fd-status-tab${statusFilter === f.value ? ' active' : ''}`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Room Cards ── */}
        {loading ? (
          <div className="fd-loading"><div className="fd-spinner" /><p>Loading orders</p></div>
        ) : filteredRoomEntries.length === 0 ? (
          <div className="fd-card" style={{ textAlign: 'center', color: 'var(--fd-text-faint)', fontSize: 13, padding: '48px 0' }}>
            {statusFilter === 'all' ? 'No food orders yet.' : `No ${statusFilter} orders found.`}
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '80px 1fr auto 24px',
              gap: 16,
              padding: '0 22px 10px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
              textTransform: 'uppercase', color: 'var(--fd-text-muted)',
            }}>
              <span>Room</span>
              <span>Summary</span>
              <span>Status</span>
              <span></span>
            </div>

            {filteredRoomEntries.map(([room, roomOrders]) => (
              <RoomCard
                key={room}
                roomNumber={room}
                orders={roomOrders}
                onClick={() => setModalRoom({ roomNumber: room, orders: roomOrders })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Room Orders Modal ── */}
      {modalRoom && (
        <RoomOrdersModal
          open={!!modalRoom}
          onClose={() => setModalRoom(null)}
          roomNumber={modalRoom.roomNumber}
          orders={modalRoom.orders}
          statusFilter={statusFilter}
        />
      )}
    </div>
  );
}