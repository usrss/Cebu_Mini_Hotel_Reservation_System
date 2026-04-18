import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { analyticsApi } from '../../../services/adminApi';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#FFFFFF', border:'none', borderRadius:10, padding:'10px 14px', fontFamily:"'DM Sans',sans-serif", fontSize:12, boxShadow:'0 4px 20px rgba(1,0,13,0.09)' }}>
      <p style={{ color:'#52515E', fontWeight:700, margin:'0 0 6px' }}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{ color:p.color, margin:'2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

export default function RoomPerformance({ period }) {
  const [chartPeriod, setChartPeriod] = useState(period ?? 'monthly');
  const [report,      setReport]      = useState(null);
  const [loading,     setLoading]     = useState(false);

  useEffect(() => { setChartPeriod(period ?? 'monthly'); }, [period]);

  useEffect(() => {
    setLoading(true);
    analyticsApi.report('occupancy', chartPeriod)
      .then(res => setReport(res.data ?? res))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [chartPeriod]);

  const rows   = report?.rows ?? [];
  const sorted = [...rows].sort((a,b) =>
    (Number(b.total_bookings ?? b.bookings ?? 0)) - (Number(a.total_bookings ?? a.bookings ?? 0))
  );
  const top5   = sorted.slice(0, 5).map(r => ({
    name:  r.room_number ? `Room ${r.room_number}` : (r.room_type ?? 'Room'),
    value: Number(r.total_bookings ?? r.bookings) || 0,
  }));
  const bot5   = sorted.slice(-5).reverse().map(r => ({
    name:  r.room_number ? `Room ${r.room_number}` : (r.room_type ?? 'Room'),
    value: Number(r.total_bookings ?? r.bookings) || 0,
  }));

  const PERIOD_OPTS = ['daily','weekly','monthly','yearly'];

  const periodRow = (
    <div className="an-chart-period">
      {PERIOD_OPTS.map(p => (
        <button key={p} className={`an-chart-period-btn${chartPeriod===p?' an-chart-period-btn--active':''}`}
          onClick={() => setChartPeriod(p)}>
          {p.slice(0,1).toUpperCase()+p.slice(1)}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="an-grid-chart-table">
        {/* Top 5 */}
        <div className="an-card">
          <div className="an-card-header">
            <div><p className="an-card-eyebrow">Most Popular</p><h3 className="an-card-title">Top 5 Booked Rooms</h3></div>
            {periodRow}
          </div>
          {loading ? (
            <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
          ) : top5.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={top5} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'#7A7987', fontSize:10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill:'#7A7987', fontSize:10 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Bookings" radius={[0,2,2,0]}>
                  {top5.map((_,i) => <Cell key={i} fill="#3B5BDB" fillOpacity={1 - i * 0.12} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No data available.</div>}
        </div>

        {/* Bottom 5 */}
        <div className="an-card">
          <p className="an-card-eyebrow">Least Popular</p>
          <h3 className="an-card-title">Bottom 5 Rooms</h3>
          {loading ? (
            <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
          ) : bot5.length ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={bot5} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(1,0,13,0.05)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'#7A7987', fontSize:10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill:'#7A7987', fontSize:10 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="Bookings" fill="#DC2626" radius={[0,2,2,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No data available.</div>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Full Report</p>
          <h3 className="an-card-title">Room Utilization</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead><tr>{Object.keys(rows[0]).map(k => <th key={k}>{k.replace(/_/g,' ')}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0,20).map((row,i) => (
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