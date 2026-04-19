/**
 * FoodAnalytics.jsx
 * Food & Drinks analytics section — matches the BookingAnalytics pattern exactly.
 * Uses the same an-* CSS classes from AnalyticsDashboard.css.
 */
import { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { foodApi } from '../../../services/adminApi';

const CATEGORY_COLORS = {
  food:     '#D97706',
  drinks:   '#3B5BDB',
  snacks:   '#0D9488',
  desserts: '#DB2777',
};
const DONUT_COLORS = ['#D97706', '#3B5BDB', '#0D9488', '#F9A8D4', '#7C3AED'];
const PAYMENT_TYPE_COLORS = {
  "Pay Now": '#60A5FA',
  "Pay Checkout": '#C4B5FD',
};
const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

function StatBox({ label, value, color }) {
  return (
    <div className="an-stat-box">
      <span className="an-stat-box-label">{label}</span>
      <span className="an-stat-box-value" style={{ color: color ?? '#01000D' }}>{value ?? '—'}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#FFFFFF', border: 'none', borderRadius: 10,
      padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
      boxShadow: '0 4px 20px rgba(1,0,13,0.09)',
    }}>
      <p style={{ color: '#52515E', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') ? `₱${p.value.toFixed(2)}` : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function currency(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

export default function FoodAnalytics({ period: globalPeriod }) {
  const [chartPeriod, setChartPeriod] = useState(globalPeriod ?? 'monthly');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => { setChartPeriod(globalPeriod ?? 'monthly'); }, [globalPeriod]);

  useEffect(() => {
    setLoading(true);
    foodApi.analytics(chartPeriod)
      .then(res => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [chartPeriod]);

  const s          = data?.summary;
  const trend      = data?.trend ?? [];
  const topItems   = data?.top_items ?? [];
  const categories = data?.categories ?? [];
  const statusBreakdown = data?.status_breakdown ?? [];
  const paymentSplit    = data?.payment_split ?? [];

  // Donut data for categories
  const categoryDonut = categories.map((c, i) => ({
    name:  c.category.charAt(0).toUpperCase() + c.category.slice(1),
    value: c.orders,
    revenue: c.revenue,
  }));

  return (
    <>
      {/* Alerts */}
      <div className="an-alerts">
        {(s?.pending_orders ?? 0) > 5 && (
          <div className="an-alert an-alert--warning">
            ⚠ {s.pending_orders} food orders currently pending.
          </div>
        )}
        {(s?.total_orders ?? 0) === 0 && !loading && (
          <div className="an-alert an-alert--info">
            No food orders recorded for this period.
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="an-grid-4">
        <StatBox label="Total Orders"    value={loading ? '…' : s?.total_orders}                            color="#3B5BDB"  />
        <StatBox label="Total Revenue"   value={loading ? '…' : currency(s?.total_revenue)}                 color="#D97706"  />
        <StatBox label="Paid Revenue"    value={loading ? '…' : currency(s?.paid_revenue)}                  color="#0D9488" />
        <StatBox label="Avg Order Value" value={loading ? '…' : currency(s?.avg_order_value)}               color="#3B5BDB" />
      </div>

      <div className="an-grid-4" style={{ marginTop: 0 }}>
        <StatBox label="Pending"   value={loading ? '…' : s?.pending_orders}   color="#D97706" />
        <StatBox label="Completed" value={loading ? '…' : s?.completed_orders} color="#4ade80"               />
        {paymentSplit.map((p) => (
          <StatBox
            key={p.type}
            label={p.type}
            value={loading ? '…' : p.count}
            color={PAYMENT_TYPE_COLORS[p.type] ?? '#94A3B8'}
          />
        ))}
      </div>

      {/* Trend + Category Donut */}
      <div className="an-grid-chart-wide">
        {/* Revenue & Orders trend */}
        <div className="an-card">
          <div className="an-card-header">
            <div>
              <p className="an-card-eyebrow">Trend</p>
              <h3 className="an-card-title">Orders & Revenue</h3>
            </div>
            <div className="an-chart-period">
              {PERIODS.map(p => (
                <button key={p}
                  className={`an-chart-period-btn${chartPeriod === p ? ' an-chart-period-btn--active' : ''}`}
                  onClick={() => setChartPeriod(p)}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
          ) : trend.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" />
                <XAxis dataKey="period" tick={{ fill: '#7A7987', fontSize: 10 }}
                  tickFormatter={v => String(v).slice(-5)} />
                <YAxis yAxisId="left"  tick={{ fill: '#7A7987', fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#7A7987', fontSize: 10 }}
                  tickFormatter={v => `₱${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#52515E' }} />
                <Line yAxisId="left"  type="monotone" dataKey="orders"  name="Orders"  stroke="#3B5BDB" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#D97706" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="an-empty">No trend data available.</div>
          )}
        </div>

        {/* Category donut */}
        <div className="an-card">
          <p className="an-card-eyebrow">Distribution</p>
          <h3 className="an-card-title">Orders by Category</h3>
          {categoryDonut.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {categoryDonut.map((entry, i) => (
                    <Cell key={i} fill={CATEGORY_COLORS[entry.name.toLowerCase()] ?? DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: '#52515E' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="an-empty">No category data.</div>
          )}
        </div>
      </div>

      {/* Top items bar chart */}
      {!loading && topItems.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Performance</p>
          <h3 className="an-card-title">Top Items by Revenue</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topItems.slice(0, 8)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#7A7987', fontSize: 10 }}
                tickFormatter={v => `₱${v}`} />
              <YAxis type="category" dataKey="name" width={130}
                tick={{ fill: '#52515E', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenue" fill="#D97706" radius={[0, 3, 3, 0]}>
                {topItems.slice(0, 8).map((entry, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[entry.category] ?? DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top items detail table */}
      {!loading && topItems.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Detail</p>
          <h3 className="an-card-title">Item Breakdown</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Orders</th>
                  <th>Qty Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: '#01000D' }}>{item.name}</td>
                    <td>
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: CATEGORY_COLORS[item.category] ?? '#52515E',
                        background: 'rgba(1,0,13,0.07)',
                        borderRadius: 999, padding: '2px 7px',
                      }}>
                        {item.category}
                      </span>
                    </td>
                    <td>{item.orders}</td>
                    <td>{item.quantity}</td>
                    <td style={{ fontFamily: "'DM Serif Display', serif", color: '#D97706' }}>
                      {currency(item.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}