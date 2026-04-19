import { useState, useEffect } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import api from '../../../services/api';

const ROLE_LABELS = {
  admin:'Admin', manager:'Manager', receptionist:'Receptionist',
  front_desk:'Front Desk', housekeeping:'Housekeeping',
  maintenance:'Maintenance', security:'Security',
};
const ROLE_COLORS = ['#3B5BDB','#0D9488','#7C3AED','#D97706','#22D3EE','#F87171','#818CF8'];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#FFFFFF', border: 'none', borderRadius: 10, padding: '10px 14px', fontFamily: "'DM Sans', sans-serif", fontSize: 12, boxShadow: '0 4px 20px rgba(1,0,13,0.09)' }}>
      {payload.map((p,i) => <p key={i} style={{ color: p.payload.fill, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>)}
    </div>
  );
}

export default function StaffAnalytics({ dashboard }) {
  const [monitoring, setMonitoring] = useState(null);

  // Poll monitoring every 30s
  useEffect(() => {
    const load = () => api.get('/staff/monitoring/').then(r => setMonitoring(r.data)).catch(() => {});
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  const s      = dashboard?.staff;
  const byRole = monitoring?.by_role ?? {};

  const donutData = Object.entries(byRole)
    .filter(([, d]) => d.count > 0)
    .map(([role, d], i) => ({
      name:  ROLE_LABELS[role] ?? role,
      value: d.count,
      fill:  ROLE_COLORS[i % ROLE_COLORS.length],
    }));

  const statusData = s ? [
    { name: 'Online',  value: s.online  ?? 0, fill: '#6EE7B7' },
    { name: 'Idle',    value: s.idle    ?? 0, fill: '#FCD34D' },
    { name: 'Offline', value: s.offline ?? 0, fill: '#B8B8C0' },
  ].filter(d => d.value > 0) : [];

  return (
    <>
      <div className="an-grid-4">
        {[
          { label: 'Total Active', value: s?.total,   color: '#01000D' },
          { label: 'Online',       value: s?.online,  color: '#6EE7B7' },
          { label: 'Idle',         value: s?.idle,    color: '#FCD34D' },
          { label: 'Offline',      value: s?.offline, color: '#7A7987' },
        ].map((k,i) => (
          <div key={i} className="an-stat-box">
            <span className="an-stat-box-label">{k.label}</span>
            <span className="an-stat-box-value" style={{ color: k.color }}>{k.value ?? '—'}</span>
          </div>
        ))}
      </div>

      <div className="an-grid-chart-table">
        {/* Status donut */}
        <div className="an-card">
          <p className="an-card-eyebrow">Presence</p>
          <h3 className="an-card-title">Online Status</h3>
          {statusData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={4} dataKey="value">
                  {statusData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:10, color:'#52515E' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No status data.</div>}
        </div>

        {/* Role donut */}
        <div className="an-card">
          <p className="an-card-eyebrow">By Role</p>
          <h3 className="an-card-title">Staff Distribution</h3>
          {donutData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {donutData.map((d,i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize:10, color:'#52515E' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="an-empty">No role data.</div>}
        </div>
      </div>

      {dashboard?.recent_activity?.length > 0 && (
        <div className="an-card">
          <p className="an-card-eyebrow">Audit Trail</p>
          <h3 className="an-card-title">Recent Staff Activity</h3>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr><th>Staff</th><th>Action</th><th>Description</th><th>Time</th></tr>
              </thead>
              <tbody>
                {dashboard.recent_activity.slice(0,15).map((log,i) => (
                  <tr key={i}>
                    <td>{log.staff_name ?? log.staff ?? '—'}</td>
                    <td style={{ color:'#3B5BDB', textTransform:'capitalize' }}>
                      {log.action_type?.replace(/_/g,' ')}
                    </td>
                    <td style={{ maxWidth:240, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {log.description}
                    </td>
                    <td>{log.created_at ? new Date(log.created_at).toLocaleTimeString() : '—'}</td>
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