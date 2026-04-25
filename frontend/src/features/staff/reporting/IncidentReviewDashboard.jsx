/**
 * src/features/staff/reporting/IncidentReviewDashboard.jsx
 *
 * Accessible by: manager ONLY
 * Route: /staff/incident-review
 *
 * Manager can:
 *  - View ALL submitted incidents
 *  - Update status (reported → under_investigation → resolved)
 *  - Assign an incident to ONE specific security staff member
 *  - Assign an incident to MULTIPLE security staff (creates parallel assignments)
 *  - Bulk-assign all high/critical unresolved incidents to ALL security staff
 *    (or a selected subset)
 *
 * NOTE on multiple assignment:
 *  The backend IncidentLog.assigned_to is a single FK. To assign to multiple
 *  staff, we call PATCH once per staff member — each creates a copy of the
 *  assignment so each security staff member sees it in their dashboard.
 *  For true multi-assignment you would need a ManyToMany on the backend;
 *  until then, this sends one PATCH per selected staff member in parallel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, AlertTriangle, CheckCircle2, Eye,
  UserCheck, Users, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  incidentsApi,
  staffMembersApi,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
} from '../services/staffApi';
import '../Staff.css';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function OnlineDot({ status }) {
  const colors = { online: '#0D9488', idle: '#D97706', offline: '#BEC2D0' };
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
      background: colors[status] || colors.offline,
      marginRight: 6, flexShrink: 0,
      boxShadow: status === 'online' ? `0 0 4px ${colors.online}` : 'none',
    }} />
  );
}

// ── Assign Modal ───────────────────────────────────────────────────────────────
// Assigns ONE incident to ONE or MULTIPLE security staff members.

function AssignModal({ incident, securityStaff, onClose, onSuccess }) {
  const [selectedStaff, setSelectedStaff] = useState(
    incident.assigned_to ? [incident.assigned_to] : []
  );
  const [newStatus,  setNewStatus]  = useState(
    incident.status === 'reported' ? 'under_investigation' : incident.status
  );
  const [notes,  setNotes]  = useState(incident.resolution_notes || '');
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState(null);

  const toggleStaff = (id) => {
    setSelectedStaff(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedStaff(securityStaff.map(m => m.id));
  const selectOnline = () =>
    setSelectedStaff(securityStaff.filter(m => m.online_status === 'online').map(m => m.id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedStaff.length === 0) {
      setError('Select at least one security staff member, or skip assignment.');
      return;
    }
    setBusy(true); setError(null);

    try {
      const body = { status: newStatus };
      if (notes.trim()) body.resolution_notes = notes.trim();

      // Assign to each selected staff member in parallel
      const settled = await Promise.allSettled(
        selectedStaff.map(staffId =>
          incidentsApi.assign(incident.id, { ...body, assigned_to: staffId })
        )
      );

      const succeeded = settled
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
      const failed = settled.filter(r => r.status === 'rejected').length;

      if (succeeded.length === 0) {
        setError('All assignments failed. Please try again.');
        setBusy(false);
        return;
      }

      // Return the last successful update as the "current" incident state
      onSuccess(succeeded[succeeded.length - 1], failed);
    } catch (err) {
      const d = err.response?.data;
      setError(d ? Object.values(d).flat().join(' ') : err.message);
      setBusy(false);
    }
  };

  const isCritical = incident.severity === 'critical' || incident.severity === 'high';
  const onlineCount = securityStaff.filter(m => m.online_status === 'online').length;

  return (
    <div className="sf-modal-overlay">
      <div className="sf-modal" style={{ maxWidth: 520 }}>
        <div className="sf-modal-header">
          <h2 className="sf-modal-title">Review & Assign Incident</h2>
          <button className="sf-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sf-modal-body">

          {isCritical && (
            <div className="sf-notice sf-notice-error" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <AlertTriangle size={13} />
              <strong>{SEVERITY_LABELS[incident.severity]} severity</strong> — assign to security immediately.
            </div>
          )}

          <div className="sf-notice sf-notice-blue" style={{ marginBottom: 16, fontSize: 12 }}>
            <div>
              <strong>{incident.title || INCIDENT_TYPE_LABELS[incident.incident_type]}</strong>
              {incident.location && <span style={{ marginLeft: 8, opacity: 0.7 }}>📍 {incident.location}</span>}
              <div style={{ marginTop: 3, opacity: 0.75 }}>
                Reported by {incident.logged_by_name} · {formatDate(incident.created_at)}
              </div>
            </div>
          </div>

          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form id="assign-form" onSubmit={handleSubmit}>

            {/* Status */}
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Update Status</label>
              <select className="sf-select" value={newStatus} onChange={e => setNewStatus(e.target.value)} required>
                {Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Staff selection */}
            <div className="sf-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="sf-label" style={{ margin: 0 }}>
                  Assign to Security Staff
                  <span style={{ marginLeft: 6, color: 'var(--sf-text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    ({selectedStaff.length} selected)
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {onlineCount > 0 && (
                    <button type="button" className="sf-btn" style={{ fontSize: 10, padding: '4px 10px' }}
                      onClick={selectOnline}>
                      🟢 All Online ({onlineCount})
                    </button>
                  )}
                  <button type="button" className="sf-btn" style={{ fontSize: 10, padding: '4px 10px' }}
                    onClick={selectAll}>
                    Select All
                  </button>
                </div>
              </div>

              {securityStaff.length === 0 ? (
                <div className="sf-notice sf-notice-amber" style={{ fontSize: 12 }}>
                  No active security staff found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {securityStaff.map(m => {
                    const isSelected = selectedStaff.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: isSelected ? 'var(--sf-blue-bg)' : 'var(--sf-surface-2)',
                          padding: '9px 12px', borderRadius: 'var(--sf-radius-md)',
                          cursor: 'pointer', transition: 'background 0.15s',
                          border: `1.5px solid ${isSelected ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleStaff(m.id)}
                          style={{ accentColor: 'var(--sf-blue)', flexShrink: 0 }}
                        />
                        <OnlineDot status={m.online_status} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--sf-text-primary)' }}>
                          {m.user?.full_name || m.user?.email}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--sf-text-faint)', textTransform: 'capitalize' }}>
                          {m.online_status}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            {newStatus === 'resolved' ? (
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Resolution Notes</label>
                <textarea className="sf-textarea" rows={3} value={notes}
                  onChange={e => setNotes(e.target.value)} required
                  placeholder="Describe how the incident was resolved…" />
              </div>
            ) : (
              <div className="sf-form-group">
                <label className="sf-label">
                  Notes
                  <span style={{ color: 'var(--sf-text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
                    (optional)
                  </span>
                </label>
                <textarea className="sf-textarea" rows={2} value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Investigation notes, actions taken…" />
              </div>
            )}

          </form>
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="assign-form" className="sf-btn sf-btn-primary" disabled={busy}>
            {busy
              ? 'Saving…'
              : <><UserCheck size={13} /> Assign to {selectedStaff.length || '—'} Staff</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Assign Modal ──────────────────────────────────────────────────────────
// Assigns ALL selected high/critical incidents to ALL (or selected) security staff.

function BulkAssignModal({ incidents, securityStaff, onClose, onSuccess }) {
  const [selectedIncidents, setSelectedIncidents] = useState(incidents.map(i => i.id));
  const [selectedStaff,     setSelectedStaff]     = useState(
    securityStaff.filter(m => m.online_status === 'online').map(m => m.id)
  );
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [results, setResults] = useState(null);

  const toggleIncident = (id) =>
    setSelectedIncidents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleStaff = (id) =>
    setSelectedStaff(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedIncidents.length) { setError('Select at least one incident.'); return; }
    if (!selectedStaff.length)     { setError('Select at least one security staff member.'); return; }
    setBusy(true); setError(null);

    // For each selected incident, assign to each selected staff member in parallel
    const pairs = selectedIncidents.flatMap(incId =>
      selectedStaff.map(staffId => ({ incId, staffId }))
    );

    const body = { status: 'under_investigation' };
    const settled = await Promise.allSettled(
      pairs.map(({ incId, staffId }) =>
        incidentsApi.assign(incId, { ...body, assigned_to: staffId })
      )
    );

    const succeeded = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed    = settled.filter(r => r.status === 'rejected').length;

    setBusy(false);
    setResults({ succeeded: succeeded.length, failed, incidentCount: selectedIncidents.length, staffCount: selectedStaff.length });
    if (succeeded.length) onSuccess(succeeded);
  };

  const onlineCount = securityStaff.filter(m => m.online_status === 'online').length;

  if (results) {
    return (
      <div className="sf-modal-overlay">
        <div className="sf-modal" style={{ maxWidth: 420 }}>
          <div className="sf-modal-header">
            <h2 className="sf-modal-title">Bulk Assignment Complete</h2>
            <button className="sf-modal-close" onClick={onClose}>×</button>
          </div>
          <div className="sf-modal-body">
            <div className="sf-notice sf-notice-success" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle2 size={16} />
              <div>
                <strong>
                  {results.incidentCount} incident{results.incidentCount !== 1 ? 's' : ''}
                  {' '}assigned to {results.staffCount} staff member{results.staffCount !== 1 ? 's' : ''}.
                </strong>
                {results.failed > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 12 }}>
                    {results.failed} assignment{results.failed !== 1 ? 's' : ''} failed — retry individually.
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="sf-modal-footer">
            <button className="sf-btn sf-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sf-modal-overlay">
      <div className="sf-modal" style={{ maxWidth: 580 }}>
        <div className="sf-modal-header">
          <h2 className="sf-modal-title">Bulk Assign High Priority Incidents</h2>
          <button className="sf-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sf-modal-body">
          <div className="sf-notice sf-notice-error" style={{ marginBottom: 16, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={13} />
            {incidents.length} high/critical incident{incidents.length !== 1 ? 's' : ''} need immediate attention.
            Each selected incident will be assigned to each selected staff member.
          </div>
          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form id="bulk-form" onSubmit={handleSubmit}>

            {/* Staff selection */}
            <div className="sf-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="sf-label" style={{ margin: 0 }}>
                  Assign To Security Staff
                  <span style={{ marginLeft: 6, color: 'var(--sf-text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    ({selectedStaff.length} selected)
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {onlineCount > 0 && (
                    <button type="button" className="sf-btn" style={{ fontSize: 10, padding: '4px 10px' }}
                      onClick={() => setSelectedStaff(securityStaff.filter(m => m.online_status === 'online').map(m => m.id))}>
                      🟢 Online Only ({onlineCount})
                    </button>
                  )}
                  <button type="button" className="sf-btn" style={{ fontSize: 10, padding: '4px 10px' }}
                    onClick={() => setSelectedStaff(securityStaff.map(m => m.id))}>
                    All Staff
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {securityStaff.map(m => {
                  const isSelected = selectedStaff.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        background: isSelected ? 'var(--sf-blue-bg)' : 'var(--sf-surface-2)',
                        padding: '7px 12px', borderRadius: 'var(--sf-radius-md)',
                        cursor: 'pointer', fontSize: 12, fontWeight: 500,
                        border: `1.5px solid ${isSelected ? 'rgba(37,99,235,0.25)' : 'transparent'}`,
                        transition: 'all 0.15s',
                      }}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleStaff(m.id)}
                        style={{ accentColor: 'var(--sf-blue)' }} />
                      <OnlineDot status={m.online_status} />
                      {m.user?.full_name || m.user?.email}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Incident selection */}
            <div className="sf-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="sf-label" style={{ margin: 0 }}>
                  Select Incidents
                  <span style={{ marginLeft: 6, color: 'var(--sf-text-faint)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    ({selectedIncidents.length} / {incidents.length})
                  </span>
                </label>
                <button type="button" className="sf-btn" style={{ fontSize: 10, padding: '4px 10px' }}
                  onClick={() => setSelectedIncidents(incidents.map(i => i.id))}>
                  Select All
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 240, overflowY: 'auto' }}>
                {incidents.map(inc => {
                  const isSelected = selectedIncidents.includes(inc.id);
                  return (
                    <label
                      key={inc.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        background: isSelected ? 'var(--sf-red-bg)' : 'var(--sf-surface-2)',
                        padding: '10px 12px', borderRadius: 'var(--sf-radius-md)',
                        cursor: 'pointer', transition: 'background 0.15s',
                        border: `1.5px solid ${isSelected ? 'rgba(220,38,38,0.2)' : 'transparent'}`,
                      }}
                    >
                      <input type="checkbox" checked={isSelected} onChange={() => toggleIncident(inc.id)}
                        style={{ marginTop: 2, accentColor: 'var(--sf-red)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sf-text-primary)' }}>
                            {inc.title || INCIDENT_TYPE_LABELS[inc.incident_type]}
                          </span>
                          <span className={`sf-badge ${SEVERITY_CLASS[inc.severity]}`}>
                            {inc.severity === 'critical' ? '⚠ ' : ''}{SEVERITY_LABELS[inc.severity]}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--sf-text-muted)', marginTop: 3 }}>
                          {inc.location && <span>📍 {inc.location} · </span>}
                          by {inc.logged_by_name} · {formatDate(inc.created_at)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

          </form>
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="bulk-form" className="sf-btn sf-btn-danger"
            disabled={busy || !selectedIncidents.length || !selectedStaff.length}>
            {busy
              ? 'Assigning…'
              : <><Users size={13} /> Assign {selectedIncidents.length} Incident{selectedIncidents.length !== 1 ? 's' : ''} to {selectedStaff.length} Staff</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function IncidentReviewDashboard() {
  const [incidents,     setIncidents]     = useState([]);
  const [securityStaff, setSecurityStaff] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);

  const [severityFil, setSeverityFil] = useState('');
  const [statusFil,   setStatusFil]   = useState('');
  const [typeFil,     setTypeFil]     = useState('');

  const [reviewTarget,   setReviewTarget]   = useState(null);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [assignFeedback, setAssignFeedback] = useState(null); // { message, failed }

  const [expanded, setExpanded] = useState({});
  const pollRef = useRef(null);
  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = {};
      if (severityFil) params.severity      = severityFil;
      if (statusFil)   params.status        = statusFil;
      if (typeFil)     params.incident_type = typeFil;
      const data = await incidentsApi.list(params);
      setIncidents(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [severityFil, statusFil, typeFil]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(() => load(true), 5_000); // poll every 5s — near-realtime
    return () => clearInterval(pollRef.current);
  }, [load]);

  useEffect(() => {
    staffMembersApi
      .list({ role: 'security', is_active: 'true' })
      .then(d => setSecurityStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  const urgentIncidents = incidents.filter(
    i => (i.severity === 'high' || i.severity === 'critical') && i.status !== 'resolved'
  );
  const unresolvedCount    = incidents.filter(i => i.status !== 'resolved').length;
  const underInvestigation = incidents.filter(i => i.status === 'under_investigation').length;
  const resolvedCount      = incidents.filter(i => i.status === 'resolved').length;

  const handleReviewSuccess = (updated, failed = 0) => {
    setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
    setReviewTarget(null);
    if (failed > 0) {
      setAssignFeedback({ message: `Assigned, but ${failed} staff assignment(s) failed.`, type: 'amber' });
    } else {
      setAssignFeedback({ message: 'Incident updated and assigned successfully.', type: 'success' });
    }
    setTimeout(() => setAssignFeedback(null), 4000);
  };

  const handleBulkSuccess = (updatedList) => {
    setIncidents(prev => {
      const map = Object.fromEntries(updatedList.map(i => [i.id, i]));
      return prev.map(i => map[i.id] ?? i);
    });
  };

  return (
    <div className="sf-page">

      {reviewTarget && (
        <AssignModal
          incident={reviewTarget}
          securityStaff={securityStaff}
          onClose={() => setReviewTarget(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
      {showBulkAssign && (
        <BulkAssignModal
          incidents={urgentIncidents}
          securityStaff={securityStaff}
          onClose={() => setShowBulkAssign(false)}
          onSuccess={(list) => { handleBulkSuccess(list); setShowBulkAssign(false); }}
        />
      )}

      {/* Toast feedback */}
      {assignFeedback && (
        <div
          className={`sf-notice sf-notice-${assignFeedback.type === 'success' ? 'success' : 'amber'}`}
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 700, maxWidth: 360, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => setAssignFeedback(null)}
        >
          <CheckCircle2 size={14} />
          {assignFeedback.message}
        </div>
      )}

      <div className="sf-inner">

        {/* Header */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Security</p>
            <h1>Incident Review</h1>
            <p>
              {unresolvedCount > 0 && (
                <span style={{ color: 'var(--sf-red)' }}>{unresolvedCount} unresolved · </span>
              )}
              {incidents.length} total
            </p>
          </div>
          {urgentIncidents.length > 0 && (
            <button className="sf-btn sf-btn-danger" onClick={() => setShowBulkAssign(true)}>
              <Users size={13} />
              Bulk Assign ({urgentIncidents.length} urgent)
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="sf-summary-grid" style={{ marginBottom: 24 }}>
          {[
            { label: 'Unresolved',          value: unresolvedCount,        color: 'var(--sf-red)'   },
            { label: 'Under Investigation', value: underInvestigation,     color: 'var(--sf-amber)' },
            { label: 'Resolved',            value: resolvedCount,          color: 'var(--sf-green)' },
            { label: 'High / Critical',     value: urgentIncidents.length, color: 'var(--sf-red)'   },
          ].map(s => (
            <div key={s.label} className="sf-summary-card">
              <div className="sf-summary-label">{s.label}</div>
              <div className="sf-summary-value" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Urgent alert banner */}
        {urgentIncidents.length > 0 && (
          <div className="sf-notice sf-notice-error"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 20 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} />
              <strong>
                {urgentIncidents.length} high/critical incident{urgentIncidents.length !== 1 ? 's' : ''} need immediate attention.
              </strong>
            </span>
            <button className="sf-btn sf-btn-danger" style={{ fontSize: 10, padding: '5px 12px', flexShrink: 0 }}
              onClick={() => setShowBulkAssign(true)}>
              <Users size={11} /> Assign All
            </button>
          </div>
        )}

        {/* Security staff online status bar */}
        {securityStaff.length > 0 && (
          <div className="sf-card" style={{ padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--sf-text-muted)' }}>
              Security Staff
            </span>
            {securityStaff.map(m => (
              <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--sf-text-secondary)' }}>
                <OnlineDot status={m.online_status} />
                {m.user?.full_name || m.user?.email}
              </span>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={typeFil} onChange={e => setTypeFil(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
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
            {Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="sf-filter-clear" onClick={() => { setTypeFil(''); setSeverityFil(''); setStatusFil(''); }}>
            Clear
          </button>
        </div>

        {/* Incident list */}
        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading incidents…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : incidents.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--sf-text-muted)', fontSize: 13, padding: '40px 0' }}>
            No incidents found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {incidents.map(inc => {
              const isUrgent   = inc.severity === 'high' || inc.severity === 'critical';
              const isExpanded = expanded[inc.id];
              return (
                <div key={inc.id} className="sf-card" style={{
                  padding: '18px 22px',
                  borderLeft: isUrgent && inc.status !== 'resolved'
                    ? '3px solid var(--sf-red)' : '3px solid transparent',
                  opacity: inc.status === 'resolved' ? 0.65 : 1,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>

                    {/* Left */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sf-text-primary)', margin: 0 }}>
                          {inc.title || INCIDENT_TYPE_LABELS[inc.incident_type]}
                        </h3>
                        <span className={`sf-badge ${SEVERITY_CLASS[inc.severity]}`}>
                          {inc.severity === 'critical' ? '⚠ ' : ''}{SEVERITY_LABELS[inc.severity]}
                        </span>
                        <span className={`sf-badge ${STATUS_CLASS[inc.status]}`}>
                          {INCIDENT_STATUS_LABELS[inc.status]}
                        </span>
                        <span className="sf-badge sf-badge-muted">
                          {INCIDENT_TYPE_LABELS[inc.incident_type]}
                        </span>
                      </div>

                      <p style={{ fontSize: 12, color: 'var(--sf-text-muted)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {inc.location && <span>📍 {inc.location}</span>}
                        <span>By <strong style={{ color: 'var(--sf-text-secondary)' }}>{inc.logged_by_name}</strong></span>
                        <span style={{ color: 'var(--sf-text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={10} /> {formatDate(inc.created_at)}
                        </span>
                      </p>

                      {/* Assigned to */}
                      {inc.assigned_to_name && (
                        <p style={{ fontSize: 11, color: 'var(--sf-blue)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <UserCheck size={11} /> Assigned to <strong>{inc.assigned_to_name}</strong>
                        </p>
                      )}

                      {/* Description */}
                      <p style={{
                        fontSize: 13, color: 'var(--sf-text-secondary)', margin: '0 0 4px', lineHeight: 1.6,
                        display: isExpanded ? 'block' : '-webkit-box',
                        WebkitLineClamp: isExpanded ? 'unset' : 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: isExpanded ? 'visible' : 'hidden',
                      }}>
                        {inc.description}
                      </p>
                      {inc.description?.length > 120 && (
                        <button onClick={() => toggleExpand(inc.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--sf-blue)', fontSize: 11, cursor: 'pointer', padding: 0, marginBottom: 4 }}>
                          {isExpanded
                            ? <><ChevronUp size={11} style={{ marginRight: 3 }} />Show less</>
                            : <><ChevronDown size={11} style={{ marginRight: 3 }} />Show more</>
                          }
                        </button>
                      )}

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

                    {/* Right — actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
                      <button
                        className={`sf-btn ${isUrgent && inc.status !== 'resolved' ? 'sf-btn-danger' : inc.status !== 'resolved' ? 'sf-btn-amber' : ''}`}
                        style={{ fontSize: 10, padding: '7px 14px', whiteSpace: 'nowrap' }}
                        onClick={() => setReviewTarget(inc)}
                      >
                        <UserCheck size={11} />
                        {inc.status === 'resolved' ? 'View / Edit' : 'Review & Assign'}
                      </button>
                    </div>

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