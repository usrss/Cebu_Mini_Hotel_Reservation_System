/**
 * src/features/staff/reporting/MyMaintenanceRequestsPage.jsx
 *
 * Accessible by: front_desk, housekeeping (see own), admin, manager (see all)
 * Route: /staff/my-maintenance-requests
 *
 * Lists submitted maintenance requests with status tracking.
 * FD/HK see only their own requests (scoped server-side).
 * Admin/Manager see all requests here too (they have the dedicated dashboard).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock, CheckCircle2, Eye } from 'lucide-react';
import {
  maintenanceRequestsApi,
  MAINTENANCE_REQUEST_STATUS_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const STATUS_CLASS = {
  pending:           'sf-badge-blue',
  reviewed:          'sf-badge-amber',
  converted_to_task: 'sf-badge-green',
};

const STATUS_ICON = {
  pending:           <Clock size={10} />,
  reviewed:          <Eye size={10} />,
  converted_to_task: <CheckCircle2 size={10} />,
};

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyMaintenanceRequestsPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [requests,   setRequests]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [statusFil,  setStatusFil]  = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status = statusFil;
      const data = await maintenanceRequestsApi.list(params);
      setRequests(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFil]);

  useEffect(() => { load(); }, [load]);

  const isAdminView = perms.canManageMaintenanceRequests;

  return (
    <div className="sf-page">
      <div className="sf-inner">

        {/* Header */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Maintenance</p>
            <h1>{isAdminView ? 'All Maintenance Requests' : 'My Maintenance Requests'}</h1>
            <p>{requests.filter((r) => r.status === 'pending').length} pending review · {requests.length} total</p>
          </div>
          {perms.canSubmitMaintenanceRequest && (
            <button
              className="sf-btn sf-btn-primary"
              onClick={() => navigate('/staff/report-maintenance')}
            >
              <Plus size={13} /> Report Issue
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(MAINTENANCE_REQUEST_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="sf-filter-clear" onClick={() => setStatusFil('')}>Clear</button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading requests…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : requests.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: 'var(--white-dim)', fontSize: 13, margin: '0 0 16px' }}>
              {statusFil
                ? `No ${MAINTENANCE_REQUEST_STATUS_LABELS[statusFil]} requests.`
                : 'No maintenance requests submitted yet.'}
            </p>
            {perms.canSubmitMaintenanceRequest && (
              <button
                className="sf-btn sf-btn-primary"
                onClick={() => navigate('/staff/report-maintenance')}
              >
                <Plus size={13} /> Report Your First Issue
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {requests.map((req) => (
              <div key={req.id} className="sf-card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>

                  {/* Left: info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <h3 style={{
                        fontFamily: "'Playfair Display', serif",
                        fontSize: 16,
                        color: 'var(--white)',
                        margin: 0,
                      }}>
                        {req.title}
                      </h3>
                      <span className={`sf-badge ${STATUS_CLASS[req.status]}`}>
                        {STATUS_ICON[req.status]}
                        {MAINTENANCE_REQUEST_STATUS_LABELS[req.status]}
                      </span>
                    </div>

                    {/* Room + reporter */}
                    <p style={{ fontSize: 12, color: 'var(--white-dim)', margin: '0 0 8px' }}>
                      {req.room_number ? `📍 Room ${req.room_number}` : '📍 No room specified'}
                      {isAdminView && req.reported_by_name && (
                        <span style={{ marginLeft: 12, color: 'rgba(248,246,240,0.4)' }}>
                          · by {req.reported_by_name}
                        </span>
                      )}
                    </p>

                    {/* Description */}
                    <p style={{
                      fontSize: 13,
                      color: 'var(--white-dim)',
                      margin: '0 0 8px',
                      lineHeight: 1.6,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {req.description}
                    </p>

                    {/* Review notes */}
                    {req.review_notes && (
                      <div className="sf-notice sf-notice-amber" style={{ margin: '8px 0 0', padding: '8px 12px', fontSize: 12 }}>
                        <strong>Review note:</strong> {req.review_notes}
                      </div>
                    )}

                    {/* Converted task info */}
                    {req.status === 'converted_to_task' && req.converted_task_title && (
                      <div className="sf-notice sf-notice-success" style={{ margin: '8px 0 0', padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={12} />
                        Task created: <strong>{req.converted_task_title}</strong>
                      </div>
                    )}
                  </div>

                  {/* Right: date */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 11, color: 'rgba(248,246,240,0.35)', margin: 0 }}>
                      {formatDate(req.created_at)}
                    </p>
                    {req.updated_at !== req.created_at && (
                      <p style={{ fontSize: 10, color: 'rgba(248,246,240,0.2)', margin: '3px 0 0' }}>
                        Updated {formatDate(req.updated_at)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}