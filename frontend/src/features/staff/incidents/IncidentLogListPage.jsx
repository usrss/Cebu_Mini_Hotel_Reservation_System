/**
 * IncidentLogListPage.jsx
 *
 * /staff/incidents  — rendered for: admin (all), manager (all), security (assigned only)
 *
 * Admin/Manager : read-only overview of all incidents. No edit button.
 * Security      : sees only assigned incidents; can edit to update/resolve.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CheckCircle2, Clock, UserCheck } from 'lucide-react';
import { incidentsApi, INCIDENT_TYPE_LABELS, SEVERITY_LABELS, INCIDENT_STATUS_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const SEVERITY_CLASS = { low: 'sf-badge-green', medium: 'sf-badge-amber', high: 'sf-badge-red', critical: 'sf-badge-red' };
const STATUS_CLASS   = { reported: 'sf-badge-blue', under_investigation: 'sf-badge-amber', resolved: 'sf-badge-green' };

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function IncidentLogListPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();
  const role     = perms.role;

  const isAdminOrManager = role === 'admin' || role === 'manager';
  const isSecurity       = role === 'security';

  const [incidents,   setIncidents]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [typeFil,     setTypeFil]     = useState('');
  const [severityFil, setSeverityFil] = useState('');
  const [statusFil,   setStatusFil]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (typeFil)     params.incident_type = typeFil;
      if (severityFil) params.severity      = severityFil;
      if (statusFil)   params.status        = statusFil;
      const data = await incidentsApi.list(params);
      setIncidents(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) { setError(err.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  }, [typeFil, severityFil, statusFil]);

  useEffect(() => { load(); }, [load]);

  const unresolved = incidents.filter(i => i.status !== 'resolved').length;

  // Page title / subtitle depend on role
  const pageTitle    = isAdminOrManager ? 'All Incident Reports' : 'My Assigned Incidents';
  const pageSubtitle = isAdminOrManager
    ? `${unresolved} unresolved · ${incidents.length} total`
    : `${unresolved} open · ${incidents.length} assigned to you`;

  const emptyMsg = isAdminOrManager
    ? 'No incidents found.'
    : isSecurity
      ? 'No incidents have been assigned to you yet.'
      : 'No incidents found.';

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Security</p>
            <h1>{pageTitle}</h1>
            <p>{pageSubtitle}</p>
          </div>
          {/* Only security can log new incidents from this page */}
          {isSecurity && (
            <button className="sf-btn sf-btn-primary" onClick={() => navigate('/staff/incidents/new')}>
              <Plus size={13} /> Log Incident
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={typeFil} onChange={e => setTypeFil(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="sf-select" value={severityFil} onChange={e => setSeverityFil(e.target.value)}>
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select className="sf-select" value={statusFil} onChange={e => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="sf-filter-clear" onClick={() => { setTypeFil(''); setSeverityFil(''); setStatusFil(''); }}>Clear</button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading incidents…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : incidents.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: '#7A7987', fontSize: 13, padding: '40px 0' }}>
            {emptyMsg}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {incidents.map(inc => {
              const isUrgent = inc.severity === 'high' || inc.severity === 'critical';
              return (
                <div key={inc.id} className="sf-card" style={{
                  padding: '18px 22px',
                  borderLeft: isUrgent && inc.status !== 'resolved'
                    ? '3px solid var(--sf-red)' : '3px solid transparent',
                  opacity: inc.status === 'resolved' ? 0.7 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sf-text-primary)', margin: 0 }}>
                          {inc.title || INCIDENT_TYPE_LABELS[inc.incident_type]}
                        </h3>
                        <span className={`sf-badge ${SEVERITY_CLASS[inc.severity] || 'sf-badge-muted'}`}>
                          {SEVERITY_LABELS[inc.severity]}
                        </span>
                        <span className={`sf-badge ${STATUS_CLASS[inc.status] || 'sf-badge-muted'}`}>
                          {INCIDENT_STATUS_LABELS[inc.status]}
                        </span>
                        <span className="sf-badge sf-badge-muted">
                          {INCIDENT_TYPE_LABELS[inc.incident_type]}
                        </span>
                      </div>

                      <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', margin: '0 0 6px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        {inc.location && <span>📍 {inc.location}</span>}
                        <span>By <strong style={{ color: 'var(--sf-text-secondary)' }}>{inc.logged_by_name}</strong></span>
                        <span style={{ color: 'var(--sf-text-faint)' }}><Clock size={10} style={{ marginRight: 3 }} />{formatDate(inc.created_at)}</span>
                      </p>

                      {inc.assigned_to_name && (
                        <p style={{ fontSize: 11, color: 'var(--sf-blue)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <UserCheck size={11} /> Assigned to <strong>{inc.assigned_to_name}</strong>
                        </p>
                      )}

                      <p style={{ fontSize: 13, color: 'var(--sf-text-secondary)', margin: '0 0 4px', lineHeight: 1.6 }}>
                        {inc.description}
                      </p>

                      {inc.involved_guests && (
                        <p style={{ fontSize: 11, color: 'var(--sf-text-faint)', margin: 0 }}>
                          Guests: {inc.involved_guests}
                        </p>
                      )}

                      {inc.resolution_notes && (
                        <div className="sf-notice sf-notice-success" style={{ margin: '10px 0 0', padding: '8px 12px', fontSize: 12 }}>
                          <strong>Resolution:</strong> {inc.resolution_notes}
                        </div>
                      )}
                    </div>

                    {/* Security can edit to update/resolve. Admin/Manager read-only on this page. */}
                    {isSecurity && inc.status !== 'resolved' && (
                      <div style={{ flexShrink: 0 }}>
                        <button
                          className="sf-btn sf-btn-primary"
                          style={{ fontSize: 10, padding: '7px 14px', whiteSpace: 'nowrap' }}
                          onClick={() => navigate(`/staff/incidents/${inc.id}/edit`)}
                        >
                          Update / Resolve
                        </button>
                      </div>
                    )}
                    {isSecurity && inc.status === 'resolved' && (
                      <div style={{ flexShrink: 0 }}>
                        <span className="sf-badge sf-badge-green" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={11} /> Resolved
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}