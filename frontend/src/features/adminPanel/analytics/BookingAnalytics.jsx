import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../../../services/adminApi';

const DONUT_COLORS = ['#6EE7B7','#3B5BDB','#93C5FD','#FCD34D','#C4B5FD'];
const PERIODS = ['daily','weekly','monthly'];

function StatBox({ label, value, color }) {
  return (
    <div className="an-stat-box">
      <span className="an-stat-box-label">{label}</span>
      <span className="an-stat-box-value" style={{ color: color ?? 'var(--white)' }}>{value ?? '—'}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--navy-card)', border: '1px solid var(--gold-border)', padding: '10px 14px', fontFamily: 'Raleway, sans-serif', fontSize: 12 }}>
      <p style={{ color: 'var(--gold)', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
}

export default function BookingAnalytics({ dashboard, period }) {
  const [chartPeriod, setChartPeriod] = useState(period ?? 'monthly');
  const [report,      setReport]      = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => { setChartPeriod(period ?? 'monthly'); }, [period]);

  useEffect(() => {
    setLoading(true);
    analyticsApi.report('bookings', chartPeriod)
      .then(res => setReport(res.data ?? res))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [chartPeriod]);

  const b = dashboard?.bookings;

  const summary = report?.summary ?? {};

  const donutData = summary ? [
    { name: 'Confirmed',       value: summary.confirmed        ?? 0 },
    { name: 'Checked In',      value: summary.checked_in       ?? 0 },
    { name: 'Pending Payment', value: summary.pending_payment  ?? 0 },
    { name: 'Cancelled',       value: summary.cancelled        ?? 0 },
    { name: 'No Show',         value: summary.no_show          ?? 0 },
    { name: 'Checked Out',     value: summary.checked_out      ?? 0 },
  ].filter(d => d.value > 0) : [];

  const trendData = (report?.rows ?? []).map(r => ({
    name: String(r.date ?? r.period ?? '').slice(-5),
    Bookings: Number(r.total_bookings ?? r.bookings ?? 0),
    Confirmed: Number(r.confirmed ?? 0),
    Cancelled: Number(r.cancelled ?? 0),
  }));

  return (
    <>
      {/* Alerts */}
      <div className="an-alerts">
        {(b?.created_today ?? 0) > 0 && (
          <div className="an-alert an-alert--success">📈 {b.created_today} new booking{b.created_today !== 1 ? 's' : ''} created today.</div>
        )}
        {(b?.pending_payment ?? 0) > 5 && (
          <div className="an-alert an-alert--warning">⚠ {b.pending_payment} bookings awaiting payment.</div>
        )}
      </div>

      {/* KPI row */}
      <div className="an-grid-4">
        <StatBox label="Checked In"      value={b?.checked_in}      color="var(--c-booking)" />
        <StatBox label="Confirmed"       value={b?.confirmed}       color="#6EE7B7" />
        <StatBox label="Pending Payment" value={b?.pending_payment} color="#FCD34D" />
        <StatBox label="Checked Out"     value={summary.checked_out ?? b?.checked_out_today} color="#60A5FA" />
      </div>

      {/* Today's Activity (NOT part of status distribution donut) */}
      <div className="an-grid-2">
        <StatBox label="Today's Activity — Created"     value={b?.created_today}     color="#93C5FD" />
        <StatBox label="Today's Activity — Checked Out" value={b?.checked_out_today} color="#6EE7B7" />
      </div>

      {/* Donut + Trend side by side */}
      <div className="an-grid-chart-wide">
        {/* Trend line chart */}
        <div className="an-card">
          <div className="an-card-header">
            <div>
              <p className="an-card-eyebrow">Trend</p>
              <h3 className="an-card-title">Booking Trend</h3>
            </div>
            <div className="an-chart-period">
              {PERIODS.map(p => (
                <button key={p} className={`an-chart-period-btn${chartPeriod === p ? ' an-chart-period-btn--active' : ''}`}
                  onClick={() => setChartPeriod(p)}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
          ) : trendData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.08)" />
                <XAxis dataKey="name" tick={{ fill: 'rgba(248,246,240,0.45)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'rgba(248,246,240,0.45)', fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'rgba(248,246,240,0.55)' }} />
                <Line type="monotone" dataKey="Bookings"  stroke="#60A5FA" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Confirmed" stroke="#6EE7B7" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="Cancelled" stroke="#F87171" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="an-empty">No trend data available.</div>
          )}
        </div>

        {/* Donut chart */}
        <div className="an-card">
          <p className="an-card-eyebrow">Distribution</p>
          <h3 className="an-card-title">Booking Status</h3>
          {donutData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {donutData.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10, color: 'rgba(248,246,240,0.55)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="an-empty">No booking data.</div>
          )}
        </div>
      </div>

      {/* Report table */}
      {!loading && (report?.rows?.length > 0) && (
        <div className="an-card">
          <p className="an-card-eyebrow">Detail</p>
          <h3 className="an-card-title">Booking Report</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>{Object.keys(report.rows[0]).map(k => <th key={k}>{k.replace(/_/g,' ')}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.slice(0,20).map((row, i) => (
                  <tr key={i}>{Object.values(row).map((v,j) => <td key={j}>{v ?? '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}