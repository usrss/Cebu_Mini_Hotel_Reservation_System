/**
 * FoodOrdersAdminPage.jsx
 * Admin + Manager — all food orders with filters by room, guest, date, payment type.
 * Route: /admin/food-orders
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../../../services/api';

const POLL_MS = 30_000;

const STATUS_STYLE = {
  pending:   { color:'var(--amber, #C9A84C)', bg:'rgba(201,168,76,0.1)',   border:'rgba(201,168,76,0.3)'   },
  completed: { color:'#4ade80',               bg:'rgba(74,222,128,0.1)',   border:'rgba(74,222,128,0.25)'  },
  cancelled: { color:'var(--white-dim)',       bg:'rgba(255,255,255,0.04)', border:'var(--gold-border)'    },
};
const PAYMENT_STYLE = {
  unpaid: { color:'#f87171', bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.25)' },
  paid:   { color:'#4ade80', bg:'rgba(74,222,128,0.1)',   border:'rgba(74,222,128,0.25)'  },
};

function Badge({ label, style }) {
  return (
    <span style={{
      fontSize:9, fontWeight:700, letterSpacing:1, textTransform:'uppercase',
      padding:'3px 8px',
      color: style.color, background: style.bg, border:`1px solid ${style.border}`,
    }}>
      {label}
    </span>
  );
}

function RoomGroup({ roomNumber, orders, onRefresh }) {
  const [open, setOpen] = useState(false);
  const total      = orders.reduce((s, o) => s + parseFloat(o.total_price), 0);
  const unpaidPay  = orders.filter(o => o.payment_type === 'pay_now'      && o.payment_status === 'unpaid');
  const checkoutOwed = orders.filter(o => o.payment_type === 'pay_checkout' && o.payment_status === 'unpaid');

  return (
    <div style={{ border:'1px solid var(--gold-border)', marginBottom:10, position:'relative', overflow:'hidden' }}>
      {/* gold top line */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg, var(--gold), transparent)' }} />

      {/* Room header row */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          width:'100%', padding:'14px 20px',
          background:'var(--navy-card)', border:'none', cursor:'pointer',
          fontFamily:"'Raleway', sans-serif", color:'var(--white)',
        }}
      >
        <div style={{ display:'flex', alignItems:'center', gap:16, textAlign:'left' }}>
          <div style={{ background:'var(--gold-dim)', border:'1px solid var(--gold-border)', padding:'6px 12px', minWidth:48, textAlign:'center' }}>
            <div style={{ fontSize:9, color:'var(--gold)', fontWeight:700, letterSpacing:1.5, textTransform:'uppercase' }}>Room</div>
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:20, color:'var(--white)', lineHeight:1 }}>{roomNumber}</div>
          </div>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:13, fontWeight:600 }}>{orders.length} order{orders.length !== 1 ? 's' : ''}</div>
            <div style={{ fontSize:11, color:'var(--white-dim)', marginTop:2 }}>
              Total: <strong style={{ color:'var(--gold)' }}>₱{total.toFixed(2)}</strong>
              {unpaidPay.length > 0 && <span style={{ color:'#f87171', marginLeft:10 }}>{unpaidPay.length} Pay Now unpaid</span>}
              {checkoutOwed.length > 0 && <span style={{ color:'var(--amber, #C9A84C)', marginLeft:10 }}>{checkoutOwed.length} at checkout</span>}
            </div>
          </div>
        </div>
        {open ? <ChevronUp size={16} style={{ color:'var(--gold)' }} /> : <ChevronDown size={16} style={{ color:'var(--gold)' }} />}
      </button>

      {/* Itemized breakdown */}
      {open && (
        <div style={{ borderTop:'1px solid var(--gold-border)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'rgba(201,168,76,0.04)' }}>
                {['Item', 'Qty', 'Price', 'Order Status', 'Payment', 'Type', 'Ordered'].map(h => (
                  <th key={h} style={{ padding:'8px 16px', textAlign:'left', fontSize:9, fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:'var(--gold)', whiteSpace:'nowrap', borderBottom:'1px solid var(--gold-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} style={{ borderBottom:'1px solid rgba(201,168,76,0.06)' }}>
                  <td style={{ padding:'10px 16px', fontSize:13, fontWeight:600, color:'var(--white)' }}>{order.food_item_name}</td>
                  <td style={{ padding:'10px 16px', fontSize:13, color:'var(--white-dim)' }}>{order.quantity}</td>
                  <td style={{ padding:'10px 16px', fontSize:13, color:'var(--white)', fontFamily:"'Playfair Display', serif" }}>₱{parseFloat(order.total_price).toFixed(2)}</td>
                  <td style={{ padding:'10px 16px' }}><Badge label={order.order_status} style={STATUS_STYLE[order.order_status] ?? STATUS_STYLE.pending} /></td>
                  <td style={{ padding:'10px 16px' }}><Badge label={order.payment_status} style={PAYMENT_STYLE[order.payment_status] ?? PAYMENT_STYLE.unpaid} /></td>
                  <td style={{ padding:'10px 16px', fontSize:10, color:'var(--white-dim)', textTransform:'uppercase', letterSpacing:0.5 }}>
                    {order.payment_type === 'pay_now' ? 'Pay Now' : 'Checkout'}
                  </td>
                  <td style={{ padding:'10px 16px', fontSize:11, color:'var(--white-dim)' }}>
                    {new Date(order.created_at).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FoodOrdersAdminPage() {
  const [orders,     setOrders]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Filters
  const [filterStatus,  setFilterStatus]  = useState('');
  const [filterPayType, setFilterPayType] = useState('');
  const [filterDate,    setFilterDate]    = useState('');
  const [filterRoom,    setFilterRoom]    = useState('');

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

  // Apply filters
  const filtered = orders.filter(o => {
    if (filterStatus  && o.order_status   !== filterStatus)  return false;
    if (filterPayType && o.payment_type   !== filterPayType) return false;
    if (filterDate    && !o.created_at.startsWith(filterDate)) return false;
    if (filterRoom    && String(o.room_number) !== filterRoom) return false;
    return true;
  });

  // Group by room
  const byRoom = filtered.reduce((acc, o) => {
    const room = o.room_number ?? 'Unknown';
    if (!acc[room]) acc[room] = [];
    acc[room].push(o);
    return acc;
  }, {});

  const totalRevenue = filtered
    .filter(o => o.payment_status === 'paid')
    .reduce((s, o) => s + parseFloat(o.total_price), 0);

  const selectStyle = {
    background:'var(--navy-mid)', border:'1px solid var(--gold-border)',
    color:'var(--white)', padding:'7px 12px', fontSize:12,
    fontFamily:"'Raleway', sans-serif", cursor:'pointer',
  };

  return (
    <div style={{ padding:'44px 48px 80px', maxWidth:1200, margin:'0 auto', fontFamily:"'Raleway', sans-serif", color:'var(--white)' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:32, flexWrap:'wrap', gap:16 }}>
        <div>
          <p style={{ fontSize:10, fontWeight:700, letterSpacing:3, textTransform:'uppercase', color:'var(--gold)', margin:'0 0 8px' }}>Admin Panel</p>
          <h1 style={{ fontFamily:"'Playfair Display', serif", fontSize:28, color:'var(--white)', margin:'0 0 4px' }}>Food Orders</h1>
          <p style={{ fontSize:13, color:'var(--white-dim)', margin:0 }}>
            {filtered.length} orders · ₱{totalRevenue.toFixed(2)} collected
          </p>
          <div style={{ width:44, height:1, background:'linear-gradient(90deg, var(--gold), transparent)', marginTop:16 }} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {lastUpdate && (
            <span style={{ fontSize:11, color:'rgba(248,246,240,0.3)', display:'flex', alignItems:'center', gap:5 }}>
              <RefreshCw size={11} />
              {lastUpdate.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
            </span>
          )}
          <button
            onClick={() => load()}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:'var(--gold-dim)', border:'1px solid var(--gold-border)', color:'var(--gold)', fontFamily:"'Raleway', sans-serif", fontSize:12, cursor:'pointer' }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI strips */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:28 }}>
        {[
          { label:'Total Orders',   value: orders.length,                                          color:'var(--gold)'   },
          { label:'Pending',        value: orders.filter(o => o.order_status === 'pending').length, color:'var(--amber, #C9A84C)' },
          { label:'Completed',      value: orders.filter(o => o.order_status === 'completed').length, color:'#4ade80'    },
          { label:'Revenue Paid',   value:`₱${totalRevenue.toFixed(2)}`,                           color:'#4ade80'       },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--navy-card)', border:'1px solid var(--gold-border)', padding:'16px 18px', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:'linear-gradient(90deg, var(--gold), transparent)' }} />
            <div style={{ fontFamily:"'Playfair Display', serif", fontSize:22, color: k.color, lineHeight:1 }}>{k.value}</div>
            <div style={{ fontSize:10, color:'var(--white-dim)', marginTop:4, letterSpacing:0.5 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
        <select style={selectStyle} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select style={selectStyle} value={filterPayType} onChange={e => setFilterPayType(e.target.value)}>
          <option value="">All Payment Types</option>
          <option value="pay_now">Pay Now</option>
          <option value="pay_checkout">Pay at Checkout</option>
        </select>
        <input
          type="date"
          style={{ ...selectStyle }}
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filter by room…"
          style={{ ...selectStyle, minWidth:140 }}
          value={filterRoom}
          onChange={e => setFilterRoom(e.target.value)}
        />
        {(filterStatus || filterPayType || filterDate || filterRoom) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPayType(''); setFilterDate(''); setFilterRoom(''); }}
            style={{ ...selectStyle, color:'#f87171', border:'1px solid rgba(248,113,113,0.3)', cursor:'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Orders grouped by room */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'64px 0', color:'var(--white-dim)', fontSize:13 }}>Loading orders…</div>
      ) : Object.keys(byRoom).length === 0 ? (
        <div style={{ textAlign:'center', padding:'64px 0', color:'var(--white-dim)', fontSize:13 }}>No orders match the current filters.</div>
      ) : (
        Object.entries(byRoom)
          .sort(([a], [b]) => String(a).localeCompare(String(b)))
          .map(([room, roomOrders]) => (
            <RoomGroup key={room} roomNumber={room} orders={roomOrders} onRefresh={load} />
          ))
      )}
    </div>
  );
}