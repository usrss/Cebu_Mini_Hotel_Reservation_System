import { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts';
import api from '../../../services/api';

const PERIOD_OPTS = [
  { label: 'Today', value: 'today' },
  { label: 'Week',  value: 'week'  },
  { label: 'Month', value: 'month' },
  { label: 'Year',  value: 'year'  },
];
const GROUP_OPTS = [
  { label: 'Day',   value: 'day'   },
  { label: 'Month', value: 'month' },
];

// Map global period from parent (daily/weekly/monthly/yearly) → revenue API period param
const GLOBAL_TO_API = { daily: 'today', weekly: 'week', monthly: 'month', yearly: 'year' };

function StatBox({ label, value, color, sub }) {
  return (
    <div className="an-stat-box">
      <span className="an-stat-box-label">{label}</span>
      <span className="an-stat-box-value" style={{ color: color ?? '#01000D' }}>{value ?? '—'}</span>
      {sub && <span className="an-stat-box-sub">{sub}</span>}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#FFFFFF', border: 'none', borderRadius: 10,
      padding: '10px 14px', fontFamily: "'DM Sans', sans-serif",
      fontSize: 12, boxShadow: '0 4px 20px rgba(1,0,13,0.09)',
    }}>
      <p style={{ color: '#52515E', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>
            {['Revenue', 'Net Revenue', 'Refunded'].includes(p.name)
              ? `₱${Number(p.value).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`
              : p.value}
          </strong>
        </p>
      ))}
    </div>
  );
}

function currency(n) {
  if (n == null) return '—';
  return `₱${Number(n).toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

export default function RevenueAnalytics({ period: globalPeriod }) {
  const [apiPeriod, setApiPeriod] = useState(GLOBAL_TO_API[globalPeriod] ?? 'month');
  const [groupBy,   setGroupBy]   = useState('day');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);

  // Sync when parent global period changes
  useEffect(() => {
    setApiPeriod(GLOBAL_TO_API[globalPeriod] ?? 'month');
  }, [globalPeriod]);

  useEffect(() => {
    setLoading(true);
    api.get('/admin/payments/revenue/', { params: { period: apiPeriod, group_by: groupBy } })
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [apiPeriod, groupBy]);

  const totalRevenue = data?.total_revenue     ?? null;
  const txnCount     = data?.transaction_count ?? null;
  const refunded     = data?.refunded_total    ?? null;
  const netRevenue   = data?.net_revenue       ?? null;
  const pendingCount = data?.pending_count     ?? null;
  const pendingAmt   = data?.pending_amount    ?? null;

  const trendData = (data?.trend ?? []).map(r => ({
    name: r.period
      ? new Date(r.period).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      : '—',
    Revenue:      Number(r.revenue ?? 0),
    Transactions: Number(r.count   ?? 0),
  }));

  return (
    <>
      {/* Alerts */}
      <div className="an-alerts">
        {refunded !== null && Number(refunded) > 0 && (
          <div className="an-alert an-alert--warning">
            ⚠ {currency(refunded)} refunded in this period — net revenue adjusted.
          </div>
        )}
        {pendingCount !== null && pendingCount > 5 && (
          <div className="an-alert an-alert--info">
            💳 {pendingCount} pending payment{pendingCount !== 1 ? 's' : ''} totalling {currency(pendingAmt)}.
          </div>
        )}
        {netRevenue !== null && Number(netRevenue) > 0 && (
          <div className="an-alert an-alert--success">
            ✅ Net revenue {currency(netRevenue)} after refunds.
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="an-grid-4">
        <StatBox label="Total Revenue"  value={loading ? '…' : currency(totalRevenue)} color="#0D9488" />
        <StatBox label="Net Revenue"    value={loading ? '…' : currency(netRevenue)}   color={netRevenue !== null && Number(netRevenue) >= 0 ? '#0D9488' : '#DC2626'} />
        <StatBox label="Refunded"       value={loading ? '…' : currency(refunded)}     color="#DC2626" />
        <StatBox label="Transactions"   value={loading ? '…' : txnCount}              color="#3B5BDB" />
      </div>

      <div className="an-grid-2">
        <StatBox
          label="Pending Payments"
          value={loading ? '…' : pendingCount}
          color="#FCD34D"
          sub={pendingAmt != null ? `${currency(pendingAmt)} pending` : undefined}
        />
        <StatBox
          label="Avg Transaction Value"
          value={loading ? '…' : (txnCount && totalRevenue ? currency(Number(totalRevenue) / Number(txnCount)) : '—')}
          color="#60A5FA"
          sub="Per confirmed payment"
        />
      </div>

      {/* Revenue trend chart */}
      <div className="an-card">
        <div className="an-card-header">
          <div>
            <p className="an-card-eyebrow">Trend</p>
            <h3 className="an-card-title">Revenue Over Time</h3>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="an-chart-period">
              {PERIOD_OPTS.map(p => (
                <button
                  key={p.value}
                  className={`an-chart-period-btn${apiPeriod === p.value ? ' an-chart-period-btn--active' : ''}`}
                  onClick={() => setApiPeriod(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="an-chart-period">
              {GROUP_OPTS.map(g => (
                <button
                  key={g.value}
                  className={`an-chart-period-btn${groupBy === g.value ? ' an-chart-period-btn--active' : ''}`}
                  onClick={() => setGroupBy(g.value)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
        ) : trendData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#7A7987', fontSize: 10 }} />
              <YAxis
                yAxisId="left"
                tick={{ fill: '#7A7987', fontSize: 10 }}
                tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: '#7A7987', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#52515E' }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="Revenue"
                stroke="#0D9488"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Transactions"
                stroke="#3B5BDB"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="an-empty">No revenue data for this period.</div>
        )}
      </div>

      {/* Revenue bar chart */}
      {!loading && trendData.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Breakdown</p>
          <h3 className="an-card-title">Revenue by Period</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" />
              <XAxis dataKey="name" tick={{ fill: '#7A7987', fontSize: 10 }} />
              <YAxis
                tick={{ fill: '#7A7987', fontSize: 10 }}
                tickFormatter={v => `₱${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Revenue" fill="#0D9488" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Detail table */}
      {!loading && trendData.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Detail</p>
          <h3 className="an-card-title">Revenue Report</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Revenue</th>
                  <th>Transactions</th>
                </tr>
              </thead>
              <tbody>
                {trendData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.name}</td>
                    <td style={{ color: '#0D9488', fontWeight: 600 }}>{currency(row.Revenue)}</td>
                    <td>{row.Transactions}</td>
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