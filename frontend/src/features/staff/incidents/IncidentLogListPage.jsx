/**
 * src/features/staff/incidents/IncidentLogListPage.jsx
 *
 * Lists all incident logs. Allows Admin/Security to view and filter.
 * "Log Incident" button navigates to IncidentLogFormPage.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { incidentsApi, INCIDENT_TYPE_LABELS, SEVERITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';

const SEVERITY_COLORS = {
  low:    'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high:   'bg-red-100 text-red-700',
};

const TYPE_ICONS = {
  lost_item:   '🔍',
  disturbance: '📢',
  trespassing: '🚫',
  medical:     '🏥',
  theft:       '🔒',
  other:       '📋',
};

export default function IncidentLogListPage() {
  const navigate = useNavigate();
  const perms    = useStaffRole();

  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const [typeFil,     setTypeFil]     = useState('');
  const [severityFil, setSeverityFil] = useState('');
  const [resolvedFil, setResolvedFil] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (typeFil)     params.incident_type = typeFil;
      if (severityFil) params.severity      = severityFil;
      if (resolvedFil !== '') params.resolved = resolvedFil;
      const data = await incidentsApi.list(params);
      setIncidents(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [typeFil, severityFil, resolvedFil]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Incident Logs</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {incidents.filter((i) => !i.resolved).length} unresolved · {incidents.length} total
          </p>
        </div>
        {perms.canLogIncidents && (
          <button
            onClick={() => navigate('/staff/incidents/new')}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            + Log Incident
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <select value={typeFil} onChange={(e) => setTypeFil(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Types</option>
          {Object.entries(INCIDENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={severityFil} onChange={(e) => setSeverityFil(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select value={resolvedFil} onChange={(e) => setResolvedFil(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All</option>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
        </select>
        <button onClick={() => { setTypeFil(''); setSeverityFil(''); setResolvedFil(''); }}
          className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading…</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : incidents.length === 0 ? (
        <div className="py-20 text-center text-slate-400">No incidents found.</div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc) => (
            <div key={inc.id}
              className={`bg-white rounded-xl border p-4 ${inc.resolved ? 'border-slate-200 opacity-70' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{TYPE_ICONS[inc.incident_type] || '📋'}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">
                        {INCIDENT_TYPE_LABELS[inc.incident_type]}
                      </span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[inc.severity]}`}>
                        {SEVERITY_LABELS[inc.severity]}
                      </span>
                      {inc.resolved && (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Resolved
                        </span>
                      )}
                    </div>
                    {inc.location && (
                      <p className="text-xs text-slate-500 mt-0.5">📍 {inc.location}</p>
                    )}
                    <p className="text-sm text-slate-600 mt-1">{inc.description}</p>
                    {inc.involved_guests && (
                      <p className="text-xs text-slate-400 mt-1">Guests: {inc.involved_guests}</p>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-400">
                    {new Date(inc.created_at).toLocaleDateString('en-PH', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">by {inc.logged_by_name}</p>
                  {perms.canLogIncidents && (
                    <button
                      onClick={() => navigate(`/staff/incidents/${inc.id}/edit`)}
                      className="text-xs text-blue-500 hover:underline mt-1"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {inc.resolution_notes && (
                <div className="mt-2 bg-green-50 rounded-lg p-2 text-xs text-green-700">
                  Resolution: {inc.resolution_notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}