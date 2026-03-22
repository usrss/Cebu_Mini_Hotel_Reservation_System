/**
 * src/features/staff/tasks/CleaningTaskListPage.jsx
 *
 * Updated to match the housekeeping spec:
 *  - Status labels: Pending / In Progress / Done (mapped from dirty/cleaning/clean)
 *  - Shows cleaning start time and end time
 *  - Shows time remaining (countdown) or overdue indicator
 *  - Overdue tasks highlighted with a distinct badge
 *  - Workflow enforced: Pending → In Progress → Done
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cleaningApi, staffMembersApi, PRIORITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';
import '../Staff.css';

// ── Label overrides to match spec (Pending / In Progress / Done) ──────────────
const STATUS_LABELS = {
  dirty:    'Pending',
  cleaning: 'In Progress',
  clean:    'Done',
};

const STATUS_CLASS = {
  dirty:    'sf-badge-red',
  cleaning: 'sf-badge-amber',
  clean:    'sf-badge-green',
};

const PRIORITY_CLASS = {
  1: 'sf-badge-red',
  2: 'sf-badge-gold',
  3: 'sf-badge-muted',
};

// Workflow: dirty → cleaning → clean (no going back to dirty once clean)
const TRANSITIONS = {
  dirty:    ['cleaning'],
  cleaning: ['clean'],
  clean:    [],
};

const BTN_LABEL = {
  cleaning: 'Start Cleaning',
  clean:    'Mark as Done',
};

const BTN_CLASS = {
  cleaning: 'sf-task-btn-amber',
  clean:    'sf-task-btn-green',
};

// ── Time helpers ──────────────────────────────────────────────────────────────

function getTimeRemaining(cleaningEndAt) {
  if (!cleaningEndAt) return null;
  const diff = new Date(cleaningEndAt) - Date.now();
  return diff; // ms — negative means overdue
}

function formatTimeRemaining(ms) {
  if (ms <= 0) return null; // overdue
  const totalSec = Math.floor(ms / 1000);
  const h        = Math.floor(totalSec / 3600);
  const m        = Math.floor((totalSec % 3600) / 60);
  const s        = totalSec % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${s}s remaining`;
  return `${s}s remaining`;
}

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-PH', {
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// ── Time remaining live ticker ─────────────────────────────────────────────────

function TimeRemaining({ cleaningEndAt, status }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status === 'clean') return; // no need to tick when done
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  if (!cleaningEndAt || status === 'clean') return null;

  const diff       = new Date(cleaningEndAt) - now;
  const isOverdue  = diff <= 0;
  const label      = isOverdue
    ? `Overdue by ${formatOverdue(Math.abs(diff))}`
    : formatTimeRemaining(diff);

  return (
    <div className={`sf-cleaning-timer ${isOverdue ? 'sf-cleaning-timer--overdue' : ''}`}>
      {isOverdue
        ? <AlertTriangle size={12} />
        : <Clock size={12} />
      }
      <span>{label}</span>
    </div>
  );
}

function formatOverdue(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h        = Math.floor(totalSec / 3600);
  const m        = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CleaningTaskListPage() {
  const perms = useStaffRole();

  const [tasks,      setTasks]      = useState([]);
  const [hkStaff,    setHkStaff]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [statusFil,  setStatusFil]  = useState('');
  const [priFilter,  setPriFilter]  = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [form,       setForm]       = useState({ room: '', assigned_to: '', priority: 2, notes: '' });
  const [formBusy,   setFormBusy]   = useState(false);
  const [formErr,    setFormErr]    = useState(null);
  const [statusBusy, setStatusBusy] = useState(null);

  const loadTasks = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status   = statusFil;
      if (priFilter) params.priority = priFilter;
      const data = await cleaningApi.list(params);
      setTasks(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFil, priFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!perms.canManageCleaning) return;
    staffMembersApi.list({ role: 'housekeeping', is_active: 'true' })
      .then((d) => setHkStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, [perms.canManageCleaning]);

  const handleCreate = async (e) => {
    e.preventDefault(); setFormBusy(true); setFormErr(null);
    try {
      await cleaningApi.create(form);
      setForm({ room: '', assigned_to: '', priority: 2, notes: '' });
      setShowForm(false);
      loadTasks();
    } catch (err) {
      const d = err.response?.data;
      setFormErr(d ? Object.values(d).flat().join(' ') : err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const handleStatus = async (task, next) => {
    setStatusBusy(task.id);
    try {
      await cleaningApi.updateStatus(task.id, { status: next });
      loadTasks();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setStatusBusy(null);
    }
  };

  // Derived counts
  const pendingCount    = tasks.filter((t) => t.status === 'dirty').length;
  const inProgressCount = tasks.filter((t) => t.status === 'cleaning').length;
  const overdueCount    = tasks.filter((t) =>
    t.status !== 'clean' && t.cleaning_end_at && new Date(t.cleaning_end_at) < new Date()
  ).length;

  return (
    <div className="sf-page">
      <div className="sf-inner">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Housekeeping</p>
            <h1>Cleaning Tasks</h1>
            <p>
              {pendingCount} pending · {inProgressCount} in progress
              {overdueCount > 0 && (
                <span className="sf-overdue-summary"> · {overdueCount} overdue</span>
              )}
            </p>
          </div>
          {perms.canManageCleaning && (
            <button className="sf-btn sf-btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? '× Cancel' : <><Plus size={13} /> New Task</>}
            </button>
          )}
          {!perms.canManageCleaning && perms.canAccessCleaning && (
            <span className="sf-badge sf-badge-muted">Your Assigned Tasks</span>
          )}
        </div>

        {/* ── Create form (Admin/Manager only) ───────────────────────────── */}
        {showForm && perms.canManageCleaning && (
          <div className="sf-card" style={{ marginBottom: 20 }}>
            <div className="sf-card-label">New Cleaning Task</div>
            {formErr && <div className="sf-notice sf-notice-error">{formErr}</div>}
            <form onSubmit={handleCreate}>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Room ID</label>
                  <input
                    type="number" className="sf-input" value={form.room}
                    onChange={(e) => setForm({ ...form, room: e.target.value })}
                    required placeholder="Room primary key"
                  />
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Assign To</label>
                  <select
                    className="sf-select" value={form.assigned_to}
                    onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {hkStaff.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.user?.full_name || m.user?.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label">Priority</label>
                  <select
                    className="sf-select" value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                  >
                    <option value={1}>High</option>
                    <option value={2}>Normal</option>
                    <option value={3}>Low</option>
                  </select>
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Notes</label>
                  <input
                    className="sf-input" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="sf-btn sf-btn-primary" disabled={formBusy}>
                  {formBusy ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Filters ────────────────────────────────────────────────────── */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="dirty">Pending</option>
            <option value="cleaning">In Progress</option>
            <option value="clean">Done</option>
          </select>
          <select className="sf-select" value={priFilter} onChange={(e) => setPriFilter(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="1">High</option>
            <option value="2">Normal</option>
            <option value="3">Low</option>
          </select>
          <button
            className="sf-filter-clear"
            onClick={() => { setStatusFil(''); setPriFilter(''); }}
          >
            Clear
          </button>
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="sf-loading">
            <div className="sf-spinner" /><p>Loading tasks…</p>
          </div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : tasks.length === 0 ? (
          <div className="sf-card" style={{ textAlign: 'center', color: 'var(--white-dim)', fontSize: 13 }}>
            No cleaning tasks found.
          </div>
        ) : (
          <div className="sf-cards-grid">
            {tasks.map((t) => {
              const isOverdue = t.status !== 'clean'
                && t.cleaning_end_at
                && new Date(t.cleaning_end_at) < new Date();

              return (
                <div
                  key={t.id}
                  className={`sf-task-card ${isOverdue ? 'sf-task-card--overdue' : ''}`}
                >
                  {/* Card header */}
                  <div className="sf-task-card-head">
                    <div>
                      <h3 className="sf-task-card-title">Room {t.room_number || t.room}</h3>
                      <p className="sf-task-card-sub">
                        {t.assigned_to_name ? `→ ${t.assigned_to_name}` : 'Unassigned'}
                      </p>
                    </div>
                    <div className="sf-task-card-badges">
                      {isOverdue && (
                        <span className="sf-badge sf-badge-overdue">
                          <AlertTriangle size={10} /> Overdue
                        </span>
                      )}
                      <span className={`sf-badge ${STATUS_CLASS[t.status]}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                      <span className={`sf-badge ${PRIORITY_CLASS[t.priority]}`}>
                        {PRIORITY_LABELS[t.priority]}
                      </span>
                    </div>
                  </div>

                  {/* Cleaning window */}
                  {(t.cleaning_started_at || t.cleaning_end_at) && t.status !== 'clean' && (
                    <div className="sf-cleaning-window">
                      <div className="sf-cleaning-window-row">
                        <span className="sf-cleaning-window-label">Started</span>
                        <span className="sf-cleaning-window-value">
                          {formatDateTime(t.cleaning_started_at)}
                        </span>
                      </div>
                      <div className="sf-cleaning-window-row">
                        <span className="sf-cleaning-window-label">Must finish by</span>
                        <span className={`sf-cleaning-window-value ${isOverdue ? 'sf-text-danger' : ''}`}>
                          {formatDateTime(t.cleaning_end_at)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Live countdown */}
                  <TimeRemaining
                    cleaningEndAt={t.cleaning_end_at}
                    status={t.status}
                  />

                  {/* Completion time */}
                  {t.status === 'clean' && t.completed_at && (
                    <div className="sf-cleaning-done">
                      <CheckCircle2 size={12} />
                      <span>Completed {formatDateTime(t.completed_at)}</span>
                    </div>
                  )}

                  {/* Notes */}
                  {t.notes && <p className="sf-task-card-body">{t.notes}</p>}

                  {/* Created date */}
                  <p className="sf-task-card-meta">
                    Created {new Date(t.created_at).toLocaleDateString()}
                  </p>

                  {/* Action buttons
                      Workflow enforced: Pending → In Progress → Done only.
                      No reverting allowed from the housekeeping dashboard.
                      Admin/Manager can still reassign via the detail view. */}
                  {TRANSITIONS[t.status]?.length > 0 && perms.canAccessCleaning && (
                    <div className="sf-task-card-actions">
                      {TRANSITIONS[t.status].map((next) => (
                        <button
                          key={next}
                          className={`sf-task-btn ${BTN_CLASS[next] || 'sf-task-btn-gold'}`}
                          onClick={() => handleStatus(t, next)}
                          disabled={statusBusy === t.id}
                        >
                          {statusBusy === t.id ? '…' : BTN_LABEL[next]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}