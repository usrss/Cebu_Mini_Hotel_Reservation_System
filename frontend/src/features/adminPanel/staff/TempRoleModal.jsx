/**
 * TempRoleModal.jsx — Assign temporary role with expiry
 * Uses: POST /api/staff/members/<id>/temp-role/
 * Body: { temp_role, expires_at }
 */
import { useState } from 'react';
import { X, Clock } from 'lucide-react';
import { staffApi } from '../../../services/staffApi';

const ROLE_OPTIONS = [
  { value:'manager',      label:'Manager' },
  { value:'receptionist', label:'Receptionist' },
  { value:'front_desk',   label:'Front Desk' },
  { value:'housekeeping', label:'Housekeeping' },
  { value:'maintenance',  label:'Maintenance' },
  { value:'security',     label:'Security' },
];

const QUICK_DURATIONS = [
  { label:'4 hours',  hours:4 },
  { label:'8 hours',  hours:8 },
  { label:'1 day',    hours:24 },
  { label:'3 days',   hours:72 },
  { label:'1 week',   hours:168 },
];

function addHours(h) {
  const d = new Date();
  d.setHours(d.getHours() + h);
  // format for datetime-local
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TempRoleModal({ staff, onClose, onSaved }) {
  const [role,       setRole]       = useState('front_desk');
  const [expiresAt,  setExpiresAt]  = useState(addHours(8));
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  const handleSubmit = async () => {
    if (!expiresAt) { setError('Please set an expiry date/time.'); return; }
    const expires = new Date(expiresAt);
    if (expires <= new Date()) { setError('Expiry must be in the future.'); return; }

    setSubmitting(true); setError('');
    try {
      await staffApi.assignTemp(staff.id, {
        temp_role:  role,
        expires_at: expires.toISOString(),
      });
      setSuccess('Temporary role assigned.');
      setTimeout(onSaved, 800);
    } catch (err) {
      setError(
        err.response?.data?.temp_role?.[0] ??
        err.response?.data?.expires_at?.[0] ??
        err.response?.data?.detail ??
        'Failed to assign temp role.'
      );
    } finally { setSubmitting(false); }
  };

  const name = staff.user?.full_name ?? staff.user?.email;

  return (
    <div className="sm-overlay">
      <div className="sm-modal">
        <div className="sm-modal-header">
          <h2 className="sm-modal-title">Assign Temporary Role</h2>
          <button className="sm-modal-close" onClick={onClose}><X size={15} /></button>
        </div>
        <div className="sm-modal-body">
          {error   && <div className="sm-alert sm-alert--error">{error}</div>}
          {success && <div className="sm-alert sm-alert--success">✓ {success}</div>}

          <p style={{ color:'var(--white-dim)', fontSize:13, marginBottom:20 }}>
            Assigning a temporary role override for <strong style={{ color:'var(--white)' }}>{name}</strong>.
            This will override their permanent role until the expiry time.
          </p>

          <div className="sm-field">
            <label className="sm-label">Temporary Role <span>*</span></label>
            <select className="sm-select-input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="sm-field">
            <label className="sm-label">Quick Duration</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {QUICK_DURATIONS.map(d => (
                <button key={d.hours} type="button"
                  className="sm-btn-secondary"
                  style={{ padding:'5px 12px', fontSize:11 }}
                  onClick={() => setExpiresAt(addHours(d.hours))}>
                  <Clock size={11} /> {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sm-field">
            <label className="sm-label">Expires At <span>*</span></label>
            <input className="sm-input" type="datetime-local"
              value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div className="sm-modal-footer">
          <button className="sm-btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="sm-btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting && <span className="sm-spinner" style={{ width:14, height:14, borderWidth:2 }} />}
            Assign Role
          </button>
        </div>
      </div>
    </div>
  );
}