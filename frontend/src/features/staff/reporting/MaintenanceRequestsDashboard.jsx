/**
 * src/features/staff/reporting/MaintenanceRequestsDashboard.jsx
 *
 * Accessible by: admin, manager only
 * Route: /staff/maintenance-requests
 *
 * Full dashboard to:
 *  - List all submitted MaintenanceRequests
 *  - Mark as reviewed
 *  - Convert to MaintenanceTask (with assignment + priority + deadline)
 */

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, ArrowRight, Eye, Clock, AlertTriangle, MapPin, User, Calendar } from 'lucide-react';
import {
  maintenanceRequestsApi, staffMembersApi,
  MAINTENANCE_REQUEST_STATUS_LABELS, PRIORITY_LABELS,
} from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const STATUS_CLASS = {
  pending:           'sf-badge-blue',
  reviewed:          'sf-badge-amber',
  converted_to_task: 'sf-badge-green',
};

function formatDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Convert modal ─────────────────────────────────────────────────────────────

function ConvertModal({ request, mtStaff, onClose, onSuccess }) {
  const [form, setForm] = useState({
    title:       request.title,
    description: request.description,
    priority:    2,
    deadline:    '',
    assigned_to: '',

  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);



  const set = (field) => (e) => {
  const value = field === 'priority' ? Number(e.target.value) : e.target.value;
  setForm((f) => ({ ...f, [field]: value }));
};

 const handleSubmit = async (e) => {
  e.preventDefault(); setBusy(true); setError(null);
  try {
    const payload = { ...form };
    if (!payload.deadline)    delete payload.deadline;
    if (!payload.assigned_to) delete payload.assigned_to;
    else                       payload.assigned_to = Number(payload.assigned_to);
    const task = await maintenanceRequestsApi.convert(request.id, payload);
    onSuccess(task);
  } catch (err) {
    const d = err.response?.data;
    setError(d ? Object.values(d).flat().join(' ') : err.message);
  } finally {
    setBusy(false);
  }
};

  return (
    <div className="sf-modal-overlay">
      <div className="sf-modal" style={{ maxWidth: 520 }}>
        <div className="sf-modal-header">
          <h2 className="sf-modal-title">Convert to Maintenance Task</h2>
          <button className="sf-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sf-modal-body">
          <div className="sf-notice sf-notice-amber" style={{ marginBottom: 16, fontSize: 12 }}>
            Converting request: <strong>{request.title}</strong>
            {request.room_number && <span> — Room {request.room_number}</span>}
          </div>
          {error && <div className="sf-notice sf-notice-error">{error}</div>}

          <form id="convert-form" onSubmit={handleSubmit}>
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Task Title</label>
              <input className="sf-input" value={form.title} onChange={set('title')} required />
            </div>
            <div className="sf-form-group">
              <label className="sf-label sf-label-req">Description</label>
              <textarea className="sf-textarea" rows={3} value={form.description} onChange={set('description')} required />
            </div>

            <div className="sf-form-row">
              <div className="sf-form-group">
                <label className="sf-label">Priority</label>
                <select className="sf-select" value={form.priority} onChange={set('priority')}>
                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="sf-form-group">
                <label className="sf-label">Deadline</label>
                <input type="datetime-local" className="sf-input" value={form.deadline} onChange={set('deadline')} />
              </div>
            </div>
            <div className="sf-form-group">
              <label className="sf-label">Assign To Maintenance Staff</label>
              <select className="sf-select" value={form.assigned_to} onChange={set('assigned_to')}>
                <option value="">— Unassigned (assign later) —</option>
                {mtStaff.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user?.full_name || m.user?.email}
                  </option>
                ))}
              </select>
            </div>
          </form>
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            form="convert-form"
            className="sf-btn sf-btn-primary"
            disabled={busy}
          >
            {busy ? 'Creating…' : <><ArrowRight size={13} /> Create Task</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Review modal ──────────────────────────────────────────────────────────────

function ReviewModal({ request, onClose, onSuccess }) {
  const [notes, setNotes] = useState(request.review_notes || '');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const updated = await maintenanceRequestsApi.review(request.id, { review_notes: notes });
      onSuccess(updated);
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sf-modal-overlay">
      <div className="sf-modal" style={{ maxWidth: 440 }}>
        <div className="sf-modal-header">
          <h2 className="sf-modal-title">Mark as Reviewed</h2>
          <button className="sf-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="sf-modal-body">
          {error && <div className="sf-notice sf-notice-error">{error}</div>}
          <div className="sf-form-group">
            <label className="sf-label">Review Notes <span style={{ color: 'var(--white-dim)', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              className="sf-textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for the submitter or for your reference…"
            />
          </div>
        </div>
        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>Cancel</button>
          <button className="sf-btn sf-btn-amber" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : <><Eye size={13} /> Mark Reviewed</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export default function MaintenanceRequestsDashboard() {
  const [requests,  setRequests]  = useState([]);
  const [mtStaff,   setMtStaff]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [statusFil, setStatusFil] = useState('');
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const perms = useStaffRole();

  const [convertTarget, setConvertTarget] = useState(null);
  const [reviewTarget,  setReviewTarget]  = useState(null);
  const [convertOk,     setConvertOk]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status    = statusFil;
      if (dateFrom)  params.date_from = dateFrom;
      if (dateTo)    params.date_to   = dateTo;
      const data = await maintenanceRequestsApi.list(params);
      setRequests(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFil, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffMembersApi.list({ role: 'maintenance', is_active: 'true' })
      .then((d) => setMtStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  const pendingCount  = requests.filter((r) => r.status === 'pending').length;
  const reviewedCount = requests.filter((r) => r.status === 'reviewed').length;
  const doneCount     = requests.filter((r) => r.status === 'converted_to_task').length;

  const handleReviewSuccess = (updated) => {
    setRequests((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    setReviewTarget(null);
  };

  const handleConvertSuccess = (task) => {
    setConvertTarget(null);
    setConvertOk(task);
    load(); // reload to show updated status
  };

  return (
    <div className="sf-page">

      {/* Modals */}
      {reviewTarget && (
        <ReviewModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSuccess={handleReviewSuccess}
        />
      )}
      {convertTarget && (
        <ConvertModal
          request={convertTarget}
          mtStaff={mtStaff}
          onClose={() => setConvertTarget(null)}
          onSuccess={handleConvertSuccess}
        />
      )}

      {/* Success toast */}
      {convertOk && (
        <div
          className="sf-notice sf-notice-success"
          style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 700, maxWidth: 360, cursor: 'pointer' }}
          onClick={() => setConvertOk(null)}
        >
          <CheckCircle2 size={14} style={{ marginRight: 8 }} />
          Task "<strong>{convertOk.title}</strong>" created successfully.
        </div>
      )}

      <div className="sf-inner">

        {/* Header */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Operations</p>
            <h1>Maintenance Requests</h1>
            <p>
              {pendingCount > 0 && (
                <span style={{ color: 'var(--amber)' }}>{pendingCount} awaiting review · </span>
              )}
              {requests.length} total
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="sf-summary-grid" style={{ marginBottom: 24 }}>
          {[
            { label: 'Pending Review', value: pendingCount,  color: 'var(--blue)',  icon: <Clock size={16} /> },
            { label: 'Reviewed',       value: reviewedCount, color: 'var(--amber)', icon: <Eye size={16} /> },
            { label: 'Converted',      value: doneCount,     color: 'var(--green)', icon: <CheckCircle2 size={16} /> },
          ].map((s) => (
            <div key={s.label} className="sf-summary-card">
              <div className="sf-summary-label">{s.label}</div>
              <div className="sf-summary-value" style={{ color: s.color, fontSize: 30 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Pending alert */}
        {pendingCount > 0 && (
          <div className="sf-notice sf-notice-amber" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={14} />
            <strong>{pendingCount} request{pendingCount !== 1 ? 's' : ''} waiting for your review.</strong>
          </div>
        )}

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(MAINTENANCE_REQUEST_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="date" className="sf-input" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)} style={{ width: 150 }} />
            <span style={{ color: 'var(--white-dim)', fontSize: 12 }}>→</span>
            <input type="date" className="sf-input" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)} style={{ width: 150 }} />
          </div>
          <button className="sf-filter-clear" onClick={() => { setStatusFil(''); setDateFrom(''); setDateTo(''); }}>
            Clear
          </button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading requests…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : requests.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>
            No maintenance requests found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {requests.map((req) => (
              <div key={req.id} className="sf-card" style={{ padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>

                  {/* Left */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: 'var(--white)', margin: 0 }}>
                        {req.title}
                      </h3>
                      <span className={`sf-badge ${STATUS_CLASS[req.status]}`}>
                        {MAINTENANCE_REQUEST_STATUS_LABELS[req.status]}
                      </span>
                    </div>

                    <p style={{ fontSize: 12, color: 'var(--white-dim)', margin: '0 0 8px' }}>
                      <span style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <MapPin size={11} /> {req.room_number ? `Room ${req.room_number}` : 'No room'} </span>
                      {req.reported_by_name && (
                        <span style={{ marginLeft: 12, color: 'rgba(248,246,240,0.4)', display:'inline-flex', alignItems:'center', gap:4 }}>
                             <User size={11} /> <strong style={{ color: 'var(--white-dim)' }}>{req.reported_by_name}</strong>
                        </span>
                      )}
                    <span style={{ marginLeft: 12, color: 'rgba(248,246,240,0.3)', fontSize: 11, display:'inline-flex', alignItems:'center', gap:4 }}>
                         <Calendar size={10} /> {formatDate(req.created_at)}
                    </span>
                    </p>

                    <p style={{ fontSize: 13, color: 'var(--white-dim)', margin: '0 0 10px', lineHeight: 1.6 }}>
                      {req.description}
                    </p>

                    {req.review_notes && (
                      <div className="sf-notice sf-notice-amber" style={{ margin: '0 0 10px', padding: '8px 12px', fontSize: 12 }}>
                        <strong>Review note:</strong> {req.review_notes}
                      </div>
                    )}

                    {req.status === 'converted_to_task' && req.converted_task_title && (
                      <div className="sf-notice sf-notice-success" style={{ margin: '0 0 10px', padding: '8px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <CheckCircle2 size={12} />
                        Task: <strong>{req.converted_task_title}</strong>
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, alignItems: 'flex-end' }}>
                    {/* Mark as reviewed */}
                    {req.status === 'pending' && perms.canAssignMaintenance &&  (
                      <button
                        className="sf-btn sf-btn-amber"
                        style={{ fontSize: 9, padding: '7px 14px', whiteSpace: 'nowrap' }}
                        onClick={() => setReviewTarget(req)}
                      >
                        <Eye size={11} /> Mark Reviewed
                      </button>
                    )}

                    {/* Convert to task */}
                    {req.is_convertible && perms.canAssignMaintenance && (
                      <button
                        className="sf-btn sf-btn-primary"
                        style={{ fontSize: 9, padding: '7px 14px', whiteSpace: 'nowrap' }}
                        onClick={() => setConvertTarget(req)}
                      >
                        <ArrowRight size={11} /> Convert to Task
                      </button>
                    )}

                    {/* Already converted */}
                    {!req.is_convertible && (
                      <span className="sf-badge sf-badge-green">
                        <CheckCircle2 size={9} /> Converted
                      </span>
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