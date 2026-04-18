/**
 * KitchenDashboard.jsx — revised to match AdminDashboard light theme
 * Real-time polling every 15s, no manual refresh button, no emojis.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { CheckCircle2, Clock, RefreshCw, UtensilsCrossed, X } from 'lucide-react';
import { getStoredUser } from '../../../services/api';
import { kitchenApi } from './kitchenApi';
import './KitchenDashboard.css';

const POLL_MS = 15_000;

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'Pending',   cls: 'kd-badge kd-badge--amber' },
    preparing: { label: 'Preparing', cls: 'kd-badge kd-badge--blue'  },
    completed: { label: 'Completed', cls: 'kd-badge kd-badge--green' },
    cancelled: { label: 'Cancelled', cls: 'kd-badge kd-badge--gray'  },
  };
  const b = map[status] ?? map.pending;
  return <span className={b.cls}>{b.label}</span>;
}

function OrderRow({ order, onPrepare, onComplete, actionInProgress }) {
  const isActionInProgress = actionInProgress === order.id;

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
          {new Date(order.created_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
          {' · '}
          {new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="kd-order-meta">
        <StatusBadge status={order.order_status} />
      </div>
      <div className="kd-order-action">
        {order.order_status === 'pending' && (
          <button
            className="kd-btn"
            onClick={() => onPrepare(order.id)}
            disabled={isActionInProgress}
          >
            {isActionInProgress
              ? <RefreshCw size={14} className="kd-spin" />
              : <Clock size={14} />
            }
            {isActionInProgress ? 'Starting…' : 'Start Preparing'}
          </button>
        )}
        {order.order_status === 'preparing' && (
          <button
            className="kd-btn"
            onClick={() => onComplete(order.id)}
            disabled={isActionInProgress}
          >
            {isActionInProgress
              ? <RefreshCw size={14} className="kd-spin" />
              : <CheckCircle2 size={14} />
            }
            {isActionInProgress ? 'Completing…' : 'Mark Completed'}
          </button>
        )}
        {order.order_status === 'completed' && (
          <span className="kd-done-label">
            <CheckCircle2 size={14} /> Done
          </span>
        )}
      </div>
    </div>
  );
}

function OrderHistoryModal({ isOpen, onClose, orders }) {
  if (!isOpen) return null;
  return (
    <div className="kd-modal-overlay" onClick={onClose}>
      <div className="kd-modal" onClick={e => e.stopPropagation()}>
        <div className="kd-modal-header">
          <h2 className="kd-modal-title">Order History</h2>
          <button className="kd-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="kd-modal-body">
          {orders.length === 0 ? (
            <div className="kd-modal-empty"><p>No completed orders yet.</p></div>
          ) : (
            <div className="kd-modal-list">
              {orders.map(order => (
                <div key={order.id} className="kd-modal-item">
                  <div className="kd-modal-item-header">
                    <p className="kd-modal-item-name">{order.food_item_name}</p>
                    <span className="kd-badge kd-badge--green">Completed</span>
                  </div>
                  <p className="kd-modal-item-meta">Room {order.room_number || '—'} · Qty: {order.quantity}</p>
                  <p className="kd-modal-item-time">{new Date(order.created_at).toLocaleString('en-PH')}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KitchenDashboard() {
  const user        = getStoredUser();
  const displayName = user?.first_name || 'Staff';

  const [tab,              setTab]              = useState('pending');
  const [pending,          setPending]          = useState([]);
  const [preparing,        setPreparing]        = useState([]);
  const [completed,        setCompleted]        = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [error,            setError]            = useState('');
  const [historyOpen,      setHistoryOpen]      = useState(false);
  const timerRef = useRef(null);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [pRes, prRes, cRes] = await Promise.all([
        kitchenApi.getPending(),
        kitchenApi.getPreparing(),
        kitchenApi.getCompleted(),
      ]);
      setPending(pRes);
      setPreparing(prRes);
      setCompleted(cRes);
    } catch (err) {
      setError('Failed to load orders. Retrying automatically…');
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    timerRef.current = setInterval(() => fetchOrders(true), POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchOrders]);

  async function handleStartPreparing(orderId) {
    setActionInProgress(orderId);
    try {
      await kitchenApi.markPreparing(orderId);
      await fetchOrders(true);
    } catch (err) {
      setError('Failed to start preparing order.');
      console.error(err);
    } finally { setActionInProgress(null); }
  }

  async function handleMarkCompleted(orderId) {
    setActionInProgress(orderId);
    try {
      await kitchenApi.markCompleted(orderId);
      await fetchOrders(true);
    } catch (err) {
      setError('Failed to mark order as completed.');
      console.error(err);
    } finally { setActionInProgress(null); }
  }

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const displayList = tab === 'pending' ? pending : tab === 'preparing' ? preparing : completed;

  return (
    <div className="kd-page">

      {/* Header */}
      <div className="kd-header">
        <div>
          <span className="kd-eyebrow">Kitchen Dashboard</span>
          <h1 className="kd-title">{greeting}, {displayName}</h1>
          <p className="kd-subtitle">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="kd-divider" />
        </div>
      </div>

      {/* Stats */}
      <div className="kd-strips">
        <div className="kd-strip">
          <Clock size={18} className="kd-strip-icon" />
          <div>
            <div className="kd-strip-value">{pending.length}</div>
            <div className="kd-strip-name">Pending</div>
          </div>
        </div>
        <div className="kd-strip">
          <RefreshCw size={18} className="kd-strip-icon" />
          <div>
            <div className="kd-strip-value">{preparing.length}</div>
            <div className="kd-strip-name">Preparing</div>
          </div>
        </div>
        <div className="kd-strip">
          <CheckCircle2 size={18} className="kd-strip-icon" />
          <div>
            <div className="kd-strip-value">{completed.length}</div>
            <div className="kd-strip-name">Completed</div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && <div className="kd-error">{error}</div>}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="kd-tabs">
          <button className={`kd-tab${tab === 'pending' ? ' kd-tab--active' : ''}`} onClick={() => setTab('pending')}>
            Pending
            {pending.length > 0 && <span className="kd-tab-badge">{pending.length}</span>}
          </button>
          <button className={`kd-tab${tab === 'preparing' ? ' kd-tab--active' : ''}`} onClick={() => setTab('preparing')}>
            Preparing
            {preparing.length > 0 && <span className="kd-tab-badge">{preparing.length}</span>}
          </button>
          <button className={`kd-tab${tab === 'completed' ? ' kd-tab--active' : ''}`} onClick={() => setTab('completed')}>
            Completed
          </button>
        </div>
        {completed.length > 0 && (
          <button className="kd-history-btn" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        )}
      </div>

      {/* Orders */}
      <div className="kd-orders">
        {loading && <div className="kd-loading">Loading orders…</div>}

        {!loading && displayList.length === 0 && (
          <div className="kd-empty">
            <UtensilsCrossed size={30} style={{ opacity: 0.3 }} />
            <p>
              {tab === 'pending'   && 'No pending orders right now.'}
              {tab === 'preparing' && 'No orders being prepared right now.'}
              {tab === 'completed' && 'No completed orders today.'}
            </p>
          </div>
        )}

        {!loading && displayList.map(order => (
          <OrderRow
            key={order.id}
            order={order}
            onPrepare={handleStartPreparing}
            onComplete={handleMarkCompleted}
            actionInProgress={actionInProgress}
          />
        ))}
      </div>

      <OrderHistoryModal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} orders={completed} />
    </div>
  );
}