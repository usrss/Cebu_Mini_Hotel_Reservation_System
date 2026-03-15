/**
 * src/features/staff/shifts/ShiftCalendarPage.jsx
 *
 * Admin/Manager shift scheduling:
 * - Table list of all shifts with filters
 * - Create new shift inline form
 * - Edit / delete existing shifts
 */

import { useState, useEffect, useCallback } from 'react';
import { shiftsApi, staffMembersApi, ROLE_LABELS } from '../services/staffApi';

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_shift:  'bg-green-100 text-green-700',
  completed: 'bg-slate-100 text-slate-500',
  missed:    'bg-red-100 text-red-600',
  cancelled: 'bg-slate-100 text-slate-400 line-through',
};

function fmt(dt) {
  return new Date(dt).toLocaleString('en-PH', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function ShiftCalendarPage() {
  const [shifts,   setShifts]   = useState([]);
  const [members,  setMembers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Filters
  const [staffId,   setStaffId]   = useState('');
  const [statusFil, setStatusFil] = useState('');

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ staff: '', label: '', start_time: '', end_time: '', notes: '' });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const [deleteBusy, setDeleteBusy] = useState(null);

  const loadShifts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (staffId)   params.staff_id = staffId;
      if (statusFil) params.status   = statusFil;
      const data = await shiftsApi.list(params);
      setShifts(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [staffId, statusFil]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  useEffect(() => {
    staffMembersApi.list({ is_active: 'true' })
      .then((d) => setMembers(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormBusy(true); setFormError(null);
    try {
      await shiftsApi.create(form);
      setForm({ staff: '', label: '', start_time: '', end_time: '', notes: '' });
      setShowForm(false);
      loadShifts();
    } catch (err) {
      const d = err.response?.data;
      setFormError(
        d
          ? Object.values(d).flat().join(' ')
          : err.message
      );
    } finally {
      setFormBusy(false);
    }
  };

  const handleDelete = async (pk) => {
    if (!window.confirm('Delete this shift?')) return;
    setDeleteBusy(pk);
    try {
      await shiftsApi.remove(pk);
      loadShifts();
    } catch (err) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setDeleteBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Shift Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">{shifts.length} shifts</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-700"
        >
          {showForm ? '× Cancel' : '+ Add Shift'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">New Shift</h3>
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg p-3 text-sm mb-3">{formError}</div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-slate-500 mb-1">Staff Member *</label>
              <select value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                <option value="">Select staff…</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.user?.full_name || m.user?.email} ({ROLE_LABELS[m.effective_role]})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Label</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Morning Shift"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Start Time *</label>
              <input type="datetime-local" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">End Time *</label>
              <input type="datetime-local" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div className="col-span-2 flex justify-end">
              <button type="submit" disabled={formBusy}
                className="bg-slate-800 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
                {formBusy ? 'Saving…' : 'Create Shift'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4 flex flex-wrap gap-3">
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Staff</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>
          ))}
        </select>
        <select value={statusFil} onChange={(e) => setStatusFil(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
          <option value="">All Statuses</option>
          {['scheduled','in_shift','completed','missed','cancelled'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <button onClick={() => { setStaffId(''); setStatusFil(''); }}
          className="text-sm text-slate-500 hover:text-slate-700">Clear</button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">Loading…</div>
        ) : error ? (
          <div className="py-16 text-center text-red-500">{error}</div>
        ) : shifts.length === 0 ? (
          <div className="py-16 text-center text-slate-400">No shifts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Staff</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Label</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Start</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">End</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Hours</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shifts.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-700">{s.staff_name}</td>
                  <td className="px-4 py-3 text-slate-600">{s.label || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(s.start_time)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmt(s.end_time)}</td>
                  <td className="px-4 py-3 text-slate-500">{s.duration_hours}h</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[s.status] || 'bg-slate-100 text-slate-600'}`}>
                      {s.status_display || s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deleteBusy === s.id}
                      className="text-xs text-red-500 hover:underline disabled:opacity-50"
                    >
                      {deleteBusy === s.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}