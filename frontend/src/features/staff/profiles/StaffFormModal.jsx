/**
 * src/features/staff/profiles/StaffFormModal.jsx
 *
 * Modal for creating a new staff account (Admin only).
 * Creates both User + StaffProfile in one POST.
 */

import { useState } from 'react';
import { staffMembersApi, ROLE_LABELS } from '../services/staffApi';

export default function StaffFormModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    email:       '',
    password:    '',
    first_name:  '',
    last_name:   '',
    role:        'receptionist',
    employee_id: '',
    phone:       '',
    notes:       '',
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await staffMembersApi.create(form);
      onSuccess();
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        const msgs = Object.entries(d)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`)
          .join('\n');
        setError(msgs);
      } else {
        setError(err.message || 'Failed to create staff member.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Add New Staff Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm whitespace-pre-line">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">First Name</label>
              <input value={form.first_name} onChange={set('first_name')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Last Name</label>
              <input value={form.last_name} onChange={set('last_name')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Email <span className="text-red-400">*</span></label>
            <input type="email" value={form.email} onChange={set('email')} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Password <span className="text-red-400">*</span></label>
            <input type="password" value={form.password} onChange={set('password')} required minLength={8}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Role <span className="text-red-400">*</span></label>
            <select value={form.role} onChange={set('role')} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Employee ID</label>
              <input value={form.employee_id} onChange={set('employee_id')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Phone</label>
              <input value={form.phone} onChange={set('phone')}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-lg text-sm font-medium hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="flex-1 bg-slate-800 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
              {busy ? 'Creating…' : 'Create Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}