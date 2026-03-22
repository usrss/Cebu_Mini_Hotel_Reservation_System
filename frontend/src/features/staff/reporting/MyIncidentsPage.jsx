/**
 * src/features/staff/reporting/MyIncidentsPage.jsx
 *
 * Accessible by: front_desk, housekeeping (own only), security, admin, manager (all)
 * Route: /staff/my-incidents
 *
 * FD/HK see only their own submitted incidents (scoped server-side).
 * Read-only for FD/HK — no edit button.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  incidentsApi,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const SEVERITY_CLASS = {
  low:      'sf-badge-green',
  medium:   'sf-badge-amber',
  high:     'sf-badge-red',
  critical: 'sf-badge-red',
};

const STATUS_CLASS = {
  reported:            'sf-badge-blue',
  under_investigation: 'sf-badge-amber',
  resolved:            'sf-badge-green',
};

const TYPE_ICONS = {
  lost_item:   '🔍',
  disturbance: '📢',
  trespassing: '🚫',
  medical:     '🏥',
  theft:       '🔒',
  other:       '📋',
};

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function MyIncidentsPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [incidents,  setIncidents]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [statusFil,  setStatusFil]  = useState('');
  const [typeFil,    setTypeFil]    = useState('');

  // FD/HK cannot edit — Security/Admin can
  const canEdit = perms.canCreateIncidents; // admin + security

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status        = statusFil;
      if (typeFil)   params.incident_type = typeFil;
      const data = await incidentsApi.list(params);
      setIncidents(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFil, typeFil]);

  useEffect(() => { load(); }, [load]);

  const isOwnView = !perms.canViewIncidents; // FD/HK don't have full incident view

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Security</p>
            <h1>{isOwnView ? 'My Incident Reports' : 'All Incident Reports'}</h1>
            <p>
              {incidents.filter((i) => i.status !== 'resolved').length} open
              · {incidents.length} total
            </p>
          </div>
          {perms.canReportIncident && (
            <button
              className="sf-btn sf-btn-danger"
              onClick={() => navigate('/staff/report-incident')}
            >
              <Plus size={13} /> Report Incident
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={typeFil} onChange={(e) => setTypeFil(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="sf-filter-clear" onClick={() => { setTypeFil(''); setStatusFil(''); }}>
            Clear
          </button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading incidents…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : incidents.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: 'var(--white-dim)', fontSize: 13, margin: '0 0 16px' }}>
              {statusFil || typeFil ? 'No incidents match the current filters.' : 'No incidents reported yet.'}
            </p>
            {perms.canReportIncident && (
              <button
                className="sf-btn sf-btn-danger"
                onClick={() => navigate('/staff/report-incident')}
              >
                <Plus size={13} /> Report First Incident
              </button>
            )}
          </div>
        ) : (
          <div>
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className={`sf-incident-item${inc.status === 'resolved' ? ' resolved' : ''}`}
                style={{
                  borderLeftColor: inc.severity === 'critical' ? '#f97316' : undefined,
                  borderLeftWidth: inc.severity === 'critical' ? 3 : undefined,
                }}
              >
                <div className="sf-incident-row">
                  <span className="sf-incident-icon">{TYPE_ICONS[inc.incident_type] || '📋'}</span>

                  <div className="sf-incident-content">
                    <h3 className="sf-incident-title">
                      {inc.title || INCIDENT_TYPE_LABELS[inc.incident_type]}
                      <span className={`sf-badge ${SEVERITY_CLASS[inc.severity]}`}>
                        {inc.severity === 'critical' && '⚠ '}{SEVERITY_LABELS[inc.severity]}
                      </span>
                      <span className={`sf-badge ${STATUS_CLASS[inc.status]}`}>
                        {INCIDENT_STATUS_LABELS[inc.status]}
                      </span>
                    </h3>

                    <p className="sf-incident-location" style={{ color: 'var(--gold)', fontSize: 11 }}>
                      {INCIDENT_TYPE_LABELS[inc.incident_type]}
                    </p>

                    {inc.location && <p className="sf-incident-location">📍 {inc.location}</p>}
                    <p className="sf-incident-desc">{inc.description}</p>
                    {inc.involved_guests && (
                      <p className="sf-incident-guests">Guests: {inc.involved_guests}</p>
                    )}
                  </div>

                  <div className="sf-incident-meta">
                    <p className="sf-incident-time">{formatDate(inc.created_at)}</p>
                    <p className="sf-incident-by">by {inc.logged_by_name}</p>

                    {/* FD/HK: read-only. Security/Admin: can edit */}
                    {canEdit && (
                      <button
                        className="sf-btn"
                        style={{ padding: '5px 12px', fontSize: 9, marginTop: 6, display: 'block', width: '100%', textAlign: 'center' }}
                        onClick={() => navigate(`/staff/incidents/${inc.id}/edit`)}
                      >
                        Edit
                      </button>
                    )}

                    {/* Read-only label for FD/HK */}
                    {!canEdit && (
                      <span
                        className="sf-badge sf-badge-muted"
                        style={{ marginTop: 6, display: 'block', textAlign: 'center' }}
                      >
                        Read-only
                      </span>
                    )}
                  </div>
                </div>

                {/* Resolution notes */}
                {inc.resolution_notes && (
                  <div className="sf-incident-resolution">
                    Resolution: {inc.resolution_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}