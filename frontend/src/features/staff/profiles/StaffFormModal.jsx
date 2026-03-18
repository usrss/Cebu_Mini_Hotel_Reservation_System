/**
 * src/features/staff/profiles/StaffFormModal.jsx
 */

import { useState } from 'react';
import { staffMembersApi, ROLE_LABELS } from '../services/staffApi';
import '../Staff.css';

export default function StaffFormModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    email: '', password: '', first_name: '', last_name: '',
    role: 'receptionist', employee_id: '', phone: '', notes: '',
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      await staffMembersApi.create(form);
      onSuccess();
    } catch (err) {
      const d = err.response?.data;
      if (d && typeof d === 'object') {
        setError(Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' ') : v}`).join('\n'));
      } else {
        setError(err.message || 'Failed to create staff member.');
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="sf-modal-overlay">
      <div className="sf-modal">
        <div className="sf-modal-header">
          <h2 className="sf-modal-title">Add New Staff Member</h2>
          <button className="sf-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="sf-modal-body">
          {error && (
            <div className="sf-notice sf-notice-error" style={{ whiteSpace: 'pre-line' }}>{error}</div>
          )}

          <div className="sf-form-row">
            <div className="sf-form-group">
              <label className="sf-label">First Name</label>
              <input className="sf-input" value={form.first_name} onChange={set('first_name')} />
            </div>
            <div className="sf-form-group">
              <label className="sf-label">Last Name</label>
              <input className="sf-input" value={form.last_name} onChange={set('last_name')} />
            </div>
          </div>

          <div className="sf-form-group">
            <label className="sf-label sf-label-req">Email</label>
            <input type="email" className="sf-input" value={form.email} onChange={set('email')} required />
          </div>

          <div className="sf-form-group">
            <label className="sf-label sf-label-req">Password</label>
            <input type="password" className="sf-input" value={form.password} onChange={set('password')} required minLength={8} />
          </div>

          <div className="sf-form-group">
            <label className="sf-label sf-label-req">Role</label>
            <select className="sf-select" value={form.role} onChange={set('role')} required>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="sf-form-row">
            <div className="sf-form-group">
              <label className="sf-label">Employee ID</label>
              <input className="sf-input" value={form.employee_id} onChange={set('employee_id')} />
            </div>
            <div className="sf-form-group">
              <label className="sf-label">Phone</label>
              <input className="sf-input" value={form.phone} onChange={set('phone')} />
            </div>
          </div>

          <div className="sf-form-group">
            <label className="sf-label">Notes</label>
            <textarea className="sf-textarea" rows={2} value={form.notes} onChange={set('notes')} />
          </div>
        </div>

        <div className="sf-modal-footer">
          <button className="sf-btn" onClick={onClose}>Cancel</button>
          <button className="sf-btn sf-btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Creating…' : 'Create Staff Member'}
          </button>
        </div>
      </div>
    </div>
  );
}