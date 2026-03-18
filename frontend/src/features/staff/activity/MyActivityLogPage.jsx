/**
 * src/features/staff/activity/MyActivityLogPage.jsx
 *
 * Every staff member (including receptionist, front_desk, security, etc.)
 * can view their own activity log via GET /api/staff/activity-logs/me/
 *
 * This is separate from ActivityLogPage (full audit trail — admin/manager only).
 * Per the prompt:
 *   - Receptionist: can view their own activity logs
 *   - Front Desk:   can view their own activity logs
 *   - All other roles also have access to this self-service view
 */

import { useState, useEffect } from 'react';
import { activityLogsApi } from '../services/staffApi';
import '../Staff.css';

const ACTION_CLASS = {
  check_in_guest:   'sf-badge-green',
  check_out_guest:  'sf-badge-blue',
  create_booking:   'sf-badge-gold',
  cancel_booking:   'sf-badge-red',
  update_cleaning_status:    'sf-badge-amber',
  update_maintenance_status: 'sf-badge-amber',
  log_incident:     'sf-badge-red',
  create_shift:     'sf-badge-blue',
};

export default function MyActivityLogPage() {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    activityLogsApi.mine()
      .then((data) => setLogs(Array.isArray(data) ? data : (data.results ?? [])))
      .catch((err) => setError(err.response?.data?.detail || err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="sf-page">
      <div className="sf-inner" style={{ maxWidth: 860 }}>

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">My Account</p>
            <h1>My Activity Log</h1>
            <p>Your last {logs.length} recorded actions</p>
          </div>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : logs.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>
            No activity recorded yet.
          </div>
        ) : (
          <div className="sf-table-wrap">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Description</th>
                  <th>IP Address</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
                      {new Date(log.created_at).toLocaleString('en-PH', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <span className={`sf-badge ${ACTION_CLASS[log.action_type] || 'sf-badge-muted'}`}>
                        {log.action_type}
                      </span>
                    </td>
                    <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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