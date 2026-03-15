/**
 * src/features/staff/activity/ActivityLogPage.jsx
 *
 * Full audit trail — Admin/Manager only.
 * Filterable by staff, action_type, date range.
 * Read-only.
 */

import { useState, useEffect, useCallback } from 'react';
import { activityLogsApi, staffMembersApi } from '../services/staffApi';

export default function ActivityLogPage() {
  const [logs,    setLogs]    = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const [staffId,     setStaffId]     = useState('');
  const [actionType,  setActionType]  = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');

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
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [staffId, actionType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffMembersApi.list()
      .then((d) => setMembers(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  const ACTION_COLORS = {
    check_in_guest:  'bg-green-100 text-green-700',
    check_out_guest: 'bg-blue-100 text-blue-700',
    create_staff:    'bg-purple-100 text-purple-700',
    deactivate_staff:'bg-red-100 text-red-700',
    role_change:     'bg-amber-100 text-amber-700',
    create_shift:    'bg-cyan-100 text-cyan-700',
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Activity Logs</h1>
        <p className="text-sm text-slate-500 mt-0.5">Immutable audit trail · {logs.length} entries</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Staff</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>
          ))}
        </select>
        <input value={actionType} onChange={(e) => setActionType(e.target.value)}
          placeholder="Action type (e.g. check_in_guest)"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 w-52" />
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
        </div>
        <button onClick={() => { setStaffId(''); setActionType(''); setDateFrom(''); setDateTo(''); }}
          className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
      </div>

      {/* Log table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-slate-400">Loading…</div>
        ) : error ? (
          <div className="py-20 text-center text-red-500">{error}</div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-slate-400">No activity logs found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Time</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Staff</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Action</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-PH', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.staff_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action_type] || 'bg-slate-100 text-slate-600'}`}>
                      {log.action_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-sm truncate">{log.description}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{log.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}