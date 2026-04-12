/**
 * StaffFormModal.jsx — Create or Edit staff member
 * Create: email, name, role (no password — activation email sent automatically)
 * Edit:   name, phone, employee_id, notes (unchanged)
 */

import { useState, useEffect } from 'react';
import { X, Mail, CheckCircle2 } from 'lucide-react';
import { staffApi } from '../../staff/services/staffApi';

// Receptionist excluded per spec
const ROLE_OPTIONS = [
  { value:'admin',        label:'Admin (Super Admin)' },
  { value:'manager',      label:'Manager' },
  { value:'front_desk',   label:'Front Desk' },
  { value:'housekeeping', label:'Housekeeping' },
  { value:'maintenance',  label:'Maintenance' },
  { value:'security',     label:'Security' },
  { value:'kitchen_staff', label:'Kitchen Staff' }
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
    role:        'front_desk',
    employee_id: '',
    phone:       '',
    notes:       '',
  });
  const [errors,     setErrors]     = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState('');
  const [invited,    setInvited]    = useState(false); // activation-sent screen

  useEffect(() => {
    if (staff) {
      setForm({
        first_name:  staff.user?.full_name?.split(' ')[0] ?? '',
        last_name:   staff.user?.full_name?.split(' ').slice(1).join(' ') ?? '',
        email:       staff.user?.email ?? '',
        role:        staff.role ?? 'front_desk',
        employee_id: staff.employee_id ?? '',
        phone:       staff.phone ?? '',
        notes:       staff.notes ?? '',
      });
    }
  }, [staff]);

  const set = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => ({ ...p, [k]: undefined }));
  };

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
        // No password — backend creates inactive account and sends activation email
        await staffApi.create({
          first_name:  form.first_name,
          last_name:   form.last_name,
          email:       form.email,
          role:        form.role,
          employee_id: form.employee_id || undefined,
          phone:       form.phone,
          notes:       form.notes,
        });
        setInvited(true); // show confirmation screen instead of closing immediately
      }
    } catch (err) {
      const data = err.response?.data ?? {};
      if (typeof data === 'object') setErrors(data);
      else setErrors({ non_field_errors: 'An error occurred.' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Activation-sent confirmation screen ─────────────────────────────────────
  if (invited) {
    return (
      <div className="sm-overlay">
        <div className="sm-modal" style={{ maxWidth: 440 }}>
          <div className="sm-modal-header">
            <h2 className="sm-modal-title">Invitation Sent</h2>
            <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
          </div>
          <div className="sm-modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', margin: '0 auto 16px',
              background: 'rgba(110,231,183,.1)', border: '1px solid rgba(110,231,183,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CheckCircle2 size={24} color="#6EE7B7" />
            </div>
            <p style={{ color: '#f5f5f5', fontWeight: 600, fontSize: 15, margin: '0 0 8px' }}>
              Account created successfully
            </p>
            <p style={{ color: '#888', fontSize: 13, lineHeight: 1.7, margin: '0 0 6px' }}>
              An activation email has been sent to
            </p>
            <p style={{
              color: 'var(--gold)', fontWeight: 600, fontSize: 13,
              background: 'rgba(201,168,76,.08)', border: '1px solid rgba(201,168,76,.2)',
              borderRadius: 6, padding: '6px 14px', display: 'inline-block', margin: '0 0 16px',
            }}>
              {form.email}
            </p>
            <p style={{ color: '#666', fontSize: 12, lineHeight: 1.6 }}>
              The staff member must click the link in that email to set their
              password and activate their account. The link expires in{' '}
              <strong style={{ color: '#aaa' }}>3 days</strong>.
            </p>
          </div>
          <div className="sm-modal-footer">
            <button className="sm-btn-secondary" onClick={() => {
              setInvited(false);
              setForm({ first_name:'', last_name:'', email:'', role:'front_desk',
                        employee_id:'', phone:'', notes:'' });
            }}>
              Add Another
            </button>
            <button className="sm-btn-primary" onClick={() => { onSaved(); onClose(); }}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">{isEdit ? 'Edit Staff Profile' : 'Create Staff Account'}</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">

          {/* Activation notice — create mode only */}
          {!isEdit && (
            <div className="sm-alert sm-alert--info" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Mail size={13} style={{ flexShrink:0 }} />
              <span>
                No password needed — an <strong>activation email</strong> will be sent
                so the staff member can set their own password.
              </span>
            </div>
          )}

          {success && <div className="sm-alert sm-alert--success">✓ {success}</div>}
          {errors.non_field_errors && (
            <div className="sm-alert sm-alert--error">{errors.non_field_errors}</div>
          )}

          <div className="sm-grid-2">
            <Field label="First Name" error={errors.first_name} required>
              <input className={`sm-input${errors.first_name ? ' sm-input--error' : ''}`}
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
                <input className={`sm-input${errors.email ? ' sm-input--error' : ''}`}
                  type="email" value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="staff@hotel.com" />
              </Field>
              {/* PASSWORD FIELD REMOVED — activation email handles this */}
              <Field label="Role" error={errors.role} required>
                <select className={`sm-select-input${errors.role ? ' sm-select-input--error' : ''}`}
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
            {isEdit ? 'Save Changes' : 'Create & Send Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}