import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { analyticsApi } from '../../../services/adminApi';

const DONUT_COLORS = ['#6EE7B7','#3B5BDB','#C4B5FD','#F87171'];

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
    <div style={{ background:'var(--navy-card)', border:'1px solid var(--gold-border)', padding:'10px 14px', fontFamily:'Raleway,sans-serif', fontSize:12 }}>
      <p style={{ color:'var(--gold)', fontWeight:700, margin:'0 0 6px' }}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{ color:p.color, margin:'2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

export default function OccupancyAnalytics({ dashboard, period }) {
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

  const r = dashboard?.rooms;
  const t = dashboard?.tasks;
  const liveOccupancyRate = r?.total ? Math.round((r.occupied / r.total) * 100) : null;
  const avgOccupancyRateRaw = report?.summary?.avg_occupancy_rate ?? report?.summary?.occupancy_rate ?? null;
  const avgOccupancyRate = avgOccupancyRateRaw != null ? Math.round(Number(avgOccupancyRateRaw)) : null;

  const isTodayPeriod = chartPeriod === 'daily';
  const occupancyRate = isTodayPeriod ? liveOccupancyRate : avgOccupancyRate;

  const donutData = r ? [
    { name: 'Available',   value: r.available   ?? 0 },
    { name: 'Occupied',    value: r.occupied    ?? 0 },
    { name: 'Cleaning',    value: r.cleaning    ?? 0 },
    { name: 'Maintenance', value: r.maintenance ?? 0 },
  ].filter(d => d.value > 0) : [];

  const taskData = t ? [
    { name: 'Dirty',              value: t.cleaning_dirty        ?? 0, fill: '#F87171' },
    { name: 'Cleaning',           value: t.cleaning_in_progress  ?? 0, fill: '#FCD34D' },
    { name: 'Maint. Pending',     value: t.maintenance_pending   ?? 0, fill: '#F87171' },
    { name: 'Maint. In Progress', value: t.maintenance_in_progress ?? 0, fill: '#FCD34D' },
  ] : [];

  return (
    <>
      <div className="an-alerts">
        {occupancyRate !== null && occupancyRate < 40 && (
          <div className="an-alert an-alert--warning">⚠ Low occupancy — {occupancyRate}% of rooms occupied.</div>
        )}
        {occupancyRate !== null && occupancyRate >= 80 && (
          <div className="an-alert an-alert--success">🏨 High occupancy — {occupancyRate}% rooms occupied.</div>
        )}
        {(t?.maintenance_pending ?? 0) > 3 && (
          <div className="an-alert an-alert--danger">🛠 {t.maintenance_pending} rooms have pending maintenance.</div>
        )}
      </div>

      <div className="an-grid-4">
        <StatBox
          label={isTodayPeriod ? 'Live Occupancy' : 'Avg Occupancy Rate'}
          value={occupancyRate !== null ? `${occupancyRate}%` : '—'}
          color={occupancyRate >= 70 ? '#6EE7B7' : occupancyRate >= 40 ? '#FCD34D' : '#F87171'} />
        <StatBox
          label="Total Rooms"
          value={isTodayPeriod ? r?.total : report?.summary?.total_rooms ?? r?.total}
          color="var(--white)" />
        <StatBox
          label="Occupied"
          value={
            isTodayPeriod
              ? r?.occupied
              : (avgOccupancyRate != null && report?.summary?.total_rooms != null)
                ? Math.round((avgOccupancyRate / 100) * report.summary.total_rooms)
                : '—'
          }
          color="var(--c-occupancy)" />
        <StatBox
          label="Available"
          value={
            isTodayPeriod
              ? r?.available
              : (avgOccupancyRate != null && report?.summary?.total_rooms != null)
                ? report.summary.total_rooms - Math.round((avgOccupancyRate / 100) * report.summary.total_rooms)
                : '—'
          }
          color="#6EE7B7" />
      </div>

      <div className="an-grid-chart-wide">
        {/* Room status donut */}
        <div className="an-card">
          <p className="an-card-eyebrow">Status</p>
          <h3 className="an-card-title">Room Availability Status</h3>
          {donutData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  paddingAngle={3} dataKey="value">
                  {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:10, color:'rgba(248,246,240,0.55)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No room data.</div>}
        </div>

        {/* Tasks bar chart */}
        <div className="an-card">
          <p className="an-card-eyebrow">Tasks</p>
          <h3 className="an-card-title">Housekeeping & Maintenance</h3>
          {taskData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={taskData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(201,168,76,0.08)" horizontal={false} />
                <XAxis type="number" tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill:'rgba(248,246,240,0.45)', fontSize:10 }} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0,2,2,0]}>
                  {taskData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No task data.</div>}
        </div>
      </div>

      {/* Report table */}
      <div className="an-card">
        <div className="an-card-header">
          <div><p className="an-card-eyebrow">Report</p><h3 className="an-card-title">Occupancy by Room Type</h3></div>
          <div className="an-chart-period">
            {['daily','weekly','monthly'].map(p => (
              <button key={p} className={`an-chart-period-btn${chartPeriod===p?' an-chart-period-btn--active':''}`}
                onClick={() => setChartPeriod(p)}>
                {p.charAt(0).toUpperCase()+p.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="an-loading"><div className="an-spinner" /><span>Loading…</span></div>
        ) : report?.rows?.length ? (
          <div className="an-table-wrap">
            <table className="an-table">
              <thead><tr>{Object.keys(report.rows[0]).map(k => <th key={k}>{k.replace(/_/g,' ')}</th>)}</tr></thead>
              <tbody>
                {report.rows.slice(0,15).map((row,i) => (
                  <tr key={i}>{Object.values(row).map((v,j) => <td key={j}>{v ?? '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="an-empty">No occupancy data available.</div>}
      </div>
    </>
  );
}