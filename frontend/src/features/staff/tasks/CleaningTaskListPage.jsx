/**
 * src/features/staff/tasks/CleaningTaskListPage.jsx
 *
 * - Admin/Manager: see all tasks, create tasks, assign staff
 * - Housekeeping:  see only own assigned tasks, update status
 *
 * Status transitions:
 *   dirty → cleaning → clean
 *   cleaning → dirty (re-queue)
 */

import { useState, useEffect, useCallback } from 'react';
import { cleaningApi, staffMembersApi, CLEANING_STATUS_LABELS, PRIORITY_LABELS } from '../services/staffApi';
import { useStaffRole } from '../hooks/useStaffRole';

const STATUS_COLORS = {
  dirty:    'bg-red-100 text-red-700',
  cleaning: 'bg-amber-100 text-amber-700',
  clean:    'bg-green-100 text-green-700',
};

const PRIORITY_COLORS = {
  1: 'bg-red-50 text-red-600 border border-red-200',
  2: 'bg-slate-50 text-slate-600 border border-slate-200',
  3: 'bg-green-50 text-green-600 border border-green-200',
};

// Backend-enforced allowed transitions
const TRANSITIONS = {
  dirty:    ['cleaning'],
  cleaning: ['clean', 'dirty'],
  clean:    [],
};

export default function CleaningTaskListPage() {
  const perms = useStaffRole();

  const [tasks,    setTasks]    = useState([]);
  const [hkStaff,  setHkStaff]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Filters
  const [statusFil, setStatusFil] = useState('');
  const [priFilter, setPriFilter] = useState('');

  // Create form (admin/manager only)
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]         = useState({ room: '', assigned_to: '', priority: 2, notes: '' });
  const [formBusy, setFormBusy] = useState(false);
  const [formErr,  setFormErr]  = useState(null);

  const [statusBusy, setStatusBusy] = useState(null); // task pk

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
    e.preventDefault();
    setFormBusy(true); setFormErr(null);
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

  const handleStatusChange = async (task, newStatus) => {
    setStatusBusy(task.id);
    try {
      await cleaningApi.updateStatus(task.id, { status: newStatus });
      loadTasks();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setStatusBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Cleaning Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {tasks.filter((t) => t.status !== 'clean').length} active · {tasks.length} total
          </p>
        </div>
        {perms.canManageCleaning && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700"
          >
            {showForm ? '× Cancel' : '+ New Task'}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && perms.canManageCleaning && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          {formErr && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm mb-3">{formErr}</div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Room ID *</label>
              <input
                type="number" value={form.room}
                onChange={(e) => setForm({ ...form, room: e.target.value })}
                placeholder="Room primary key"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Assign To</label>
              <select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">Unassigned</option>
                {hkStaff.map((m) => (
                  <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>
                ))}
              </select>
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
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={formBusy}
                className="bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
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
          <option value="dirty">Dirty</option>
          <option value="cleaning">Cleaning</option>
          <option value="clean">Clean</option>
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
        <div className="py-20 text-center text-slate-400">No cleaning tasks.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-800">Room {t.room_number || t.room}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t.assigned_to_name ? `→ ${t.assigned_to_name}` : 'Unassigned'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status]}`}>
                    {CLEANING_STATUS_LABELS[t.status]}
                  </span>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${PRIORITY_COLORS[t.priority]}`}>
                    {PRIORITY_LABELS[t.priority]}
                  </span>
                </div>
              </div>

              {t.notes && <p className="text-xs text-slate-500 mb-3 line-clamp-2">{t.notes}</p>}

              <div className="text-xs text-slate-400 mb-3">
                Created: {new Date(t.created_at).toLocaleDateString()}
                {t.completed_at && ` · Done: ${new Date(t.completed_at).toLocaleDateString()}`}
              </div>

              {/* Transition buttons */}
              {TRANSITIONS[t.status]?.length > 0 && (
                <div className="flex gap-2">
                  {TRANSITIONS[t.status].map((next) => (
                    <button
                      key={next}
                      onClick={() => handleStatusChange(t, next)}
                      disabled={statusBusy === t.id}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors
                        ${next === 'clean'    ? 'bg-green-600 text-white hover:bg-green-700' :
                          next === 'cleaning' ? 'bg-amber-500 text-white hover:bg-amber-600' :
                          'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                    >
                      {statusBusy === t.id ? '…' : `→ ${CLEANING_STATUS_LABELS[next]}`}
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