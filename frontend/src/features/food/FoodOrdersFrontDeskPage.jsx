/**
 * FoodOrdersFrontDeskPage.jsx
 * Front Desk — master food orders view, grouped by room.
 *
 * ISSUES FIXED IN THIS REVISION
 * ─────────────────────────────────────────────────────────────────
 * ISSUE 1 — "Charge Pay Now" button is wrong logic ← CRITICAL
 *   pay_now orders are paid by the guest online via PayMongo before
 *   the order is even confirmed.  By the time an order appears in
 *   this list with payment_type=pay_now, it was ALREADY paid through
 *   PayMongo, or it was explicitly abandoned/cancelled.
 *
 *   The "Charge Pay Now" button called PATCH /food/orders/<pk>/mark-paid/
 *   which would double-mark an already-paid order, or mark an abandoned
 *   one as paid — both are wrong.
 *
 *   The ONLY legitimate "charge at desk" scenario is pay_checkout, and
 *   those are settled during the guest checkout flow (GuestCheckoutPage),
 *   not here.
 *
 *   Fix: removed the "Charge Pay Now" button entirely.  Front desk
 *   staff can see which pay_now orders are still unpaid (e.g. payment
 *   failed or was abandoned) as a signal to follow up with the guest,
 *   but they do not charge from this view.  A "Follow up" note badge
 *   replaces the button for visibility.
 *
 * ISSUE 2 — Room grouping bucketed null room_number as "Unknown"
 *   When booking__room is null the serializer returns room_number=null.
 *   Grouped them under the room_number string or a readable fallback.
 *
 * ISSUE 3 — KPI "At Checkout Total" included already-paid orders
 *   The filter was payment_type=pay_checkout + unpaid + not cancelled,
 *   which is correct.  But the RoomGroup checkoutTotal included ALL
 *   pay_checkout orders regardless of payment_status.  Fixed to also
 *   require payment_status=unpaid in the room-level calculation.
 *
 * ISSUE 4 — Room header "total" included cancelled order prices
 *   The total shown in the room header row included cancelled order
 *   amounts.  Guests should not be billed for cancelled orders.
 *   Fixed to exclude cancelled orders from the room total.
 *
 * ISSUE 5 — No order status filter
 *   Added a status filter bar so front desk can quickly see only
 *   pending, completed, or all orders.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw, ChevronDown, ChevronUp, AlertCircle, X, CheckCircle,
} from 'lucide-react';
import api from '../../services/api';

const POLL_MS = 30_000;

// ── helpers ───────────────────────────────────────────────────────────────────
function safeMoney(val) {
  const n = parseFloat(val);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// ── Room Group ────────────────────────────────────────────────────────────────
function RoomGroup({ roomNumber, orders, statusFilter }) {
  const [open, setOpen] = useState(false);

  // ISSUE 4 FIX: exclude cancelled from the room total shown to front desk
  const activeOrders = orders.filter(o => o.order_status !== 'cancelled');
  const total        = activeOrders.reduce((s, o) => s + safeMoney(o.total_price), 0);

  // ISSUE 1 FIX: pay_now unpaid = abandoned/failed payment, not chargeable here
  const abandonedPayNow = orders.filter(
    o => o.payment_type === 'pay_now' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  );

  // ISSUE 3 FIX: checkout total = pay_checkout + unpaid + not cancelled
  const unpaidCheckout = orders.filter(
    o => o.payment_type === 'pay_checkout'
      && o.payment_status === 'unpaid'
      && o.order_status !== 'cancelled',
  );
  const checkoutTotal = unpaidCheckout.reduce((s, o) => s + safeMoney(o.total_price), 0);

  // Apply the status filter inside the expanded table
  const displayOrders = statusFilter === 'all'
    ? orders
    : orders.filter(o => o.order_status === statusFilter);

  return (
    <div style={{
      border: '1px solid var(--gold-border)', marginBottom: 10,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, var(--gold), transparent)',
      }} />

      {/* Room header row — click to expand */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => e.key === 'Enter' && setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '14px 20px',
          background: 'var(--navy-card)', cursor: 'pointer',
          fontFamily: "'Raleway', sans-serif", color: 'var(--white)',
          userSelect: 'none',
        }}
      >
        {/* Left: room badge + summary */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
            padding: '6px 12px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 9, color: 'var(--gold)', fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Room
            </div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: 'var(--white)', lineHeight: 1 }}>
              {roomNumber}
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {activeOrders.length} order{activeOrders.length !== 1 ? 's' : ''} · ₱{total.toFixed(2)} active total
            </div>
            <div style={{ fontSize: 11, color: 'var(--white-dim)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {/* ISSUE 1 FIX: show abandoned pay_now as info, not a charge button */}
              {abandonedPayNow.length > 0 && (
                <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={11} />
                  {abandonedPayNow.length} Pay Now unpaid — follow up with guest
                </span>
              )}
              {checkoutTotal > 0 && (
                <span style={{ color: 'var(--amber)' }}>
                  ₱{checkoutTotal.toFixed(2)} pending at checkout
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: chevron only — NO charge button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {open
            ? <ChevronUp   size={16} style={{ color: 'var(--gold)' }} />
            : <ChevronDown size={16} style={{ color: 'var(--gold)' }} />
          }
        </div>
      </div>

      {/* Expanded order table */}
      {open && (
        <div style={{ borderTop: '1px solid var(--gold-border)' }}>
          {displayOrders.length === 0 ? (
            <div style={{
              padding: '20px 16px', fontSize: 12,
              color: 'var(--white-dim)', textAlign: 'center',
            }}>
              No orders match the current filter.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(201,168,76,0.04)' }}>
                  {['Item', 'Qty', 'Price', 'Order Status', 'Payment', 'Type', 'Placed'].map(h => (
                    <th key={h} style={{
                      padding: '8px 16px', textAlign: 'left',
                      fontSize: 9, fontWeight: 700, letterSpacing: 2,
                      textTransform: 'uppercase', color: 'var(--gold)',
                      borderBottom: '1px solid var(--gold-border)',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayOrders.map(order => (
                  <tr
                    key={order.id}
                    style={{
                      borderBottom: '1px solid rgba(201,168,76,0.06)',
                      opacity: order.order_status === 'cancelled' ? 0.45 : 1,
                    }}
                  >
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--white)' }}>
                      {order.food_item_name}
                      {order.order_status === 'cancelled' && (
                        <span style={{
                          marginLeft: 8, fontSize: 9,
                          color: 'var(--white-dim)', letterSpacing: 1, textTransform: 'uppercase',
                        }}>
                          cancelled
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--white-dim)' }}>
                      {order.quantity}
                    </td>
                    <td style={{
                      padding: '10px 16px',
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 13, color: 'var(--white)',
                    }}>
                      ₱{safeMoney(order.total_price).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        textTransform: 'uppercase', padding: '3px 8px',
                        color:      order.order_status === 'completed' ? '#4ade80'
                                  : order.order_status === 'cancelled' ? 'rgba(248,246,240,0.4)'
                                  : 'var(--amber)',
                        background: order.order_status === 'completed' ? 'rgba(74,222,128,0.1)'
                                  : order.order_status === 'cancelled' ? 'rgba(248,246,240,0.05)'
                                  : 'rgba(201,168,76,0.1)',
                        border: `1px solid ${
                          order.order_status === 'completed' ? 'rgba(74,222,128,0.25)'
                          : order.order_status === 'cancelled' ? 'rgba(248,246,240,0.12)'
                          : 'rgba(201,168,76,0.3)'
                        }`,
                      }}>
                        {order.order_status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 1,
                        textTransform: 'uppercase', padding: '3px 8px',
                        color:      order.payment_status === 'paid' ? '#4ade80' : '#f87171',
                        background: order.payment_status === 'paid' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.08)',
                        border: `1px solid ${order.payment_status === 'paid' ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.3)'}`,
                      }}>
                        {order.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 10, color: 'var(--white-dim)', letterSpacing: 0.5 }}>
                      {order.payment_type === 'pay_now' ? 'Pay Now' : 'At Checkout'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 10, color: 'rgba(248,246,240,0.35)' }}>
                      {order.created_at
                        ? new Date(order.created_at).toLocaleTimeString('en-PH', {
                            hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Checkout total footer — only if there are unpaid pay_checkout orders */}
          {checkoutTotal > 0 && (
            <div style={{
              padding: '10px 16px',
              background: 'rgba(201,168,76,0.04)',
              borderTop: '1px solid var(--gold-border)',
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <span style={{ fontSize: 12, color: 'var(--white-dim)' }}>
                To collect at checkout:{' '}
                <strong style={{ color: 'var(--gold)' }}>₱{checkoutTotal.toFixed(2)}</strong>
                <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(248,246,240,0.35)' }}>
                  — settled during guest checkout
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FoodOrdersFrontDeskPage() {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // ISSUE 5 FIX: order status filter for the entire page
  const [statusFilter, setStatusFilter] = useState('all');

  const timerRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/food/orders/admin/');
      setOrders(res.data.results ?? res.data);
      setLastUpdate(new Date());
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

  // ISSUE 2 FIX: group by room_number, handle null gracefully
  const byRoom = orders.reduce((acc, o) => {
    const room = o.room_number ?? '—';
    if (!acc[room]) acc[room] = [];
    acc[room].push(o);
    return acc;
  }, {});

  // KPI calculations
  const pendingCount = orders.filter(o => o.order_status === 'pending').length;

  // ISSUE 1 FIX: "Pay Now Unpaid" = abandoned/failed — shown as info, not charged
  const abandonedPayNow = orders.filter(
    o => o.payment_type === 'pay_now' && o.payment_status === 'unpaid' && o.order_status !== 'cancelled',
  ).length;

  // ISSUE 3 FIX: at-checkout total = unpaid + not cancelled only
  const checkoutTotal = orders
    .filter(
      o => o.payment_type === 'pay_checkout'
        && o.payment_status === 'unpaid'
        && o.order_status !== 'cancelled',
    )
    .reduce((s, o) => s + safeMoney(o.total_price), 0);

  const STATUS_FILTERS = [
    { value: 'all',       label: 'All Orders'  },
    { value: 'pending',   label: 'Pending'     },
    { value: 'completed', label: 'Completed'   },
    { value: 'cancelled', label: 'Cancelled'   },
  ];

  return (
    <div style={{
      padding: '44px 48px 80px', maxWidth: 1100, margin: '0 auto',
      fontFamily: "'Raleway', sans-serif", color: 'var(--white)',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: 32, flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 3,
            textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 8px',
          }}>
            Front Desk
          </p>
          <h1 style={{
            fontFamily: "'Playfair Display', serif", fontSize: 28,
            color: 'var(--white)', margin: '0 0 4px',
          }}>
            Food Orders
          </h1>
          <p style={{ fontSize: 13, color: 'var(--white-dim)', margin: 0 }}>
            {Object.keys(byRoom).length} rooms with orders
          </p>
          <div style={{
            width: 44, height: 1,
            background: 'linear-gradient(90deg, var(--gold), transparent)',
            marginTop: 16,
          }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdate && (
            <span style={{
              fontSize: 11, color: 'rgba(248,246,240,0.3)',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <RefreshCw size={11} />
              {lastUpdate.toLocaleTimeString('en-PH', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </span>
          )}
          <button
            onClick={() => load()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              background: 'var(--gold-dim)', border: '1px solid var(--gold-border)',
              color: 'var(--gold)', fontFamily: "'Raleway', sans-serif",
              fontSize: 12, cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI strips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          {
            label: 'Pending Orders',
            value: pendingCount,
            color: 'var(--amber)',
          },
          {
            // ISSUE 1 FIX: re-labelled so staff understand this is not chargeable here
            label: 'Pay Now — Unpaid (follow up)',
            value: abandonedPayNow,
            color: abandonedPayNow > 0 ? '#f87171' : 'var(--white-dim)',
          },
          {
            label: 'At Checkout (to collect)',
            value: `₱${checkoutTotal.toFixed(2)}`,
            color: 'var(--gold)',
          },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--navy-card)', border: '1px solid var(--gold-border)',
            padding: '16px 18px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 1,
              background: 'linear-gradient(90deg, var(--gold), transparent)',
            }} />
            <div style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 22, color: k.color, lineHeight: 1,
            }}>
              {k.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--white-dim)', marginTop: 4, letterSpacing: 0.5 }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* ISSUE 5 FIX: status filter bar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
      }}>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            style={{
              padding: '6px 16px',
              background: statusFilter === f.value ? 'var(--gold-dim)' : 'transparent',
              border: `1px solid ${statusFilter === f.value ? 'var(--gold)' : 'var(--gold-border)'}`,
              color: statusFilter === f.value ? 'var(--gold)' : 'var(--white-dim)',
              fontFamily: "'Raleway', sans-serif",
              fontSize: 11, fontWeight: 600, letterSpacing: 1,
              cursor: 'pointer', textTransform: 'uppercase',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ISSUE 1 FIX: info notice when there are abandoned pay_now orders */}
      {abandonedPayNow > 0 && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)',
          padding: '10px 16px', marginBottom: 20, fontSize: 12,
          color: '#f87171',
        }}>
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>{abandonedPayNow}</strong> Pay Now order{abandonedPayNow !== 1 ? 's' : ''} are
            unpaid — the guest's online payment likely failed or was abandoned. These are{' '}
            <strong>not charged here</strong>. Please contact the guest to retry payment, or cancel
            the order if it will not be fulfilled.
          </span>
        </div>
      )}

      {/* Room groups */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--white-dim)', fontSize: 13 }}>
          Loading orders…
        </div>
      ) : Object.keys(byRoom).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--white-dim)', fontSize: 13 }}>
          No food orders yet.
        </div>
      ) : (
        Object.entries(byRoom)
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
          .map(([room, roomOrders]) => (
            <RoomGroup
              key={room}
              roomNumber={room}
              orders={roomOrders}
              statusFilter={statusFilter}
            />
          ))
      )}
    </div>
  );
}