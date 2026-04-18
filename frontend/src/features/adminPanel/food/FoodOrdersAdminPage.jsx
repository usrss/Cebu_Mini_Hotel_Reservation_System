/**
 * HousekeepingDashboard.jsx — revised to match AdminDashboard light theme
 * Real-time polling (no refresh button), no emoji, no strip lines, consistent layout.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Clock, AlertTriangle, CheckCircle2, RefreshCw, Sparkles, UserPlus, X } from 'lucide-react';
import { cleaningApi, staffMembersApi, PRIORITY_LABELS } from '../../staff/services/staffApi';
import { adminGetRooms } from '../../../services/roomService';
import { useStaffRole } from '../../staff/hooks/useStaffRole';
import '../../staff/Staff.css';
import '../../staff/housekeeping/HousekeepingDashboard.css';

const STATUS_LABELS = { dirty: 'Pending', cleaning: 'In Progress', clean: 'Done' };
const STATUS_CLASS  = { dirty: 'sf-badge-red', cleaning: 'sf-badge-amber', clean: 'sf-badge-green' };
const PRIORITY_CLASS = { 1: 'sf-badge-red', 2: 'sf-badge-gold', 3: 'sf-badge-muted' };
const TRANSITIONS  = { dirty: ['cleaning'], cleaning: ['clean'], clean: [] };
const ACTION_LABELS = { cleaning: 'Start Cleaning', clean: 'Mark as Done' };
const ACTION_CLASS  = { cleaning: 'sf-task-btn-amber', clean: 'sf-task-btn-green' };

function formatDateTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m remaining`;
  if (m > 0) return `${m}m ${sec}s remaining`;
  return `${sec}s remaining`;
}

function formatOverdue(ms) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `Overdue by ${h}h ${m}m`;
  return `Overdue by ${m}m`;
}

function CleaningTimer({ cleaningEndAt, status }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status === 'clean') return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [status]);
  if (!cleaningEndAt || status === 'clean') return null;
  const diff = new Date(cleaningEndAt) - Date.now();
  const isOverdue = diff <= 0;
  const label = isOverdue ? formatOverdue(diff) : formatCountdown(diff);
  return (
    <div className={`hk-timer${isOverdue ? ' hk-timer--overdue' : ''}`}>
      {isOverdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
      <span>{label}</span>
    </div>
  );
}

function AssignWidget({ task, hkStaff, onAssigned }) {
  const [open, setOpen]     = useState(false);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const [selected, setSelected] = useState('');

  const handleAssign = async () => {
    setBusy(true); setError(null);
    try {
      const body = selected ? { assigned_to: Number(selected) } : { assigned_to: null };
      const updated = await cleaningApi.assign(task.id, body);
      onAssigned(updated);
      setOpen(false); setSelected('');
    } catch (err) { setError(err.response?.data?.error || err.message); }
    finally { setBusy(false); }
  };

  if (!open) {
    return (
      <button className="hk-assign-btn" onClick={() => setOpen(true)} title="Assign to housekeeping staff">
        <UserPlus size={11} />
        {task.assigned_to ? 'Reassign' : 'Assign'}
      </button>
    );
  }

  return (
    <div className="hk-assign-widget">
      <div className="hk-assign-row">
        <select className="sf-select hk-assign-select" value={selected} onChange={e => setSelected(e.target.value)} autoFocus>
          <option value="">— Unassign —</option>
          {hkStaff.map(m => (
            <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>
          ))}
        </select>
        <button className="sf-task-btn sf-task-btn-green" onClick={handleAssign} disabled={busy}>{busy ? '…' : 'Confirm'}</button>
        <button className="sf-task-btn sf-task-btn-muted" onClick={() => { setOpen(false); setSelected(''); setError(null); }} disabled={busy}><X size={10} /></button>
      </div>
      {error && <p className="hk-assign-error">{error}</p>}
    </div>
  );
}

function SummaryCard({ label, value, icon }) {
  return (
    <div className="hk-summary-card">
      <div className="hk-summary-icon">{icon}</div>
      <div className="hk-summary-value">{value}</div>
      <div className="hk-summary-label">{label}</div>
    </div>
  );
}

function TaskCard({ task, onAction, onAssigned, actionBusy, canAct, canAssign, hkStaff }) {
  const isOverdue = task.status !== 'clean' && task.cleaning_end_at && new Date(task.cleaning_end_at) < new Date();
  const nextSteps = TRANSITIONS[task.status] ?? [];

  return (
    <div className={`hk-task-card${isOverdue ? ' hk-task-card--overdue' : ''}${task.status === 'clean' ? ' hk-task-card--done' : ''}`}>
      <div className="hk-task-head">
        <div className="hk-task-room">
          <span className="hk-task-room-label">Room</span>
          <span className="hk-task-room-number">{task.room_number || task.room}</span>
        </div>
        <div className="hk-task-badges">
          {isOverdue && <span className="sf-badge hk-badge-overdue"><AlertTriangle size={9} /> Overdue</span>}
          {task.status === 'clean' && <span className="sf-badge hk-badge-done"><CheckCircle2 size={9} /> Done</span>}
          <span className={`sf-badge ${STATUS_CLASS[task.status]}`}>{STATUS_LABELS[task.status]}</span>
          <span className={`sf-badge ${PRIORITY_CLASS[task.priority]}`}>{PRIORITY_LABELS[task.priority]}</span>
        </div>
      </div>

      <p className="hk-task-assigned">
        {task.assigned_to_name ? <>Assigned to {task.assigned_to_name}</> : <span className="hk-unassigned">Unassigned</span>}
      </p>

      {task.status !== 'clean' && task.cleaning_started_at && (
        <div className="hk-cleaning-window">
          <div className="hk-window-row">
            <span className="hk-window-label"><Clock size={10} /> Started</span>
            <span className="hk-window-value">{formatDateTime(task.cleaning_started_at)}</span>
          </div>
          <div className="hk-window-row">
            <span className="hk-window-label">Must finish by</span>
            <span className={`hk-window-value ${isOverdue ? 'hk-text-danger' : 'hk-text-amber'}`}>{formatDateTime(task.cleaning_end_at)}</span>
          </div>
        </div>
      )}

      <CleaningTimer cleaningEndAt={task.cleaning_end_at} status={task.status} />

      {task.status === 'clean' && task.completed_at && (
        <div className="hk-done-row">
          <CheckCircle2 size={11} />
          <span>Completed {formatDateTime(task.completed_at)}</span>
        </div>
      )}

      {task.notes && <p className="sf-task-card-body">{task.notes}</p>}

      {canAssign && task.status !== 'clean' && (
        <AssignWidget task={task} hkStaff={hkStaff} onAssigned={onAssigned} />
      )}

      {canAct && nextSteps.length > 0 && (
        <div className="sf-task-card-actions">
          {nextSteps.map(next => (
            <button
              key={next}
              className={`sf-task-btn ${ACTION_CLASS[next]}`}
              onClick={() => onAction(task, next)}
              disabled={actionBusy === task.id}
            >
              {actionBusy === task.id
                ? <><span className="hk-btn-spinner" /> Working…</>
                : ACTION_LABELS[next]
              }
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HousekeepingDashboard() {
  const perms = useStaffRole();

  const [tasks,       setTasks]       = useState([]);
  const [hkStaff,     setHkStaff]     = useState([]);
  const [rooms,       setRooms]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [statusFil,   setStatusFil]   = useState('');
  const [showForm,    setShowForm]    = useState(false);
  const [form,        setForm]        = useState({ room: '', assigned_to: '', priority: 2, notes: '' });
  const [formBusy,    setFormBusy]    = useState(false);
  const [formErr,     setFormErr]     = useState(null);
  const [actionBusy,  setActionBusy]  = useState(null);
  const autoRefreshRef = useRef(null);

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const params = {};
      if (statusFil) params.status = statusFil;
      const data = await cleaningApi.list(params);
      setTasks(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      if (!silent) setError(err.response?.data?.detail || err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [statusFil]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => loadTasks(true), 30000);
    return () => clearInterval(autoRefreshRef.current);
  }, [loadTasks]);

  useEffect(() => {
    if (!perms.canManageCleaning) return;
    staffMembersApi.list({ role: 'housekeeping', is_active: 'true' })
      .then(d => setHkStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
    adminGetRooms({ is_active: true })
      .then(res => {
        const data = res.data;
        setRooms(Array.isArray(data) ? data : (data.results ?? []));
      })
      .catch(() => {});
  }, [perms.canManageCleaning]);

  const pendingCount    = tasks.filter(t => t.status === 'dirty').length;
  const inProgressCount = tasks.filter(t => t.status === 'cleaning').length;
  const doneCount       = tasks.filter(t => t.status === 'clean').length;
  const overdueCount    = tasks.filter(t => t.status !== 'clean' && t.cleaning_end_at && new Date(t.cleaning_end_at) < new Date()).length;

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
    } finally { setFormBusy(false); }
  };

  const handleAction = async (task, next) => {
    setActionBusy(task.id);
    try {
      await cleaningApi.updateStatus(task.id, { status: next });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t));
      loadTasks(true);
    } catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setActionBusy(null); }
  };

  const handleAssigned = (updatedTask) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };

  const displayed = statusFil ? tasks.filter(t => t.status === statusFil) : tasks;
  const sorted = [...displayed].sort((a, b) => {
    const aOD = a.status !== 'clean' && a.cleaning_end_at && new Date(a.cleaning_end_at) < new Date();
    const bOD = b.status !== 'clean' && b.cleaning_end_at && new Date(b.cleaning_end_at) < new Date();
    if (aOD && !bOD) return -1;
    if (!aOD && bOD) return 1;
    const order = { dirty: 0, cleaning: 1, clean: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return a.priority - b.priority;
  });

  return (
    <div className="sf-page hk-page">
      <div className="sf-inner">

        {/* Header */}
        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Housekeeping</p>
            <h1>Cleaning Dashboard</h1>
          </div>
          <div className="hk-header-actions">
            {perms.canManageCleaning && (
              <button className="sf-btn sf-btn-primary" onClick={() => setShowForm(!showForm)}>
                {showForm ? <><X size={13} /> Cancel</> : <><Plus size={13} /> New Task</>}
              </button>
            )}
            {!perms.canManageCleaning && perms.canAccessCleaning && (
              <span className="sf-badge sf-badge-blue">
                <Sparkles size={10} /> Housekeeping
              </span>
            )}
          </div>
        </div>

        {/* Summary cards */}
        <div className="hk-summary-grid">
          <SummaryCard label="Pending"     value={pendingCount}    icon={<Clock size={18} />} />
          <SummaryCard label="In Progress" value={inProgressCount} icon={<RefreshCw size={18} />} />
          <SummaryCard label="Done"        value={doneCount}       icon={<CheckCircle2 size={18} />} />
          <SummaryCard label="Overdue"     value={overdueCount}    icon={<AlertTriangle size={18} />} />
        </div>

        {/* Overdue banner */}
        {overdueCount > 0 && (
          <div className="hk-overdue-banner">
            <AlertTriangle size={15} />
            <strong>{overdueCount} room{overdueCount !== 1 ? 's' : ''} exceeded the 2-hour cleaning window.</strong>
            <span>Please prioritise these tasks immediately.</span>
          </div>
        )}

        {/* Create form */}
        {showForm && perms.canManageCleaning && (
          <div className="sf-card" style={{ marginBottom: 20 }}>
            <div className="sf-card-label">New Cleaning Task</div>
            {formErr && <div className="sf-notice sf-notice-error">{formErr}</div>}
            <form onSubmit={handleCreate}>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Room</label>
                  <select className="sf-select" value={form.room} onChange={e => setForm({ ...form, room: e.target.value })} required>
                    <option value="">— Select a room —</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>#{r.room_number} — {r.room_type_display || r.room_type}{r.status !== 'available' ? ` (${r.status_display || r.status})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Assign To</label>
                  <select className="sf-select" value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to: e.target.value })}>
                    <option value="">Unassigned</option>
                    {hkStaff.map(m => <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>)}
                  </select>
                </div>
              </div>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label">Priority</label>
                  <select className="sf-select" value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>
                    <option value={1}>High</option>
                    <option value={2}>Normal</option>
                    <option value={3}>Low</option>
                  </select>
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Notes</label>
                  <input className="sf-input" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
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

        {/* Filters */}
        <div className="sf-filter-bar">
          <span className="hk-filter-label">Filter:</span>
          {[
            { value: '',         label: 'All',         count: tasks.length },
            { value: 'dirty',    label: 'Pending',     count: pendingCount },
            { value: 'cleaning', label: 'In Progress', count: inProgressCount },
            { value: 'clean',    label: 'Done',        count: doneCount },
          ].map(opt => (
            <button
              key={opt.value}
              className={`hk-filter-pill${statusFil === opt.value ? ' active' : ''}`}
              onClick={() => setStatusFil(opt.value)}
            >
              {opt.label}
              {opt.count > 0 && <span className="hk-filter-count">{opt.count}</span>}
            </button>
          ))}
        </div>

        {/* Task grid */}
        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading cleaning tasks…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : sorted.length === 0 ? (
          <div className="hk-empty">
            <CheckCircle2 size={36} />
            <p>{statusFil ? `No ${STATUS_LABELS[statusFil] ?? statusFil} tasks.` : 'No cleaning tasks at the moment.'}</p>
            {statusFil && <button className="sf-btn" onClick={() => setStatusFil('')}>Show all</button>}
          </div>
        ) : (
          <div className="sf-cards-grid">
            {sorted.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onAction={handleAction}
                onAssigned={handleAssigned}
                actionBusy={actionBusy}
                canAct={perms.canAccessCleaning}
                canAssign={perms.canManageCleaning}
                hkStaff={hkStaff}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}