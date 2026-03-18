/**
 * src/features/staff/activity/ActivityLogPage.jsx
 */

import { useState, useEffect, useCallback } from 'react';
import { activityLogsApi, staffMembersApi } from '../services/staffApi';
import '../Staff.css';

const ACTION_CLASS = {
  check_in_guest:  'sf-badge-green',
  check_out_guest: 'sf-badge-blue',
  create_staff:    'sf-badge-gold',
  deactivate_staff:'sf-badge-red',
  role_change:     'sf-badge-amber',
  create_shift:    'sf-badge-blue',
};

export default function ActivityLogPage() {
  const [logs,    setLogs]    = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [staffId,    setStaffId]    = useState('');
  const [actionType, setActionType] = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (staffId)    params.staff       = staffId;
      if (actionType) params.action_type = actionType;
      if (dateFrom)   params.date_from   = dateFrom;
      if (dateTo)     params.date_to     = dateTo;
      const data = await activityLogsApi.list(params);
      setLogs(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) { setError(err.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  }, [staffId, actionType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffMembersApi.list()
      .then((d) => setMembers(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Audit</p>
            <h1>Activity Logs</h1>
            <p>Immutable audit trail · {logs.length} entries</p>
          </div>
        </div>

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">All Staff</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>)}
          </select>
          <input className="sf-input" value={actionType} onChange={(e) => setActionType(e.target.value)}
            placeholder="Action type…" style={{ maxWidth: 200 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" className="sf-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 150 }} />
            <span style={{ color: 'var(--white-dim)', fontSize: 12 }}>→</span>
            <input type="date" className="sf-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ width: 150 }} />
          </div>
          <button className="sf-filter-clear" onClick={() => { setStaffId(''); setActionType(''); setDateFrom(''); setDateTo(''); }}>
            Clear
          </button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading logs…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : (
          <div className="sf-table-wrap">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Description</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="sf-table-empty">No activity logs found</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                      {new Date(log.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="sf-table-name">{log.staff_name}</td>
                    <td>
                      <span className={`sf-badge ${ACTION_CLASS[log.action_type] || 'sf-badge-muted'}`}>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.description}
                    </td>
                    <td style={{ fontSize: 11 }}>{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}