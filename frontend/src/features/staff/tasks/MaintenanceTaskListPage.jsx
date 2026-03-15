/**
 * src/features/staff/tasks/MaintenanceTaskListPage.jsx
 *
 * - Admin/Manager: see all tasks, create, assign maintenance staff
 * - Maintenance:   see only own assigned tasks, update status
 *
 * Status transitions:
 *   pending → in_progress | cancelled
 *   in_progress → completed | cancelled
 */

import { useState, useEffect, useCallback } from 'react';
import { maintenanceApi, staffMembersApi, MAINTENANCE_STATUS_LABELS, PRIORITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';

const STATUS_COLORS = {
  pending:     'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
  cancelled:   'bg-slate-100 text-slate-400',
};

const TRANSITIONS = {
  pending:     ['in_progress', 'cancelled'],
  in_progress: ['completed',   'cancelled'],
  completed:   [],
  cancelled:   [],
};

const TRANSITION_STYLE = {
  in_progress: 'bg-amber-500 text-white hover:bg-amber-600',
  completed:   'bg-green-600 text-white hover:bg-green-700',
  cancelled:   'bg-slate-200 text-slate-700 hover:bg-slate-300',
};

export default function MaintenanceTaskListPage() {
  const perms = useStaffRole();

  const [tasks,    setTasks]    = useState([]);
  const [mtStaff,  setMtStaff]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Filters
  const [statusFil, setStatusFil] = useState('');
  const [priFilter, setPriFilter] = useState('');

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ room: '', assigned_to: '', title: '', description: '', priority: 2 });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr,  setFormErr]  = useState(null);

  // Status update
  const [statusBusy, setStatusBusy]  = useState(null);
  const [notesModal, setNotesModal]   = useState(null); // task pk awaiting completion notes
  const [compNotes,  setCompNotes]    = useState('');

  const loadTasks = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (statusFil) params.status   = statusFil;
      if (priFilter) params.priority = priFilter;
      const data = await maintenanceApi.list(params);
      setTasks(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFil, priFilter]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!perms.canManageMaintenance) return;
    staffMembersApi.list({ role: 'maintenance', is_active: 'true' })
      .then((d) => setMtStaff(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, [perms.canManageMaintenance]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormBusy(true); setFormErr(null);
    try {
      await maintenanceApi.create(form);
      setForm({ room: '', assigned_to: '', title: '', description: '', priority: 2 });
      setShowForm(false);
      loadTasks();
    } catch (err) {
      const d = err.response?.data;
      setFormErr(d ? Object.values(d).flat().join(' ') : err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const handleStatusChange = async (task, newStatus) => {
    // If completing, prompt for completion notes
    if (newStatus === 'completed') {
      setNotesModal(task.id);
      return;
    }
    await doStatusChange(task.id, newStatus, '');
  };

  const doStatusChange = async (pk, newStatus, notes) => {
    setStatusBusy(pk);
    try {
      await maintenanceApi.updateStatus(pk, { status: newStatus, completion_notes: notes });
      setNotesModal(null); setCompNotes('');
      loadTasks();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setStatusBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Completion notes modal */}
      {notesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">Complete Task</h3>
            <textarea
              value={compNotes}
              onChange={(e) => setCompNotes(e.target.value)}
              placeholder="Completion notes (optional)…"
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <div className="flex gap-3">
              <button onClick={() => { setNotesModal(null); setCompNotes(''); }}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-lg text-sm">
                Cancel
              </button>
              <button
                onClick={() => doStatusChange(notesModal, 'completed', compNotes)}
                disabled={statusBusy === notesModal}
                className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {statusBusy === notesModal ? 'Saving…' : 'Mark Completed'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Maintenance Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tasks.filter((t) => ['pending', 'in_progress'].includes(t.status)).length} active
          </p>
        </div>
        {perms.canManageMaintenance && (
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700">
            {showForm ? '× Cancel' : '+ New Task'}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && perms.canManageMaintenance && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          {formErr && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm mb-3">{formErr}</div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Room ID *</label>
              <input type="number" value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Assign To</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">Unassigned</option>
                {mtStaff.map((m) => (
                  <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Description *</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value={1}>High</option>
                <option value={2}>Normal</option>
                <option value={3}>Low</option>
              </select>
            </div>
            <div className="flex items-end">
              <button type="submit" disabled={formBusy}
                className="w-full bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
                {formBusy ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <select value={statusFil} onChange={(e) => setStatusFil(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Statuses</option>
          {Object.entries(MAINTENANCE_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select value={priFilter} onChange={(e) => setPriFilter(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Priorities</option>
          <option value="1">High</option>
          <option value="2">Normal</option>
          <option value="3">Low</option>
        </select>
        <button onClick={() => { setStatusFil(''); setPriFilter(''); }}
          className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Loading…</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500">{error}</div>
      ) : tasks.length === 0 ? (
        <div className="py-20 text-center text-slate-400">No maintenance tasks.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="font-semibold text-slate-800 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Room {t.room_number || t.room}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                    {MAINTENANCE_STATUS_LABELS[t.status]}
                  </span>
                  <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-slate-50 text-slate-500 border border-slate-200">
                    {PRIORITY_LABELS[t.priority]}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-500 mb-2 line-clamp-2">{t.description}</p>

              {t.assigned_to_name && (
                <p className="text-xs text-slate-400 mb-2">→ {t.assigned_to_name}</p>
              )}

              {t.completion_notes && (
                <p className="text-xs text-green-700 bg-green-50 rounded p-2 mb-2">{t.completion_notes}</p>
              )}

              <div className="text-xs text-slate-400 mb-3">
                {new Date(t.created_at).toLocaleDateString()}
                {t.completed_at && ` · Done ${new Date(t.completed_at).toLocaleDateString()}`}
              </div>

              {TRANSITIONS[t.status]?.length > 0 && (
                <div className="flex gap-2">
                  {TRANSITIONS[t.status].map((next) => (
                    <button
                      key={next}
                      onClick={() => handleStatusChange(t, next)}
                      disabled={statusBusy === t.id}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors ${TRANSITION_STYLE[next] || 'bg-slate-200 text-slate-700'}`}
                    >
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
  );
}