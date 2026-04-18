import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { analyticsApi } from '../../../services/adminApi';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--navy-card)', border:'1px solid var(--gold-border)', padding:'10px 14px', fontFamily:'Raleway,sans-serif', fontSize:12 }}>
      <p style={{ color:'var(--gold)', fontWeight:700, margin:'0 0 6px' }}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{ color:p.color, margin:'2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

export default function CancellationAnalytics({ period }) {
  const [chartPeriod, setChartPeriod] = useState(period ?? 'monthly');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => { setChartPeriod(period ?? 'monthly'); }, [period]);

  useEffect(() => {
    setLoading(true);
    analyticsApi.report('bookings', chartPeriod)
      .then(res => setData(res.data ?? res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [chartPeriod]);

  const rows        = data?.rows ?? [];
  const summary     = data?.summary ?? {};
  const totalBooks  = summary.total_bookings     ?? rows.reduce((a,r) => a + (Number(r.total_bookings)||0), 0);
  const totalCancel = summary.cancelled_bookings ?? rows.reduce((a,r) => a + (Number(r.cancelled)||0), 0);
  const totalNoShow = summary.no_show_bookings   ?? rows.reduce((a,r) => a + (Number(r.no_show)||0), 0);
  // Cancellation rate priority:
  // 1) Backend-provided `summary.cancellation_rate` (preferred / authoritative)
  // 2) Frontend computed fallback ONLY if backend summary doesn't include it.
  const backendCancelRate = summary?.cancellation_rate;
  const cancelRate = backendCancelRate != null
    ? Number(backendCancelRate).toFixed(1)
    : (totalBooks > 0 ? ((totalCancel / totalBooks) * 100).toFixed(1) : null);

  const trendData = rows.map(r => ({
    name:        String(r.date ?? r.period ?? '').slice(-5),
    Bookings:    Number(r.total_bookings  ?? 0),
    Cancelled:   Number(r.cancelled      ?? 0),
    'No Show':   Number(r.no_show        ?? 0),
  }));

  const PERIOD_OPTS = ['daily','weekly','monthly','yearly'];

  return (
    <>
      <div className="an-alerts">
        {cancelRate !== null && Number(cancelRate) > 20 && (
          <div className="an-alert an-alert--danger">⚠ High cancellation rate of {cancelRate}% — review your policy.</div>
        )}
        {cancelRate !== null && Number(cancelRate) <= 10 && (
          <div className="an-alert an-alert--success">✅ Low cancellation rate of {cancelRate}%.</div>
        )}
      </div>

      <div className="an-grid-4">
        {[
          { label: 'Total Bookings',    value: totalBooks,    color: 'var(--white)' },
          { label: 'Cancellations',     value: totalCancel,   color: '#F87171' },
          { label: 'Cancellation Rate', value: cancelRate !== null ? `${cancelRate}%` : '—',
            color: Number(cancelRate) > 20 ? '#F87171' : Number(cancelRate) > 10 ? '#FCD34D' : '#6EE7B7' },
          { label: 'No Shows',          value: totalNoShow,   color: '#C4B5FD' },
        ].map((k,i) => (
          <div key={i} className="an-stat-box">
            <span className="an-stat-box-label">{k.label}</span>
            <span className="an-stat-box-value" style={{ color: k.color }}>{k.value ?? '—'}</span>
          </div>
        ))}
      </div>

      <div className="an-card">
        <div className="an-card-header">
          <div><p className="an-card-eyebrow">Trend</p><h3 className="an-card-title">Cancellation Trend</h3></div>
          <div className="an-chart-period">
            {PERIOD_OPTS.map(p => (
              <button key={p} className={`an-chart-period-btn${chartPeriod===p?' an-chart-period-btn--active':''}`}
                onClick={() => setChartPeriod(p)}>
                {p.slice(0,1).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
        ) : trendData.length ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.08)" />
              <XAxis dataKey="name" tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} />
              <YAxis tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11, color:'rgba(248,246,240,0.55)' }} />
              <Line type="monotone" dataKey="Bookings"  stroke="#60A5FA" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Cancelled" stroke="#F87171" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="No Show"   stroke="#C4B5FD" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="an-empty">No cancellation data available.</div>
        )}
      </div>
    </>
  );
}