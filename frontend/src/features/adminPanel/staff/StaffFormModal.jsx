/**
 * StaffFormModal.jsx — Create or Edit staff member
 * Create: email, password, name, role, employee_id, phone, notes
 * Edit:   name, phone, employee_id, notes (no password/email change here)
 */

import { useState, useEffect } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { staffApi } from '../../../services/staffApi';

const ROLE_OPTIONS = [
  { value:'manager',      label:'Manager' },
  { value:'receptionist', label:'Receptionist' },
  { value:'front_desk',   label:'Front Desk' },
  { value:'housekeeping', label:'Housekeeping' },
  { value:'maintenance',  label:'Maintenance' },
  { value:'security',     label:'Security' },
];

function Field({ label, error, required, children }) {
  return (
    <div className="sm-field">
      <label className="sm-label">{label}{required && <span>*</span>}</label>
      {children}
      {error && <span className="sm-error-msg">{Array.isArray(error) ? error[0] : error}</span>}
    </div>
  );
}

export default function StaffFormModal({ staff, onClose, onSaved }) {
  const isEdit = !!staff;
  const [form, setForm] = useState({
    first_name:  '',
    last_name:   '',
    email:       '',
    password:    '',
    role:        'receptionist',
    employee_id: '',
    phone:       '',
    notes:       '',
  });
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPw,     setShowPw]     = useState(false);
  const [success,    setSuccess]    = useState('');

  useEffect(() => {
    if (staff) {
      setForm({
        first_name:  staff.user?.full_name?.split(' ')[0] ?? '',
        last_name:   staff.user?.full_name?.split(' ').slice(1).join(' ') ?? '',
        email:       staff.user?.email ?? '',
        password:    '',
        role:        staff.role ?? 'receptionist',
        employee_id: staff.employee_id ?? '',
        phone:       staff.phone ?? '',
        notes:       staff.notes ?? '',
      });
    }
  }, [staff]);

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

  const handleSubmit = async () => {
    setErrors({});
    setSubmitting(true);
    try {
      if (isEdit) {
        await staffApi.update(staff.id, {
          first_name:  form.first_name,
          last_name:   form.last_name,
          phone:       form.phone,
          employee_id: form.employee_id,
          notes:       form.notes,
        });
        setSuccess('Staff profile updated.');
        setTimeout(onSaved, 800);
      } else {
        await staffApi.create({
          first_name:  form.first_name,
          last_name:   form.last_name,
          email:       form.email,
          password:    form.password,
          role:        form.role,
          employee_id: form.employee_id || undefined,
          phone:       form.phone,
          notes:       form.notes,
        });
        setSuccess('Staff account created successfully.');
        setTimeout(onSaved, 800);
      }
    } catch (err) {
      const data = err.response?.data ?? {};
      if (typeof data === 'object') setErrors(data);
      else setErrors({ non_field_errors: 'An error occurred.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">{isEdit ? 'Edit Staff Profile' : 'Create Staff Account'}</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">
          {success && <div className="sm-alert sm-alert--success">✓ {success}</div>}
          {errors.non_field_errors && (
            <div className="sm-alert sm-alert--error">{errors.non_field_errors}</div>
          )}

          <div className="sm-grid-2">
            <Field label="First Name" error={errors.first_name} required>
              <input className={`sm-input${errors.first_name?' sm-input--error':''}`}
                value={form.first_name} onChange={e => set('first_name', e.target.value)}
                placeholder="Juan" />
            </Field>
            <Field label="Last Name" error={errors.last_name}>
              <input className="sm-input" value={form.last_name}
                onChange={e => set('last_name', e.target.value)} placeholder="Dela Cruz" />
            </Field>
          </div>

          {!isEdit && (
            <>
              <Field label="Email Address" error={errors.email} required>
                <input className={`sm-input${errors.email?' sm-input--error':''}`}
                  type="email" value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="staff@hotel.com" />
              </Field>
              <Field label="Password" error={errors.password} required>
                <div className="sm-input-pw-wrap">
                  <input className={`sm-input${errors.password?' sm-input--error':''}`}
                    type={showPw ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="Minimum 8 characters" />
                  <button type="button" className="sm-eye-btn" onClick={() => setShowPw(v => !v)}>
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Role" error={errors.role} required>
                <select className={`sm-select-input${errors.role?' sm-select-input--error':''}`}
                  value={form.role} onChange={e => set('role', e.target.value)}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>
            </>
          )}

          <hr className="sm-divider-line" />

          <div className="sm-grid-2">
            <Field label="Employee ID" error={errors.employee_id}>
              <input className="sm-input" value={form.employee_id}
                onChange={e => set('employee_id', e.target.value)} placeholder="EMP-001" />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <input className="sm-input" value={form.phone}
                onChange={e => set('phone', e.target.value)} placeholder="+63 912 345 6789" />
            </Field>
          </div>

          <Field label="Notes" error={errors.notes}>
            <textarea className="sm-textarea" value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes about this staff member…" />
          </Field>
        </div>
        <div className="sm-modal-footer">
          <button className="sm-btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sm-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && <span className="sm-spinner" style={{ width:14, height:14, borderWidth:2 }} />}
            {isEdit ? 'Save Changes' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}