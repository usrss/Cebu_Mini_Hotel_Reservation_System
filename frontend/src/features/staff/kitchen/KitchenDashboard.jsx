/**
 * KitchenDashboard.jsx
 * Kitchen staff view — pending food orders + mark completed.
 * Polls every 30s for new orders automatically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Clock, RefreshCw, UtensilsCrossed } from 'lucide-react';
import { getStoredUser } from '../../../services/api';
import { kitchenApi } from './kitchenApi';
import './KitchenDashboard.css';

const POLL_MS = 30_000;

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pending',   cls: 'kd-badge kd-badge--amber'  },
    completed: { label: 'Completed', cls: 'kd-badge kd-badge--green'  },
    cancelled: { label: 'Cancelled', cls: 'kd-badge kd-badge--gray'   },
  };
  const b = map[status] ?? map.pending;
  return <span className={b.cls}>{b.label}</span>;
}

function PayBadge({ type }) {
  return (
    <span className="kd-pay-badge">
      {type === 'pay_now' ? 'Pay Now' : 'Pay at Checkout'}
    </span>
  );
}

function OrderRow({ order, onComplete, completing }) {
  const isCompleting = completing === order.id;
  return (
    <div className={`kd-order-row${order.order_status === 'completed' ? ' kd-order-row--done' : ''}`}>
      <div className="kd-order-room">
        <span className="kd-room-label">Room</span>
        <span className="kd-room-number">{order.room_number ?? '—'}</span>
      </div>
      <div className="kd-order-info">
        <p className="kd-food-name">{order.food_item_name}</p>
        <p className="kd-food-meta">
          Qty: <strong>{order.quantity}</strong>
          {order.notes && <span className="kd-notes"> · {order.notes}</span>}
        </p>
        <p className="kd-food-time">
          {new Date(order.created_at).toLocaleTimeString('en-PH', {
            hour: '2-digit', minute: '2-digit',
          })} · {new Date(order.created_at).toLocaleDateString('en-PH', {
            month: 'short', day: 'numeric',
          })}
        </p>
      </div>
      <div className="kd-order-meta">
        <StatusBadge status={order.order_status} />
        <PayBadge type={order.payment_type} />
      </div>
      <div className="kd-order-action">
        {order.order_status === 'pending' ? (
          <button
            className="kd-complete-btn"
            onClick={() => onComplete(order.id)}
            disabled={isCompleting}
          >
            {isCompleting ? (
              <RefreshCw size={14} className="kd-spin" />
            ) : (
              <CheckCircle2 size={14} />
            )}
            {isCompleting ? 'Marking…' : 'Mark Completed'}
          </button>
        ) : (
          <span className="kd-done-label">
            <CheckCircle2 size={13} /> Done
          </span>
        )}
      </div>
    </div>
  );
}

export default function KitchenDashboard() {
  const user        = getStoredUser();
  const displayName = user?.first_name || 'Staff';

  const [tab,        setTab]        = useState('pending');   // 'pending' | 'completed'
  const [pending,    setPending]    = useState([]);
  const [completed,  setCompleted]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [completing, setCompleting] = useState(null);
  const [error,      setError]      = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [pRes, cRes] = await Promise.all([
        kitchenApi.getPending(),
        kitchenApi.getCompleted(),
      ]);
      setPending(pRes);
      setCompleted(cRes);
      setLastUpdate(new Date());
    } catch {
      setError('Failed to load orders. Retrying…');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    timerRef.current = setInterval(() => fetchOrders(true), POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchOrders]);

  async function handleComplete(orderId) {
    setCompleting(orderId);
    try {
      await kitchenApi.markCompleted(orderId);
      await fetchOrders(true);
    } catch {
      setError('Failed to mark order as completed.');
    } finally {
      setCompleting(null);
    }
  }

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const displayList = tab === 'pending' ? pending : completed;

  return (
    <div className="kd-page">

      {/* ── Header ── */}
      <div className="kd-header">
        <div>
          <p className="kd-eyebrow">Kitchen Dashboard</p>
          <h1 className="kd-title">{greeting}, {displayName}</h1>
          <p className="kd-subtitle">
            {new Date().toLocaleDateString('en-PH', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
          <div className="kd-divider" />
        </div>
        {lastUpdate && (
          <div className="kd-refresh-note">
            <RefreshCw size={11} />
            Updated {lastUpdate.toLocaleTimeString('en-PH', {
              hour: '2-digit', minute: '2-digit', second: '2-digit',
            })}
          </div>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div className="kd-strips">
        <div className="kd-strip">
          <Clock size={16} className="kd-strip-icon kd-strip-icon--amber" />
          <div>
            <div className="kd-strip-value">{pending.length}</div>
            <div className="kd-strip-name">Pending Orders</div>
          </div>
        </div>
        <div className="kd-strip">
          <CheckCircle2 size={16} className="kd-strip-icon kd-strip-icon--green" />
          <div>
            <div className="kd-strip-value">{completed.length}</div>
            <div className="kd-strip-name">Completed Today</div>
          </div>
        </div>
        <div className="kd-strip">
          <UtensilsCrossed size={16} className="kd-strip-icon kd-strip-icon--gold" />
          <div>
            <div className="kd-strip-value">
              {pending.filter(o => o.payment_type === 'pay_now').length}
            </div>
            <div className="kd-strip-name">Pay Now Orders</div>
          </div>
        </div>
      </div>

      {/* ── Error ── */}
      {error && <div className="kd-error">{error}</div>}

      {/* ── Tabs ── */}
      <div className="kd-tabs">
        <button
          className={`kd-tab${tab === 'pending' ? ' kd-tab--active' : ''}`}
          onClick={() => setTab('pending')}
        >
          Pending
          {pending.length > 0 && (
            <span className="kd-tab-badge">{pending.length}</span>
          )}
        </button>
        <button
          className={`kd-tab${tab === 'completed' ? ' kd-tab--active' : ''}`}
          onClick={() => setTab('completed')}
        >
          Completed
        </button>
        <button
          className="kd-refresh-btn"
          onClick={() => fetchOrders()}
          disabled={loading}
        >
          <RefreshCw size={13} className={loading ? 'kd-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Orders list ── */}
      <div className="kd-orders">
        {loading && (
          <div className="kd-loading">Loading orders…</div>
        )}

        {!loading && displayList.length === 0 && (
          <div className="kd-empty">
            <UtensilsCrossed size={32} className="kd-empty-icon" />
            <p>{tab === 'pending' ? 'No pending orders right now.' : 'No completed orders today.'}</p>
          </div>
        )}

        {!loading && displayList.map(order => (
          <OrderRow
            key={order.id}
            order={order}
            onComplete={handleComplete}
            completing={completing}
          />
        ))}
      </div>
    </div>
  );
}