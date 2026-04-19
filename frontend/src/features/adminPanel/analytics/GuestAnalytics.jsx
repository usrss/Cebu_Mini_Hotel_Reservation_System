import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { analyticsApi, guestApi } from '../../../services/adminApi';

const COLORS = ['#6EE7B7','#93C5FD'];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#FFFFFF', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, boxShadow: '0 4px 20px rgba(1,0,13,0.09)' }}>
      <p style={{ color: '#52515E', fontWeight: 700, margin: '0 0 6px' }}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{ color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

export default function GuestAnalytics({ period }) {
  const [chartPeriod, setChartPeriod] = useState(period ?? 'monthly');
  const [report,      setReport]      = useState(null);
  const [guestCount,  setGuestCount]  = useState(null);

  useEffect(() => { setChartPeriod(period ?? 'monthly'); }, [period]);

  useEffect(() => {
    Promise.allSettled([
      guestApi.list({ page: 1 }),
      analyticsApi.report('guests', chartPeriod),
    ]).then(([guests, rep]) => {
      if (guests.status === 'fulfilled') setGuestCount(guests.value.count ?? null);
      if (rep.status    === 'fulfilled') setReport(rep.value.data ?? rep.value);
    });
  }, [chartPeriod]);

  const summary   = report?.summary ?? {};
  const newG      = summary.new_guests       ?? 0;
  const returning = summary.returning_guests ?? 0;
  const total     = newG + returning;
  const newPct    = total > 0 ? Math.round((newG / total) * 100) : 0;
  const retPct    = total > 0 ? Math.round((returning / total) * 100) : 0;

  const donutData = total > 0 ? [
    { name: `New (${newPct}%)`,       value: newG },
    { name: `Returning (${retPct}%)`, value: returning },
  ] : [];

  const trendData = (report?.rows ?? []).map(r => ({
    name: String(r.date ?? r.period ?? '').slice(-5),
    'New Guests':       Number(r.new_guests ?? 0),
    'Returning Guests': Number(r.returning_guests ?? 0),
  }));

  return (
    <>
      <div className="an-grid-4">
        {[
          { label: 'Total Guests',       value: guestCount,                         color: '#3B5BDB' },
          { label: 'New Guests',         value: newG || '—',                        color: '#6EE7B7' },
          { label: 'Returning Guests',   value: returning || '—',                   color: '#93C5FD' },
          { label: 'Avg Stay (nights)',  value: summary.avg_stay_nights ?? '—',     color: '#FCD34D' },
        ].map((k, i) => (
          <div key={i} className="an-stat-box">
            <span className="an-stat-box-label">{k.label}</span>
            <span className="an-stat-box-value" style={{ color: k.color }}>{k.value ?? '—'}</span>
          </div>
        ))}
      </div>

      <div className="an-grid-chart-wide">
        {/* Trend line */}
        <div className="an-card">
          <div className="an-card-header">
            <div><p className="an-card-eyebrow">Trend</p><h3 className="an-card-title">Guest Registrations</h3></div>
            <div className="an-chart-period">
              {['daily','weekly','monthly','yearly'].map(p => (
                <button key={p} className={`an-chart-period-btn${chartPeriod===p?' an-chart-period-btn--active':''}`}
                  onClick={() => setChartPeriod(p)}>
                  {p.slice(0,1).toUpperCase()+p.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {trendData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" />
                <XAxis dataKey="name" tick={{ fill:'#7A7987', fontSize:10 }} />
                <YAxis tick={{ fill:'#7A7987', fontSize:10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:11, color:'#52515E' }} />
                <Line type="monotone" dataKey="New Guests"       stroke="#6EE7B7" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Returning Guests" stroke="#93C5FD" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No guest trend data.</div>}
        </div>

        {/* Donut */}
        <div className="an-card">
          <p className="an-card-eyebrow">Breakdown</p>
          <h3 className="an-card-title">New vs Returning</h3>
          {donutData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={4} dataKey="value">
                  {donutData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:10, color:'#52515E' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No data.</div>}
        </div>
      </div>

      {report?.rows?.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Detail</p>
          <h3 className="an-card-title">Guest Report</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead><tr>{Object.keys(report.rows[0]).map(k => <th key={k}>{k.replace(/_/g,' ')}</th>)}</tr></thead>
              <tbody>
                {report.rows.slice(0,20).map((row,i) => (
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