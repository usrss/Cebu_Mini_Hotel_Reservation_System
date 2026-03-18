/**
 * src/features/staff/shifts/ShiftCalendarPage.jsx
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { shiftsApi, staffMembersApi, ROLE_LABELS } from '../services/staffApi';
import '../Staff.css';

const SHIFT_STATUS_CLASS = {
  scheduled: 'sf-badge-blue',
  in_shift:  'sf-badge-green',
  completed: 'sf-badge-muted',
  missed:    'sf-badge-red',
  cancelled: 'sf-badge-muted',
};

function fmt(dt) {
  return new Date(dt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ShiftCalendarPage() {
  const [shifts,    setShifts]    = useState([]);
  const [members,   setMembers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [staffId,   setStaffId]   = useState('');
  const [statusFil, setStatusFil] = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [form, setForm] = useState({ staff: '', label: '', start_time: '', end_time: '', notes: '' });
  const [formBusy,  setFormBusy]  = useState(false);
  const [formError, setFormError] = useState(null);
  const [deleteBusy,setDeleteBusy]= useState(null);

  const loadShifts = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = {};
      if (staffId)   params.staff_id = staffId;
      if (statusFil) params.status   = statusFil;
      const data = await shiftsApi.list(params);
      setShifts(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) { setError(err.response?.data?.detail || err.message); }
    finally { setLoading(false); }
  }, [staffId, statusFil]);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  useEffect(() => {
    staffMembersApi.list({ is_active: 'true' })
      .then((d) => setMembers(Array.isArray(d) ? d : (d.results ?? [])))
      .catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault(); setFormBusy(true); setFormError(null);
    try {
      await shiftsApi.create(form);
      setForm({ staff: '', label: '', start_time: '', end_time: '', notes: '' });
      setShowForm(false); loadShifts();
    } catch (err) {
      const d = err.response?.data;
      setFormError(d ? Object.values(d).flat().join(' ') : err.message);
    } finally { setFormBusy(false); }
  };

  const handleDelete = async (pk) => {
    if (!window.confirm('Delete this shift?')) return;
    setDeleteBusy(pk);
    try { await shiftsApi.remove(pk); loadShifts(); }
    catch (err) { alert(err.response?.data?.detail || err.message); }
    finally { setDeleteBusy(null); }
  };

  return (
    <div className="sf-page">
      <div className="sf-inner">

        <div className="sf-toprow">
          <div className="sf-toprow-left">
            <p className="sf-eyebrow">Workforce Management</p>
            <h1>Shift Schedule</h1>
            <p>{shifts.length} shifts</p>
          </div>
          <button className="sf-btn sf-btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? '× Cancel' : <><Plus size={13} /> Add Shift</>}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="sf-card" style={{ marginBottom: 20 }}>
            <div className="sf-card-label">New Shift</div>
            {formError && <div className="sf-notice sf-notice-error">{formError}</div>}
            <form onSubmit={handleCreate}>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Staff Member</label>
                  <select className="sf-select" value={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.value })} required>
                    <option value="">Select staff…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email} ({ROLE_LABELS[m.effective_role]})</option>
                    ))}
                  </select>
                </div>
                <div className="sf-form-group">
                  <label className="sf-label">Label</label>
                  <input className="sf-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Morning Shift" />
                </div>
              </div>
              <div className="sf-form-row">
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">Start Time</label>
                  <input type="datetime-local" className="sf-input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} required />
                </div>
                <div className="sf-form-group">
                  <label className="sf-label sf-label-req">End Time</label>
                  <input type="datetime-local" className="sf-input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} required />
                </div>
              </div>
              <div className="sf-form-group">
                <label className="sf-label">Notes</label>
                <input className="sf-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="sf-btn sf-btn-primary" disabled={formBusy}>
                  {formBusy ? 'Creating…' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="sf-filter-bar">
          <select className="sf-select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">All Staff</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.user?.full_name || m.user?.email}</option>)}
          </select>
          <select className="sf-select" value={statusFil} onChange={(e) => setStatusFil(e.target.value)}>
            <option value="">All Statuses</option>
            {['scheduled','in_shift','completed','missed','cancelled'].map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <button className="sf-filter-clear" onClick={() => { setStaffId(''); setStatusFil(''); }}>Clear</button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="sf-loading"><div className="sf-spinner" /><p>Loading shifts…</p></div>
        ) : error ? (
          <div className="sf-error"><p>{error}</p></div>
        ) : (
          <div className="sf-table-wrap">
            <table className="sf-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Label</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Hours</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={7} className="sf-table-empty">No shifts found</td></tr>
                ) : shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="sf-table-name">{s.staff_name}</td>
                    <td>{s.label || '—'}</td>
                    <td>{fmt(s.start_time)}</td>
                    <td>{fmt(s.end_time)}</td>
                    <td>{s.duration_hours}h</td>
                    <td>
                      <span className={`sf-badge ${SHIFT_STATUS_CLASS[s.status] || 'sf-badge-muted'}`}>
                        {s.status_display || s.status}
                      </span>
                    </td>
                    <td>
                      <button className="sf-btn sf-btn-danger" style={{ padding: '5px 10px', fontSize: 9 }}
                        onClick={() => handleDelete(s.id)} disabled={deleteBusy === s.id}>
                        {deleteBusy === s.id ? '…' : <><Trash2 size={11} /> Delete</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}