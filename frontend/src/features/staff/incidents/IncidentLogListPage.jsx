/**
 * IncidentLogListPage.jsx — revised to match AdminDashboard light theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { incidentsApi, INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const SEVERITY_CLASS = { low: 'sf-badge-green', medium: 'sf-badge-amber', high: 'sf-badge-red' };

export default function IncidentLogListPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [incidents,   setIncidents]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [typeFil,     setTypeFil]     = useState('');
  const [severityFil, setSeverityFil] = useState('');
  const [resolvedFil, setResolvedFil] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (typeFil)             params.incident_type = typeFil;
      if (severityFil)         params.severity      = severityFil;
      if (resolvedFil !== '')  params.resolved      = resolvedFil;
      const data = await incidentsApi.list(params);
      setIncidents(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) { setError(err.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  }, [typeFil, severityFil, resolvedFil]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Security</p>
            <h1>Incident Logs</h1>
            <p>{incidents.filter(i => !i.resolved).length} unresolved · {incidents.length} total</p>
          </div>
          {perms.canCreateIncidents && (
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
          </select>
          <select className="sf-select" value={resolvedFil} onChange={e => setResolvedFil(e.target.value)}>
            <option value="">All</option>
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
          </select>
          <button className="sf-filter-clear" onClick={() => { setTypeFil(''); setSeverityFil(''); setResolvedFil(''); }}>Clear</button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading incidents…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : incidents.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: '#7A7987', fontSize: 13, padding: '40px 0' }}>No incidents found.</div>
        ) : (
          <div>
            {incidents.map(inc => (
              <div key={inc.id} className={`sf-incident-item${inc.resolved ? ' resolved' : ''}`}>
                <div className="sf-incident-row">
                  <div className="sf-incident-content">
                    <h3 className="sf-incident-title">
                      {INCIDENT_TYPE_LABELS[inc.incident_type]}
                      <span className={`sf-badge ${SEVERITY_CLASS[inc.severity]}`}>{SEVERITY_LABELS[inc.severity]}</span>
                      {inc.resolved && <span className="sf-badge sf-badge-green">Resolved</span>}
                    </h3>
                    {inc.location && <p className="sf-incident-location">{inc.location}</p>}
                    <p className="sf-incident-desc">{inc.description}</p>
                    {inc.involved_guests && <p className="sf-incident-guests">Guests: {inc.involved_guests}</p>}
                  </div>
                  <div className="sf-incident-meta">
                    <p className="sf-incident-time">
                      {new Date(inc.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="sf-incident-by">by {inc.logged_by_name}</p>
                    {perms.canCreateIncidents && (
                      <button className="sf-btn" style={{ padding: '5px 12px', fontSize: 9, marginTop: 8 }}
                        onClick={() => navigate(`/staff/incidents/${inc.id}/edit`)}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
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