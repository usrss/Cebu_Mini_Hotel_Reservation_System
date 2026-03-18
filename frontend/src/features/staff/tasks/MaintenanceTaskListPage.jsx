/**
 * src/features/staff/tasks/MaintenanceTaskListPage.jsx
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { maintenanceApi, staffMembersApi, MAINTENANCE_STATUS_LABELS, PRIORITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

const STATUS_CLASS  = { pending:'sf-badge-blue', in_progress:'sf-badge-amber', completed:'sf-badge-green', cancelled:'sf-badge-muted' };
const TRANSITIONS   = { pending:['in_progress','cancelled'], in_progress:['completed','cancelled'], completed:[], cancelled:[] };
const BTN_CLASS     = { in_progress:'sf-task-btn-amber', completed:'sf-task-btn-green', cancelled:'sf-task-btn-muted' };

export default function MaintenanceTaskListPage() {
  const perms = useStaffRole();

  const [tasks,    setTasks]    = useState([]);
  const [mtStaff,  setMtStaff]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [statusFil, setStatusFil] = useState('');
  const [priFilter, setPriFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]  = useState({ room: '', assigned_to: '', title: '', description: '', priority: 2 });
  const [formBusy, setFormBusy]  = useState(false);
  const [formErr,  setFormErr]   = useState(null);
  const [statusBusy, setStatusBusy] = useState(null);
  // Completion notes modal
  const [notesModal, setNotesModal] = useState(null);
  const [compNotes,  setCompNotes]  = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status   = statusFil;
      if (priFilter) params.priority = priFilter;
      const data = await maintenanceApi.list(params);
      setTasks(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) { setError(err.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  }, [statusFil, priFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Only admin/manager can create tasks and need the maintenance staff list
  useEffect(() => {
    if (!perms.canManageMaintenance) return;
    staffMembersApi.list({ role: 'maintenance', is_active: 'true' })
      .then((d) => setMtStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, [perms.canManageMaintenance]);

  const handleCreate = async (e) => {
    e.preventDefault(); setFormBusy(true); setFormErr(null);
    try {
      await maintenanceApi.create(form);
      setForm({ room: '', assigned_to: '', title: '', description: '', priority: 2 });
      setShowForm(false); loadTasks();
    } catch (err) {
      const d = err.response?.data;
      setFormErr(d ? Object.values(d).flat().join(' ') : err.message);
    } finally { setFormBusy(false); }
  };

  const handleStatus = async (task, next) => {
    if (next === 'completed') { setNotesModal(task.id); return; }
    await doStatus(task.id, next, '');
  };

  const doStatus = async (pk, next, notes) => {
    setStatusBusy(pk);
    try {
      await maintenanceApi.updateStatus(pk, { status: next, completion_notes: notes });
      setNotesModal(null); setCompNotes(''); loadTasks();
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setStatusBusy(null); }
  };

  return (
    <div className="sf-page">

      {/* Completion notes modal */}
      {notesModal && (
        <div className="sf-modal-overlay">
          <div className="sf-modal" style={{ maxWidth: 440 }}>
            <div className="sf-modal-header">
              <h2 className="sf-modal-title">Complete Task</h2>
              <button className="sf-modal-close" onClick={() => { setNotesModal(null); setCompNotes(''); }}>×</button>
            </div>
            <div className="sf-modal-body">
              <div className="sf-form-group">
                <label className="sf-label">Completion Notes (optional)</label>
                <textarea className="sf-textarea" rows={4} value={compNotes} onChange={(e) => setCompNotes(e.target.value)} placeholder="Describe what was done…" />
              </div>
            </div>
            <div className="sf-modal-footer">
              <button className="sf-btn" onClick={() => { setNotesModal(null); setCompNotes(''); }}>Cancel</button>
              <button className="sf-btn sf-btn-success" onClick={() => doStatus(notesModal, 'completed', compNotes)} disabled={statusBusy === notesModal}>
                {statusBusy === notesModal ? 'Saving…' : 'Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sf-inner">
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Facilities</p>
            <h1>Maintenance Tasks</h1>
            <p>{tasks.filter((t) => ['pending','in_progress'].includes(t.status)).length} active</p>
          </div>
          {perms.canManageMaintenance && (
            <button className="sf-btn sf-btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? '× Cancel' : <><Plus size={13} /> New Task</>}
            </button>
          )}
          {/* Maintenance staff: read-only badge shown instead */}
          {!perms.canManageMaintenance && perms.canAccessMaintenance && (
            <span className="sf-badge sf-badge-muted">Your Assigned Tasks</span>
          )}
        </div>

        {/* Create form — Admin/Manager only. Maintenance staff cannot create tasks. */}
        {showForm && perms.canManageMaintenance && (
          <div className="sf-card" style={{ marginBottom: 20 }}>
            <div className="sf-card-label">New Maintenance Task</div>
            {formErr && <div className="sf-notice sf-notice-error">{formErr}</div>}
            <form onSubmit={handleCreate}>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Room ID</label>
                  <input type="number" className="sf-input" value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })} required placeholder="Room primary key" />
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Assign To</label>
                  <select className="sf-select" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                    <option value="">Unassigned</option>
                    {mtStaff.map((m) => <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>)}
                  </select>
                </div>
              </div>
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Title</label>
                <input className="sf-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="sf-form-group">
                <label className="sf-label sf-label-req">Description</label>
                <textarea className="sf-textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
              </div>
              <div className="sf-form-group" style={{ maxWidth: 200 }}>
                <label className="sf-label">Priority</label>
                <select className="sf-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}>
                  <option value={1}>High</option>
                  <option value={2}>Normal</option>
                  <option value={3}>Low</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="sf-btn sf-btn-primary" disabled={formBusy}>
                  {formBusy ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {Object.entries(MAINTENANCE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="sf-select" value={priFilter} onChange={(e) => setPriFilter(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="1">High</option>
            <option value="2">Normal</option>
            <option value="3">Low</option>
          </select>
          <button className="sf-filter-clear" onClick={() => { setStatusFil(''); setPriFilter(''); }}>Clear</button>
        </div>

        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading tasks…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : tasks.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>No maintenance tasks found.</div>
        ) : (
          <div className="sf-cards-grid">
            {tasks.map((t) => (
              <div key={t.id} className="sf-task-card">
                <div className="sf-task-card-head">
                  <div>
                    <h3 className="sf-task-card-title">{t.title}</h3>
                    <p className="sf-task-card-sub">Room {t.room_number || t.room}</p>
                  </div>
                  <div className="sf-task-card-badges">
                    <span className={`sf-badge ${STATUS_CLASS[t.status]}`}>{MAINTENANCE_STATUS_LABELS[t.status]}</span>
                    <span className="sf-badge sf-badge-muted">{PRIORITY_LABELS[t.priority]}</span>
                  </div>
                </div>
                <p className="sf-task-card-body">{t.description}</p>
                {t.assigned_to_name && (
                  <p className="sf-task-card-meta">→ {t.assigned_to_name}</p>
                )}
                {t.completion_notes && (
                  <div className="sf-notice sf-notice-success" style={{ margin: 0, padding: '8px 12px', fontSize: 11 }}>
                    {t.completion_notes}
                  </div>
                )}
                <p className="sf-task-card-meta">
                  {new Date(t.created_at).toLocaleDateString()}
                  {t.completed_at && ` · Done ${new Date(t.completed_at).toLocaleDateString()}`}
                </p>
                {/* Status transitions:
                    Admin/Manager: always shown
                    Maintenance: shown (backend enforces assigned_to check) */}
                {TRANSITIONS[t.status]?.length > 0 && perms.canAccessMaintenance && (
                  <div className="sf-task-card-actions">
                    {TRANSITIONS[t.status].map((next) => (
                      <button key={next} className={`sf-task-btn ${BTN_CLASS[next] || 'sf-task-btn-gold'}`}
                        onClick={() => handleStatus(t, next)} disabled={statusBusy === t.id}>
                        {statusBusy === t.id ? '…' : `→ ${MAINTENANCE_STATUS_LABELS[next]}`}
                      </button>
                    ))}
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